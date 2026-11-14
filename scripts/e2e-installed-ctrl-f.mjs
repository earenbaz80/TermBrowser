#!/usr/bin/env node
/**
 * E2E Windows: Ctrl+F en la app Electron instalada, con el foco dentro de un
 * iframe REAL cross-origin, y búsqueda real en las vistas OSCURO y TEXTO.
 *
 * La prueba no usa `electron .`: arranca el ejecutable instalado con un perfil
 * temporal, carga `https://example.com/` para el iframe REAL, sirve un fixture
 * HTTP local en otro puerto (por tanto, otro origen) y envía Ctrl+F con SendKeys.
 * Después cambia a OSCURO y TEXTO y comprueba que el buscador encuentra texto
 * dentro de cada iframe proxied.
 *
 * Requisitos:
 *   - Windows con una sesión de escritorio interactiva.
 *   - La app instalada a partir del build actual.
 *   - `npm run test:e2e:installed` (o `node scripts/e2e-installed-ctrl-f.mjs`).
 *
 * Si el ejecutable está en otra ruta:
 *   TERMINUS_INSTALLED_EXE="C:\ruta\Terminus.exe" npm run test:e2e:installed
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { suiteSteps } from './e2e-suites.mjs';
import {
  assertInstalledMatchesBuild,
  captureFailureScreenshot,
  launchInstalledApp,
  sleep,
  waitForExpression,
} from './lib/installed-app.mjs';

const LOG = '[e2e-installed-ctrl-f]';
// Los pasos se cuentan: el guion cierra con «STEPS: ejecutados/esperados» y el paso
// del E2E en CI compara ese número con el total, para que un paso perdido no pase.
// El total vive en `e2e-suites.mjs`, la misma lista que lee el CI.
const TOTAL_STEPS = suiteSteps('ctrl-f');
let stepsRun = 0;
let stepStartedAt = Date.now();
const FIND_SHORTCUT_MARKER = 'terminus:find:shortcut';
// La barra de direcciones se identifica por su relación con la lista de sugerencias
// (atributos del DOM, no el aria-label del idioma activo), así la prueba sirve en cualquier idioma.
const ADDRESS_SELECTOR = 'input[aria-controls="terminus-address-suggestions"]';
const EXTERNAL_URL = 'https://example.com/';

// --- Anclas del DOM (ninguna depende del idioma activo) ---
// Conmutador del buscador: atributo fijo de teclado, no la etiqueta traducida.
const FIND_TOGGLE = 'button[aria-keyshortcuts="Control+F"]';
// Buscador: `data-e2e` es la ancla; lo que va tras la coma o el `??` es el respaldo
// para la 0.3.0 instalada, que todavía no lleva los atributos.
const FIND_DIALOG_EXPRESSION = `document.querySelector('[data-e2e="find-bar"]')
    ?? [...document.querySelectorAll('[role="dialog"]')]
      .find((item) => item.querySelector('[aria-live="polite"]'))`;
const FIND_INPUT_SELECTOR = '[data-e2e="find-input"], input';
const FIND_STATUS_SELECTOR = '[data-e2e="find-status"], [aria-live="polite"]';
// Conmutadores de vista: `data-e2e="view-mode-<id>"`; el respaldo son los únicos
// `aria-pressed` fuera de un diálogo, en el orden en que PAGE_MODES los pinta.
const MODE_INDEX = { real: 0, dark: 1, text: 2 };
// La consulta, el estado y el modo del iframe salen de una sola lectura.
const FIND_BAR_EXPRESSION = `(() => {
  const dialog = ${FIND_DIALOG_EXPRESSION};
  const input = dialog?.querySelector('${FIND_INPUT_SELECTOR}') ?? null;
  const status = dialog?.querySelector('${FIND_STATUS_SELECTOR}');
  const frame = document.querySelector('iframe');
  let frameMode = null;
  try { frameMode = frame ? new URL(frame.src).searchParams.get('mode') : null; } catch {}
  return {
    open: Boolean(dialog),
    value: input?.value ?? null,
    status: status?.textContent?.trim() ?? '',
    focused: document.activeElement === input,
    frameMode,
  };
})()`;

/** Anota un paso superado, lo numera sobre el total y registra lo que tardó. */
function pass(message) {
  stepsRun += 1;
  const seconds = ((Date.now() - stepStartedAt) / 1000).toFixed(1).replace('.', ',');
  stepStartedAt = Date.now();
  console.log(LOG + ' PASS ' + stepsRun + '/' + TOTAL_STEPS + ': ' + message + ` (${seconds} s)`);
}

