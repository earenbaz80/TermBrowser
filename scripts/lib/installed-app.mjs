/**
 * Arranque y cliente CDP compartidos por los E2E que corren contra la app
 * Electron instalada (Ctrl+F y la interfaz).
 *
 * El módulo solo sabe lanzar el ejecutable con un perfil temporal, hablar con
 * DevTools y detectar que la app murió; las comprobaciones viven en cada script.
 *
 * Uso:
 *   const app = await launchInstalledApp({ exe, label: '[mi-e2e]', profilePrefix: 'terminus-e2e-' });
 *   const cdp = app.client;
 *   await waitForExpression(cdp, expression, predicate, 'lo que sea', 15000);
 *   ...
 *   await app.cleanup();
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => {
        if (port > 0) resolve(port);
        else reject(new Error('No se pudo reservar un puerto libre.'));
      });
    });
  });
}

async function waitForCdpPage(port, { isDead, logs, timeoutMs = 30000 }) {
  const deadline = Date.now() + timeoutMs;
  let lastError = '';

  while (Date.now() < deadline) {
    if (isDead()) {
      throw new Error(`La app terminó antes de exponer CDP.\n${logs()}`);
    }

    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) {
        const targets = await response.json();
        const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
        if (page) return page;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(250);
  }

  throw new Error(
    `CDP no respondió en ${timeoutMs} ms${lastError ? ` (${lastError})` : ''}.\n${logs()}`,
  );
}

/**
 * Conecta con el target de DevTools. El estado de la app va adjunto al cliente
 * para que `waitForExpression` pueda abortar con el log si el proceso murió.
 */
export function connectCdp(webSocketUrl, state = { isDead: () => false, logs: () => '' }) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(webSocketUrl);
    const pending = new Map();
    let nextId = 0;
    let opened = false;

    const failPending = (error) => {
      for (const request of pending.values()) {
        clearTimeout(request.timer);
        request.reject(error);
      }
      pending.clear();
    };

    const send = (method, params = {}) =>
      new Promise((resolveSend, rejectSend) => {
        if (socket.readyState !== WebSocket.OPEN) {
          rejectSend(new Error(`CDP cerrado antes de ${method}.`));
          return;
        }
        const id = ++nextId;
        const timer = setTimeout(() => {
          pending.delete(id);
          rejectSend(new Error(`Timeout CDP en ${method}.`));
        }, 15000);
        pending.set(id, { resolve: resolveSend, reject: rejectSend, timer });
        socket.send(JSON.stringify({ id, method, params }));
      });

    socket.addEventListener('message', (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error) {
        request.reject(new Error(message.error.message || `Error CDP ${message.error.code}.`));
      } else {
        request.resolve(message.result);
      }
    });

    socket.addEventListener('error', () => {
      if (!opened) reject(new Error('No se pudo abrir el WebSocket CDP.'));
      failPending(new Error('Error WebSocket CDP.'));
    });
    socket.addEventListener('close', () => {
      failPending(new Error('CDP cerrado.'));
    });
    socket.addEventListener(
      'open',
      () => {
        opened = true;
        resolve({
          state,
          send,
          evaluate: async (expression) => {
            const result = await send('Runtime.evaluate', {
              expression,
              returnByValue: true,
              awaitPromise: true,
            });
            if (result.exceptionDetails) {
              throw new Error(
                result.exceptionDetails.exception?.description ||
                  result.exceptionDetails.text ||
                  'Fallo de evaluación en el renderer.',
              );
            }
            return result.result.value;
          },
          close: () => socket.close(),
        });
      },
      { once: true },
    );
  });
}

/** Reintenta una expresión en el renderer hasta que `predicate` la acepte. */
export async function waitForExpression(client, expression, predicate, label, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  const { isDead, logs } = client.state ?? { isDead: () => false, logs: () => '' };
  let lastValue;
  let lastError = '';

  while (Date.now() < deadline) {
    if (isDead()) {
      throw new Error(`La app terminó mientras se esperaba ${label}.\n${logs()}`);
    }
    try {
      lastValue = await client.evaluate(expression);
      if (predicate(lastValue)) return lastValue;
      lastError = '';
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(200);
  }

  throw new Error(
    `Timeout esperando ${label}. Último estado: ${lastError || JSON.stringify(lastValue)}`,
  );
}

/**
 * Lanza el ejecutable instalado con perfil temporal y devuelve su cliente CDP.
 * `cleanup()` cierra el CDP, mata el proceso y borra el perfil.
 */
export async function launchInstalledApp({ exe, env = {}, profilePrefix = 'terminus-e2e-' }) {
  const cdpPort = await getFreePort();
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), profilePrefix));
  let appLogs = '';

  const appProcess = spawn(
    exe,
    [`--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profileDir}`],
    {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: false,
    },
  );
  const appendLog = (chunk) => {
    appLogs = (appLogs + chunk.toString()).slice(-20000);
  };
  appProcess.stdout?.on('data', appendLog);
  appProcess.stderr?.on('data', appendLog);

  const isDead = () => appProcess.exitCode !== null;
  const logs = () => appLogs;

  const target = await waitForCdpPage(cdpPort, { isDead, logs });
  const client = await connectCdp(target.webSocketDebuggerUrl, { isDead, logs });
  await client.send('Runtime.enable');

  const stop = async () => {
    try {
      client.close();
    } catch {}
    if (appProcess.exitCode !== null) return;

    const exited = new Promise((resolve) => appProcess.once('exit', resolve));
    appProcess.kill();
    await Promise.race([exited, sleep(4000)]);
    if (appProcess.exitCode === null) {
      appProcess.kill('SIGKILL');
      await Promise.race([exited, sleep(2000)]);
    }
  };

  const cleanup = async () => {
    await stop();
    try {
      fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch (error) {
      console.warn(
        `No se pudo borrar el perfil temporal ${profileDir}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  };

  return { process: appProcess, pid: appProcess.pid, client, logs, stop, cleanup };
}
