# Revisión de seguridad: proxy e iframes

- **Versión revisada:** Terminus 0.2.1
- **Fecha:** 11 de noviembre de 2026
- **Tipo:** revisión estática de código, pruebas unitarias focalizadas y prueba E2E en Electron empaquetado
- **Alcance:** `/api/proxy`, `/api/view`, `/api/image`, `/api/download`, `/api/dns`, `sanitizeProxiedHtml`, `proxiedPage`, `htmlToRetroMarkup`, `WebBrowserSurface`, `TerminalWebpageView`, las protecciones de ventana de Electron y `scripts/e2e-adblock-electron.mjs`.

Esta revisión no es una auditoría independiente ni una prueba de penetración. La prueba E2E valida el bloqueo de red, los popups y los cosméticos sobre la app empaquetada; el resto de hallazgos sigue basándose en el código, las pruebas existentes y pruebas puntuales de las funciones puras.

> Las cifras de pruebas citadas corresponden a la revisión de 0.2.1 (28 archivos, 130 pruebas). Tras la internacionalización y el merge del PR #11 la suite está en 38 archivos y 160 pruebas; ninguno de los controles de proxy, iframes, sanitización o Electron revisados aquí cambió con esa tanda.

## Resumen ejecutivo

El diseño tiene una separación razonable entre el **modo proxy** y el **modo REAL**:

- Las páginas proxificadas se sirven desde un origen opaco, sin `allow-same-origin`, con CSP de nonce, sin scripts originales, sin formularios, sin iframes hijos y sin `connect-src`.
- La vista retro usa una allowlist de etiquetas y reconstruye enlaces e imágenes; la vista texto escapa el contenido.
- La validación de red bloquea metadata cloud, valida cada redirección y ahora bloquea redes privadas por defecto.
- El iframe del intérprete Python valida `event.source` y un identificador de petición.

El riesgo residual más importante **no es XSS en el chrome de Terminus**, sino la capacidad de una página para provocar tráfico hacia la red local. El bypass por DNS rebinding se corrigió fijando la IP validada en la conexión real. El egress del proxy y la vista REAL ya están cubiertos: la CSP proxificada no permite recursos remotos, las imágenes pasan por `/api/image`, y Electron instala un guard de red y un forward proxy local que fija la IP también para REAL. La validación de `postMessage` también se incorporó: solo el `contentWindow` exacto del iframe proxificado puede enviar mensajes de navegación o atajo. F-05 y F-07 también quedaron corregidos: la política de red canonicaliza IPv6 y el proxy usa un sanitizador basado en parser. La inconsistencia de `base-uri` que afectaba a las URLs relativas de las páginas proxificadas también se corrigió y se verificó en la prueba E2E.

## Hallazgos

| ID | Severidad | Hallazgo | Estado |
| --- | --- | --- | --- |
| F-01 | Alta (SSRF condicionado) | DNS rebinding entre la validación y el `fetch` del proxy | Resuelto |
| F-02 | Media | Las páginas proxificadas pueden emitir peticiones ciegas a redes privadas mediante imágenes, CSS, fuentes y media | Resuelto |
| F-03 | Media | La vista REAL directa no pasa por la política de red del proxy | Resuelto |
| F-04 | Baja/Media | `postMessage` de los iframes no valida `event.origin` ni `event.source` | Resuelto |
| F-05 | Baja | IPv4-mapped IPv6 en forma hexadecimal evita `isPrivateAddress` | Resuelto |
| F-06 | Baja (correctitud/defensa) | `base-uri 'self'` bloquea el `<base>` remoto que inyecta el proxy | Resuelto |
| F-07 | Baja/Informativo | La sanitización HTML es por regex y deja variantes que dependen de CSP/sandbox | Resuelto |

## F-01 — DNS rebinding en la validación SSRF

**Severidad:** Alta, condicionada a que el atacante controle el DNS de un hostname usado en el proxy.

**Evidencia**

`assertRemoteTarget()` resuelve el hostname con `lookup()` y comprueba las direcciones. Después, `fetchRemote()` llama a `fetch()` sobre la misma URL, lo que provoca una segunda resolución DNS independiente:

