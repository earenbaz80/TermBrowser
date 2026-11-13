# Terminus

Terminus es un navegador web de terminal con una consola integrada, pensado para leer la web con una estética retro y para trabajar con archivos, shells y automatizaciones desde la misma ventana. Corre como aplicación de escritorio Electron y también como aplicación web local.

El estado del proyecto, los pendientes y las decisiones cerradas están en [ROADMAP.md](ROADMAP.md).

## Características

- **Dos superficies**: navegador web real y terminal interactiva, con pestañas independientes.
- **Cabecera única**: pestañas, herramientas, controles de ventana y menú de configuración (audio, temas, B&W y CRT) en una sola barra.
- **Navegador**: barra de direcciones con sugerencias de marcadores e historial global, historial por pestaña, favoritos, indicador HTTPS/HTTP y descarga de la página.
- **Búsqueda web desde el inicio**: el campo de la pantalla de inicio busca directamente, sin abrir otra pantalla antes; las sugerencias son clicables y los resultados aparecen en Terminus Search.
- **Vistas de página**: `REAL` (iframe directo cuando el sitio lo permite), `OSCURO` (proxy con hoja retro) y `TEXTO` (extracción legible).
- **Búsqueda en página** con `Ctrl+F` en las tres vistas; en Electron un atajo global la captura incluso con el foco dentro de un iframe REAL cross-origin. **Zoom por pestaña** con `Ctrl++`, `Ctrl+-` y `Ctrl+0`.
- **Terminal**: intérprete interno, PTY real con CMD/PowerShell/Bash en Electron, comandos de navegación, archivos virtuales y workspace local.
- **Panel de archivos**, monitor de recursos, scripts, extensiones, atajos, ayuda y bóveda cifrada.
- **Interfaz en cinco idiomas**: español, alemán, francés, italiano e inglés, con cambio en vivo desde Configuración y español como referencia.
- **Persistencia local** de tema, sesión, pestañas, marcadores, zoom e historial. No hay backend remoto de usuario.

## Requisitos

- Node.js 22 o superior.
- Windows para el instalador NSIS y para CMD/PowerShell a través de PTY.
- Linux puede ejecutarse en modo web y compilar AppImage; el soporte de shells depende de las herramientas instaladas.

## Desarrollo

```bash
npm install
npm run dev
```

Abre `http://127.0.0.1:3000`. El servidor escucha en loopback por defecto. Para exponerlo deliberadamente en una LAN:

```bash
HOST=0.0.0.0 npm run dev
```

No expongas el servidor fuera de una red de confianza: las APIs locales están pensadas para el usuario de la máquina.

### Aplicación de escritorio

```bash
npm run desktop:dev      # Electron contra el servidor de desarrollo
npm run desktop:dir      # build + servidor + carpeta desempaquetada
npm run desktop:build    # instalador en release/
```

El instalador de Windows se genera con electron-builder y el icono de `build/icon.ico`.

El instalador se distribuye sin firma Authenticode por decisión del proyecto: Windows SmartScreen puede mostrar una advertencia. Verifica el binario con los hashes publicados en las notas de release. El flujo de firma queda documentado como referencia en [docs/code-signing-windows.md](docs/code-signing-windows.md).

### Vista WEB dentro del flujo del terminal

La consola recibe `allowInlineFrames={false}` desde `src/App.tsx`: el flujo del terminal se queda en RETRO y TEXTO y no abre un iframe vivo, porque cada iframe deja un sitio entero en memoria y la página ya se pinta en la superficie del navegador. Esa es la decisión que se publica.

Para probar la vista WEB dentro del propio terminal, pon `allowInlineFrames={true}` en tu copia y no lo commitees: es un ajuste local, así que `git status` mostrará `src/App.tsx` modificado de forma permanente. Revierte con `git checkout -- src/App.tsx` cuando termines.

## Scripts de verificación

```bash
npm run lint                  # tsc --noEmit + eslint
npm test                      # Vitest
npm run build                 # cliente Vite con code-splitting
npm run build:server
npm run test:e2e:adblock     # Electron empaquetado: red, popups y cosméticos
npm run test:e2e:installed    # Windows: Ctrl+F y búsqueda OSCURO/TEXTO
npm run test:e2e:installed:ui # Windows: cabecera, tema persistido y búsqueda en un paso
npm run test:e2e:python-sandbox # Chromium real; requiere npx playwright install chromium
```

