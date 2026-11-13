#!/usr/bin/env node
/**
 * E2E Windows: la interfaz nueva en la app Electron instalada.
 *
 * Cubre lo que el hito 3 dejaba pendiente en la app empaquetada, sin mocks:
 *   - cabecera única (un `<header>` con marca, pestañas y controles de ventana),
 *   - menú de configuración abierto, cambio de tema y persistencia tras recargar,
 *   - búsqueda del inicio en un solo paso (escribir y Enter), sin el botón
 *     intermedio «ABRIR TERMINUS SEARCH».
 *
 * Arranca el ejecutable instalado con un perfil temporal y habla con él por CDP.
 * No usa `electron .` ni `example.com`.
 *
 * Requisitos:
 *   - Windows con una sesión de escritorio interactiva.
 *   - La app instalada a partir del build actual.
 *   - `npm run test:e2e:installed:ui`.
 *
 * Si el ejecutable está en otra ruta:
 *   TERMINUS_INSTALLED_EXE="C:\ruta\Terminus.exe" npm run test:e2e:installed:ui
 *
 * Para comprobar que la prueba no depende del idioma, con la interfaz en inglés:
 *   TERMINUS_E2E_LOCALE=en npm run test:e2e:installed:ui
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const LOG = '[e2e-installed-ui]';
const THEME_KEY = 'termbrowser_theme_v1';
const HISTORY_KEY = 'termbrowser_cmd_history_v1';
const UI_MARKER = 'terminus-theme-select';
// La barra de direcciones se identifica por su relación con la lista de sugerencias
// (atributos del DOM, no el aria-label del idioma activo), así la prueba sirve en cualquier idioma.
const ADDRESS_SELECTOR = 'input[aria-controls="terminus-address-suggestions"]';
const SEARCH_QUERY = 'terminus e2e ui';
const LOCALE_KEY = 'terminus_locale_v1';
const EN_ADDRESS_LABEL = 'Address and search bar';
// Opcional: cambia el idioma de la app desde el menú antes de comprobarla.
const e2eLocale = (process.env.TERMINUS_E2E_LOCALE ?? '').trim();
const START_FORM = 'form[role="search"]';
const THEMES = {
  msdos: { id: 'ms-dos', bg: '#000080', rgb: 'rgb(0, 0, 128)' },
  matrix: { id: 'matrix-dark', bg: '#020402', rgb: 'rgb(2, 4, 2)' },
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const installedExe = process.env.TERMINUS_INSTALLED_EXE
  ? path.resolve(process.env.TERMINUS_INSTALLED_EXE)
  : path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Terminus', 'Terminus.exe');

let profileDir = '';
let appProcess = null;
let cdp = null;
let appLogs = '';

function appendAppLog(chunk) {
  appLogs = (appLogs + chunk.toString()).slice(-20000);
}

function getFreePort() {
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

async function waitForCdpPage(port, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = '';

  while (Date.now() < deadline) {
    if (appProcess && appProcess.exitCode !== null) {
      throw new Error(
        `La app terminó antes de exponer CDP (código ${appProcess.exitCode}).\n${appLogs}`,
      );
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
    `CDP no respondió en ${timeoutMs} ms${lastError ? ` (${lastError})` : ''}.\n${appLogs}`,
  );
}

function connectCdp(webSocketUrl) {
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

async function waitForExpression(client, expression, predicate, label, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let lastValue;
  let lastError = '';

  while (Date.now() < deadline) {
    if (appProcess && appProcess.exitCode !== null) {
      throw new Error(`La app terminó mientras se esperaba ${label}.\n${appLogs}`);
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

const ROOT_STATE_EXPRESSION = `(() => {
  const root = document.getElementById('root')?.firstElementChild ?? null;
  return {
    bg: root?.style.backgroundColor ?? null,
    theme: localStorage.getItem(${JSON.stringify(THEME_KEY)}),
  };
})()`;

/** Presses Enter through CDP so the renderer handles it as a real key press. */
async function pressEnter(client) {
  await client.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Enter',
    code: 'Enter',
    text: '\r',
    unmodifiedText: '\r',
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  });
  await client.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  });
}