```ts
const addresses = await lookup(hostname, { all: true });
if (addresses.length === 0 || addresses.some((entry) => isPrivateAddress(entry.address))) {
  throw new Error(blockedMessage);
}

// Más tarde, en fetchRemote:
const response = await fetch(current, { ...init, redirect: 'manual' });
```

No hay pinning de la IP resuelta ni un dispatcher que conecte a la dirección ya validada. Un dominio controlado por el atacante puede devolver una IP pública a la primera consulta y una IP privada o de metadata a la consulta que hace `fetch`.

**Impacto**

- SSRF hacia servicios internos o endpoints de metadata.
- La comprobación de `isMetadataHost()` también es por hostname; el rebinding permite usar un dominio atacante que apunte a metadata.
- El impacto depende de qué respuesta se devuelva al usuario, pero la petición interna ya se produjo.

**Corrección aplicada**

`resolveRemoteTarget()` valida y devuelve una única dirección. `fetchRemote()` crea o reutiliza un `Agent` de `undici` cuyo `lookup` devuelve siempre esa dirección, conservando `Host` y SNI; la petición usa el `fetch` del mismo paquete `undici` para evitar la incompatibilidad con el `fetch` global de Electron. Cada salto de redirección se valida y se fija por separado. Los agentes se cachean por host, puerto, IP y familia, con un límite de 32 y cierre de los más antiguos.

**Verificación**

`serverSecurity.test.ts` incluye un resolver simulado que devuelve una IP pública (`8.8.8.8`) en la primera consulta y `127.0.0.1` en la segunda: la resolución se mantiene en la primera y se comprueba que el resolver solo se invoca una vez. Otra prueba conecta a un fixture local mediante un hostname ficticio y confirma que la petición llega a la IP fijada.

## F-02 — Egress ciego desde páginas proxificadas

**Severidad:** Media.

**Evidencia**

`PROXIED_CSP` permite orígenes remotos en recursos que no pasan por `connect-src`:

```ts
"style-src 'self' 'unsafe-inline' https: http:",
"img-src 'self' data: blob: https: http:",
"font-src 'self' data: https: http:",
"media-src 'self' https: http:",
"connect-src 'none'",
```

El HTML proxificado conserva etiquetas como `<img>`, `<link rel="stylesheet">`, `@import`, `poster` y `srcset`. El shim de navegación no reescribe esas URLs.

Una página pública puede incluir:

```html
<img src="http://192.168.1.1/estado">
<link rel="stylesheet" href="http://10.0.0.5/tema.css">
```

El iframe tiene origen opaco, así que no puede leer las respuestas ni acceder a la app. Sin embargo, la petición HTTP se emite desde el equipo del usuario. Esto permite sondeo ciego y CSRF de endpoints que acepten GET, además de efectos laterales en routers, impresoras o servicios internos.

`connect-src 'none'` bloquea `fetch`, XHR y WebSocket, pero **no** imágenes, CSS, fuentes ni media.

**Recomendación**

- Reescribir recursos remotos a endpoints proxificados que apliquen la misma política de red (`/api/image` para imágenes; un proxy de CSS/fuentes si se necesita).
- Restringir la CSP a `img-src 'self' data: blob:`, `font-src 'self' data:` y `media-src 'self'` cuando el HTML no se haya reescrito.
- Añadir una prueba de navegador que cargue una página proxificada con un `<img>` hacia `127.0.0.1` y verifique que la petición no sale.

**Corrección aplicada**

`buildProxiedCsp()` ya no publica `https:` ni `http:` para `style-src`, `font-src` ni `media-src`; `img-src` solo admite el documento, `data:`, `blob:` y el origen local explícito de Terminus. Las etiquetas `<img>` y sus `srcset` se reescriben a una URL absoluta del origen local `/api/image`, no a una ruta relativa que el `<base>` remoto resolvería contra el sitio original. Ese endpoint usa `fetchRemote()`, por lo que aplica la política de red privada y el pinning de F-01. Las imágenes inyectadas dinámicamente después de la carga siguen sujetas a la CSP y no pueden abrir una conexión directa.

**Verificación**

La prueba E2E inyecta una imagen hacia un servidor privado distinto en la página proxificada: `PRIVATE_PROXY_PROBE hits: 0`. La CSP registra el bloqueo y el servidor privado no recibe ninguna petición. La integración de `/api/view` comprueba que la imagen reescrita apunta al origen de Terminus y que la CSP incluye únicamente ese origen local en `img-src`.