Estado esperado: typecheck limpio, pruebas de unidad en verde y ambos builds correctos. Referencia actual: `npm test` con 41 archivos y 191 pruebas.

`test:e2e:adblock` arranca `release/win-unpacked/Terminus.exe` con Playwright, sirve un fixture local de anuncios y comprueba el bloqueo de red y de popups. Después navega a `https://example.com/` para verificar que los cosméticos de EasyList se aplican al iframe proxificado; el fixture local no sirve para cosméticos porque `127.0.0.1` no tiene eTLD. Requiere haber ejecutado `npm run desktop:dir` antes.

`test:e2e:installed` requiere Windows, una sesión de escritorio interactiva y la app instalada a partir del build actual. Arranca una copia aislada con perfil temporal, usa `https://example.com/` para el iframe REAL cross-origin y un fixture local para las vistas proxificadas, envía `Ctrl+F` con `SendKeys` y comprueba una búsqueda real en OSCURO y TEXTO. Si el ejecutable está en otra ruta, define `TERMINUS_INSTALLED_EXE`.

`test:e2e:installed:ui` usa el mismo arranque aislado (perfil temporal y CDP) contra la app empaquetada y cubre la interfaz: un solo `<header>` con las pestañas y los controles de ventana dentro, el menú de configuración abierto y un cambio de tema que queda en `localStorage` y se aplica tras recargar el renderer, y la búsqueda del inicio en un paso (escribir y Enter, sin botón intermedio). Falla si el build instalado no es el actual.

Con `TERMINUS_E2E_LOCALE=en npm run test:e2e:installed:ui` (o `de`, `fr`, `it`) la prueba cambia el idioma desde el menú antes de comprobar nada. El cambio se valida con `document.documentElement.lang` y con que la barra de direcciones cambie de nombre accesible, sin comparar con ninguna cadena traducida.

Para preparar un runner de GitHub Actions con escritorio interactivo, configurar las etiquetas y lanzar el E2E manualmente, consulta [docs/e2e-installed-windows.md](docs/e2e-installed-windows.md).

### Verificar el instalador de un run de CI

Cada run publica el `.exe` y un artefacto `terminus-sha256sums-<versión>-run-<n>-windows` con su SHA-256. Descarga los dos desde la pestaña **Summary** del run y, con ellos en la misma carpeta:

```bash
sha256sum -c SHA256SUMS.txt
```

```powershell
Get-FileHash -Algorithm SHA256 'Terminus Setup 0.3.0.exe'   # compara con la línea del .txt
```

Ese hash corresponde al build de ese run y no tiene por qué coincidir con el de la release publicada.

## Seguridad

