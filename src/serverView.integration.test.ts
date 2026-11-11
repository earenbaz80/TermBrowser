import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const PROJECT_ROOT = process.cwd();
const CHILD_TIMEOUT_MS = 20000;

type HttpResponse = {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
};

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('El servidor de prueba no expuso un puerto TCP.'));
        return;
      }
      resolve(address.port);
    });
  });
}

function close(server: http.Server | undefined): Promise<void> {
  if (!server) return Promise.resolve();
  return new Promise((resolve) => server.close(() => resolve()));
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('No se pudo reservar un puerto libre.'));
        return;
      }
      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}

function request(url: string, headers: Record<string, string> = {}): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: 'GET', headers }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        body += chunk;
      });
      res.on('end', () => {
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body,
        });
      });
    });
    req.setTimeout(10000, () => req.destroy(new Error(`Timeout al consultar ${url}`)));
    req.once('error', reject);
    req.end();
  });
}

async function waitForServer(baseUrl: string): Promise<HttpResponse> {
  const deadline = Date.now() + CHILD_TIMEOUT_MS;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const response = await request(`${baseUrl}/api/session`);
      if (response.status === 200) return response;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`El servidor de Terminus no arrancó: ${String(lastError)}`);
}

describe('/api/view CSP integration', () => {
  let finalServer: http.Server | undefined;
  let redirectServer: http.Server | undefined;
  let terminus: ChildProcess | undefined;
  let terminusLogs = '';
  let sessionCookie = '';
  let finalOrigin = '';
  let redirectOrigin = '';
  let terminusOrigin = '';

  beforeAll(async () => {
    finalServer = http.createServer((req, res) => {
      if (req.url !== '/final') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        '<!doctype html><html><head><title>Final</title></head><body>' +
          '<a id="relative-link" href="/relative-path">Relativo</a>' +
          '<img id="relative-image" src="/foto.jpg" alt="Foto">' +
          '</body></html>'
      );
    });
    const finalPort = await listen(finalServer);
    finalOrigin = `http://127.0.0.1:${finalPort}`;

    redirectServer = http.createServer((req, res) => {
      if (req.url !== '/redirect') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('not found');
        return;
      }
      res.writeHead(302, { Location: `${finalOrigin}/final` });
      res.end();
    });
    const redirectPort = await listen(redirectServer);
    redirectOrigin = `http://127.0.0.1:${redirectPort}`;

    const terminusPort = await getFreePort();
    terminusOrigin = `http://127.0.0.1:${terminusPort}`;
    terminus = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: String(terminusPort),
        TERMINUS_ALLOW_PRIVATE: '1',
        TERMINUS_BLOCK_PRIVATE: '0',
        TERMINUS_NETWORK_POLICY: 'local',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    terminus.stdout?.on('data', (chunk: Buffer) => {
      terminusLogs += chunk.toString();
    });
    terminus.stderr?.on('data', (chunk: Buffer) => {
      terminusLogs += chunk.toString();
    });

    const session = await waitForServer(terminusOrigin);
    const setCookie = session.headers['set-cookie'];
    const cookieHeader = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    if (!cookieHeader) throw new Error(`/api/session no devolvió cookie. Logs: ${terminusLogs}`);
    sessionCookie = cookieHeader.split(';')[0];
  }, 30000);

  afterAll(async () => {
    if (terminus && terminus.exitCode === null) {
      terminus.kill();
      await Promise.race([
        once(terminus, 'exit').then(() => undefined),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
    }
    await Promise.all([close(finalServer), close(redirectServer)]);
  });

  it('uses the final origin in base-uri and resolves relative links against it', async () => {
    const target = encodeURIComponent(`${redirectOrigin}/redirect`);
    const response = await request(`${terminusOrigin}/api/view?url=${target}&mode=dark`, {
      Cookie: sessionCookie,
    });

    expect(response.status).toBe(200);
    const cspHeader = response.headers['content-security-policy'];
    const csp = Array.isArray(cspHeader) ? cspHeader.join('; ') : String(cspHeader ?? '');
    expect(csp).toContain(`base-uri 'self' ${finalOrigin}`);
    expect(csp).not.toContain(`base-uri 'self' ${redirectOrigin}`);

    const baseHref = /<base\b[^>]*href="([^"]+)"/i.exec(response.body)?.[1];
    expect(baseHref).toBe(`${finalOrigin}/final`);

    const relativeHref = /<a\b[^>]*id="relative-link"[^>]*href="([^"]+)"/i.exec(response.body)?.[1];
    expect(relativeHref).toBe('/relative-path');
    expect(new URL(relativeHref ?? '', baseHref ?? '').href).toBe(`${finalOrigin}/relative-path`);

    const imageSrc = /<img\b[^>]*id="relative-image"[^>]*src="([^"]+)"/i.exec(response.body)?.[1];
    expect(imageSrc).toContain(`${terminusOrigin}/api/image?url=`);
    expect(imageSrc).toContain(encodeURIComponent(`${finalOrigin}/foto.jpg`));
    expect(imageSrc).not.toContain(`src="${finalOrigin}/foto.jpg"`);
    expect(csp).toContain(`img-src 'self' data: blob: ${terminusOrigin}`);
  });
});
