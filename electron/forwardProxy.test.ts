import http from 'node:http';
import net from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  parseAuthority,
  startForwardProxy,
} = require('./forwardProxy.cjs') as {
  parseAuthority: (authority: string) => { host: string; port: number };
  startForwardProxy: (options?: {
    lookup?: (hostname: string, options: { all: boolean }) => Promise<Array<{ address: string; family: number }>>;
    isAddressPrivate?: (address: string) => boolean;
    isHostnamePrivate?: (hostname: string) => boolean;
  }) => Promise<{
    port: number;
    close: () => Promise<void>;
  }>;
};

const servers: http.Server[] = [];
const proxies: Array<{ close: () => Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(proxies.splice(0).map((proxy) => proxy.close()));
  await Promise.all(
    servers.splice(0).map(
      (server) => new Promise<void>((resolve) => server.close(() => resolve()))
    )
  );
});

function startFixture(): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve) => {
    const server = http.createServer((request, response) => {
      response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(`fixture:${request.url}`);
    });
    server.listen(0, '127.0.0.1', () => {
      servers.push(server);
      const address = server.address();
      resolve({ server, port: typeof address === 'object' && address ? address.port : 0 });
    });
  });
}

function httpGetThroughProxy(proxyPort: number, url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const request = http.get(
      {
        host: '127.0.0.1',
        port: proxyPort,
        path: url,
        headers: { host: new URL(url).host },
      },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () => resolve({ status: response.statusCode || 0, body }));
      }
    );
    request.once('error', reject);
  });
}

describe('forwardProxy', () => {
  it('parses CONNECT authorities including IPv6', () => {
    expect(parseAuthority('example.com:443')).toEqual({ host: 'example.com', port: 443 });
    expect(parseAuthority('[2001:db8::1]:443')).toEqual({ host: '2001:db8::1', port: 443 });
    expect(() => parseAuthority('example.com')).toThrow();
    expect(() => parseAuthority('example.com:99999')).toThrow();
  });

  it('resolves once and forwards HTTP to the pinned address', async () => {
    const fixture = await startFixture();
    const lookup = vi.fn(async () => [{ address: '127.0.0.1', family: 4 }]);
    const proxy = await startForwardProxy({
      lookup,
      isAddressPrivate: () => false,
      isHostnamePrivate: () => false,
    });
    proxies.push(proxy);

    const result = await httpGetThroughProxy(
      proxy.port,
      `http://fixture.test:${fixture.port}/hello`
    );

    expect(result).toEqual({ status: 200, body: 'fixture:/hello' });
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('rejects a hostname that resolves to a private address', async () => {
    const proxy = await startForwardProxy({
      lookup: async () => [{ address: '127.0.0.1', family: 4 }],
    });
    proxies.push(proxy);

    const result = await httpGetThroughProxy(proxy.port, 'http://rebind.test/private');

    expect(result.status).toBe(403);
    expect(result.body).toContain('privado');
  });

  it('rejects a hostname that resolves to a hexadecimal IPv4-mapped address', async () => {
    const proxy = await startForwardProxy({
      lookup: async () => [{ address: '::ffff:7f00:1', family: 6 }],
    });
    proxies.push(proxy);

    const result = await httpGetThroughProxy(proxy.port, 'http://mapped.test/private');

    expect(result.status).toBe(403);
  });

  it('tunnels CONNECT to the pinned address and one lookup', async () => {
    const fixture = await startFixture();
    const lookup = vi.fn(async () => [{ address: '127.0.0.1', family: 4 }]);
    const proxy = await startForwardProxy({
      lookup,
      isAddressPrivate: () => false,
      isHostnamePrivate: () => false,
    });
    proxies.push(proxy);

    const response = await new Promise<string>((resolve, reject) => {
      const socket = net.connect(proxy.port, '127.0.0.1');
      let buffer = '';
      let tunneled = false;
      socket.setEncoding('utf8');
      socket.once('error', reject);
      socket.on('data', (chunk) => {
        buffer += chunk;
        if (!tunneled && buffer.includes('\r\n\r\n')) {
          tunneled = true;
          buffer = buffer.split('\r\n\r\n').slice(1).join('\r\n\r\n');
          socket.write(
            `GET /through-connect HTTP/1.1\r\nHost: fixture.test:${fixture.port}\r\nConnection: close\r\n\r\n`
          );
        }
        if (tunneled && buffer.includes('fixture:/through-connect')) {
          socket.destroy();
          resolve(buffer);
        }
      });
      socket.write(
        `CONNECT fixture.test:${fixture.port} HTTP/1.1\r\nHost: fixture.test:${fixture.port}\r\n\r\n`
      );
    });

    expect(response).toContain('HTTP/1.1 200');
    expect(response).toContain('fixture:/through-connect');
    expect(lookup).toHaveBeenCalledTimes(1);
  });
});