/** Runs a terminal command through the address bar of the browser surface. */
async function runCommand(client, command) {
  const address = JSON.stringify(ADDRESS_SELECTOR);
  const focused = await client.evaluate(`(() => {
    const input = document.querySelector(${address});
    if (!input) return false;
    input.focus();
    input.select();
    return document.activeElement === input;
  })()`);
  assert.equal(focused, true, 'No se pudo enfocar la barra de direcciones.');

  await client.send('Input.insertText', { text: command });
  await waitForExpression(
    client,
    `document.querySelector(${address})?.value ?? null`,
    (value) => value === command,
    `el comando «${command}» en la barra de direcciones`,
    5000,
  );
  // Deja que React aplique el valor antes de enviar Enter.
  await sleep(200);
  await pressEnter(client);
}

const HEADER_STATE_EXPRESSION = `(() => {
  const headers = document.querySelectorAll('header');
  const header = headers[0] ?? null;
  const trigger = document.querySelector('button[aria-haspopup="dialog"]');
  return {
    headers: headers.length,
    tablists: header ? header.querySelectorAll('[role="tablist"]').length : 0,
    windowButtons: header ? header.querySelectorAll('.tb-window-controls .tb-window-button').length : 0,
    windowControlGroups: document.querySelectorAll('.tb-window-controls').length,
    menuInsideHeader: Boolean(header && trigger && header.contains(trigger)),
    text: header?.textContent?.trim().slice(0, 60) ?? '',
  };
})()`;

const MENU_STATE_EXPRESSION = `(() => {
  const dialog = [...document.querySelectorAll('[role="dialog"]')]
    .find((item) => item.querySelector('#${UI_MARKER}'));
  const select = document.getElementById('${UI_MARKER}');
  return {
    open: Boolean(dialog),
    theme: select?.value ?? null,
    options: select ? select.options.length : 0,
    locale: document.getElementById('terminus-locale-select')?.value ?? null,
  };
})()`;

async function openSettingsMenu(client) {
  const clicked = await client.evaluate(`(() => {
    const trigger = document.querySelector('button[aria-haspopup="dialog"]');
    if (!trigger) return false;
    trigger.click();
    return true;
  })()`);
  assert.equal(clicked, true, 'No se encontró el botón del menú de configuración.');

  return waitForExpression(
    client,
    MENU_STATE_EXPRESSION,
    (state) => state.open && Boolean(state.theme),
    'el menú de configuración con el selector de tema',
    10000,
  );
}

async function closeSettingsMenu(client) {
  await client.evaluate(
    `document.querySelector('button[aria-haspopup="dialog"]')?.click()`,
  );
  await waitForExpression(
    client,
    MENU_STATE_EXPRESSION,
    (state) => !state.open,
    'el cierre del menú de configuración',
    5000,
  );
}