## F-03 — La vista REAL evita la política del proxy

**Severidad:** Media.

**Evidencia**

Cuando una página es `frameable`, `WebBrowserSurface` usa directamente `tab.url` y el iframe incluye `allow-same-origin`, `allow-scripts`, formularios y popups. La política de red del servidor solo se aplica a las rutas que pasan por `fetchRemote`.

En Electron, `electron/main.cjs` protege la navegación **top-level** con `will-navigate`, pero no hay `webRequest.onBeforeRequest` ni `will-frame-navigate` para subframes. Una página pública cargada en REAL puede navegar el iframe o pedir subrecursos hacia la red privada.

La incorporación de `isPrivateTargetUrl()` y el reset de `frameable` cierran el caso de una URL privada evidente y el fallback con estado viejo, pero no convierten REAL en un sandbox de red.

**Impacto**

- Sondeo/CSRF hacia la red local desde una página REAL.
- Mayor superficie si el usuario cambia manualmente de OSCURO a REAL.
- No permite, por sí solo, leer la respuesta de otro origen ni ejecutar código en el origen de la app.

**Recomendación**

- Interceptar `webRequest.onBeforeRequest` para subframes y subrecursos, o usar una partición/sesión con proxy y allowlist.
- Alternativa conservadora: no ofrecer REAL para URLs privadas ni permitir navegación de subframes a redes privadas.
- Probar con una página pública que contenga un iframe, una imagen y un `fetch` hacia `192.168.1.1`.

**Corrección aplicada**

`electron/main.cjs` instala un único guard de `webRequest.onBeforeRequest` que se ejecuta antes de delegar en EasyList. Para cada petición remota comprueba primero IPs y hostnames privados y, para hostnames, resuelve DNS con una caché de 60 segundos; si alguna dirección es privada, cancela. El guard también bloquea `will-frame-navigate` de subframes hacia destinos privados o no web y deniega popups hacia destinos privados. La integración con Ghostery se conserva porque el guard delega el callback de anuncios después de su propia comprobación.

Para eliminar la ventana entre la comprobación y la conexión de Chromium, `electron/main.cjs` arranca un forward proxy HTTP/HTTPS en loopback (`electron/forwardProxy.cjs`) y configura `session.setProxy` para que Chromium use ese proxy en HTTP y HTTPS. El proxy resuelve el hostname una sola vez, valida todas las direcciones devueltas (incluidas las IPv4-mapped IPv6) y usa directamente la IP seleccionada: para HTTP reenvía la petición y para HTTPS establece un túnel `CONNECT`, manteniendo SNI y la validación de certificados en Chromium. Solo `127.0.0.1`, `localhost` y `[::1]` se saltan el proxy para cargar la propia app; una IP privada remota también se enruta al proxy y se rechaza.

**Verificación**

La prueba E2E carga `https://example.com` en REAL directo y añade una imagen y un iframe hacia un servidor privado: `PRIVATE_REAL_PROBE hits: 0`. El proceso principal registra `Navegación de subframe bloqueada` y la petición de imagen se cancela. También se inyecta un anuncio de DoubleClick en REAL para confirmar que EasyList sigue cancelando la petición después de la integración del guard. `resolveProxy()` devuelve `PROXY 127.0.0.1:<puerto>` para HTTP, HTTPS y `192.168.1.10`, y `DIRECT` para loopback; el E2E falla si Chromium intenta eludir el proxy. Las pruebas del módulo cubren el reenvío HTTP, el túnel CONNECT y que un resolver que devuelve `::ffff:7f00:1` no llega a conectar.

## F-04 — `postMessage` sin validar origen ni ventana

**Severidad:** Baja/Media.

**Evidencia**

`WebBrowserSurface` acepta mensajes con `source: 'termbrowser-view'` y navega, pero no comprueba `event.origin` ni `event.source`:

```ts
if (data.source !== 'termbrowser-view' || typeof data.url !== 'string') return;
if (!/^https?:\/\//i.test(data.url)) return;
onCommand(`goto ${data.url}`);
```

`TerminalWebpageView` tiene el mismo patrón. Los shims de `proxiedPage` envían con `parent.postMessage(..., '*')`.

