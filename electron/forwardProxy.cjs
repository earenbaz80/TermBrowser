'use strict';

/**
 * Loopback forward proxy used by Chromium in REAL mode.
 *
 * Chromium resolves the proxy address only; this process resolves the remote
 * hostname, validates every returned address and connects to the selected IP.
 * The validated IP is used directly by net/http, so there is no second DNS
 * lookup between the guard and the connection. HTTPS is tunnelled with CONNECT
 * and keeps Chromium's certificate validation and SNI intact.
 */

const http = require('node:http');
const net = require('node:net');
const dns = require('node:dns').promises;
const { isPrivateAddress, isPrivateHostname } = require('./networkPolicy.cjs');

const METADATA_HOSTS = new Set([
  '169.254.169.254',
  'metadata.google.internal',
  'metadata',
  'instance-data',
  'fd00:ec2::254',
]);

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

function normalizeHostname(rawHostname) {
  return String(rawHostname || '')
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
}

function parseAuthority(authority) {
  const value = String(authority || '').trim();
  if (!value || value.length > 300) throw new Error('CONNECT sin autoridad válida.');

  let host;
  let portText;

  if (value.startsWith('[')) {
    const end = value.indexOf(']');
    if (end < 2) throw new Error('CONNECT IPv6 inválido.');
    host = value.slice(1, end);
    const rest = value.slice(end + 1);
    if (!rest.startsWith(':')) throw new Error('CONNECT sin puerto.');
    portText = rest.slice(1);
  } else {
    const separator = value.lastIndexOf(':');
    if (separator < 1) throw new Error('CONNECT sin puerto.');
    host = value.slice(0, separator);
    portText = value.slice(separator + 1);
  }

  const port = Number(portText);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('CONNECT con puerto inválido.');
  }

  return { host: normalizeHostname(host), port };
}

function parseHttpTarget(request) {
  const raw = String(request.url || '');
  let target;
  try {
    target = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw)
      ? new URL(raw)
      : new URL(`http://${request.headers.host || ''}${raw.startsWith('/') ? raw : `/${raw}`}`);
  } catch {
    throw new Error('URL de proxy inválida.');
  }

  if (target.protocol !== 'http:') {
    throw new Error('Solo HTTP se reenvía sin CONNECT.');
  }
  if (target.username || target.password) {
    throw new Error('El proxy no acepta credenciales en la URL.');
  }

  return target;
}

function responseStatusFor(error) {
  return error && error.code === 'EPRIVATE' ? 403 : 502;
}

function sendHttpError(response, error) {
  if (response.headersSent) {
    response.destroy();
    return;
  }
  const status = responseStatusFor(error);
  response.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(status === 403 ? 'Destino privado bloqueado.' : 'No se pudo alcanzar el destino.');
}

function sendConnectError(socket, status) {
  if (socket.destroyed) return;
  socket.end(
    `HTTP/1.1 ${status} ${status === 403 ? 'Forbidden' : 'Bad Gateway'}\r\n` +
      'Connection: close\r\nContent-Length: 0\r\n\r\n'
  );
}

function filteredHeaders(headers, target) {
  const result = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined || HOP_BY_HOP_HEADERS.has(name.toLowerCase())) continue;
    result[name] = value;
  }
  result.host = target.host;
  return result;
}

