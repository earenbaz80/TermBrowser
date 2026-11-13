#!/usr/bin/env node
/**
 * E2E Windows: Ctrl+F en la app Electron instalada, con el foco dentro de un
 * iframe REAL cross-origin, y búsqueda real en las vistas OSCURO y TEXTO.
 *
 * La prueba no usa `electron .` ni `example.com`: arranca el ejecutable
 * instalado con un perfil temporal, sirve un fixture HTTP local en otro puerto
 * (por tanto, otro origen) y envía Ctrl+F mediante SendKeys de Windows.
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
import {
  launchInstalledApp,
  sleep,
  waitForExpression,
} from './lib/installed-app.mjs';

const LOG = '[e2e-installed-ctrl-f]';
const FIND_SHORTCUT_MARKER = 'terminus:find:shortcut';
// La barra de direcciones se identifica por su relación con la lista de sugerencias
// (atributos del DOM, no el aria-label del idioma activo), así la prueba sirve en cualquier idioma.
const ADDRESS_SELECTOR = 'input[aria-controls="terminus-address-suggestions"]';
const EXTERNAL_URL = 'https://example.com/';

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
      <p data-e2e="fixture">La prueba debe abrir el buscador desde aquí con Ctrl+F.</p>
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

/** Confirms that the server is already serving the selected proxied view. */
async function waitForProxiedPage(client, mode, expectedText, timeoutMs = 15000) {
  return waitForExpression(
    client,
    `(async () => {
      const frame = document.querySelector('iframe');
      if (!frame) return { error: 'sin iframe' };
      let frameMode = null;
      try { frameMode = new URL(frame.src).searchParams.get('mode'); } catch {}
      if (frameMode !== ${JSON.stringify(mode)}) return { error: 'iframe en modo ' + frameMode };
      try {
        const response = await fetch(frame.src, { cache: 'no-store' });
        const html = await response.text();
        return {
          status: response.status,
          hasText: html.includes(${JSON.stringify(expectedText)}),
          sample: html.slice(0, 240),
        };
      } catch (error) {
        return { error: String(error) };
      }
    })()`,
    (state) => Boolean(state && state.hasText),
    `el HTML proxied de la vista ${mode}`,
    timeoutMs,
  );
}