- Este es un proyecto personal y no ha sido auditado por terceros. La revisión incluida en `docs/security-review-proxy-iframes.md` es interna y de alcance limitado. Úsalo bajo tu propio criterio y no lo presentes como un navegador auditado.
- Para reportar una vulnerabilidad, usa el canal privado descrito en [SECURITY.md](SECURITY.md); no abras un issue público.
- El servidor escucha en `127.0.0.1` por defecto.
- Las APIs `/api/*` requieren una cookie de sesión `HttpOnly`, `SameSite=Strict` y comprobación de `Origin`/`Sec-Fetch-Site`.
- Los endpoints de sistema de archivos y bóveda requieren además el token de la sesión local (`X-Terminus-Token`), obtenido de `/api/session`.
- Las rutas de workspace se validan con `path.relative` para impedir path traversal.
- Los proxies tienen timeout, límite de tamaño (4 MB de texto, 50 MB de descarga) y bloqueo de endpoints de metadata cloud.
- Por defecto, los proxies y el endpoint DNS rechazan destinos privados (loopback, RFC1918, link-local y CGNAT) y validan cada redirección. Cada hostname se resuelve una vez y la conexión real queda fijada a la IP validada, sin una segunda resolución DNS. Las direcciones IPv4-mapped IPv6 se canonicalizan antes de clasificarlas, incluidas las formas hexadecimales como `::ffff:7f00:1`. La vista REAL tampoco se usa para URLs privadas evidentes: esas pasan por el proxy. Para una intranet o un servidor local, habilita explícitamente `TERMINUS_ALLOW_PRIVATE=1` (o `TERMINUS_BLOCK_PRIVATE=0` / `TERMINUS_NETWORK_POLICY=local`) solo en redes de confianza.
- Las páginas servidas por `/api/view` pasan por un sanitizador basado en parser (`sanitize-html`) con allowlist de etiquetas y atributos: elimina scripts, iframes, object/embed/portal, SVG/MathML, `srcdoc`, `xlink:href`, `formaction`, handlers inline y esquemas peligrosos. Se sirven con CSP de nonce, `frame-ancestors 'self'` y un `<base>` limitado por CSP al origen final validado. La CSP no permite CSS, fuentes, imágenes ni media remotos: las imágenes se reescriben a `${origen-local}/api/image`, que aplica la misma política de red y el pinning del proxy; el resto de recursos remotos queda bloqueado. Las imágenes inyectadas dinámicamente tampoco pueden saltarse la CSP.
- En Electron, la vista REAL directa pasa por un forward proxy HTTP/HTTPS en loopback: Chromium solo conecta al proxy, que resuelve una vez, valida todas las direcciones y fija la IP elegida. HTTP se reenvía y HTTPS usa un túnel `CONNECT`, conservando SNI y la validación de certificados. La app en loopback queda fuera del proxy; una IP privada remota también se enruta al proxy y se rechaza. Además, un guard de `webRequest` combina EasyList con el bloqueo de destinos privados, subframes privados o no web y popups privados.
- Los mensajes de navegación, atajo y resultado de búsqueda de los iframes exigen `event.source === iframe.contentWindow` y el origen esperado. Solo el iframe proxificado con origen opaco (`"null"`) puede controlar el chrome; un iframe REAL que envíe esos mensajes se ignora.
- Los permisos de Electron se deniegan por defecto. Solo el frame principal del origen local puede solicitar micrófono, notificaciones, portapapeles y acceso a carpetas elegidas por el usuario; los iframes remotos no pueden hacerlo.
- Electron usa `@ghostery/adblocker-electron` con EasyList/EasyPrivacy y filtros cosméticos, cachea el motor en `userData` y deja una lista local como fallback. En el modo proxy, el proceso principal calcula los cosméticos con la URL remota y los inyecta en el iframe mediante un mensaje de solo CSS. También cancela ventanas emergentes de fondo o `new-window`. Para desactivarlo: `TERMINUS_DISABLE_ADBLOCK=1`; para permitir todas las ventanas: `TERMINUS_ALLOW_POPUPS=1`.
- En producción, la CSP de la app no permite scripts inline (`script-src 'self'` y `script-src-attr 'none'`). Los estilos inline siguen permitidos porque los temas los usan.
- La aplicación usa una CSP global y `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`.
- Hallazgos y recomendaciones del proxy e iframes: [docs/security-review-proxy-iframes.md](docs/security-review-proxy-iframes.md).

### Limitaciones de seguridad conocidas

- No hay autenticación multiusuario: el modelo de confianza es una sola persona en su equipo.
- El terminal nativo y los comandos que ejecutes en él conservan el acceso a red del usuario; la política de red privada aplica al proxy y a las APIs del navegador.
- La CSP mantiene `style-src 'unsafe-inline'` por los estilos de los temas; los scripts inline quedan bloqueados en producción.
- La sanitización HTML es deliberadamente conservadora, pero no sustituye un navegador aislado para contenido hostil.
- EasyList no genera cosméticos genéricos para `localhost` ni direcciones IP porque no tienen eTLD; en esos casos se aplica el bloqueo de red, pero no el ocultado cosmético. Los dominios públicos sí reciben ambos.
- Las métricas de red del monitor son parcialmente estimadas; no deben usarse como telemetría de producción.

## Pruebas manuales recomendadas