function createForwardProxy(options = {}) {
  const lookup = options.lookup || dns.lookup;
  const addressIsPrivate = options.isAddressPrivate || isPrivateAddress;
  const hostnameIsPrivate = options.isHostnamePrivate || isPrivateHostname;
  const metadataHosts = options.metadataHosts || METADATA_HOSTS;

  async function resolveTarget(hostname, port) {
    const host = normalizeHostname(hostname);
    if (!host) throw Object.assign(new Error('Destino sin hostname.'), { code: 'EPRIVATE' });
    if (hostnameIsPrivate(host) || metadataHosts.has(host)) {
      throw Object.assign(new Error('Destino privado bloqueado.'), { code: 'EPRIVATE' });
    }

    const addresses = await lookup(host, { all: true, verbatim: true });
    if (!Array.isArray(addresses) || addresses.length === 0) {
      throw new Error('No se pudo resolver el destino.');
    }
    if (addresses.some((entry) => !entry || addressIsPrivate(entry.address))) {
      throw Object.assign(new Error('Destino privado bloqueado.'), { code: 'EPRIVATE' });
    }

    const selected = addresses[0];
    return { address: selected.address, family: selected.family, port };
  }

  const server = http.createServer((request, response) => {
    let target;
    let resolved;
    try {
      target = parseHttpTarget(request);
    } catch {
      sendHttpError(response, null);
      return;
    }

    resolveTarget(target.hostname, Number(target.port) || 80)
      .then((result) => {
        resolved = result;
        const upstream = http.request(
          {
            host: resolved.address,
            family: resolved.family,
            port: resolved.port,
            method: request.method,
            path: `${target.pathname}${target.search}`,
            headers: filteredHeaders(request.headers, target),
          },
          (upstreamResponse) => {
            const statusCode = upstreamResponse.statusCode || 502;
            const headers = { ...upstreamResponse.headers };
            for (const name of Object.keys(headers)) {
              if (HOP_BY_HOP_HEADERS.has(name.toLowerCase())) delete headers[name];
            }
            response.writeHead(statusCode, upstreamResponse.statusMessage, headers);
            upstreamResponse.pipe(response);
          }
        );

        upstream.setTimeout(30000, () => upstream.destroy(new Error('Timeout del destino.')));
        upstream.once('error', (error) => sendHttpError(response, error));
        request.once('aborted', () => upstream.destroy());
        response.once('close', () => {
          if (!response.writableEnded) upstream.destroy();
        });
        request.pipe(upstream);
      })
      .catch((error) => sendHttpError(response, error));
  });

  server.on('connect', (request, clientSocket, head) => {
    let target;
    try {
      target = parseAuthority(request.url);
    } catch {
      sendConnectError(clientSocket, 400);
      return;
    }

    let settled = false;
    let upstream = null;
    const fail = (status) => {
      if (settled) return;
      settled = true;
      if (upstream) upstream.destroy();
      sendConnectError(clientSocket, status);
    };

    clientSocket.once('error', () => {
      if (upstream) upstream.destroy();
    });

    resolveTarget(target.host, target.port)
      .then((resolved) => {
        if (clientSocket.destroyed) return;
        upstream = net.connect({
          host: resolved.address,
          family: resolved.family,
          port: resolved.port,
        });
        upstream.setTimeout(30000, () => upstream.destroy(new Error('Timeout del túnel.')));
        upstream.once('error', () => {
          if (settled) clientSocket.destroy();
          else fail(502);
        });
        upstream.once('close', () => {
          if (settled) clientSocket.destroy();
        });
        upstream.once('connect', () => {
          if (settled || clientSocket.destroyed) {
            upstream.destroy();
            return;
          }
          settled = true;
          clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
          if (head && head.length > 0) upstream.write(head);
          upstream.pipe(clientSocket);
          clientSocket.pipe(upstream);
        });
        clientSocket.once('close', () => upstream.destroy());
      })
      .catch((error) => fail(responseStatusFor(error)));
  });

  server.on('clientError', (_error, socket) => {
    if (!socket.destroyed) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
  });

  return { server, resolveTarget };
}

function startForwardProxy(options = {}) {
  const proxy = createForwardProxy(options);
  return new Promise((resolve, reject) => {
    const sockets = new Set();
    proxy.server.on('connection', (socket) => {
      sockets.add(socket);
      socket.once('close', () => sockets.delete(socket));
    });
    proxy.server.once('error', reject);
    proxy.server.listen(0, '127.0.0.1', () => {
      const address = proxy.server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      if (!port) {
        reject(new Error('El proxy no pudo abrir un puerto local.'));
        return;
      }
      resolve({
        server: proxy.server,
        port,
        resolveTarget: proxy.resolveTarget,
        close: () => {
          for (const socket of sockets) socket.destroy();
          return new Promise((done) => proxy.server.close(() => done()));
        },
      });
    });
  });
}

module.exports = {
  createForwardProxy,
  startForwardProxy,
  parseAuthority,
  parseHttpTarget,
  normalizeHostname,
};