const installedExe = process.env.TERMINUS_INSTALLED_EXE
  ? path.resolve(process.env.TERMINUS_INSTALLED_EXE)
  : path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Terminus', 'Terminus.exe');

let app = null;
let fixtureServer = null;

function startFixtureServer() {
  const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <title>Terminus E2E fixture</title>
    <style>
      html, body { height: 100%; margin: 0; }
      body { display: grid; place-items: center; background: #f6f3ea; color: #17211c; font: 20px/1.4 sans-serif; }
      main { max-width: 520px; padding: 32px; text-align: center; }
    </style>
  </head>
  <body>
    <main>
      <h1>Fixture cross-origin</h1>
      <p>Esta página se sirve en un puerto distinto al de Terminus para que el iframe REAL sea cross-origin.</p>
      <p>La prueba debe abrir el buscador desde aquí con Ctrl+F.</p>
    </main>
  </body>
</html>`;

  return new Promise((resolve, reject) => {
    const server = http.createServer((_request, response) => {
      response.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      response.end(html);
    });
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      if (!port) {
        server.close();
        reject(new Error('El fixture no pudo abrir un puerto.'));
        return;
      }
      resolve({ server, url: `http://127.0.0.1:${port}/` });
    });
  });
}

/** Pulsa el conmutador de la vista y espera a que el proxy sirva el fixture en ese modo. */
async function selectProxiedView(client, mode, expectedText) {
  const clicked = await client.evaluate(`(() => {
    const exact = document.querySelector('[data-e2e="view-mode-${mode}"]');
    if (exact) {
      exact.click();
      return { clicked: true, exact: true };
    }
    const buttons = [...document.querySelectorAll('button[aria-pressed]')]
      .filter((button) => !button.closest('[role="dialog"]'));
    const button = buttons[${MODE_INDEX[mode]}];
    if (!button) return { clicked: false, exact: false, count: buttons.length };
    button.click();
    return { clicked: true, exact: false, count: buttons.length };
  })()`);
  assert.equal(clicked.clicked, true, `No se encontró el conmutador de la vista ${mode}.`);
  // La 0.3.0 instalada no lleva data-e2e: solo entonces se depende del orden.
  if (!clicked.exact) {
    assert.equal(clicked.count, 3, `Se esperaban 3 conmutadores de vista y hay ${clicked.count}.`);
  }

  // Una sola espera: el iframe cambia de modo y el proxy sirve el fixture con su texto.
  const state = await waitForExpression(
    client,
    `(async () => {
      const frame = document.querySelector('iframe');
      let frameMode = null;
      try { frameMode = frame ? new URL(frame.src).searchParams.get('mode') : null; } catch {}
      if (!frame || frameMode !== ${JSON.stringify(mode)}) return { frameMode };
      try {
        const response = await fetch(frame.src, { cache: 'no-store' });
        const html = await response.text();
        return { iframe: frame.src, hasText: html.includes(${JSON.stringify(expectedText)}) };
      } catch (error) {
        return { iframe: frame.src, hasText: false, error: String(error) };
      }
    })()`,
    (value) => Boolean(value && value.hasText),
    `la vista ${mode} con el fixture servido`,
    15000,
  );

  return state;
}

