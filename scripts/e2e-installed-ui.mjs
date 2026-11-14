#!/usr/bin/env node
/**
 * E2E Windows: la interfaz nueva en la app Electron instalada.
 *
 * Cubre lo que el hito 3 dejaba pendiente en la app empaquetada, sin mocks:
 *   - cabecera única (un `<header>` con marca, pestañas y controles de ventana),
 *   - menú de configuración abierto, cambio de tema y persistencia tras recargar,
 *   - búsqueda del inicio en un solo paso (escribir y Enter) con un único botón
 *     de envío en el formulario,
 *   - esa misma búsqueda reaparece como chip reciente del inicio, con su ancla.
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
 * Para comprobar que la prueba no depende del idioma, con la interfaz en otro idioma:
 *   TERMINUS_E2E_LOCALE=de npm run test:e2e:installed:ui
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  launchInstalledApp,
  sleep,
  waitForExpression,
} from './lib/installed-app.mjs';

const LOG = '[e2e-installed-ui]';
// Los pasos se cuentan: el guion cierra con «STEPS: ejecutados/esperados» y el paso
// del E2E en CI compara ese número con el total, para que un paso perdido no pase.
const TOTAL_STEPS = 6;
let stepsRun = 0;
const THEME_KEY = 'termbrowser_theme_v1';
const HISTORY_KEY = 'termbrowser_cmd_history_v1';
const UI_MARKER = 'terminus-theme-select';
// La barra de direcciones se identifica por su relación con la lista de sugerencias
// (atributos del DOM, no el aria-label del idioma activo), así la prueba sirve en cualquier idioma.
const ADDRESS_SELECTOR = 'input[aria-controls="terminus-address-suggestions"]';
const SEARCH_QUERY = 'terminus e2e ui';
const LOCALE_KEY = 'terminus_locale_v1';
// Opcional: cambia el idioma de la app desde el menú antes de comprobarla.
const e2eLocale = (process.env.TERMINUS_E2E_LOCALE ?? '').trim();
const START_FORM = 'form[role="search"]';
// Ancla propia del campo de búsqueda del inicio: no depende de su posición ni del idioma.
const START_INPUT = 'input[data-e2e="start-search-input"]';
// Ancla de las chips recientes: distingue una búsqueda recordada de una sugerencia fija.
const RECENT_CHIP = '[data-e2e="recent-search"]';
// El grupo de chips y su etiqueta: el paso 6 comprueba el recorte en ventana estrecha.
const START_CHIPS = '[data-e2e="start-chips"]';
const START_CHIPS_LABEL = '[data-e2e="start-chips-label"]';
const START_SIGN = 'pre.ascii-sign-start';
// Por debajo del corte `sm` (640 px) y cerca de un móvil real.
const NARROW_WIDTH = 432;
const NARROW_QUERY = 'terminus e2e estrecho';
const THEMES = {
  msdos: { id: 'ms-dos', bg: '#000080', rgb: 'rgb(0, 0, 128)' },
  matrix: { id: 'matrix-dark', bg: '#020402', rgb: 'rgb(2, 4, 2)' },
};

/** Anota un paso superado y lo numera sobre el total esperado. */
function pass(message) {
  stepsRun += 1;
  console.log(LOG + ' PASS ' + stepsRun + '/' + TOTAL_STEPS + ': ' + message);
}

const installedExe = process.env.TERMINUS_INSTALLED_EXE
  ? path.resolve(process.env.TERMINUS_INSTALLED_EXE)
  : path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Terminus', 'Terminus.exe');

let app = null;

const ROOT_STATE_EXPRESSION = `(() => {
  const root = document.getElementById('root')?.firstElementChild ?? null;
  return {
    bg: root?.style.backgroundColor ?? null,
    theme: localStorage.getItem(${JSON.stringify(THEME_KEY)}),
  };
})()`;