Un iframe REAL remoto puede enviar el mismo mensaje al padre y forzar una navegación o abrir el buscador con `termbrowser-shortcut`. No se encontró ejecución de código en la app, pero sí secuestro de navegación y posible phishing.

**Recomendación**

- Validar `event.source === iframeRef.current?.contentWindow`.
- Para el documento proxificado, validar además que el origen sea el esperado. El iframe sandbox sin `allow-same-origin` reporta origen opaco (`null`); una comprobación estricta debe combinarse con `event.source`.
- Mejor aún: incluir un token aleatorio por documento proxificado en el shim y exigirlo en el mensaje.
- Añadir una prueba con un iframe directo que intente enviar `termbrowser-view`.

**Corrección aplicada**

`WebBrowserSurface` y `TerminalWebpageView` usan el helper compartido `frameMessageSecurity.ts`. Para `termbrowser-view`, `termbrowser-shortcut` y `termbrowser-find-result` exigen que `event.source` sea exactamente el `contentWindow` del iframe y que `event.origin` sea el origen esperado. El proxy sandbox sin `allow-same-origin` se valida como `"null"`; la vista REAL, cuyo origen es el sitio remoto, no puede usar estos mensajes en absoluto. La segunda restricción es necesaria porque un iframe REAL legítimo también podría enviar el mensaje con un origen y una ventana correctos; la navegación REAL debe ocurrir dentro del propio iframe, no a través del chrome.

**Verificación**

Se añadieron pruebas para:

- mensajes proxificados aceptados solo con el `contentWindow` correcto y origen `"null"`;
- mensajes con otra ventana u otro origen rechazados;
- un tab `frameable` en modo OSCURO, que usa proxy, rechazando el origen remoto y aceptando `"null"`;
- navegación y atajo desde un iframe REAL ignorados incluso con el origen correcto;
- las mismas comprobaciones en `TerminalWebpageView`.

La suite completa pasa con **28 archivos y 130 pruebas**, además de lint y build de producción.

La prueba E2E empaquetada del 11 de noviembre de 2026 también confirma que Ctrl+F y las búsquedas OSCURO/TEXTO siguen funcionando, y que un iframe REAL no puede navegar ni abrir el buscador mediante `postMessage`.

## F-05 — IPv4-mapped IPv6 hexadecimal

**Severidad:** Baja, pero relevante para F-01.

**Evidencia**

La comprobación de direcciones normalizaba `::ffff:` y solo reconocía la forma con puntos:

```text
isPrivateAddress('::ffff:127.0.0.1') -> true
isPrivateAddress('::ffff:7f00:1')    -> false
```

La segunda forma también representa `127.0.0.1`. Si el resolver devolvía esa representación, la comprobación de red no la clasificaba como privada.

**Corrección aplicada**

`src/utils/networkPolicy.ts` y `electron/networkPolicy.cjs` expanden ahora la dirección a ocho grupos de 16 bits, aceptan la cola IPv4 con puntos y convierten las formas IPv4-mapped e IPv4-compatible a cuatro octetos antes de aplicar la política. De este modo `::ffff:7f00:1`, `::ffff:a00:1`, `::ffff:c0a8:101`, `::ffff:ac10:1` y `::ffff:a9fe:a9fe` se clasifican igual que sus equivalentes IPv4. La misma canonicalización cubre IPv6 expandida (`0:0:0:0:0:ffff:7f00:1`), mayúsculas y zone IDs.

**Verificación**

- `src/utils/networkPolicy.test.ts` cubre las formas hexadecimales, expandidas, compatibles y públicas.
- `src/utils/serverSecurity.test.ts` comprueba que un resolver que devuelve `::ffff:7f00:1` es rechazado por `resolveRemoteTarget`.
- `electron/networkPolicy.test.ts` repite los casos en el clasificador CJS y en `http://[::ffff:7f00:1]/`.
- La suite completa pasa con **28 archivos y 130 pruebas**, además de lint.

## F-06 — `base-uri 'self'` contra el `<base>` remoto inyectado

**Severidad:** Baja (correctitud y defensa en profundidad).

**Evidencia**

`proxiedPage()` inyecta un `<base>` con la URL remota para que los enlaces e imágenes relativos funcionen:

```ts
`<base href="${escapeHtmlAttribute(url)}">`
```