async function navigateToPage(client, url, expectedFramePart) {
  const address = JSON.stringify(ADDRESS_SELECTOR);
  await client.evaluate(`(() => {
    const input = document.querySelector(${address});
    if (!input) return false;
    input.focus();
    input.select();
    return true;
  })()`);
  await client.send('Input.insertText', { text: url });
  await waitForExpression(
    client,
    `document.querySelector(${address})?.value`,
    (value) => value === url,
    `la URL ${url} en la barra de direcciones`,
    5000,
  );
  await sleep(200);
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
  await waitForExpression(
    client,
    `document.querySelector('iframe')?.src ?? null`,
    (src) => Boolean(src && src.includes(expectedFramePart)),
    `el iframe ${expectedFramePart}`,
    20000,
  );
}

/**
 * Pulsa un botón del buscador por su `data-e2e`; si la app instalada aún no lo lleva,
 * cae a la posición dentro del diálogo (0 anterior, 1 siguiente, 2 cerrar).
 */
async function clickFindControl(client, action, fallbackIndex) {
  return client.evaluate(`(() => {
    const dialog = ${FIND_DIALOG_EXPRESSION};
    if (!dialog) return false;
    const button = dialog.querySelector('[data-e2e="find-${action}"]')
      ?? [...dialog.querySelectorAll('button')][${fallbackIndex}];
    if (!button) return false;
    button.click();
    return true;
  })()`);
}

async function closeFindBar(client) {
  await clickFindControl(client, 'close', 2);
  await waitForExpression(client, FIND_BAR_EXPRESSION, (state) => !state.open, 'el cierre del buscador', 5000);
}

async function openFindBar(client) {
  const opened = await client.evaluate(`(() => {
    const toggle = document.querySelector('${FIND_TOGGLE}');
    if (!toggle) return false;
    toggle.click();
    return true;
  })()`);
  assert.equal(opened, true, `No se encontró el conmutador del buscador (${FIND_TOGGLE}).`);

  return waitForExpression(
    client,
    FIND_BAR_EXPRESSION,
    (state) => state.open && state.focused,
    'el buscador abierto con su campo enfocado',
    5000,
  );
}

