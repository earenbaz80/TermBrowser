# Roadmap de Terminus

Este documento es la fuente de verdad de lo que falta. El repositorio no usa issues ni milestones en GitHub, así que el estado se mantiene aquí y se actualiza al cerrar cada hito.

- Última release publicada: `0.3.0` (tag `v0.3.0`, 12 de noviembre de 2026), con instalador, `.blockmap`, ZIP y `SHA256SUMS.txt`.
- Estado del proyecto: rediseño de interfaz e internacionalización (PR #11) mergeados en `main`, notas de release y README alineados con los artefactos publicados, y el E2E instalado del hito 0.3.0 pasado.
- Verificación actual: `npm run lint` correcto (tsc y eslint), `npm test` con 38 archivos y 160 pruebas, cliente y servidor compilados, instalador `0.3.0` generado y `NotSigned`.
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
- [x] README actualizado: arquitectura (`SettingsMenu`, `WindowControls`, `src/i18n`), flujo de búsqueda desde el inicio, idiomas y recuento de pruebas.

Cierre: lint, pruebas y builds en verde; instalador generado, revisado e instalado; release `0.3.0` publicada con hashes; la búsqueda funciona desde la pantalla de inicio sin pasar por otra vista. Hito cerrado el 12 de noviembre de 2026.

### 2. E2E sobre la app instalada en CI — nunca se disparó; falta el runner interactivo

El script y los pasos existen (`npm run test:e2e:installed`, `.github/workflows/ci.yml`), pero en CI no se han ejecutado nunca: el repositorio tiene **0 ejecuciones `workflow_dispatch`** y **0 variables de Actions**, que son los dos únicos disparadores de los pasos (`workflow_dispatch` con `run_installed_e2e=true`, o `TERMINUS_RUN_INSTALLED_E2E=true`). Ningún run lleva el artefacto `e2e-installed-logs`; los que sí se publican son `coverage-lcov` y `terminus-installer-…`. El E2E sí pasó el 12 de noviembre de 2026, pero en local, sobre la `0.3.0` instalada (tres `PASS`, `EXIT=0`).

El runner es el requisito que falta, y no el único: `runs-on` usa `vars.TERMINUS_CI_RUNNER` y cae a `windows-latest` cuando no existe, donde el E2E se omite; además el paso «Preflight de sesión interactiva» aborta si `SessionId = 0` o `[Environment]::UserInteractive` es falso, así que hace falta un runner arrancado con `run.cmd` en una sesión de escritorio, no un runner alojado ni un servicio.

Pendiente:

- [ ] Runner Windows con sesión interactiva (`run.cmd`, no servicio; `SessionId != 0`) y etiqueta `terminus-e2e`.
- [ ] Variable de repositorio `TERMINUS_CI_RUNNER=terminus-e2e` (hoy no hay ninguna variable definida).
- [ ] Primera ejecución por `workflow_dispatch` con `run_installed_e2e=true`; la guía desaconseja dejar `TERMINUS_RUN_INSTALLED_E2E` activo para no correrlo en cada push.
- [ ] Comprobar que el run publica el artefacto `e2e-installed-logs` con el log del job.

Cierre: el log del job contiene los tres `PASS` (Ctrl+F en REAL instalado, búsqueda en OSCURO y en TEXTO) y el artefacto `e2e-installed-logs` está disponible. Requisitos y diagnóstico en `docs/e2e-installed-windows.md`.

### 3. Cobertura automatizada de la interfaz nueva — siguiente

Hoy `SettingsMenu`, `WindowControls` y la búsqueda del inicio solo tienen pruebas de unidad.

Pendiente:

- [ ] Cubrir en el E2E instalado: abrir el menú, cambiar de tema y verificar que persiste tras recargar.
- [ ] Comprobar que la búsqueda del inicio lanza la pestaña de resultados sin pasos intermedios.
- [ ] Regresión de cabecera única: fallar si vuelve a renderizarse una barra de título separada.

Cierre: las pruebas fallan si se reintroduce el botón intermedio de búsqueda, una segunda cabecera o un menú que no persiste el tema.

### 4. Deuda técnica y de seguridad — abierta, sin fecha

Limitaciones conocidas documentadas en el README; se abordan solo si aparece una razón concreta.

- `style-src 'unsafe-inline'` se mantiene por los temas: quitar los estilos inline exigiría migrar los temas a clases generadas.
- Sanitización conservadora en `/api/view`: no sustituye un navegador aislado para contenido hostil.
- EasyList no genera cosméticos para `localhost` ni IPs (sin eTLD); solo aplica bloqueo de red.
- Métricas del monitor parcialmente estimadas; no sirven como telemetría.
- REAL pasa por el forward proxy con IP fijada, pero sigue siendo una superficie de red amplia; el guard mitiga subframes y popups, no aísla.
- Sin autenticación multiusuario.

### 5. Backlog de producto — ideas, sin prioridad

- Búsquedas recientes bajo el campo de inicio, mezcladas con las sugerencias fijas.
- Sección de red y privacidad en el menú de configuración, en lugar de variables de entorno.
- Definir si Terminus Search mantiene el proveedor externo actual o pasa a un índice propio.

## Fuera de alcance

- Firma de código y reputación en SmartScreen.
- Cuentas, sincronización o backend remoto.
- Soporte de escritorio fuera de Windows (Linux queda en modo web y AppImage).

## Cómo se mantiene

Cada cambio de estado se refleja aquí en el mismo commit que lo provoca. Si un hito se descarta, se mueve a **Decisiones cerradas** con su motivo, en lugar de borrarse.