Pero `PROXIED_CSP` declaraba:

```ts
"base-uri 'self'"
```

El documento se sirve desde el origen local de Terminus, así que el navegador bloqueaba un `<base>` cuyo `href` era remoto. Las URLs relativas pasaban a resolverse contra el origen de la app, no contra el sitio original.

**Corrección aplicada**

`PROXIED_CSP` recibe ahora la URL final de la respuesta y publica `base-uri 'self' <origen-final>`. El `<base>` inyectado sigue apuntando a `response.url`, pero una página saneada no puede cambiarlo a otro origen. Si la URL no se puede parsear, la política conserva únicamente `'self'` (fail-closed).

**Verificación**

La prueba E2E carga `https://example.com/` en modo proxy, inyecta un enlace `href="/relative-path"` y comprueba que `a.href` es `https://example.com/relative-path`. También verifica que no aparece ningún error de consola de `base-uri`.

## F-07 — Sanitización HTML por regex

**Severidad:** Baja/Informativo; CSP y sandbox son la defensa principal.

**Evidencia**

`sanitizeProxiedHtml()` y las expresiones de `/api/view` eliminaban scripts, iframes emparejados y handlers entre comillas, pero no eran un parser HTML. Una prueba puntual mostraba que las variantes sin comillas sobrevivían a la función pura:

```html
<img src=x onerror=alert(1)>
<a href=javascript:alert(1)>x</a>
```

En producción, `script-src 'self'` y `script-src-attr 'none'` bloquean la ejecución inline, y el sandbox impide el acceso al padre. En desarrollo se mantiene `unsafe-inline` para Vite, por lo que la diferencia entre entornos importaba.

**Corrección aplicada**

`sanitizeProxiedHtml()` usa ahora `sanitize-html` 2.18.1, que parsea el documento y aplica una allowlist. Se eliminan scripts, iframes, object/embed/portal, SVG/MathML, `srcdoc`, `xlink:href`, `formaction`, handlers inline y esquemas peligrosos; los atributos URL pasan por la comprobación de esquemas. Las imágenes conservan `src`/`srcset` válidos y siguen reescribiéndose después a `/api/image`. Las etiquetas `<style>` se mantienen para no perder el aspecto de la página, con la CSP y el sandbox como límites; por eso el sanitizador declara explícitamente `allowVulnerableTags`.

**Verificación**

- Regresión en `serverSecurity.test.ts` con handlers sin comillas, `javascript:`, `data:text/html`, SVG/MathML, `xlink:href`, `srcdoc`, `formaction` y `srcset` mixto; también se comprueba que un `srcset` válido sobrevive.
- `npm test`: **28 archivos y 130 pruebas**.
- `npm run lint` y `npm run build:server` correctos.
- El E2E empaquetado conserva el bloqueo de red, los cosméticos, el contenido legítimo, la navegación y la política de REAL.

## Resultado de la prueba E2E de bloqueo y cosméticos

Ejecutada el 11 de noviembre de 2026 con `npm run desktop:dir` y `node scripts/e2e-adblock-electron.mjs` sobre `release/win-unpacked/Terminus.exe` (Electron 45.2.3, sin firma Authenticode), con una sesión real de Playwright:

- **Bloqueo de red:** la petición `https://doubleclick.net/pagead/ads?client=terminus-e2e` falló con `net::ERR_BLOCKED_BY_CLIENT`.
- **Popups:** abrir `https://doubleclick.net/popup` con `window.open` dejó el número de ventanas Electron en 1 y no llamó a `shell.openExternal`.
- **Contenido legítimo:** el bloque `#content` del fixture siguió visible (`display: block`).
- **Cosméticos en proxy:** al cargar `https://example.com/` mediante `/api/view?mode=dark`, el iframe recibió 7.960 caracteres de CSS de EasyList. Los elementos inyectados `ins.adsbygoogle[data-ad-slot]` y `div#div-gpt-ad-1` quedaron con `display: none`.
- **Resultado:** `E2E_ADBLOCK_OK`.

El fixture local usa `127.0.0.1`, que no tiene eTLD; EasyList devuelve 0 reglas cosméticas genéricas para esa dirección, aunque el bloqueo de red y los popups sí se comprueban allí. La prueba usa un dominio público para la parte cosmética.