1. Abrir dos pestañas web y comprobar que el historial global aparece en la barra de direcciones de ambas.
2. Navegar a un sitio con `goto`, cambiar entre `REAL`, `OSCURO` y `TEXTO`, y usar `Ctrl+F` en las tres. En Electron, comprobar que también abre el buscador con el foco dentro de la vista REAL directa.
3. Probar `Ctrl++`, `Ctrl+-` y `Ctrl+0` en una pestaña y verificar que el zoom se conserva al cambiar de pestaña.
4. Descargar una página con el botón de descarga y comprobar el archivo.
5. Abrir Terminal y verificar que un comando interno, el historial y el cambio de shell siguen funcionando.
6. En Electron, abrir CMD/PowerShell/Bash, ejecutar un comando y cerrar/abrir la pestaña para comprobar el ciclo de vida del PTY.
7. Comprobar que `/api/local-fs/list` responde 403 sin token y 200 con el token de sesión.
8. Sin variables de red, verificar que un destino `127.0.0.1` es rechazado por el proxy y por `/api/dns`; con `TERMINUS_ALLOW_PRIVATE=1`, verificar que se permite de forma explícita.

### Verificación del atajo en Electron

La captura de `Ctrl+F` ocurre en el proceso principal mediante `before-input-event`; el renderer recibe el aviso por `terminusDesktop.onFindShortcut`. Esto cubre iframes REAL cross-origin, cuyos eventos de teclado no llegan a la ventana principal.

Comprobado el 10 de noviembre de 2026 con Electron 45 en desarrollo y con Terminus 0.2.0 instalado mediante el instalador NSIS (`%LOCALAPPDATA%\Programs\Terminus\Terminus.exe`), sobre `https://example.com/` en modo `REAL`: en ambos casos el foco estaba dentro del iframe, `Ctrl+F` abrió «Buscar en la página» y el campo de búsqueda recibió el foco. El 12 de noviembre de 2026 se repitió con la `0.3.0` instalada mediante `npm run test:e2e:installed`, con tres `PASS` (REAL, OSCURO y TEXTO).

La prueba automatizada equivalente es `npm run test:e2e:installed`, que además verifica búsquedas reales en OSCURO y TEXTO. La revisión visual de la interfaz (cabecera, menú de configuración y glitch) quedó confirmada el 12 de noviembre de 2026 y el ROADMAP la registra como cerrada.

## Arquitectura

- `src/App.tsx`: estado de pestañas, sesión, historial global, modales y composición de la UI.
- `src/components/WebBrowserSurface.tsx`: navegador, barra de direcciones, zoom, búsqueda (incluido el campo de la pantalla de inicio), descargas y paneles.
- `src/components/HeaderBar.tsx`: pestañas, herramientas y fila superior con el menú de configuración y los controles de ventana.
- `src/components/SettingsMenu.tsx`: menú de configuración con audio (mute, sintetizador, WAV) y apariencia (temas, B&W, CRT).
- `src/components/WindowControls.tsx`: minimizar, maximizar y cerrar sobre la API de escritorio.
- `src/components/TerminusSearchPage.tsx`: resultados de búsqueda y sugerencias compartidas con la pantalla de inicio.
- `src/components/TerminalView.tsx`: terminal interna y puente PTY.
- `src/utils/version.ts`: única fuente de la versión; los User-Agent, el log de arranque y los rótulos la importan.
- `src/i18n/`: catálogos de interfaz, consola, fichas de ayuda, extensiones y temas en español, alemán, francés, italiano e inglés; el español es la referencia.
- `src/utils/commandProcessor.ts`: procesador de comandos y navegación.
- `src/utils/localFileSystem.ts`: cliente de workspace local con token de sesión.
- `server.ts`: Express, proxy, CSP, APIs locales y servidor Vite en desarrollo.
- `src/utils/serverSecurity.ts`: validación de red, cookies, sanitización y nombres de descarga.
- `electron/main.cjs`: ventana Electron, PTY, shells nativos y archivos.
- `electron/forwardProxy.cjs`: forward proxy de REAL con resolución DNS única, pinning de IP y túnel CONNECT.
- `electron/preload.cjs`: puente IPC con contexto aislado.

## Licencia

Apache-2.0. Consulta [LICENSE](LICENSE).
