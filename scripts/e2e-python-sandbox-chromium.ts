#!/usr/bin/env tsx
/**
 * E2E Chromium: comprueba que la CSP del runner Python bloquea una petición de red
 * desde el iframe sandbox. La misma página se sirve primero sin CSP como control:
 * si el control llega a /leak-control y la variante con CSP no llega a /leak, la
 * diferencia demuestra que el bloqueo lo aplica el navegador, no el fixture.
 */

import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { chromium, type Browser } from 'playwright';
import { pythonRunnerPage, PYTHON_RUNNER_CSP } from '../src/utils/pythonRunnerPage';

const LOG = '[e2e-python-sandbox-chromium]';
const CONTROL_ID = 'chromium-control';
const CSP_ID = 'chromium-csp';
const COMPREHENSION_ID = 'chromium-comprehension';
// Same shape as the benchmark step: a list comprehension inside a call.
const BENCHMARK_SNIPPET = "print('Factorial result:', sum([x**2 for x in range(100)]))";

interface RunnerMessage {
  id?: unknown;
  result?: { stdout: string; stderr: string; exitCode: number };
  error?: string;
}

function parentHtml(runnerPath: string, id: string, code: string): string {
  return `<!doctype html>
<html lang="es">
  <head><meta charset="utf-8"><title>Python sandbox CSP harness</title></head>
  <body>
    <iframe id="runner" sandbox="allow-scripts" src="${runnerPath}" title="runner"></iframe>
    <script>
      (function () {
        var id = ${JSON.stringify(id)};
        var code = ${JSON.stringify(code)};
        var frame = document.getElementById('runner');
        window.__result = null;
        window.addEventListener('message', function (event) {
          if (event.data && event.data.type === 'terminus-python-result' && event.data.id === id) {
            window.__result = event.data;
          }
        });
        frame.addEventListener('load', function () {
          frame.contentWindow.postMessage({ type: 'terminus-python-run', id: id, code: code }, '*');
        });
      }());
    </script>
  </body>
</html>`;
}

function probeCode(url: string): string {
  return [
    // The runner shadows the local fetch/XHR names; a fresh Function resolves the real globals.
    "var xhr = new (new Function('return XMLHttpRequest')())();",
    `xhr.open('GET', ${JSON.stringify(url)}, false);`,
    'xhr.send();',
    "return 'network-reached';",
  ].join('\n');
}

function writeHtml(response: http.ServerResponse, html: string, csp?: string): void {
  response.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...(csp ? { 'Content-Security-Policy': csp } : {}),
  });
  response.end(html);
}

async function closeServer(server: http.Server): Promise<void> {
  server.closeAllConnections?.();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

async function main(): Promise<void> {
  let server: http.Server | undefined;
  let browser: Browser | undefined;
  let port = 0;
  let leakRequests = 0;
  let controlLeakRequests = 0;
  let controlCode = '';
  let cspCode = '';

  try {
    server = http.createServer((request, response) => {
      const pathname = (request.url || '/').split('?')[0];

      if (pathname === '/python-runner.html') {
        writeHtml(response, pythonRunnerPage, PYTHON_RUNNER_CSP);
        return;
      }
      if (pathname === '/python-runner-no-csp.html') {
        writeHtml(response, pythonRunnerPage);
        return;
      }
      if (pathname === '/parent.html') {
        writeHtml(response, parentHtml('/python-runner.html', CSP_ID, cspCode));
        return;
      }
      if (pathname === '/parent-no-csp.html') {
        writeHtml(response, parentHtml('/python-runner-no-csp.html', CONTROL_ID, controlCode));
        return;
      }
      if (pathname === '/parent-comprehension.html') {
        writeHtml(
          response,
          parentHtml('/python-runner.html', COMPREHENSION_ID, BENCHMARK_SNIPPET)
        );
        return;
      }
      if (pathname === '/leak') {
        leakRequests += 1;
        response.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'text/plain' });
        response.end('leak');
        return;
      }
      if (pathname === '/leak-control') {
        controlLeakRequests += 1;
        response.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'text/plain' });
        response.end('control-leak');
        return;
      }

      response.writeHead(404, { 'Content-Type': 'text/plain' });
      response.end('not found');
    });

    await new Promise<void>((resolve, reject) => {
      server!.once('error', reject);
      server!.listen(0, '127.0.0.1', () => resolve());
    });
    port = (server!.address() as AddressInfo).port;

    controlCode = probeCode(`http://127.0.0.1:${port}/leak-control`);
    cspCode = probeCode(`http://127.0.0.1:${port}/leak`);

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    const probe = async (parentPath: string, id: string): Promise<RunnerMessage | null> => {
      await page.goto(`http://127.0.0.1:${port}${parentPath}`, { waitUntil: 'load' });
      await page.waitForFunction(
        () => Boolean((window as unknown as { __result?: unknown }).__result),
        undefined,
        { timeout: 15000 }
      );
      return page.evaluate(
        () => (window as unknown as { __result?: RunnerMessage }).__result ?? null
      );
    };

    const control = await probe('/parent-no-csp.html', CONTROL_ID);
    assert.ok(control, 'El control sin CSP no devolvió resultado.');
    assert.equal(control.id, CONTROL_ID);
    assert.equal(control.result?.stdout, 'network-reached', 'El control sin CSP no llegó a la red.');
    assert.ok(controlLeakRequests > 0, 'El control sin CSP no alcanzó /leak-control.');

    const blocked = await probe('/parent.html', CSP_ID);
    assert.ok(blocked, 'La variante con CSP no devolvió resultado.');
    assert.equal(blocked.id, CSP_ID);
    assert.ok(blocked.error, `La CSP no bloqueó la petición: ${JSON.stringify(blocked)}`);
    assert.equal(leakRequests, 0, `La CSP permitió ${leakRequests} petición(es) a /leak.`);
    assert.match(blocked.error, /NetworkError|SecurityError|Failed|blocked|CSP/i);

    const comprehension = await probe('/parent-comprehension.html', COMPREHENSION_ID);
    assert.ok(comprehension, 'La comprensión de listas no devolvió resultado.');
    assert.equal(comprehension.error, undefined, `La comprensión falló: ${comprehension.error}`);
    assert.equal(comprehension.result?.exitCode, 0);
    assert.match(
      comprehension.result?.stdout ?? '',
      /Factorial result: 328350/,
      `Salida inesperada de la comprensión: ${JSON.stringify(comprehension.result)}`
    );

    console.log(`${LOG} Chromium: ${browser!.version()}`);
    console.log(`${LOG} PASS: control sin CSP llegó a /leak-control.`);
    console.log(`${LOG} PASS: CSP bloqueó la petición a /leak (${blocked.error}).`);
    console.log(
      `${LOG} PASS: comprensión de listas en Chromium → ${comprehension.result?.stdout}`
    );
  } catch (error) {
    console.error(`${LOG} FAIL: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally {
    await browser?.close();
    if (server) await closeServer(server);
  }
}

await main();