Con la corrección de F-06, la prueba no registra errores de `base-uri`; el enlace relativo inyectado resuelve a `https://example.com/relative-path`.

## Controles que funcionan bien

- **Sandbox del proxy:** `allow-scripts` sin `allow-same-origin`; el documento tiene origen opaco y no puede leer el DOM de la app.
- **CSP del proxy:** `default-src 'none'`, `connect-src 'none'`, `frame-src 'none'`, `form-action 'none'`, `object-src 'none'` y scripts con nonce aleatorio.
- **Aislamiento del intérprete Python:** iframe sin mismo origen, CSP sin red, `event.source` y `requestId` validados.
- **Vista retro:** allowlist de etiquetas y reconstrucción de enlaces/imágenes sin atributos originales.
- **Vista texto:** texto y URL escapados; no se inserta HTML remoto.
- **Proxy:** bloqueo de metadata, validación por salto de redirección, timeout y límites de 4 MB/50 MB/12 MB.
- **Electron:** `sandbox`, `contextIsolation`, `nodeIntegration: false`, bloqueo de `webview`, IPC limitado al frame principal y navegación top-level restringida.
- **REAL:** forward proxy local que resuelve y fija la IP antes de conectar; HTTP reenviado y HTTPS por túnel `CONNECT` con TLS intacto.
- **Descargas:** nombre saneado y `Content-Disposition: attachment`.
- **Respuesta proxificada:** `X-Frame-Options: SAMEORIGIN`, `frame-ancestors 'self'`, `X-Content-Type-Options: nosniff` y `Cache-Control: no-store`.
- **Cosméticos en proxy:** el renderer no calcula reglas ni acepta CSS de la página; pide al proceso principal el CSS de la URL remota y lo aplica como texto en un `<style>` del iframe.

## Pruebas recomendadas para cerrar los hallazgos

1. **DNS rebinding:** cubierto con un resolver simulado (`8.8.8.8` y luego `127.0.0.1`) y un fixture local; regresión incluida en `serverSecurity.test.ts`.
2. **IPv4-mapped IPv6:** cubierto; se prueban `::ffff:7f00:1`, `::ffff:a00:1`, `::ffff:c0a8:101`, `::ffff:ac10:1`, `::ffff:a9fe:a9fe`, formas expandidas, compatibles y públicas.
3. **Egress proxificado:** cubierto por la CSP sin orígenes remotos, la reescritura absoluta a `/api/image` y `PRIVATE_PROXY_PROBE hits: 0` en Electron. Queda ampliar la cobertura a CSS/fuentes/media si se añade un proxy para ellos.
4. **REAL:** cubierto por el forward proxy con pinning de IP, el guard de `webRequest`, `will-frame-navigate` y `PRIVATE_REAL_PROBE hits: 0` con imagen y subframe privados. El E2E comprueba que Chromium enruta HTTP, HTTPS e IPs privadas por el proxy y solo loopback directo.
5. **Mensajes:** cubierto para `WebBrowserSurface` y `TerminalWebpageView`; un iframe REAL que envíe `termbrowser-view` y `termbrowser-shortcut` es ignorado, y el proxy exige `contentWindow` y origen `"null"`.
6. **Base:** página proxificada con `<a href="/relativo">`; comprobar que resuelve contra el sitio remoto, no contra Terminus.
7. **Sanitizador:** payloads con handlers sin comillas, SVG/MathML, `srcdoc`, `xlink:href`, `srcset` y etiquetas sin cierre.

## Conclusión

El aislamiento de **scripts** del modo proxy es sólido para el modelo actual: origen opaco, CSP de nonce y sandbox eliminan la ejecución de código del sitio y el acceso al DOM de la app. Los riesgos de **red** de F-02 y F-03 quedan cubiertos por la CSP, la reescritura de imágenes, el guard de Electron y el forward proxy con pinning de IP; la **validación de mensajes** de F-04 exige la ventana exacta y el origen esperado, y no permite que REAL controle el chrome; la **sanitización** de F-07 ya no depende de regex. F-01, F-02, F-03, F-04, F-05, F-06 y F-07 están resueltas, y la ventana de rebinding de REAL queda cerrada porque Chromium ya no conecta directamente a hosts remotos: el proxy resuelve una vez y fija la IP.
