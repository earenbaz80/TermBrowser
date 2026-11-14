/* global document, getComputedStyle, window */
/**
 * E2E de adblock sobre la app empaquetada (`release/win-unpacked/Terminus.exe`).
 *
 * Arranca con un perfil temporal propio (`--user-data-dir`) para que local y CI
 * prueben el mismo escenario frío y no dependa de la caché del usuario.
 *
 * Depende de internet (example.com y las listas de Ghostery), así que el guion
 * comprueba esos destinos antes de arrancar y distingue los fallos:
 *   - código 0: `E2E_ADBLOCK_OK`, el producto cumple.
 *   - código 2: `E2E_ADBLOCK_UNREACHABLE`, sin red en el runner o sin listas
 *     utilizables (caché ausente, truncada o con menos filtros que el mínimo).
 *   - código 1: regresión del producto.
 *
 * Para probar el camino sin red: `TERMINUS_E2E_ADBLOCK_PROBE_URLS=http://127.0.0.1:9/`.
 * Para probar el caso «motor sin listas»: `TERMINUS_E2E_ADBLOCK_SEED_EMPTY_ENGINE=1`
 * siembra un motor vacío válido en el perfil temporal, así que el producto lo
 * deserializa sin error, no descarga listas y sus comprobaciones no pueden pasar.
 */
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import { _electron as electron } from 'playwright';
import {
  assertReachable,
  isNetworkUnavailable,
  UnreachableNetworkError,
} from './lib/network-preflight.mjs';
import { isEngineUnusable, readEngineState } from './lib/adblock-engine-state.mjs';
import { FiltersEngine } from '@ghostery/adblocker';

const fixtureHtml = `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><title>Terminus ad fixture</title></head>
<body>
  <main>
    <h1>Fixture de publicidad</h1>
    <div id="ad-banner" class="ad-banner">Banner publicitario</div>
    <div id="advertisement" class="advertisement">Anuncio</div>
    <div class="adsbox">Ad box</div>
    <div class="ad-container">Ad container</div>
    <div class="ad-wrapper">Ad wrapper</div>
    <div id="google_ads_iframe_1">Google ad slot</div>
    <div class="adsbygoogle">AdSense slot</div>
    <div data-ad-slot="123">Data ad slot</div>
    <div id="div-gpt-ad-1">GPT slot</div>
    <p id="content">Contenido legítimo que debe permanecer visible.</p>
    <img id="ad-image" src="https://doubleclick.net/pagead/ads?client=terminus-e2e" alt="ad" width="1" height="1">
  </main>
</body>
</html>`;

function startFixtureServer() {
  return new Promise((resolve) => {
    const server = http.createServer((request, response) => {
      if (request.url === '/') {
        response.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        response.end(fixtureHtml);
        return;
      }
      response.writeHead(404);
      response.end('not found');
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: server.address().port });
    });
  });
}

function startPrivateProbeServer() {
  const hits = [];
  return new Promise((resolve) => {
    const server = http.createServer((request, response) => {
      hits.push(request.url || '/');
      response.writeHead(200, { 'Content-Type': 'image/png' });
      response.end();
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({
        server,
        port: server.address().port,
        getHits: () => hits.length,
      });
    });
  });
}

const appPath = path.resolve('release/win-unpacked/Terminus.exe');

// La salida se guarda en UTF-8 aunque la lance un shell que reescriba la
// codificación: el artefacto del CI lleva este fichero junto a la captura para
// poder diagnosticar un fallo sin abrir el log del run.
const LOG_PATH = path.resolve('artifacts/e2e/adblock-electron.log');

function teeOutputTo(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '');
  const write = (chunk) => {
    try {
      fs.appendFileSync(file, chunk);
    } catch {
      // Sin log se pierde el diagnóstico, no el resultado: el resumen ya se ve.
    }
  };
  for (const stream of [process.stdout, process.stderr]) {
    const original = stream.write.bind(stream);
    stream.write = (chunk, ...rest) => {
      write(chunk);
      return original(chunk, ...rest);
    };
  }
  console.log('LOG_FILE', LOG_PATH);
}

