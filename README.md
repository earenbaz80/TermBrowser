# Terminus

Terminus es un navegador web de terminal con una consola integrada, pensado para leer la web con una estética retro y para trabajar con archivos, shells y automatizaciones desde la misma ventana. Corre como aplicación de escritorio Electron y también como aplicación web local.

## Características

- **Dos superficies**: navegador web real y terminal interactiva, con pestañas independientes.
- **Navegador**: barra de direcciones con sugerencias de marcadores e historial global, historial por pestaña, favoritos, indicador HTTPS/HTTP y descarga de la página.
- **Vistas de página**: `REAL` (iframe directo cuando el sitio lo permite), `OSCURO` (proxy con hoja retro) y `TEXTO` (extracción legible).
- **Búsqueda en página** con `Ctrl+F` en las tres vistas; en Electron un atajo global la captura incluso con el foco dentro de un iframe REAL cross-origin. **Zoom por pestaña** con `Ctrl++`, `Ctrl+-` y `Ctrl+0`.
- **Terminal**: intérprete interno, PTY real con CMD/PowerShell/Bash en Electron, comandos de navegación, archivos virtuales y workspace local.
- **Panel de archivos**, monitor de recursos, scripts, extensiones, atajos, ayuda y bóveda cifrada.
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

## Scripts de verificación

```bash
npm run lint                  # tsc --noEmit
npm test                      # Vitest
npm run build                 # cliente Vite con code-splitting
npm run build:server
npm run test:e2e:installed    # Windows: Ctrl+F y búsqueda OSCURO/TEXTO
npm run test:e2e:python-sandbox # Chromium real; requiere npx playwright install chromium
```

Estado esperado: typecheck limpio, pruebas de unidad en verde y ambos builds correctos.

`test:e2e:installed` requiere Windows, una sesión de escritorio interactiva y la app instalada a partir del build actual. Arranca una copia aislada con perfil temporal, sirve un fixture local cross-origin, envía `Ctrl+F` con `SendKeys` y comprueba una búsqueda real en las vistas OSCURO y TEXTO. Si el ejecutable está en otra ruta, define `TERMINUS_INSTALLED_EXE`.

Para preparar un runner de GitHub Actions con escritorio interactivo, configurar las etiquetas y lanzar el E2E manualmente, consulta [docs/e2e-installed-windows.md](docs/e2e-installed-windows.md).

## Seguridad

- El servidor escucha en `127.0.0.1` por defecto.
- Las APIs `/api/*` requieren una cookie de sesión `HttpOnly`, `SameSite=Strict` y comprobación de `Origin`/`Sec-Fetch-Site`.
- Los endpoints de sistema de archivos y bóveda requieren además el token de la sesión local (`X-Terminus-Token`), obtenido de `/api/session`.
- Las rutas de workspace se validan con `path.relative` para impedir path traversal.
- Los proxies tienen timeout, límite de tamaño (4 MB de texto, 50 MB de descarga) y bloqueo de endpoints de metadata cloud.
- Con `TERMINUS_BLOCK_PRIVATE=1` (o `TERMINUS_NETWORK_POLICY=public`) los proxies solo aceptan destinos públicos y validan cada redirección.
- Las páginas servidas por `/api/view` pierden scripts, handlers inline, iframes, `base` y refresh; se sirven con CSP de nonce y `frame-ancestors 'self'`.
- La aplicación usa una CSP global y `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`.

### Limitaciones de seguridad conocidas

- No hay autenticación multiusuario: el modelo de confianza es una sola persona en su equipo.
- El proxy sigue permitiendo rangos privados por defecto para no romper intranets y `localhost`; usa la política pública cuando no los necesites.
- La sanitización HTML es deliberadamente conservadora, pero no sustituye un navegador aislado para contenido hostil.
- Las métricas de red del monitor son parcialmente estimadas; no deben usarse como telemetría de producción.

## Pruebas manuales recomendadas

1. Abrir dos pestañas web y comprobar que el historial global aparece en la barra de direcciones de ambas.
2. Navegar a un sitio con `goto`, cambiar entre `REAL`, `OSCURO` y `TEXTO`, y usar `Ctrl+F` en las tres. En Electron, comprobar que también abre el buscador con el foco dentro de la vista REAL directa.
3. Probar `Ctrl++`, `Ctrl+-` y `Ctrl+0` en una pestaña y verificar que el zoom se conserva al cambiar de pestaña.
4. Descargar una página con el botón de descarga y comprobar el archivo.
5. Abrir Terminal y verificar que un comando interno, el historial y el cambio de shell siguen funcionando.
6. En Electron, abrir CMD/PowerShell/Bash, ejecutar un comando y cerrar/abrir la pestaña para comprobar el ciclo de vida del PTY.
7. Comprobar que `/api/local-fs/list` responde 403 sin token y 200 con el token de sesión.
8. Configurar `TERMINUS_BLOCK_PRIVATE=1` y verificar que un destino `127.0.0.1` es rechazado por el proxy.

### Verificación del atajo en Electron

La captura de `Ctrl+F` ocurre en el proceso principal mediante `before-input-event`; el renderer recibe el aviso por `terminusDesktop.onFindShortcut`. Esto cubre iframes REAL cross-origin, cuyos eventos de teclado no llegan a la ventana principal.

Comprobado el 10 de noviembre de 2026 con Electron 45 en desarrollo y con Terminus 0.2.0 instalado mediante el instalador NSIS (`%LOCALAPPDATA%\Programs\Terminus\Terminus.exe`), sobre `https://example.com/` en modo `REAL`: en ambos casos el foco estaba dentro del iframe, `Ctrl+F` abrió «Buscar en la página» y el campo de búsqueda recibió el foco.

La prueba automatizada equivalente es `npm run test:e2e:installed`, que además verifica búsquedas reales en OSCURO y TEXTO.

## Arquitectura

- `src/App.tsx`: estado de pestañas, sesión, historial global, modales y composición de la UI.
- `src/components/WebBrowserSurface.tsx`: navegador, barra de direcciones, zoom, búsqueda, descargas y paneles.
- `src/components/HeaderBar.tsx`: pestañas y controles globales.
- `src/components/TerminalView.tsx`: terminal interna y puente PTY.
- `src/utils/commandProcessor.ts`: procesador de comandos y navegación.
- `src/utils/localFileSystem.ts`: cliente de workspace local con token de sesión.
- `server.ts`: Express, proxy, CSP, APIs locales y servidor Vite en desarrollo.
- `src/utils/serverSecurity.ts`: validación de red, cookies, sanitización y nombres de descarga.
- `electron/main.cjs`: ventana Electron, PTY, shells nativos y archivos.
- `electron/preload.cjs`: puente IPC con contexto aislado.

## Licencia

Apache-2.0. Consulta el encabezado de los archivos fuente.
