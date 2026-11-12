# Terminus 0.3.0 — Windows x64

Release construida sobre el rediseño de interfaz (`4ca78bf`) desde la rama del PR #11, que además incluye la internacionalización; ese trabajo está hoy mergeado en `main` (`644c2ba`). La versión queda centralizada en un único módulo y la instalación sigue siendo por usuario, sin firma de código.

## Cambios

- **Cabecera única.** Desaparece la barra de título que repetía «Terminus · app de escritorio». Los controles de ventana (menú, minimizar, maximizar, cerrar) pasan a la fila superior, a la derecha de las herramientas, y la zona de marca sigue arrastrando la ventana.
- **Menú de configuración.** Nueva hamburguesa antes de los controles de ventana: audio (silenciar, sintetizador IBM PC / Commodore 64 / Modern UI, WAV de notificación) y apariencia (los siete temas, B&W y CRT). El selector de tema y los botones B&W/CRT dejan de ocupar la barra.
- **Búsqueda en la pantalla de inicio.** El botón «ABRIR TERMINUS SEARCH» se sustituye por un campo de búsqueda con sugerencias clicables: escribir o pulsar una sugerencia lanza la búsqueda sin pasar por otra pantalla.
- **Terminus Search sin cabecera propia.** La página de resultados ya no repite el logo ni el chrome de la app.
- **Cartel ASCII.** Glitch por bandas con separación cromática y dos estallidos por ciclo de 4,2 s; con `prefers-reduced-motion` se mantiene quieto y solo pulsa el cromatismo. Se retira el marco exterior y el glow que dependía de la latencia.
- **CRT sin curvatura.** Quedan scanlines, viñeteado, reflejo y parpadeo, sin filtros SVG ni mapas de desplazamiento.
- **Versión centralizada.** `src/utils/version.ts` es la única constante: la usan los seis User-Agent del servidor, el log de arranque, el HUD de archivos, el badge de la cabecera y el volcado de `curl`. Una prueba verifica que coincide con `package.json`, que es lo que electron-builder usa para nombrar los artefactos.

## Verificación

- `npm run lint`: correcto (tsc y eslint).
- `npm test`: **38 archivos, 160 pruebas**, todas pasan.
- `npm run desktop:build` (incluye `build` y `build:server`): correcto; genera `Terminus Setup 0.3.0.exe`.
- `Get-AuthenticodeSignature`: `NotSigned`.
- `npm run test:e2e:installed` sobre la `0.3.0` instalada: `Ctrl+F` en REAL desde un iframe cross-origin y búsquedas reales en OSCURO y TEXTO, con tres `PASS` y salida `0`.

> Estas cifras corresponden al árbol que generó este instalador, con la internacionalización del PR #11 incluida (hoy `main` en `644c2ba`). Antes de esa tanda la suite era de 29 archivos y 134 pruebas.

> La revisión visual a ojo de la cabecera, el menú de configuración y el glitch sigue pendiente de confirmación humana; el ROADMAP la registra como abierta.

## Artefactos

- `Terminus Setup 0.3.0.exe`
- `Terminus Setup 0.3.0.exe.blockmap`
- `SHA256SUMS.txt`
- `terminus-installer-0.3.0-windows.zip` (contiene el mismo `Terminus Setup 0.3.0.exe` que se publica suelto)

### SHA-256

```text
2b0c21108416f32e13fb0e3747e8faebad9e57c1f4e5582b7b92d9fa5a041dfb  Terminus Setup 0.3.0.exe
3fc51676a022e11e196940ee44961cf46f73d78cd527204074318cb2fc99b68f  Terminus Setup 0.3.0.exe.blockmap
9e515f0dd4cd9df296ae499b85ef435daaa13da028292c15b2ac263f974e90dd  terminus-installer-0.3.0-windows.zip
```

`SHA256SUMS.txt` contiene los tres hashes anteriores. El instalador que va dentro del ZIP es el mismo fichero que se publica suelto, así que extraerlo da exactamente el mismo SHA-256. Verifica el hash del fichero que descargues: el del ZIP tal cual y, si extraes el `.exe`, el del instalador.

## Instalación

1. Descarga y extrae el ZIP.
2. Ejecuta `Terminus Setup 0.3.0.exe`.
3. La instalación es por usuario, en `%LOCALAPPDATA%\Programs\Terminus`.

Para comprobar el instalador:

```powershell
Get-FileHash '.\Terminus Setup 0.3.0.exe' -Algorithm SHA256
Get-AuthenticodeSignature '.\Terminus Setup 0.3.0.exe'
```

El hash debe coincidir con el publicado y el estado de Authenticode debe ser `NotSigned`.

## Firma

Terminus se distribuye sin firma Authenticode por decisión del proyecto. Windows SmartScreen puede advertir al ejecutar el instalador; la verificación se hace con el hash publicado, no con la reputación del editor.