// Destinos que el guion necesita de internet: la página pública del caso de
// cosméticos y las listas que descarga Ghostery en el primer arranque (sin caché).
// `TERMINUS_E2E_ADBLOCK_PROBE_URLS` permite apuntar a otros destinos para probar
// el camino sin red de forma determinista.
// Con un perfil temporal el motor arranca sin caché y descarga las listas: se
// espera a que el motor serializado tenga filtros en vez de adivinar con un
// tiempo fijo, para que el resultado no dependa de la velocidad de la red.
async function waitForEngine(file, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  // Un `.bin` que deserializa pero no llega al mínimo ya es definitivo: el
  // producto no vuelve a descargar listas si la caché se puede leer, así que
  // esperar los 90 s solo retrasaría el veredicto.
  let state = readEngineState(file);
  const started = Date.now();
  while (!state.healthy && !state.filters && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    state = readEngineState(file);
  }
  console.log('ENGINE_WAIT_MS', Date.now() - started);
  return state;
}

const LIST_ASSETS = 'https://raw.githubusercontent.com/ghostery/adblocker/master/packages/adblocker/assets';
const NETWORK_TARGETS = (process.env.TERMINUS_E2E_ADBLOCK_PROBE_URLS ?? '')
  .split(',')
  .map((url) => url.trim())
  .filter(Boolean);
const PROBE_URLS = NETWORK_TARGETS.length
  ? NETWORK_TARGETS
  : ['https://example.com/', `${LIST_ASSETS}/easylist/easylist.txt`, `${LIST_ASSETS}/ublock-origin/resources.json`];
let electronApp;
let profileDir;
let engineState;
let fixture;
let privateProbe;