/** Cambia el idioma desde el menú real y espera a que la interfaz lo aplique. */
async function applyE2ELocale(client) {
  await waitForExpression(
    client,
    "Boolean(document.querySelector('button[aria-haspopup=\"dialog\"]'))",
    Boolean,
    'la cabecera antes de cambiar el idioma',
    20000,
  );

  const current = await openSettingsMenu(client);
  assert.ok(current.locale, 'El menú de configuración no expone el selector de idioma.');

  if (current.locale !== e2eLocale) {
    const changed = await client.evaluate(`(() => {
      const select = document.getElementById('terminus-locale-select');
      if (!select) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      setter.call(select, ${JSON.stringify(e2eLocale)});
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    assert.equal(changed, true, 'No se pudo cambiar el idioma desde el menú.');
  }

  await waitForExpression(
    client,
    `(() => ({
      locale: document.getElementById('terminus-locale-select')?.value ?? null,
      stored: localStorage.getItem(${JSON.stringify(LOCALE_KEY)}),
      address: document.querySelector(${JSON.stringify(ADDRESS_SELECTOR)})?.getAttribute('aria-label') ?? null,
    }))()`,
    (state) =>
      state.locale === e2eLocale &&
      state.stored === e2eLocale &&
      state.address === EN_ADDRESS_LABEL,
    `la interfaz en ${e2eLocale}`,
    10000,
  );

  await closeSettingsMenu(client);
  console.log(`${LOG} Idioma de la app: ${e2eLocale} (barra: «${EN_ADDRESS_LABEL}»).`);
}

async function main() {
  assert.ok(
    process.platform === 'win32',
    'Esta prueba requiere Windows porque arranca el instalador de la app.',
  );
  assert.ok(
    fs.existsSync(installedExe),
    `No se encontró la app instalada en ${installedExe}. Instala el build actual o define TERMINUS_INSTALLED_EXE.`,
  );

  const asarPath = path.join(path.dirname(installedExe), 'resources', 'app.asar');
  assert.ok(fs.existsSync(asarPath), `No se encontró el paquete instalado: ${asarPath}`);
  assert.ok(
    fs.readFileSync(asarPath).includes(Buffer.from(UI_MARKER)),
    'La app instalada no contiene el menú con selector de tema. Instala el build actual antes de ejecutar la prueba.',
  );

  const cdpPort = await getFreePort();
  profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terminus-e2e-ui-'));

  console.log(`${LOG} Ejecutable instalado: ${installedExe}`);

  appProcess = spawn(
    installedExe,
    [`--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profileDir}`],
    {
      env: {
        ...process.env,
        // La prueba no navega fuera de la app; evita depender de la política de red del usuario.
        TERMINUS_BLOCK_PRIVATE: '0',
        TERMINUS_NETWORK_POLICY: 'local',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: false,
    },
  );
  appProcess.stdout?.on('data', appendAppLog);
  appProcess.stderr?.on('data', appendAppLog);

  const target = await waitForCdpPage(cdpPort);
  cdp = await connectCdp(target.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable');

  if (e2eLocale) await applyE2ELocale(cdp);

  // 1. Cabecera única: un solo <header>, con las pestañas y los controles de ventana dentro.
  const header = await waitForExpression(
    cdp,
    HEADER_STATE_EXPRESSION,
    (state) =>
      state.headers === 1 &&
      state.tablists === 1 &&
      state.windowButtons === 3 &&
      state.menuInsideHeader,
    'la cabecera única de la app instalada',
    20000,
  );
  assert.equal(header.windowControlGroups, 1, 'Los controles de ventana están duplicados.');
  console.log(`${LOG} PASS: cabecera única (1 header, pestañas y controles de ventana dentro).`);

  // 2. Menú de configuración y cambio de tema.
  const menu = await openSettingsMenu(cdp);
  assert.ok(menu.options >= 2, 'El selector de tema no ofrece temas.');
  const before = await cdp.evaluate(ROOT_STATE_EXPRESSION);
  const chosen = menu.theme === THEMES.msdos.id ? THEMES.matrix : THEMES.msdos;

  const changed = await cdp.evaluate(`(() => {
    const select = document.getElementById('${UI_MARKER}');
    if (!select) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(select, ${JSON.stringify(chosen.id)});
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  assert.equal(changed, true, 'No se pudo cambiar el tema desde el menú.');

  const applied = await waitForExpression(
    cdp,
    `${ROOT_STATE_EXPRESSION}`,
    (state) => state.theme === chosen.id && state.bg === chosen.rgb,
    `el tema ${chosen.id} aplicado y guardado`,
    10000,
  );
  assert.notEqual(applied.bg, before.bg, 'El fondo no cambió al cambiar de tema.');
  console.log(
    `${LOG} PASS: menú abierto y tema ${before.theme} -> ${chosen.id} guardado en ${THEME_KEY}.`,
  );

  // 3. Persistencia: recarga real del renderer y el tema guardado se aplica al arrancar.
  await cdp.send('Page.enable');
  await cdp.send('Page.reload', { ignoreCache: false });

  const restored = await waitForExpression(
    cdp,
    `(() => {
      const state = ${ROOT_STATE_EXPRESSION};
      return {
        ...state,
        header: Boolean(document.querySelector('header')),
        address: Boolean(document.querySelector(${JSON.stringify(ADDRESS_SELECTOR)})),
      };
    })()`,
    (state) => state.header && state.address && state.theme === chosen.id && state.bg === chosen.rgb,
    `el tema ${chosen.id} tras recargar la app`,
    30000,
  );

  const reopened = await openSettingsMenu(cdp);
  assert.equal(reopened.theme, chosen.id, 'El menú no refleja el tema guardado tras recargar.');
  await closeSettingsMenu(cdp);
  console.log(
    `${LOG} PASS: tras recargar, el tema ${restored.theme} sigue aplicado y seleccionado en el menú.`,
  );

  // 4. Búsqueda del inicio en un paso: escribir, Enter y resultados; sin botón intermedio.
  await runCommand(cdp, 'home');

  const startPage = await waitForExpression(
    cdp,
    `(() => {
      const form = document.querySelector(${JSON.stringify(START_FORM)});
      const input = form?.querySelector('input') ?? null;
      const legacy = [...document.querySelectorAll('button')].some((button) =>
        /(abrir|open|öffnen|ouvrir|apri)\\s+terminus\\s+search/i.test(button.textContent ?? ''),
      );
      return {
        forms: document.querySelectorAll(${JSON.stringify(START_FORM)}).length,
        hasInput: Boolean(input),
        iframe: Boolean(document.querySelector('iframe')),
        legacy,
      };
    })()`,
    (state) => state.forms === 1 && state.hasInput && !state.iframe && !state.legacy,
    'la página de inicio con su formulario de búsqueda',
    20000,
  );
  assert.equal(startPage.legacy, false, 'Reapareció el botón intermedio «ABRIR TERMINUS SEARCH».');

  const typed = await cdp.evaluate(`(() => {
    const form = document.querySelector(${JSON.stringify(START_FORM)});
    const input = form?.querySelector('input');
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(SEARCH_QUERY)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
    return true;
  })()`);
  assert.equal(typed, true, 'No se pudo escribir en el formulario de inicio.');
  await sleep(200);
  await pressEnter(cdp);

  const searched = await waitForExpression(
    cdp,
    `(() => {
      const form = document.querySelector(${JSON.stringify(START_FORM)});
      const input = form?.querySelector('input') ?? null;
      let history = [];
      try {
        history = JSON.parse(localStorage.getItem(${JSON.stringify(HISTORY_KEY)}) ?? '[]');
      } catch {}
      return {
        forms: document.querySelectorAll(${JSON.stringify(START_FORM)}).length,
        inputValue: input?.value ?? null,
        address: document.querySelector(${JSON.stringify(ADDRESS_SELECTOR)})?.value ?? null,
        commandLogged: Array.isArray(history) && history.includes('search ' + ${JSON.stringify(SEARCH_QUERY)}),
        legacy: [...document.querySelectorAll('button')].some((button) =>
          /(abrir|open|öffnen|ouvrir|apri)\\s+terminus\\s+search/i.test(button.textContent ?? ''),
        ),
      };
    })()`,
    (state) =>
      state.forms === 1 &&
      state.inputValue === SEARCH_QUERY &&
      /\bterminus:\/\/search\b/.test(state.address ?? '') &&
      state.commandLogged &&
      !state.legacy,
    'la búsqueda del inicio en un solo paso',
    25000,
  );

  console.log(
    `${LOG} PASS: búsqueda del inicio en un paso («search ${SEARCH_QUERY}» registrado, resultados en ${searched.address}).`,
  );
}

async function stopApp() {
  if (cdp) {
    try {
      cdp.close();
    } catch {}
    cdp = null;
  }
  if (!appProcess || appProcess.exitCode !== null) return;

  const exited = new Promise((resolve) => appProcess.once('exit', resolve));
  appProcess.kill();
  await Promise.race([exited, sleep(4000)]);
  if (appProcess.exitCode === null) {
    appProcess.kill('SIGKILL');
    await Promise.race([exited, sleep(2000)]);
  }
}

async function cleanup() {
  await stopApp();

  if (profileDir) {
    try {
      fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch (error) {
      console.warn(
        `${LOG} No se pudo borrar el perfil temporal: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    profileDir = '';
  }
}

try {
  if (process.platform !== 'win32') {
    console.log(`${LOG} SKIP: la prueba arranca el instalador y solo corre en Windows.`);
  } else {
    await main();
  }
} catch (error) {
  console.error(`${LOG} FAIL: ${error instanceof Error ? error.message : String(error)}`);
  if (appLogs.trim()) {
    console.error(`${LOG} Log de la app (cola):\n${appLogs.trim()}`);
  }
  process.exitCode = 1;
} finally {
  await cleanup();
}