async function selectViewMode(client, mode) {
  const label = mode === 'dark' ? 'OSCURO' : 'TEXTO';
  const clicked = await client.evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find((item) => item.textContent.trim() === ${JSON.stringify(label)});
    if (!button) return false;
    button.click();
    return true;
  })()`);
  assert.equal(clicked, true, `No se encontró el control ${label}.`);

  const state = await waitForExpression(
    client,
    `(() => {
      const frame = document.querySelector('iframe');
      let frameMode = null;
      try { frameMode = frame ? new URL(frame.src).searchParams.get('mode') : null; } catch {}
      const button = [...document.querySelectorAll('button')].find((item) => item.textContent.trim() === ${JSON.stringify(label)});
      return {
        iframe: frame?.src ?? null,
        frameMode,
        pressed: button?.getAttribute('aria-pressed') ?? null,
      };
    })()`,
    (value) => value.frameMode === mode && value.pressed === 'true',
    `la vista ${label}`,
    15000,
  );

  assert.ok(state.iframe, `La vista ${label} no creó un iframe.`);
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

async function closeFindBar(client) {
  const closed = await client.evaluate(`(() => {
    const button = document.querySelector('button[aria-label="Cerrar búsqueda en la página"]');
    if (!button) return false;
    button.click();
    return true;
  })()`);
  if (!closed) return;

  await waitForExpression(
    client,
    `!document.querySelector('[role="dialog"][aria-label="Buscar en la página"]')`,
    Boolean,
    'el cierre del buscador',
    5000,
  );
}

async function openFindBar(client) {
  const opened = await client.evaluate(`(() => {
    const button = document.querySelector('button[aria-label="Buscar en la página"]');
    if (!button) return false;
    button.click();
    return true;
  })()`);
  assert.equal(opened, true, 'No se encontró el botón «Buscar en la página».');

  await waitForExpression(
    client,
    `document.activeElement === document.querySelector('input[aria-label="Texto a buscar en la página"]')`,
    Boolean,
    'el foco en el campo de búsqueda',
    5000,
  );
}

/** Selects a proxied view, waits for its content and verifies a real window.find() match. */
async function searchInView(client, mode, query) {
  await selectViewMode(client, mode);
  await waitForProxiedPage(client, mode, 'Fixture cross-origin');

  await closeFindBar(client);
  await openFindBar(client);
  await client.send('Input.insertText', { text: query });
  await waitForExpression(
    client,
    `document.querySelector('input[aria-label="Texto a buscar en la página"]')?.value ?? null`,
    (value) => value === query,
    `el texto «${query}» en el buscador`,
    5000,
  );

  const deadline = Date.now() + 15000;
  let lastState = null;
  while (Date.now() < deadline) {
    lastState = await client.evaluate(`(() => {
      const dialog = document.querySelector('[role="dialog"][aria-label="Buscar en la página"]');
      const input = document.querySelector('input[aria-label="Texto a buscar en la página"]');
      const frame = document.querySelector('iframe');
      let frameMode = null;
      try { frameMode = frame ? new URL(frame.src).searchParams.get('mode') : null; } catch {}
      return {
        value: input?.value ?? null,
        status: dialog?.querySelector('[aria-live="polite"]')?.textContent?.trim() ?? '',
        iframe: frame?.src ?? null,
        frameMode,
      };
    })()`);

    if (lastState.status === 'Coincidencia encontrada') {
      assert.equal(lastState.value, query, 'El buscador perdió el texto de la consulta.');
      assert.equal(lastState.frameMode, mode, `La búsqueda cambió la vista ${mode} por otra.`);
      return lastState;
    }

    // Reintenta mientras el iframe proxied termina de cargar o window.find necesita otra pasada.
    await client.evaluate(
      `document.querySelector('button[aria-label="Siguiente coincidencia"]')?.click()`,
    );
    await sleep(300);
  }

  throw new Error(
    `No se encontró «${query}» en la vista ${mode}. Último estado: ${JSON.stringify(lastState)}`,
  );
}

function sendNativeCtrlF(pid) {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    'Add-Type -AssemblyName System.Windows.Forms',
    `$process = Get-Process -Id ${pid}`,
    'for ($i = 0; $i -lt 40 -and $process.MainWindowHandle -eq 0; $i++) { Start-Sleep -Milliseconds 250; $process.Refresh() }',
    "if ($process.MainWindowHandle -eq 0) { throw 'La ventana principal no está disponible.' }",
    '$shell = New-Object -ComObject WScript.Shell',
    '$activated = $shell.AppActivate($process.Id)',
    "if (-not $activated) { throw 'No se pudo activar la ventana de Terminus.' }",
    'Start-Sleep -Milliseconds 500',
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

async function main() {
  assert.ok(
    process.platform === 'win32',
    'Esta prueba requiere Windows porque envía Ctrl+F con SendKeys.',
  );
  assert.ok(
    fs.existsSync(installedExe),
    `No se encontró la app instalada en ${installedExe}. Instala el build actual o define TERMINUS_INSTALLED_EXE.`,
  );

  const asarPath = path.join(path.dirname(installedExe), 'resources', 'app.asar');
  assert.ok(fs.existsSync(asarPath), `No se encontró el paquete instalado: ${asarPath}`);
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

  const address = JSON.stringify(ADDRESS_SELECTOR);
  await waitForExpression(
    cdp,
    `Boolean(document.querySelector(${address}))`,
    Boolean,
    'la barra de direcciones',
    10000,
  );

  const addressRect = await cdp.evaluate(`(() => {
    const input = document.querySelector(${address});
    const rect = input.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  })()`);
  assert.ok(addressRect.width > 100 && addressRect.height > 0, 'La barra de direcciones no es visible.');

  const addressX = addressRect.x + addressRect.width / 2;
  const addressY = addressRect.y + addressRect.height / 2;
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: addressX,
    y: addressY,
    button: 'left',
    clickCount: 1,
    buttons: 1,
  });
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: addressX,
    y: addressY,
    button: 'left',
    clickCount: 1,
    buttons: 0,
  });
  await cdp.evaluate(`document.querySelector(${address}).select()`);
  await cdp.send('Input.insertText', { text: EXTERNAL_URL });
  await waitForExpression(
    cdp,
    `document.querySelector(${address})?.value`,
    (value) => value === EXTERNAL_URL,
    'la URL pública en la barra de direcciones',
    5000,
  );
  // Deja que React aplique el valor antes de enviar Enter; el DOM puede actualizarse antes.
  await sleep(200);

  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Enter',
    code: 'Enter',
    text: '\r',
    unmodifiedText: '\r',
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  });
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  });

  await waitForExpression(
    cdp,
    `(() => {
      const frame = document.querySelector('iframe');
      return { src: frame?.src ?? null, address: document.querySelector(${address})?.value ?? null };
    })()`,
    (state) => Boolean(state.src),
    'el iframe de la página',
    20000,
  );

  const realClicked = await cdp.evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find((item) => item.textContent.trim() === 'REAL');
    if (!button) return false;
    button.click();
    return true;
  })()`);
  assert.equal(realClicked, true, 'No se encontró el control REAL.');

  const direct = await waitForExpression(
    cdp,
    `(() => {
      const frame = document.querySelector('iframe');
      const rect = frame?.getBoundingClientRect();
      const real = [...document.querySelectorAll('button')].find((item) => item.textContent.trim() === 'REAL');
      return {
        appUrl: location.href,
        iframe: frame?.src ?? null,
        realPressed: real?.getAttribute('aria-pressed') ?? null,
        rect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
      };
    })()`,
    (state) => state.iframe === EXTERNAL_URL && state.realPressed === 'true' && Boolean(state.rect),
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
      findDialog: Boolean(document.querySelector('[role="dialog"][aria-label="Buscar en la página"]')),
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

  sendNativeCtrlF(app.pid);

  const findState = await waitForExpression(
    cdp,
    `(() => {
      const dialog = document.querySelector('[role="dialog"][aria-label="Buscar en la página"]');
      const input = document.querySelector('input[aria-label="Texto a buscar en la página"]');
      const toggle = document.querySelector('button[aria-label="Buscar en la página"]');
      return {
        dialog: Boolean(dialog),
        input: Boolean(input),
        focused: document.activeElement === input,
        activeElement: document.activeElement?.tagName +
          (document.activeElement?.getAttribute('aria-label')
            ? '[' + document.activeElement.getAttribute('aria-label') + ']'
            : ''),
        expanded: toggle?.getAttribute('aria-expanded') ?? null,
        iframe: document.querySelector('iframe')?.src ?? null,
      };
    })()`,
    (state) => state.dialog && state.input && state.focused && state.expanded === 'true',
    'el diálogo «Buscar en la página» con el campo enfocado',
    10000,
  );

  assert.equal(findState.input, true, 'No apareció el campo de búsqueda.');
  assert.equal(findState.focused, true, 'El campo de búsqueda no recibió el foco.');
  assert.equal(findState.expanded, 'true', 'El botón de búsqueda no quedó expandido.');
  assert.equal(findState.iframe, EXTERNAL_URL, 'El iframe cambió después de abrir el buscador.');

  console.log(`${LOG} PASS: Ctrl+F abrió «Buscar en la página» en la app instalada.`);
  console.log(`${LOG} Foco: ${findState.activeElement}`);
  console.log(`${LOG} iframe: ${findState.iframe}`);

  // The local fixture is intentionally private: REAL must keep it on /api/view.
  // Navigate back to the fixture for the deterministic proxied find tests.
  await closeFindBar(cdp);
  await navigateToPage(cdp, fixture.url, '/api/view');

  const dark = await searchInView(cdp, 'dark', 'Fixture');
  console.log(`${LOG} PASS: búsqueda en OSCURO (${dark.status}).`);
  console.log(`${LOG} iframe OSCURO: ${dark.iframe}`);

  const text = await searchInView(cdp, 'text', 'buscador');
  console.log(`${LOG} PASS: búsqueda en TEXTO (${text.status}).`);
  console.log(`${LOG} iframe TEXTO: ${text.iframe}`);
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
  process.exitCode = 1;
} finally {
  await app?.cleanup();

  if (fixtureServer) {
    const server = fixtureServer;
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
}