try {
  teeOutputTo(LOG_PATH);

  // Antes de arrancar la app: si el runner no tiene red, el fallo es de
  // infraestructura y se distingue con un código de salida propio.
  await assertReachable(PROBE_URLS, {
    attempts: 3,
    timeoutMs: 10000,
    delayMs: 1500,
    onAttempt: (result) =>
      console.log(
        `NETWORK ${result.ok ? 'OK' : 'FALLO'} ${result.url} (intentos: ${result.attempts}${result.reason ? `, ${result.reason}` : ''})`
      ),
  });

  fixture = await startFixtureServer();
  privateProbe = await startPrivateProbeServer();
  const fixtureUrl = `http://127.0.0.1:${fixture.port}/`;
  const privateProbeUrl = `http://127.0.0.1:${privateProbe.port}/private.png`;

  // Perfil temporal propio: sin esto la app usa %APPDATA%\Terminus, comparte
  // adblock-engine.bin con el usuario y la corrida depende de la caché previa.
  profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terminus-e2e-adblock-'));
  console.log('PROFILE', profileDir);
  const cacheBeforeStart = fs.existsSync(path.join(profileDir, 'adblock-engine.bin'));
  console.log('ADBLOCK_CACHE_BEFORE', cacheBeforeStart);
  if (cacheBeforeStart) {
    throw new Error('El perfil temporal ya tenía caché del motor: la corrida no es un arranque frío.');
  }

  // Ensayo del caso «caché presente pero sin listas»: un motor vacío serializado
  // que el producto deserializa sin error y por tanto no vuelve a descargar. Así
  // la corrida ve un motor inservible sin depender de cortar la red de las listas.
  if (process.env.TERMINUS_E2E_ADBLOCK_SEED_EMPTY_ENGINE === '1') {
    fs.writeFileSync(path.join(profileDir, 'adblock-engine.bin'), FiltersEngine.empty().serialize());
    console.log('SEED_EMPTY_ENGINE true');
  }

  electronApp = await electron.launch({
    executablePath: appPath,
    args: [`--user-data-dir=${profileDir}`],
    env: {
      ...process.env,
      TERMINUS_ALLOW_PRIVATE: '1',
    },
    timeout: 60000,
  });
  electronApp.process().stdout?.on('data', (chunk) => process.stdout.write(`[main] ${chunk}`));
  electronApp.process().stderr?.on('data', (chunk) => process.stderr.write(`[main:err] ${chunk}`));

  const page = await electronApp.firstWindow({ timeout: 60000 });
  const proxyRoute = await electronApp.evaluate(async ({ session }) => ({
    http: await session.defaultSession.resolveProxy('http://example.com/'),
    https: await session.defaultSession.resolveProxy('https://example.com/'),
    privateIp: await session.defaultSession.resolveProxy('http://192.168.1.10/'),
    loopback: await session.defaultSession.resolveProxy('http://127.0.0.1/'),
  }));
  console.log('PROXY_ROUTE', JSON.stringify(proxyRoute));
  if (
    !proxyRoute.http.includes('PROXY 127.0.0.1:') ||
    !proxyRoute.https.includes('PROXY 127.0.0.1:') ||
    !proxyRoute.privateIp.includes('PROXY 127.0.0.1:') ||
    !proxyRoute.loopback.includes('DIRECT')
  ) {
    throw new Error(`La política de proxy de Chromium es incorrecta: ${JSON.stringify(proxyRoute)}`);
  }
  page.on('pageerror', (error) => console.log('PAGE_ERROR', error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') console.log('CONSOLE_ERROR', message.text());
  });

  const adRequests = [];
  const failedAdRequests = [];
  const baseUriErrors = [];
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (/base\s+URI|base-uri/i.test(text)) baseUriErrors.push(text);
  });
  page.on('request', (request) => {
    if (request.url().includes('doubleclick.net')) adRequests.push(request.url());
  });
  page.on('requestfailed', (request) => {
    if (request.url().includes('doubleclick.net')) {
      failedAdRequests.push({ url: request.url(), error: request.failure()?.errorText });
    }
  });

  const userData = await electronApp.evaluate(({ app }) => app.getPath('userData'));
  console.log('USER_DATA', userData);
  const profileIsolated =
    path.resolve(userData).toLowerCase() === path.resolve(profileDir).toLowerCase();
  console.log('PROFILE_ISOLATED', profileIsolated);
  if (!profileIsolated) {
    throw new Error(`El E2E no usa su perfil temporal: ${userData} frente a ${profileDir}`);
  }


  await page.getByRole('textbox', { name: 'Barra de direcciones y búsqueda' }).waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  const address = page.getByRole('textbox', { name: 'Barra de direcciones y búsqueda' });
  await address.click();
  await address.fill(fixtureUrl);
  await address.press('Enter');
  await page.waitForTimeout(5000);
  console.log('ADDRESS_VALUE', await address.inputValue().catch(() => '<sin barra>'));
  console.log('PAGE_URL', page.url());
  console.log('BODY_TEXT', (await page.locator('body').innerText().catch(() => '<sin body>')).slice(0, 1200));
  console.log('LOCAL_STORAGE', await page.evaluate(() => ({ ...localStorage })).catch(() => '<sin storage>'));

  // Estado real del motor serializado: cuántos filtros quedaron guardados. Sirve
  // para no confundir una caché sin listas con una regresión de cosméticos.
  engineState = await waitForEngine(path.join(userData, 'adblock-engine.bin'), 90000);
  console.log('ENGINE_STATE', JSON.stringify(engineState));

  const frames = page.frames().map((frame) => frame.url());
  console.log('FRAMES', JSON.stringify(frames));

  const proxiedFrame = page.frames().find((frame) => frame.url().includes('/api/view'));
  if (!proxiedFrame) throw new Error('No se encontró el iframe proxificado de la página de prueba.');

  const selectors = [
    '#ad-banner',
    '#advertisement',
    '.adsbox',
    '.ad-container',
    '.ad-wrapper',
    '#google_ads_iframe_1',
    '.adsbygoogle',
    '[data-ad-slot]',
    '#div-gpt-ad-1',
  ];
  const cosmeticState = await proxiedFrame.evaluate((candidateSelectors) => {
    return candidateSelectors.map((selector) => {
      const element = document.querySelector(selector);
      if (!element) return { selector, exists: false };
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        selector,
        exists: true,
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        height: rect.height,
        width: rect.width,
      };
    });
  }, selectors);
  const hiddenCosmetic = cosmeticState.filter(
    (state) =>
      state.exists &&
      (state.display === 'none' || state.visibility === 'hidden' || state.opacity === '0' || state.height === 0)
  );
  const contentState = await proxiedFrame.evaluate(() => {
    const element = document.querySelector('#content');
    if (!element) return null;
    const style = getComputedStyle(element);
    return { display: style.display, visibility: style.visibility, height: element.getBoundingClientRect().height };
  });

  // 127.0.0.1 has no eTLD, so EasyList intentionally returns no generic
  // cosmetics for the local fixture. A public domain exercises the real path:
  // the proxy iframe keeps the app URL, so the chrome must fetch the remote
  // cosmetics and send them to the proxied frame.
  await address.click();
  await address.fill('https://example.com/');
  await address.press('Enter');
  await page.waitForTimeout(8000);
  const publicFrame = page.frames().find((frame) => frame.url().includes('example.com'));
  if (!publicFrame) throw new Error('No se encontró el iframe proxificado de example.com.');
  const publicCosmeticState = await publicFrame.evaluate(() => {
    const style = document.getElementById('termbrowser-adblock-cosmetics');
    const ad = document.createElement('ins');
    ad.id = 'cosmetic-test-ad';
    ad.className = 'adsbygoogle';
    ad.setAttribute('data-ad-client', 'ca-pub-terminus-test');
    ad.setAttribute('data-ad-slot', 'terminus-test');
    ad.textContent = 'Anuncio de prueba';
    const gpt = document.createElement('div');
    gpt.id = 'div-gpt-ad-1';
    gpt.textContent = 'GPT de prueba';
    const relative = document.createElement('a');
    relative.id = 'relative-test';
    relative.href = '/relative-path';
    relative.textContent = 'Relativo';
    document.body.append(ad, gpt, relative);
    return {
      cssLength: style?.textContent?.length ?? 0,
      adDisplay: getComputedStyle(ad).display,
      slotDisplay: getComputedStyle(gpt).display,
      relativeHref: relative.href,
    };
  });

  // The proxied CSP must stop a page from probing the host's private network
  // even when the page dynamically creates the image after load.
  const proxyProbeSrc = await publicFrame.evaluate((probeUrl) => {
    const image = document.createElement('img');
    image.id = 'private-proxy-probe';
    image.src = probeUrl;
    document.body.appendChild(image);
    return image.src;
  }, privateProbeUrl);
  await page.waitForTimeout(1200);
  const proxyProbeHits = privateProbe.getHits();

  // Switch the public page to REAL (direct iframe) and verify that both an image
  // subresource and an iframe navigation to a private port are cancelled.
  await page.getByRole('button', { name: 'REAL', exact: true }).click();
  await page.waitForTimeout(3000);
  const realFrame = page.frames().find(
    (frame) => frame.url().startsWith('https://example.com') && !frame.url().includes('/api/view')
  );
  if (!realFrame) throw new Error('No se encontró el iframe REAL directo de example.com.');

  // F-04: a REAL iframe can postMessage with its own valid source/origin; the
  // chrome must still ignore navigation and shortcut messages from it.
  await realFrame.evaluate(() => {
    window.parent.postMessage(
      { source: 'termbrowser-view', url: 'https://example.com/forged-by-real-frame' },
      '*'
    );
    window.parent.postMessage({ source: 'termbrowser-shortcut', action: 'find' }, '*');
  });
  await page.waitForTimeout(700);
  const realMessageState = await page.evaluate(() => ({
    address: document.querySelector('input[aria-label="Barra de direcciones y búsqueda"]')?.value ?? null,
    findDialog: Boolean(document.querySelector('[role="dialog"][aria-label="Buscar en la página"]')),
    iframe: document.querySelector('iframe')?.src ?? null,
  }));
  if (
    realMessageState.address?.includes('forged-by-real-frame') ||
    realMessageState.findDialog ||
    realMessageState.iframe !== 'https://example.com/'
  ) {
    throw new Error(`Un iframe REAL pudo controlar el chrome: ${JSON.stringify(realMessageState)}`);
  }

  const realProbe = await realFrame.evaluate((probeUrl) => {
    const image = document.createElement('img');
    image.id = 'private-real-probe';
    image.src = probeUrl;
    document.body.appendChild(image);
    const frame = document.createElement('iframe');
    frame.id = 'private-real-frame';
    frame.src = probeUrl.replace('/private.png', '/private-frame');
    document.body.appendChild(frame);
    return { image: image.src, frame: frame.src };
  }, privateProbeUrl);
  await page.waitForTimeout(2000);
  const realProbeHits = privateProbe.getHits();

  // Keep the ad-block assertion meaningful after proxied images are rewritten:
  // inject a tracker directly into the REAL page, where EasyList must cancel it.
  await realFrame.evaluate(() => {
    const image = document.createElement('img');
    image.id = 'real-ad-probe';
    image.src = 'https://doubleclick.net/pagead/ads?client=terminus-real-e2e';
    document.body.appendChild(image);
  });
  await page.waitForTimeout(1200);

  await electronApp.evaluate(({ shell }) => {
    globalThis.__terminusOpenedExternal = [];
    const original = shell.openExternal;
    shell.openExternal = async (url) => {
      globalThis.__terminusOpenedExternal.push(url);
      return original.call(shell, url);
    };
  });
  const windowsBeforePopup = electronApp.windows().length;
  await page.evaluate(() => {
    window.open('https://doubleclick.net/popup', '_blank');
  });
  await page.waitForTimeout(1200);
  const popupState = {
    electronWindows: electronApp.windows().length,
    openedExternal: await electronApp.evaluate(() => globalThis.__terminusOpenedExternal),
  };

  await page.screenshot({ path: 'artifacts/adblock-electron.png', fullPage: true });

  console.log('COSMETIC_STATE_LOCAL_FIXTURE', JSON.stringify(cosmeticState));
  console.log('HIDDEN_COSMETIC_LOCAL_FIXTURE', JSON.stringify(hiddenCosmetic));
  console.log('CONTENT_STATE', JSON.stringify(contentState));
  console.log('PUBLIC_COSMETIC_STATE', JSON.stringify(publicCosmeticState));
  console.log('PRIVATE_PROXY_PROBE', JSON.stringify({ src: proxyProbeSrc, hits: proxyProbeHits }));
  console.log('PRIVATE_REAL_PROBE', JSON.stringify({ ...realProbe, hits: realProbeHits }));
  console.log('REAL_FRAME_MESSAGE_STATE', JSON.stringify(realMessageState));
  console.log('BASE_URI_ERRORS', JSON.stringify(baseUriErrors));
  console.log('AD_REQUESTS', JSON.stringify(adRequests));
  console.log('FAILED_AD_REQUESTS', JSON.stringify(failedAdRequests));
  console.log('POPUP_STATE', JSON.stringify({ before: windowsBeforePopup, ...popupState }));

  if (adRequests.length === 0 && failedAdRequests.length === 0) {
    throw new Error('No se observó ninguna petición publicitaria para verificar el bloqueo de red.');
  }
  if (!failedAdRequests.some((request) => request.url.includes('doubleclick.net') && request.error === 'net::ERR_BLOCKED_BY_CLIENT')) {
    throw new Error('EasyList no canceló la petición publicitaria directa de la vista REAL.');
  }
  if (popupState.electronWindows !== windowsBeforePopup || popupState.openedExternal.length > 0) {
    throw new Error('El popup publicitario no quedó bloqueado.');
  }
  if (!contentState || contentState.display === 'none' || contentState.visibility === 'hidden') {
    throw new Error('El contenido legítimo fue ocultado por error.');
  }
  if (
    publicCosmeticState.cssLength === 0 ||
    publicCosmeticState.adDisplay !== 'none' ||
    publicCosmeticState.slotDisplay !== 'none'
  ) {
    // Sin caché, con una caché ilegible o con listas a medias, el motor no tiene
    // filtros: eso es red (o una descarga truncada), no una regresión del producto.
    if (isEngineUnusable(engineState)) {
      throw new UnreachableNetworkError(
        [{ url: `${LIST_ASSETS}/easylist/easylist.txt`, reason: `motor sin listas: ${engineState.reason}` }],
        { attempts: 3 }
      );
    }
    throw new Error('Los filtros cosméticos no se aplicaron a la página proxificada pública.');
  }
  if (proxyProbeHits !== 0) {
    throw new Error('La vista proxificada emitió una petición hacia la red privada.');
  }
  if (realProbeHits !== 0) {
    throw new Error('La vista REAL emitió una petición hacia la red privada.');
  }
  if (baseUriErrors.length > 0) {
    throw new Error(`La CSP sigue bloqueando el <base> remoto: ${baseUriErrors.join(' | ')}`);
  }
  if (publicCosmeticState.relativeHref !== 'https://example.com/relative-path') {
    throw new Error(`La URL relativa no apunta al origen remoto: ${publicCosmeticState.relativeHref}`);
  }

  console.log('E2E_ADBLOCK_OK');
} catch (error) {
  if (isNetworkUnavailable(error)) {
    // Código 2: el CI lo trata como aviso. Nunca se pierde el motivo exacto.
    console.error(`E2E_ADBLOCK_UNREACHABLE: ${error.message}`);
    console.error('[e2e-adblock] Es un fallo de red del runner, no del producto; el CI lo marca como aviso.');
    process.exitCode = 2;
  } else if (engineState && isEngineUnusable(engineState)) {
    // El motor quedó sin listas utilizables, así que ninguna comprobación de
    // adblock es concluyente: la de red (que falla antes que la de cosméticos)
    // también es un fallo de descarga, no una regresión del producto.
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`E2E_ADBLOCK_UNREACHABLE: motor sin listas (${engineState.reason}); primera comprobación fallida: ${detail}`);
    console.error('[e2e-adblock] Sin filtros cargados no se puede distinguir una regresión de una descarga fallida; el CI lo marca como aviso.');
    process.exitCode = 2;
  } else {
    console.error(`[e2e-adblock] FAIL: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
} finally {
  if (electronApp) await electronApp.close().catch(() => {});
  if (fixture) fixture.server.close();
  if (privateProbe) privateProbe.server.close();
  if (profileDir) {
    try {
      fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch (error) {
      console.warn(
        `No se pudo borrar el perfil temporal ${profileDir}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
