# Roadmap de Terminus

Este documento es la fuente de verdad de lo que falta. El repositorio no usa issues ni milestones en GitHub, así que el estado se mantiene aquí y se actualiza al cerrar cada hito.

- Última release publicada: `0.2.2`; el paquete ya está en `0.3.0` y el instalador está generado, pendiente de publicar.
- Rama `main` en `4ca78bf` (rediseño de interfaz), más el bump de versión y las notas sin commitear.
- Verificación actual: `npm run lint:types` correcto, `npm test` con 29 archivos y 134 pruebas, cliente y servidor compilados, instalador `0.3.0` generado y `NotSigned`.
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

### 1. Publicar la nueva interfaz (`0.3.0`) — en curso

Trabajo ya hecho y commiteado en `4ca78bf`:

- Menú de configuración (audio, temas, B&W, CRT) en la cabecera, con los controles de ventana a su lado.
- Eliminación de la barra de título duplicada; una sola cabecera.
- Buscador en la pantalla de inicio con sugerencias clicables, sin botón intermedio.
- Glitch del cartel ASCII con bandas, separación cromática y variante para `prefers-reduced-motion`.
- Terminus Search sin cabecera interna propia.

Pendiente:

- [ ] Revisión manual de la UI en Electron instalado: cabecera, menú, buscador desde el inicio, glitch a velocidad normal y con movimiento reducido.
- [x] Commit del rediseño y `package.json` a `0.3.0`, con la versión centralizada en `src/utils/version.ts` (versión visible y User-Agent incluidos).
- [x] `docs/release-notes-v0.3.0.md` con cambios, verificación y SHA-256 del instalador.
- [ ] Publicar la release `0.3.0` con el instalador y `SHA256SUMS.txt`.
- [ ] README actualizado: arquitectura (`SettingsMenu`, `WindowControls`), flujo de búsqueda desde el inicio y recuento de pruebas.

Cierre: lint, pruebas y builds en verde; instalador generado, revisado a mano e instalado; release `0.3.0` publicada con hashes; la búsqueda funciona desde la pantalla de inicio sin pasar por otra vista.

### 2. E2E sobre la app instalada en CI — bloqueado por infraestructura

El script y el job existen (`npm run test:e2e:installed`, `.github/workflows/ci.yml`), pero nunca se ejecutaron en CI porque falta el runner.

Pendiente:

- [ ] Runner Windows con sesión interactiva (`run.cmd`, no servicio; `SessionId != 0`) y etiqueta `terminus-e2e`.
- [ ] Variable de repositorio `TERMINUS_CI_RUNNER=terminus-e2e`.
- [ ] Ejecución por `workflow_dispatch` con `run_installed_e2e=true`.

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