/** Presses Enter through CDP so the renderer handles it as a real key press. */
async function pressEnter(client) {
  const key = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 };
  await client.send('Input.dispatchKeyEvent', { type: 'keyDown', ...key, text: '\r', unmodifiedText: '\r' });
  await client.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key });
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

  // El idioma se comprueba con el `lang` que fija la app al aplicarlo y con que quede
  // guardado; el nombre accesible de la barra solo se registra, no se compara.
  const applied = await waitForExpression(
    client,
    `(() => ({
      stored: localStorage.getItem(${JSON.stringify(LOCALE_KEY)}),
      lang: document.documentElement.lang || null,
      address: document.querySelector(${JSON.stringify(ADDRESS_SELECTOR)})?.getAttribute('aria-label') ?? null,
    }))()`,
    (state) => state.stored === e2eLocale && state.lang === e2eLocale,
    `la interfaz en ${e2eLocale}`,
    10000,
  );

  await closeSettingsMenu(client);
  console.log(
    `${LOG} Idioma de la app: ${e2eLocale} (html lang=${applied.lang}, barra: «${applied.address}»).`,
  );
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

  console.log(`${LOG} Ejecutable instalado: ${installedExe}`);

  app = await launchInstalledApp({
    exe: installedExe,
    profilePrefix: 'terminus-e2e-ui-',
    env: {
      // La prueba no navega fuera de la app; evita depender de la política de red del usuario.
      TERMINUS_BLOCK_PRIVATE: '0',
      TERMINUS_NETWORK_POLICY: 'local',
    },
  });
  const cdp = app.client;

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
  pass(`cabecera única (1 header, pestañas y controles de ventana dentro).`);

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
    ROOT_STATE_EXPRESSION,
    (state) => state.theme === chosen.id && state.bg === chosen.rgb,
    `el tema ${chosen.id} aplicado y guardado`,
    10000,
  );
  assert.notEqual(applied.bg, before.bg, 'El fondo no cambió al cambiar de tema.');
  pass(`menú abierto y tema ${before.theme} -> ${chosen.id} guardado en ${THEME_KEY}.`);

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
  pass(`tras recargar, el tema ${restored.theme} sigue aplicado y seleccionado en el menú.`);

  // 4. Búsqueda del inicio en un paso: escribir, Enter y resultados; sin botón intermedio.
  await runCommand(cdp, 'home');

  const startPage = await waitForExpression(
    cdp,
    `(() => {
      const form = document.querySelector(${JSON.stringify(START_FORM)});
      const input = form?.querySelector(${JSON.stringify(START_INPUT)}) ?? null;
      return {
        forms: document.querySelectorAll(${JSON.stringify(START_FORM)}).length,
        hasInput: Boolean(input),
        iframe: Boolean(document.querySelector('iframe')),
        formButtons: form ? form.querySelectorAll('button').length : 0,
        submitButtons: form ? form.querySelectorAll('button[type="submit"]').length : 0,
      };
    })()`,
    (state) => state.forms === 1 && state.hasInput && !state.iframe,
    'la página de inicio con su formulario de búsqueda',
    20000,
  );
  // Sin mirar textos: el formulario de inicio solo debe tener su botón de envío.
  assert.equal(startPage.formButtons, 1, 'El formulario de inicio tiene botones de más: ¿volvió el botón intermedio?');
  assert.equal(startPage.submitButtons, 1, 'El único botón del formulario de inicio no es el de envío.');

  const typed = await cdp.evaluate(`(() => {
    const form = document.querySelector(${JSON.stringify(START_FORM)});
    const input = form?.querySelector(${JSON.stringify(START_INPUT)});
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
      // Ya en los resultados, la única form[role="search"] es la de esa página.
      const form = document.querySelector(${JSON.stringify(START_FORM)});
      const input = form?.querySelector('input[type="search"]') ?? null;
      let history = [];
      try {
        history = JSON.parse(localStorage.getItem(${JSON.stringify(HISTORY_KEY)}) ?? '[]');
      } catch {}
      return {
        forms: document.querySelectorAll(${JSON.stringify(START_FORM)}).length,
        inputValue: input?.value ?? null,
        address: document.querySelector(${JSON.stringify(ADDRESS_SELECTOR)})?.value ?? null,
        commandLogged: Array.isArray(history) && history.includes('search ' + ${JSON.stringify(SEARCH_QUERY)}),
      };
    })()`,
    (state) =>
      state.forms === 1 &&
      state.inputValue === SEARCH_QUERY &&
      /\bterminus:\/\/search\b/.test(state.address ?? '') &&
      state.commandLogged,
    'la búsqueda del inicio en un solo paso',
    25000,
  );

  pass(`búsqueda del inicio en un paso («search ${SEARCH_QUERY}» registrado, resultados en ${searched.address}).`);
  // 5. La búsqueda lanzada arriba queda como chip reciente del inicio.
  await runCommand(cdp, 'home');
  const recent = await waitForExpression(
    cdp,
    `(() => {
      const form = document.querySelector(${JSON.stringify(START_FORM)});
      const chips = [...document.querySelectorAll(${JSON.stringify(RECENT_CHIP)})];
      const input = form?.querySelector(${JSON.stringify(START_INPUT)}) ?? null;
      return {
        onStart: Boolean(input),
        focused: document.activeElement === input,
        chips: chips.map((chip) => (chip.textContent ?? '').trim()),
        visible: chips
          .filter((chip) => chip.getClientRects().length > 0)
          .map((chip) => (chip.textContent ?? '').trim()),
      };
    })()`,
    (state) =>
      state.onStart &&
      state.focused &&
      state.chips[0] === SEARCH_QUERY &&
      state.visible.includes(SEARCH_QUERY),
    'la búsqueda reciente como chip del inicio y el campo enfocado',
    20000,
  );

  // Repetir `home` sin cambiar de pantalla también debe devolver el cursor al campo.
  await runCommand(cdp, 'home');
  await waitForExpression(
    cdp,
    `(() => {
      const input = document.querySelector(${JSON.stringify(START_INPUT)});
      return Boolean(input) && document.activeElement === input;
    })()`,
    (focused) => focused === true,
    'el campo del inicio enfocado al repetir "home"',
    20000,
  );

  pass(
    `la búsqueda del inicio queda como chip reciente (${recent.chips.length} guardada(s), ancla ${RECENT_CHIP}) y el campo recupera el foco al volver con "home".`,
  );

  // 6. Ventana estrecha (~430 px): el cartel del inicio cabe entero y las recientes se
  //    recortan a la más nueva, con la etiqueta del grupo oculta.
  const narrowTyped = await cdp.evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(START_INPUT)});
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(NARROW_QUERY)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
    return true;
  })()`);
  assert.equal(narrowTyped, true, 'No se pudo escribir la segunda búsqueda en el inicio.');
  await sleep(200);
  await pressEnter(cdp);

  await waitForExpression(
    cdp,
    `(() => ({
      address: document.querySelector(${JSON.stringify(ADDRESS_SELECTOR)})?.value ?? null,
      onStart: Boolean(document.querySelector(${JSON.stringify(START_INPUT)})),
    }))()`,
    (state) => /terminus:\/\/search/.test(state.address ?? '') && !state.onStart,
    'los resultados de la segunda búsqueda',
    25000,
  );

  // Dos recientes para que el recorte tenga algo que ocultar.
  await runCommand(cdp, 'home');
  await waitForExpression(
    cdp,
    `document.querySelectorAll(${JSON.stringify(RECENT_CHIP)}).length`,
    (count) => count >= 2,
    'las dos búsquedas recientes en el inicio',
    20000,
  );

  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: NARROW_WIDTH,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });

  const narrow = await waitForExpression(
    cdp,
    `(() => {
      const sign = document.querySelector(${JSON.stringify(START_SIGN)});
      const rect = sign?.getBoundingClientRect() ?? null;
      // Los glifos, no la caja: scrollWidth incluye la copia fantasma del glitch.
      const glyphs = document.createRange();
      if (sign) glyphs.selectNodeContents(sign);
      const glyphRect = glyphs.getBoundingClientRect();
      const box = document.querySelector(${JSON.stringify(START_CHIPS)});
      const label = document.querySelector(${JSON.stringify(START_CHIPS_LABEL)});
      return {
        width: window.innerWidth,
        pageWidth: document.documentElement.scrollWidth,
        fontSize: sign ? parseFloat(getComputedStyle(sign).fontSize) : 0,
        signFits: Boolean(sign) && glyphRect.width <= (rect?.width ?? 0) + 1,
        signInside: Boolean(rect) && rect.left >= -0.5 && rect.right <= window.innerWidth + 0.5,
        labelVisible: Boolean(label) && label.getClientRects().length > 0,
        chips: [...(box?.querySelectorAll('button') ?? [])].map((chip) => ({
          text: (chip.textContent ?? '').trim(),
          recent: chip.getAttribute('data-e2e') === 'recent-search',
          visible: chip.getClientRects().length > 0,
        })),
      };
    })()`,
    (state) =>
      state.width <= NARROW_WIDTH + 8 &&
      state.pageWidth <= state.width &&
      state.signFits &&
      state.signInside &&
      state.fontSize < 10 &&
      !state.labelVisible &&
      state.chips.filter((chip) => chip.recent && chip.visible).length === 1 &&
      state.chips.some((chip) => chip.recent && !chip.visible) &&
      state.chips.filter((chip) => !chip.recent).length > 0 &&
      state.chips.filter((chip) => !chip.recent).every((chip) => chip.visible),
    `el inicio a ${NARROW_WIDTH} px con el cartel entero`,
    20000,
  );

  const visibleRecent = narrow.chips.find((chip) => chip.recent && chip.visible);
  const hiddenRecent = narrow.chips.find((chip) => chip.recent && !chip.visible);
  assert.equal(visibleRecent?.text, NARROW_QUERY, 'La reciente visible no es la más nueva.');
  assert.equal(hiddenRecent?.text, SEARCH_QUERY, 'La reciente oculta no es la anterior.');

  await cdp.send('Emulation.clearDeviceMetricsOverride');

  pass(
    `ventana de ${NARROW_WIDTH} px: cartel entero (${narrow.fontSize.toFixed(2)} px, sin desbordar su caja) y solo la reciente más nueva («${NARROW_QUERY}») visible, con la etiqueta del grupo oculta.`,
  );

  assert.equal(
    stepsRun,
    TOTAL_STEPS,
    'pasos ejecutados: ' + stepsRun + '/' + TOTAL_STEPS,
  );

}

try {
  if (process.platform !== 'win32') {
    console.log(`${LOG} SKIP: la prueba arranca el instalador y solo corre en Windows.`);
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
  // El paso del E2E en CI lee esta línea para comparar con el total esperado.
  console.log(LOG + ' STEPS: ' + stepsRun + '/' + TOTAL_STEPS);
  await app?.cleanup();
}
