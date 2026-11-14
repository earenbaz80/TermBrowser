# Roadmap de Terminus

Este documento es la fuente de verdad de lo que falta. El repositorio no usa issues ni milestones en GitHub, así que el estado se mantiene aquí y se actualiza al cerrar cada hito.

- Última release publicada: `0.3.0` (tag `v0.3.0`, 12 de noviembre de 2026), con instalador, `.blockmap`, ZIP y `SHA256SUMS.txt`.
- Estado del proyecto: rediseño de interfaz e internacionalización (PR #11) mergeados en `main`, notas de release y README alineados con los artefactos publicados, y el E2E instalado del hito 0.3.0 pasado.
- Verificación actual: `npm run lint` correcto (tsc y eslint), `npm test` con 41 archivos y 195 pruebas, cliente y servidor compilados, instalador `0.3.0` generado y `NotSigned`.
- No hay fechas comprometidas. Los hitos se ordenan por prioridad, no por calendario.

## Decisiones cerradas

No son pendientes; están aquí para que no vuelvan a aparecer como deuda.

| Tema | Decisión | Consecuencia |
| --- | --- | --- |
| Firma Authenticode | **No se firma.** Terminus se distribuye como aplicación sin firma. | Windows SmartScreen puede advertir al ejecutar el instalador. La verificación se hace publicando `SHA256SUMS.txt` y comprobando con `Get-FileHash`; las notas de release deben decir explícitamente que el binario es `NotSigned`. |
| Infraestructura de firma en CI | Se conserva pero queda inerte: sin `WINDOWS_CERTIFICATE_BASE64`, electron-builder omite la firma. | `docs/code-signing-windows.md` pasa a ser referencia histórica, no una tarea abierta. No se deben pedir certificados ni secretos de firma. |
| Curvatura CRT | Descartada. | Quedan scanlines, viñeteado, reflejo y parpadeo; sin filtros SVG ni mapas de desplazamiento. |
| Backend de usuario | No existe. | El modelo de confianza sigue siendo una sola persona por equipo. |

## Hitos

### 1. Publicar la nueva interfaz (`0.3.0`) — publicada

Trabajo ya hecho y mergeado (rediseño de interfaz e internacionalización del PR #11):

- Menú de configuración (audio, temas, B&W, CRT) en la cabecera, con los controles de ventana a su lado.
- Eliminación de la barra de título duplicada; una sola cabecera.
- Buscador en la pantalla de inicio con sugerencias clicables, sin botón intermedio.
- Glitch del cartel ASCII con bandas, separación cromática y variante para `prefers-reduced-motion`.
- Terminus Search sin cabecera interna propia.
- Internacionalización completa (PR #11): interfaz, consola, fichas de ayuda, extensiones, temas, scripts de ejemplo y archivos de muestra en español, alemán, francés, italiano e inglés.

Estado:

- [x] E2E sobre la app instalada, contra la `0.3.0` instalada el 12 de noviembre de 2026: los tres `PASS` (Ctrl+F en REAL desde un iframe cross-origin, búsqueda en OSCURO y en TEXTO) con `EXIT=0`.
- [x] Comprobación asistida por CDP de la `0.3.0` instalada: cabecera única sin barra duplicada, menú de configuración con persistencia del tema tras recargar, buscador de inicio (12 resultados en 235 ms) y glitch con movimiento normal y reducido.
- [x] Revisión visual de la `0.3.0` instalada, 12 de noviembre de 2026: cabecera única, menú de configuración con persistencia del tema y glitch con movimiento normal y reducido, a partir de las capturas de esa sesión (`01-inicio`, `02-menu-configuracion`, `04-tema-persistido`, `14-glitch-normal-forzado`, `15-glitch-reducido-forzado`); el revisor CDP cerró sin fallos.
- [x] Commit del rediseño y `package.json` a `0.3.0`, con la versión centralizada en `src/utils/version.ts` (versión visible y User-Agent incluidos).
- [x] `docs/release-notes-v0.3.0.md` con cambios, verificación y SHA-256 del instalador.
- [x] PR #11 mergeado en `main` con el CI en verde (lint, pruebas, cobertura y E2E opcional), sin anotaciones.
- [x] Release `0.3.0` publicada el 12 de noviembre de 2026 y marcada como última release, con instalador, `.blockmap`, ZIP y `SHA256SUMS.txt` (los tres hashes).
- [x] Publicación automatizada (14 de noviembre de 2026): `.github/workflows/release.yml` se dispara con un tag `v*`, compila con `npm run desktop:build`, escribe hashes y notas con `scripts/release-artifacts.cjs` —el mismo helper que usa el CI— y publica la release con el `.exe` y `SHA256SUMS.txt`. El tag tiene que coincidir con `package.json` (si no, falla antes del build), un sufijo lo marca como preliminar y reintentar el tag reemplaza la release. El CI de push solo corre en ramas, así que un tag no compila dos veces.
- [x] README actualizado: arquitectura (`SettingsMenu`, `WindowControls`, `src/i18n`), flujo de búsqueda desde el inicio, idiomas y recuento de pruebas.

Cierre: lint, pruebas y builds en verde; instalador generado, revisado e instalado; release `0.3.0` publicada con hashes; la búsqueda funciona desde la pantalla de inicio sin pasar por otra vista. Hito cerrado el 12 de noviembre de 2026.

### 2. E2E sobre la app instalada en CI — ejecutado y en verde

El script y los pasos existen (`npm run test:e2e:installed`, `.github/workflows/ci.yml`) y el 13 de noviembre de 2026 se dispararon por primera vez con `workflow_dispatch` (`run_installed_e2e=true`). El E2E pasó en el runner alojado `windows-latest`: el preflight interactivo (`SessionId != 0`, `[Environment]::UserInteractive`) se cumple allí, así que la etiqueta del runner no decide nada. Corridas en verde: 43384471680 (07:15 UTC, la primera), 43394890760 (08:39), 43397410888 (08:58) y 43413835372 (11:02, run #228, ya con el resumen simplificado); las cuatro `success`, con el paso «E2E en la app instalada» ejecutado y el artefacto `e2e-installed-logs` publicado con `e2e-installed.log`, `e2e-installed-ui.log` y `e2e-installed-ui-de.log`.

El resumen del job dice dónde corrió la prueba y se escribe también en la salida del paso, para leerlo en el log sin sesión de GitHub: `- **Runner del E2E:** GitHub Actions 1000002614 (alojado por GitHub)`.

Sigue pendiente el runner autoalojado, que solo hace falta para ejecutar el E2E en cada push. Hoy el repositorio tiene **0 runners** y **0 variables** de Actions. El orden importa: definir `TERMINUS_CI_RUNNER` antes de registrar un runner con esa etiqueta deja todos los jobs en cola, porque `runs-on` no encontraría dónde ejecutarlos.

Pendiente (opcional):

- [ ] Registrar un runner Windows con sesión interactiva (`run.cmd`, no servicio; `SessionId != 0`) con la etiqueta `terminus-e2e`.
- [ ] Solo después, definir la variable `TERMINUS_CI_RUNNER=terminus-e2e`; la guía desaconseja dejar `TERMINUS_RUN_INSTALLED_E2E` activo para no correr el E2E en cada push.
- [x] Primera ejecución por `workflow_dispatch` con `run_installed_e2e=true` (43384471680).
- [x] Artefacto `e2e-installed-logs` con los tres logs del job.
- [x] El guion de UI se ejecuta también con `TERMINUS_E2E_LOCALE=de` dentro del paso opcional.

Estado del guion de Ctrl+F (13 de noviembre de 2026):

- [x] Anclas `data-e2e` en `WebBrowserSurface.tsx`: `find-bar`, `find-input`, `find-status`, `find-prev`, `find-next`, `find-close` y `view-mode-real|dark|text`. El guion resuelve buscador, campo, estado, botones y conmutadores por esos atributos, en vez de por orden del JSX o `aria-pressed`.
- [x] Respaldo para la versión instalada anterior: un build sin `data-e2e` (la `0.3.0` del 12 de noviembre) sigue pasando por el camino estructural (único `[role="dialog"]` con `aria-live`, primer `input`, botones por posición y `aria-pressed` fuera de diálogos). Verificado con tres `PASS` contra ese ejecutable.
- [x] Pruebas que protegen las anclas: cuatro casos en `WebBrowserSurface.test.tsx` ("anclas data-e2e del E2E instalado") fallan si desaparecen los atributos del buscador, del campo de inicio, del único botón de envío o de los conmutadores de vista. `npm test` queda en 41 archivos y 195 pruebas.
- [x] Paso nativo con verificación de primer plano: la activación se reintenta hasta cinco veces y se confirma con `GetForegroundWindow` contra `MainWindowHandle` antes de enviar la tecla. Si el primer plano no llega o la tecla se pierde, el guion repite el atajo por CDP (mismo `before-input-event` de Chromium y mismo IPC, sin depender de la ventana activa), lo anota en el log como «Ctrl+F por CDP» y continúa; solo falla si tampoco así se abre el buscador.
- [x] Resultado real de la última tanda, con el build de hoy instalado (instalador `0.3.0` generado e instalado; `app.asar` contiene `find-bar`, `find-next` y `view-mode-`): siete corridas seguidas de `npm run test:e2e:installed` cerraron con los tres `PASS` y `EXIT=0`, ya por la ruta `data-e2e`; las siete avisaron «Ctrl+F por CDP» porque otra ventana retenía el primer plano, y ninguna dependió de reintentos. El respaldo estructural se comprobó aparte con las mismas tres comprobaciones contra la `0.3.0` anterior.

Cierre (13 de noviembre de 2026): las corridas dejan el log con los `PASS` de Ctrl+F, los de la UI y los de la UI en alemán, numerados (`PASS n/m`, con `STEPS: n/m` que el CI compara con el esperado) y el artefacto `e2e-installed-logs` disponible. El paso de E2E del CI compara ese recuento con el total esperado y falla si no coincide, así un paso saltado no sale verde. Requisitos y diagnóstico en `docs/e2e-installed-windows.md`.

Vigilancia (14 de noviembre de 2026): las suites y su recuento esperado viven en `scripts/e2e-suites.mjs`, que leen los dos guiones y el ejecutor; `node scripts/e2e-run.mjs` las lanza, guarda los logs y compara el recuento sin PowerShell embebido en el workflow (pruebas en `scripts/lib/e2e-report.test.mjs`). El E2E corre en los PRs del propio repositorio que tocan la app (`ctrl-f` y `ui`), todas las noches en `main` con las tres suites, y un `workflow_dispatch` ya no cancela el check del PR. Los guiones anotan la duración de cada paso y comprueban que el `app.asar` instalado es idéntico al del build local antes de empezar, para que una instalación vieja falle al principio y no como un timeout.

Cobertura de Ctrl+F (14 de noviembre de 2026): el guion pasa a cinco pasos. Además de abrir el buscador y buscar en OSCURO y TEXTO, recorre las coincidencias de `cross-origin` con «siguiente» y «anterior» (cada pulsación tiene que producir una búsqueda nueva con resultado, comprobada por el aviso `termbrowser-find-result`, porque el iframe va con `sandbox` y no deja leer su documento) y cierra con `Escape`, exigiendo el diálogo cerrado y `aria-expanded="false"` en el conmutador. Cuando un paso falla, el guion guarda una captura en `artifacts/e2e/failure-<guion>-<fecha>.png`.

Cobertura de pestañas (14 de noviembre de 2026): la suite de la UI pasa a once pasos. El 9 abre una segunda pestaña con `tab new web`, navega en ella por su cuenta y exige que la primera conserve URL e historial; el 10 vuelve a la primera y comprueba que `back`/`forward` recorren solo su historial, con la segunda intacta; el 11 recarga el renderer y exige que las dos pestañas vuelvan con su `id`, URL, historial e índice y que la primera siga activa. Se compara la sesión guardada (`termbrowser.tabs`) y `aria-selected`, no el texto de las etiquetas, así que los pasos valen igual con la interfaz en alemán: `ui 11/11 · ui-de 11/11` en la 0.3.0 instalada.

### 3. Cobertura automatizada de la interfaz nueva — regresiones cubiertas en CI

Las tres regresiones del cierre y la persistencia del tema tienen prueba en `npm test` (41 archivos, 195 pruebas), que el CI ejecuta siempre, y además en la app empaquetada: `npm run test:e2e:installed:ui` cerró con cuatro `PASS` sobre la 0.3.0 instalada (12 de noviembre de 2026).

Pendiente:

- [x] `SettingsMenu` (`SettingsMenu.test.tsx`): abrir y cerrar el menú, `role="dialog"` con sus secciones, cambio de tema que avisa al padre y respeta el tema activo, silencio y CRT, e ida y vuelta de B&N.
- [x] `WindowControls` (`WindowControls.test.tsx`): los tres botones a través del puente, estado deshabilitado sin puente y cambio a «Restaurar ventana» cuando `onMaximizedChange` empuja el estado, sin pulsar nada.
- [x] Búsqueda del inicio (`WebBrowserSurface.test.tsx`): un solo paso (`search <consulta>`, con espacios recortados y el campo vaciado), envío vacío que no navega y sugerencia clicable que busca su propio texto; falla si reaparece el botón «ABRIR TERMINUS SEARCH».
- [x] Cabecera única (`HeaderBar.test.tsx`): un solo `<header>` con la marca, las pestañas y los controles de ventana dentro, sin barra de título duplicada.
- [x] Persistencia del tema (`App.theme.test.tsx`): monta la app entera, cambia el tema desde el menú, comprueba que queda en `localStorage` y que al desmontarla y volver a montarla arranca con el tema guardado aplicado; también cubre el tema por defecto y un valor guardado que ya no existe.
- [x] Los mismos casos en el E2E instalado (`scripts/e2e-installed-ui.mjs`, `npm run test:e2e:installed:ui`): sobre la 0.3.0 instalada comprueba la cabecera única (1 `<header>` con pestañas y los 3 controles de ventana dentro), abre el menú, cambia el tema y lo ve guardado en `localStorage` y aplicado tras recargar el renderer, y hace la búsqueda del inicio escribiendo y pulsando Enter, sin botón intermedio. y comprueba que esa misma consulta reaparece al volver al inicio como chip reciente anclado en `data-e2e="recent-search"`, con el campo ya enfocado para escribir. Resultado: ocho `PASS` (el sexto, a 432 px, comprueba el cartel sin recortar y el recorte de chips a la reciente más nueva; el séptimo pulsa una chip fija y una reciente y exige sus resultados, sin duplicar la fija como reciente; el octavo repite el foco del campo con el sinónimo `inicio`). Ya está en el paso opcional del E2E instalado, junto al de Ctrl+F, y corre en CI con `workflow_dispatch` (`run_installed_e2e=true`).

Cierre: las pruebas fallan si se reintroduce el botón intermedio de búsqueda, una segunda cabecera o un menú que no guarda el tema. La persistencia se comprueba de dos formas: remontando la app completa en Vitest y recargando el renderer de la app instalada, que arranca con el tema guardado seleccionado en el menú.

### 4. Deuda técnica y de seguridad — abierta, sin fecha

Limitaciones conocidas documentadas en el README; se abordan solo si aparece una razón concreta.

- `style-src 'unsafe-inline'` se mantiene por los temas: quitar los estilos inline exigiría migrar los temas a clases generadas.
- Sanitización conservadora en `/api/view`: no sustituye un navegador aislado para contenido hostil.
- EasyList no genera cosméticos para `localhost` ni IPs (sin eTLD); solo aplica bloqueo de red.
- Métricas del monitor parcialmente estimadas; no sirven como telemetría.
- REAL pasa por el forward proxy con IP fijada, pero sigue siendo una superficie de red amplia; el guard mitiga subframes y popups, no aísla.
- Sin autenticación multiusuario.

### 5. Backlog de producto — ideas, sin prioridad

- Búsquedas recientes bajo el campo de inicio, mezcladas con las sugerencias fijas — **hecha**: las tres últimas consultas se guardan en `localStorage` (`termbrowser.recent-searches.v1`, sin distinguir mayúsculas y sin repetir), aparecen delante de las fijas sin duplicarlas y llevan el ancla `data-e2e="recent-search"`. Cubierta por `src/utils/recentSearches.test.ts` y seis casos del componente. Por debajo de `sm` (640 px) solo queda visible la reciente más nueva y la etiqueta se oculta, con clases de CSS, para que la fila no crezca a tres líneas; un reciente que ya sea sugerencia fija no se repite, de modo que esa chip no desaparece al recortar.
- Sección de red y privacidad en el menú de configuración, en lugar de variables de entorno.
- Definir si Terminus Search mantiene el proveedor externo actual o pasa a un índice propio.

## Fuera de alcance

- Firma de código y reputación en SmartScreen.
- Cuentas, sincronización o backend remoto.
- Soporte de escritorio fuera de Windows (Linux queda en modo web y AppImage).

## Cómo se mantiene

Cada cambio de estado se refleja aquí en el mismo commit que lo provoca. Si un hito se descarta, se mueve a **Decisiones cerradas** con su motivo, en lugar de borrarse.