async function setFindQuery(client, text) {
  const changed = await client.evaluate(`(() => {
    const dialog = ${FIND_DIALOG_EXPRESSION};
    const input = dialog?.querySelector('${FIND_INPUT_SELECTOR}');
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(text)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  assert.equal(changed, true, 'No se encontró el campo del buscador.');
}

/**
 * Espera a que el buscador reporte un estado nuevo para la consulta y se repita.
 * El texto está traducido, así que la coincidencia se comprueba por comportamiento:
 * el estado de una consulta presente debe ser distinto del de una ausente, y estable.
 */
async function waitForSettledStatus(client, query, mode, previousStatus) {
  const deadline = Date.now() + 20000;
  let last = null;
  let confirmed = null;

  while (Date.now() < deadline) {
    const state = await client.evaluate(FIND_BAR_EXPRESSION);
    if (state.value !== query) {
      throw new Error(`El buscador perdió el texto «${query}»: ahora tiene «${state.value}».`);
    }

    if (state.status && state.status !== previousStatus) {
      if (confirmed?.status === state.status) {
        assert.equal(state.frameMode, mode, `La búsqueda cambió la vista ${mode} por otra.`);
        return state;
      }
      confirmed = state;
      await sleep(300);
      continue;
    }

    last = state;
    // Sin estado nuevo: el iframe proxied puede estar cargando o window.find necesita otra pasada.
    await clickFindControl(client, 'next', 1);
    await sleep(300);
  }

  throw new Error(
    `El buscador no dio un estado distinto de «${previousStatus}» para «${query}». Último estado: ${JSON.stringify(last)}`,
  );
}

/** Selecciona la vista, comprueba que el proxy sirve el fixture y busca texto real en ella. */
async function searchInView(client, mode, query) {
  await selectProxiedView(client, mode, 'Fixture cross-origin');

  await closeFindBar(client);
  const bar = await openFindBar(client);
  await setFindQuery(client, query);
  const matched = await waitForSettledStatus(client, query, mode, bar.status);

  // Una consulta que no está en la página tiene que dar otro estado; si no, el
  // «match» anterior no significaba nada.
  const absent = `${query}-ausente-${Date.now()}`;
  await setFindQuery(client, absent);
  await waitForSettledStatus(client, absent, mode, matched.status);

  return matched;
}

/**
 * Recorre las coincidencias con los botones del buscador.
 *
 * El estado del buscador no numera coincidencias (solo dice si hay o no) y el
 * iframe va con `sandbox`, así que no se puede leer su selección desde la app.
 * Lo que sí se ve es el aviso que el documento proxied devuelve a la app: cada
 * pulsación de «siguiente» o «anterior» tiene que producir una búsqueda nueva con
 * resultado, que es lo que distingue un botón conectado de uno que no hace nada.
 */
async function stepFindNavigation(client) {
  const query = 'cross-origin';
  const before = await client.evaluate(FIND_BAR_EXPRESSION);

  await client.evaluate(`(() => {
    window.__terminusE2EFindResults = [];
    if (window.__terminusE2EFindListener) {
      window.removeEventListener('message', window.__terminusE2EFindListener);
    }
    window.__terminusE2EFindListener = (event) => {
      const data = event.data;
      if (data && data.source === 'termbrowser-find-result') {
        window.__terminusE2EFindResults.push(Boolean(data.found));
      }
    };
    window.addEventListener('message', window.__terminusE2EFindListener);
    return true;
  })()`);

  await setFindQuery(client, query);
  const matched = await waitForSettledStatus(client, query, 'text', before.status);

  const clearResults = () => client.evaluate('(window.__terminusE2EFindResults.length = 0)');
  const takeResults = () => client.evaluate('window.__terminusE2EFindResults.slice()');
  const press = async (action, index) => {
    await clearResults();
    assert.equal(await clickFindControl(client, action, index), true, `No se encontró el botón «${action}».`);
    await sleep(400);
    const results = await takeResults();
    assert.ok(
      results.length >= 1,
      `«${action}» no envió ninguna búsqueda al documento proxied: ${JSON.stringify(results)}.`,
    );
    assert.ok(
      results.every(Boolean),
      `«${action}» encontró el texto unas veces y otras no: ${JSON.stringify(results)}.`,
    );
    const state = await client.evaluate(FIND_BAR_EXPRESSION);
    assert.equal(state.open, true, `El buscador se cerró al pulsar «${action}».`);
    assert.equal(state.value, query, `El buscador perdió la consulta: «${state.value}».`);
    assert.equal(state.status, matched.status, `El estado cambió al pulsar «${action}»: «${state.status}».`);
    return results.length;
  };

  const nextRuns = await press('next', 1);
  const prevRuns = await press('prev', 0);
  return { nextRuns, prevRuns, status: matched.status };
}

/** Cierra el buscador con Escape, como el usuario, y exige que el conmutador vuelva a su sitio. */
async function stepEscapeClose(client) {
  const key = { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 };
  await client.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...key });
  await client.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key });

  return waitForExpression(
    client,
    `(() => {
      const bar = ${FIND_BAR_EXPRESSION};
      const toggle = document.querySelector('${FIND_TOGGLE}');
      return { open: bar.open, expanded: toggle?.getAttribute('aria-expanded') ?? null };
    })()`,
    (state) => !state.open,
    'el cierre del buscador con Escape',
    5000,
  );
}

function sendNativeCtrlF(pid) {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    'Add-Type -AssemblyName System.Windows.Forms',
    'Add-Type @"',
    'using System;',
    'using System.Runtime.InteropServices;',
    'public class TerminusForeground {',
    '  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
    '}',
    '"@',
    `$process = Get-Process -Id ${pid}`,
    'for ($i = 0; $i -lt 40 -and $process.MainWindowHandle -eq 0; $i++) { Start-Sleep -Milliseconds 250; $process.Refresh() }',
    "if ($process.MainWindowHandle -eq 0) { throw 'La ventana principal no está disponible.' }",
    '$shell = New-Object -ComObject WScript.Shell',
    '$handle = $process.MainWindowHandle',
    '$inForeground = $false',
    'for ($i = 0; $i -lt 5 -and -not $inForeground; $i++) {',
    '  [void]$shell.AppActivate($process.Id)',
    '  Start-Sleep -Milliseconds 400',
    '  $inForeground = ([TerminusForeground]::GetForegroundWindow() -eq $handle)',
    '}',
    "if (-not $inForeground) { throw 'No se pudo poner Terminus en primer plano: la ventana activa es otra.' }",
    "[System.Windows.Forms.SendKeys]::SendWait('^f')",
    "Write-Output 'sent'",
  ].join('\r\n');

  try {
    const output = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      {
        encoding: 'utf8',
        timeout: 15000,
        windowsHide: true,
      },
    );
    assert.match(output, /sent/i);
  } catch (error) {
    const stderr = error && typeof error === 'object' && 'stderr' in error ? String(error.stderr) : '';
    throw new Error(
      `No se pudo enviar Ctrl+F con entrada nativa: ${stderr.trim() || (error instanceof Error ? error.message : String(error))}`,
    );
  }
}

/** Espera corta a que el buscador esté abierto; devuelve si lo consiguió. */
async function waitFindOpen(client, timeoutMs) {
  try {
    await waitForExpression(
      client,
      `${FIND_BAR_EXPRESSION}.open`,
      Boolean,
      'que Ctrl+F abriera el buscador',
      timeoutMs,
    );
    return true;
  } catch {
    return false;
  }
}

/** Envía Ctrl+F por CDP: el mismo before-input-event que la tecla real, sin ventana activa. */
async function sendCtrlFViaCdp(client) {
  await client.send('Input.dispatchKeyEvent', {
    type: 'rawKeyDown',
    modifiers: 2,
    key: 'f',
    code: 'KeyF',
    windowsVirtualKeyCode: 70,
    nativeVirtualKeyCode: 70,
  });
  await client.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    modifiers: 2,
    key: 'f',
    code: 'KeyF',
    windowsVirtualKeyCode: 70,
    nativeVirtualKeyCode: 70,
  });
}

/**
 * Abre el buscador con Ctrl+F. Primero la tecla nativa, que prueba el atajo del sistema;
 * si otra ventana retiene el primer plano o la tecla se pierde, CDP recorre el mismo
 * before-input-event de Chromium y el mismo IPC de la app, sin depender de la ventana activa.
 */
async function pressCtrlF(client, pid) {
  let nativeProblem = null;
  try {
    sendNativeCtrlF(pid);
  } catch (error) {
    nativeProblem = error instanceof Error ? error.message : String(error);
  }

  if (!nativeProblem && (await waitFindOpen(client, 3000))) {
    return 'nativo';
  }

  console.log(`${LOG} Ctrl+F por CDP: ${nativeProblem ?? 'la tecla nativa no abrió el buscador'}`);
  await sendCtrlFViaCdp(client);
  if (!(await waitFindOpen(client, 3000))) {
    throw new Error(
      'Ctrl+F no abrió el buscador ni con la tecla nativa ni por CDP: la app no responde al atajo.',
    );
  }
  return 'CDP';
}

async function main() {
  assert.ok(
    process.platform === 'win32',
    'Esta prueba requiere Windows porque envía Ctrl+F con SendKeys.',
  );
  assert.ok(
    fs.existsSync(installedExe),
    `No se encontró la app instalada en ${installedExe}. Instala el build actual o define TERMINUS_INSTALLED_EXE.`,
  );

  // Si hay un build local, tiene que ser exactamente el que está instalado: así un
  // instalador viejo se detecta aquí y no como un timeout confuso más adelante.
  const installed = assertInstalledMatchesBuild({ exe: installedExe });
  const asarPath = installed.asar;
  if (installed.compared) {
    console.log(`${LOG} Instalación verificada: el app.asar es el del build local.`);
  }
  assert.ok(
    fs.readFileSync(asarPath).includes(Buffer.from(FIND_SHORTCUT_MARKER)),
    'La app instalada no contiene el atajo global. Instala el build actual antes de ejecutar la prueba.',
  );

  const fixture = await startFixtureServer();
  fixtureServer = fixture.server;

  console.log(`${LOG} Ejecutable instalado: ${installedExe}`);
  console.log(`${LOG} Fixture cross-origin: ${fixture.url}`);

  app = await launchInstalledApp({
    exe: installedExe,
    profilePrefix: 'terminus-e2e-',
    env: {
      // El fixture vive en loopback; no debe depender de la política de red del usuario.
      TERMINUS_BLOCK_PRIVATE: '0',
      TERMINUS_NETWORK_POLICY: 'local',
    },
  });
  const cdp = app.client;

  // La barra de direcciones tiene que estar visible antes de escribir en ella.
  await waitForExpression(
    cdp,
    `(() => {
      const input = document.querySelector('${ADDRESS_SELECTOR}');
      const rect = input?.getBoundingClientRect();
      return rect ? { width: rect.width, height: rect.height } : null;
    })()`,
    (rect) => Boolean(rect && rect.width > 100 && rect.height > 0),
    'la barra de direcciones visible',
    10000,
  );

  await navigateToPage(cdp, EXTERNAL_URL, 'example.com');

  // La vista REAL usa un iframe directo (sin `?mode`), así que no pasa por searchInView:
  // aquí solo se comprueba que el conmutador existe y deja la página cross-origin.
  const realClicked = await cdp.evaluate(`(() => {
    const button = document.querySelector('[data-e2e="view-mode-real"]')
      ?? [...document.querySelectorAll('button[aria-pressed]')]
        .filter((item) => !item.closest('[role="dialog"]'))[${MODE_INDEX.real}];
    if (!button) return false;
    button.click();
    return true;
  })()`);
  assert.equal(realClicked, true, 'No se encontró el conmutador de la vista REAL.');

  const direct = await waitForExpression(
    cdp,
    `(() => {
      const frame = document.querySelector('iframe');
      const rect = frame?.getBoundingClientRect();
      return {
        appUrl: location.href,
        iframe: frame?.src ?? null,
        rect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
      };
    })()`,
    (state) => state.iframe === EXTERNAL_URL && Boolean(state.rect),
    'el iframe REAL directo',
    15000,
  );

  assert.notEqual(
    new URL(direct.iframe).origin,
    new URL(direct.appUrl).origin,
    'El iframe de prueba debe ser cross-origin respecto a la app.',
  );
  assert.ok(
    direct.rect.width > 100 && direct.rect.height > 100,
    'El iframe REAL no tiene un área visible suficiente.',
  );

  const frameX = direct.rect.x + direct.rect.width / 2;
  const frameY = direct.rect.y + direct.rect.height / 2;
  let focused = null;
  const focusDeadline = Date.now() + 10000;
  while (Date.now() < focusDeadline) {
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: frameX,
      y: frameY,
      button: 'left',
      clickCount: 1,
      buttons: 1,
    });
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: frameX,
      y: frameY,
      button: 'left',
      clickCount: 1,
      buttons: 0,
    });
    await sleep(250);

    const state = await cdp.evaluate(`(() => ({
      active: document.activeElement?.tagName ?? null,
      findDialog: ${FIND_BAR_EXPRESSION}.open,
    }))()`);
    if (state.active === 'IFRAME') {
      focused = state;
      break;
    }
    // La navegación del iframe puede devolver el foco a BODY; reintenta tras cargar.
    await sleep(250);
  }

  assert.ok(focused, 'El iframe REAL no recibió el foco tras varios clics.');
  assert.equal(focused.findDialog, false, 'El buscador no debe estar abierto antes de enviar Ctrl+F.');

  const shortcutRoute = await pressCtrlF(cdp, app.pid);

  const findState = await waitForExpression(
    cdp,
    `(() => {
      const bar = ${FIND_BAR_EXPRESSION};
      const toggle = document.querySelector('${FIND_TOGGLE}');
      const active = document.activeElement;
      return {
        ...bar,
        activeElement:
          (active?.tagName ?? '') +
          (active?.getAttribute('aria-label') ? '[' + active.getAttribute('aria-label') + ']' : ''),
        expanded: toggle?.getAttribute('aria-expanded') ?? null,
        iframe: document.querySelector('iframe')?.src ?? null,
      };
    })()`,
    (state) => state.open && state.focused && state.expanded === 'true',
    'el buscador abierto con el campo enfocado',
    10000,
  );

  assert.equal(findState.focused, true, 'El campo de búsqueda no recibió el foco.');
  assert.equal(findState.expanded, 'true', 'El conmutador del buscador no quedó expandido.');
  assert.equal(findState.iframe, EXTERNAL_URL, 'El iframe cambió después de abrir el buscador.');

  console.log(`${LOG} Ruta del atajo: ${shortcutRoute}`);
  pass('Ctrl+F abrió el buscador en la app instalada.');
  console.log(`${LOG} Foco: ${findState.activeElement}`);
  console.log(`${LOG} iframe: ${findState.iframe}`);

  // El fixture local es privado a propósito: REAL debe mantenerlo en /api/view.
  // Se cierra el buscador para no arrastrarlo a la navegación, y se vuelve al fixture
  // para las búsquedas deterministas en las vistas proxied.
  await closeFindBar(cdp);
  await navigateToPage(cdp, fixture.url, '/api/view');

  const dark = await searchInView(cdp, 'dark', 'Fixture');
  pass(`búsqueda en OSCURO (${dark.status}).`);
  console.log(`${LOG} Vista OSCURO: ${dark.frameMode}`);

  const text = await searchInView(cdp, 'text', 'buscador');
  pass(`búsqueda en TEXTO (${text.status}).`);
  console.log(`${LOG} Vista TEXTO: ${text.frameMode}`);

  const navigation = await stepFindNavigation(cdp);
  pass(
    `siguiente y anterior buscan otra coincidencia (${navigation.nextRuns} y ${navigation.prevRuns} búsquedas, ${navigation.status}).`,
  );

  const closed = await stepEscapeClose(cdp);
  assert.equal(closed.expanded, 'false', 'El conmutador del buscador quedó expandido tras Escape.');
  pass('Escape cerró el buscador y el conmutador volvió a su sitio.');

  assert.equal(
    stepsRun,
    TOTAL_STEPS,
    'pasos ejecutados: ' + stepsRun + '/' + TOTAL_STEPS,
  );
}

try {
  if (process.platform !== 'win32') {
    console.log(`${LOG} SKIP: la prueba usa SendKeys y solo corre en Windows.`);
  } else {
    await main();
  }
} catch (error) {
  console.error(`${LOG} FAIL: ${error instanceof Error ? error.message : String(error)}`);
  if (app?.logs().trim()) {
    console.error(`${LOG} Log de la app (cola):\n${app.logs().trim()}`);
  }
  // Una imagen del estado en el momento del fallo ahorra adivinar con el JSON del timeout.
  await captureFailureScreenshot(app?.client, 'ctrl-f');
  process.exitCode = 1;
} finally {
  // El paso del E2E en CI lee esta línea para comparar con el total esperado.
  console.log(LOG + ' STEPS: ' + stepsRun + '/' + TOTAL_STEPS);
  await app?.cleanup();

  if (fixtureServer) {
    const server = fixtureServer;
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
}
