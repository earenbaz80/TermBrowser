# E2E instalado en un runner Windows interactivo

Esta guía prepara la ejecución de `npm run test:e2e:installed` en un runner de GitHub Actions con una sesión de escritorio Windows real. El E2E valida la app Electron instalada, no `electron .`:

- arranca el ejecutable instalado con un perfil temporal;
- carga `https://example.com/` para el iframe REAL cross-origin y sirve un fixture HTTP local en otro puerto para las vistas `OSCURO` y `TEXTO`;
- obtiene el control del renderer mediante CDP;
- envía `Ctrl+F` con `SendKeys` nativo de Windows y, si otra ventana retiene el primer plano o la tecla se pierde, repite el atajo por CDP (mismo `before-input-event` de Chromium y mismo IPC);
- comprueba que el buscador encuentra texto real en las vistas `OSCURO` y `TEXTO`.

La única salida a Internet es `https://example.com/`; el resto se sirve en loopback.

## Requisitos del runner

- Windows 10/11 x64, dedicado a CI (máquina física o VM).
- Una cuenta de Windows con sesión iniciada y **escritorio interactivo desbloqueado**.
- El runner debe ejecutarse con `run.cmd` en esa sesión, no como servicio.
- PowerShell 5.1 disponible (`powershell.exe`).
- Node.js 22 o superior; el workflow ya instala Node 22 con `actions/setup-node`.
- Salida a GitHub y al registro de npm para `npm ci`.
- Permisos para instalar el NSIS por usuario en `%LOCALAPPDATA%\Programs\Terminus`.
- Sin suspensión, bloqueo de pantalla ni desconexión de RDP durante la prueba.

### El runner no puede ser un servicio

Un runner instalado con `svc.cmd install` se ejecuta en la **sesión 0**, sin escritorio interactivo. En ese contexto `AppActivate` y `SendKeys` no pueden activar la ventana de Terminus y el E2E falla con un mensaje similar a:

```text
No se pudo activar la ventana de Terminus.
```

Configura el runner y arráncalo desde la sesión del usuario:

```powershell
.\config.cmd --url https://github.com/<owner>/<repo> --token <token> --labels terminus-e2e
.\run.cmd
```

GitHub añade automáticamente las etiquetas `self-hosted`, `Windows` y `X64`; `terminus-e2e` es la etiqueta personalizada que usará el workflow. No uses `svc.cmd install` para este runner.

Para comprobar que el proceso está en una sesión interactiva:

```powershell
(Get-Process -Id $PID).SessionId
```

Debe devolver un valor distinto de `0`. Si devuelve `0`, el runner está en la sesión de servicios y el E2E no puede funcionar.

### Mantener la sesión disponible

En la cuenta del runner:

```powershell
powercfg /change standby-timeout-ac 0
powercfg /change monitor-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
```

Desactiva el bloqueo automático y el protector de pantalla. Si usas RDP, no dejes la sesión desconectada ni bloqueada; el runner debe seguir en una sesión con escritorio visible. Para un runner dedicado, es preferible usar la consola de la VM o una sesión RDP que permanezca conectada.

No ejecutes Terminus como administrador: `SendKeys` puede ser bloqueado por UIPI si la app y el proceso que envía las teclas tienen niveles de integridad distintos.

## Configurar el repositorio

En **Settings → Secrets and variables → Actions → Variables** crea:

| Variable | Valor | Uso |
| --- | --- | --- |
| `TERMINUS_CI_RUNNER` | `terminus-e2e` | Etiqueta del runner interactivo. |
| `TERMINUS_RUN_INSTALLED_E2E` | `true` | Opcional: ejecutar el E2E en cada push y en PRs del mismo repositorio. |

Recomendación: deja `TERMINUS_RUN_INSTALLED_E2E` sin definir y lanza el E2E solo con `workflow_dispatch`. Así el runner interactivo no ejecuta la prueba en cada cambio.

`TERMINUS_CI_RUNNER` debe contener **una sola etiqueta**. El workflow usa la etiqueta configurada para `push`, `workflow_dispatch` y PRs del mismo repositorio, pero **nunca** la usa para un PR desde un fork:

```yaml
runs-on: ${{ (github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name != github.repository) && 'windows-latest' || vars.TERMINUS_CI_RUNNER || 'windows-latest' }}
```

Sin la variable el job usa `windows-latest`: allí el escritorio no está garantizado, pero el preflight decide y la corrida 43384471680 ejecutó los tres guiones en verde (Ctrl+F, UI y UI en alemán). Para ejecuciones repetidas conviene un runner propio con `TERMINUS_CI_RUNNER`. En PRs desde forks se omiten la instalación y el E2E, aunque `TERMINUS_RUN_INSTALLED_E2E` esté activo.

> **Seguridad:** al definir `TERMINUS_CI_RUNNER`, los jobs de `push`, `workflow_dispatch` y PRs del mismo repositorio se ejecutan en ese runner, no solo el E2E. El workflow fuerza `windows-latest` para PRs desde forks, pero un runner autoalojado sigue siendo una superficie de riesgo. No lo configures para un repositorio público que acepte PRs de desconocidos; usa un runner dedicado y, preferiblemente, una VM desechable o una instantánea restaurable.

## Disparar la ejecución

### Desde GitHub

1. Abre **Actions → CI**.
2. Pulsa **Run workflow**.
3. Selecciona la rama.
4. Marca `run_installed_e2e`.
5. Ejecuta el workflow.

### Desde la CLI

```bash
gh workflow run ci.yml --ref <rama> -f run_installed_e2e=true
gh run list --workflow ci.yml --limit 1
gh run watch <run-id>
```

No lances dos ejecuciones simultáneas sobre la misma rama: la política de concurrencia del workflow cancela la anterior.

## Qué hace el workflow

Si el E2E está solicitado, antes de instalar dependencias se ejecuta un preflight que exige una sesión interactiva (`SessionId != 0` y `[Environment]::UserInteractive`). Si falla, el job termina antes de compilar o instalar nada.

Además, tras el checkout se valida la sintaxis y las expresiones de los workflows con actionlint. El binario se descarga con versión y SHA-256 fijados.

El job `windows` ejecuta, en orden:

1. Checkout, Node.js 22 y, si corresponde, el preflight interactivo.
2. `npm ci`.
3. `npx playwright install chromium`.
4. `npm audit --audit-level=moderate` (incluye dependencias de desarrollo).
5. `npm run lint`.
6. `npm run test:coverage`, que publica el artefacto `coverage-lcov`.
7. `npm run test:e2e:python-sandbox`.
8. `npm run desktop:build`.
9. Publica el instalador NSIS como artefacto.
10. Instala el instalador más reciente con `/S`.
11. Detiene cualquier instancia de Terminus que el instalador haya abierto.
12. Define `TERMINUS_INSTALLED_EXE` apuntando a `%LOCALAPPDATA%\Programs\Terminus\Terminus.exe`.
13. Ejecuta `npm run test:e2e:installed` y `npm run test:e2e:installed:ui`; la UI se ejecuta dos veces, sin locale y con `TERMINUS_E2E_LOCALE=de`, para ejercer la ruta multiidioma. La salida queda en `artifacts/e2e/e2e-installed.log`, `artifacts/e2e/e2e-installed-ui.log` y `artifacts/e2e/e2e-installed-ui-de.log`; el paso falla con el primer código distinto de cero.
14. Publica el log del E2E y un resumen del job.

El E2E solo se ejecuta si se cumple una de estas condiciones:

- `workflow_dispatch` con `run_installed_e2e = true`;
- variable `TERMINUS_RUN_INSTALLED_E2E = true`, salvo en PRs desde forks.

En cualquier otro caso se omite, pero el build y el instalador sí se generan.

## Evidencias esperadas

Al terminar, el resumen del workflow debe indicar:

```text
E2E: PASS
Código de salida del E2E: 0
```

El log debe contener líneas equivalentes a:

```text
[e2e-installed-ctrl-f] PASS: Ctrl+F abrió «Buscar en la página» en la app instalada.
[e2e-installed-ctrl-f] PASS: búsqueda en OSCURO (Coincidencia encontrada).
[e2e-installed-ctrl-f] PASS: búsqueda en TEXTO (Coincidencia encontrada).
```

Artefactos relevantes:

- `coverage-lcov`.
- `terminus-installer-<versión>-run-<número>-windows`.
- `e2e-installed-logs`.

## Ejecución manual equivalente

En una máquina Windows con escritorio interactivo, desde la raíz del repositorio:

```powershell
npm ci
npm run desktop:build

$installer = Get-ChildItem -LiteralPath release -Filter 'Terminus Setup *.exe' |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
if (-not $installer) { throw 'No se generó el instalador NSIS.' }

Start-Process -FilePath $installer.FullName -ArgumentList '/S' -Wait
Get-Process -Name Terminus -ErrorAction SilentlyContinue |
  Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

npm run test:e2e:installed
```

Si el ejecutable está en otra ruta:

```powershell
$env:TERMINUS_INSTALLED_EXE = 'C:\ruta\Terminus.exe'
npm run test:e2e:installed
```

En Git Bash:

```bash
TERMINUS_INSTALLED_EXE="C:\ruta\Terminus.exe" npm run test:e2e:installed
```

`npm run test:e2e:installed:ui` comparte requisitos y aislamiento, y añade las comprobaciones de interfaz: cabecera única, cambio de tema persistido tras recargar y búsqueda del inicio en un paso. La búsqueda del inicio se ancla en `[data-e2e="start-search-input"]` dentro de `form[role="search"]`, sin depender de la posición del campo ni del idioma; tras enviar, la comprobación pasa a la página de resultados, que tiene su propio formulario. Ambos guiones comparten `scripts/lib/installed-app.mjs`: arranque del ejecutable con perfil temporal, cliente CDP, esperas y limpieza. El script crea su propio servidor de fixture, perfil temporal y puerto CDP, y limpia todo al terminar. No requiere que la app esté abierta; de hecho, conviene cerrar instancias previas. Debe ejecutarse en la misma sesión interactiva y sobre el build recién instalado: el script comprueba que `app.asar` contiene el marcador del atajo global y falla si la instalación está desactualizada.

## Anclas del E2E de Ctrl+F

`scripts/e2e-installed-ctrl-f.mjs` no busca texto en español ni `aria-label` traducidos: se ancla en atributos del DOM y en el orden del JSX. Esta es la lista de lo que asume, para que quien toque `WebBrowserSurface.tsx` (o la barra de direcciones) sepa qué puede romper.

### Anclas por atributo

| Ancla | Selector o regla | Qué asume | Si cambia… |
| --- | --- | --- | --- |
| Barra de direcciones | `input[aria-controls="terminus-address-suggestions"]` | Que el id de la lista de sugerencias no cambia y que ese `input` es único. | Renombrar el id rompe el guion en el primer paso. |
| Conmutador del buscador | `button[aria-keyshortcuts="Control+F"]` | Que sigue siendo un `<button>` con esa cadena exacta y que `aria-expanded` refleja el estado abierto (`"true"` tras abrir). | Cambiar el atajo mostrado o el elemento rompe la apertura y la comprobación de expansión. |
| Conmutadores de vista | `button[data-e2e="view-mode-real|dark|text"]` | Que cada vista conserva su `data-e2e`. Sin ellos (build 0.3.0 instalado) se cae a los `button[aria-pressed]` fuera de diálogos, que deben ser exactamente **3** y en el orden de `PAGE_MODES`. | Quitar un `data-e2e` devuelve la prueba al camino posicional; un `aria-pressed` nuevo fuera de diálogos rompe solo el respaldo. |
| Buscador | `[data-e2e="find-bar"]` | Que el diálogo conserva ese atributo. Sin él se usa el respaldo: el **único** `[role="dialog"]` con una región `aria-live`. | Quitar el atributo devuelve la prueba al respaldo; si otro modal añade un `aria-live`, el respaldo puede coger el diálogo equivocado. |
| Campo de consulta | `[data-e2e="find-input"]` | Que el buscador sigue siendo un `<input>` controlado por React. Sin el atributo se toma el primer `input` del diálogo. | El guion escribe con el setter nativo de `HTMLInputElement` y un evento `input`; un `<textarea>` o un campo con máscara rompen la escritura. |
| Botones del buscador | `[data-e2e="find-prev"]`, `[data-e2e="find-next"]` y `[data-e2e="find-close"]` | Que cada control conserva su `data-e2e`. Sin ellos se pulsa por posición (0 anterior, 1 siguiente, 2 cerrar). | Añadir o mover botones solo afecta al respaldo posicional. |
| Estado de la búsqueda | texto de `[data-e2e="find-status"]` (o del `[aria-live="polite"]` del diálogo) | Que el texto puede estar traducido: nunca se compara con un literal. | Solo hay que mantener que el estado cambie al cambiar la consulta y se estabilice. |
| Iframe proxificado | primer `iframe` del documento y el parámetro `mode` de su `src` | Que el `src` proxificado lleva `?mode=real\|dark\|text` y que no hay otro `iframe` antes en el DOM. | Sin el parámetro `mode` fallan las esperas de `OSCURO` y `TEXTO`. |

### Supuestos posicionales

Solo aplican al **respaldo**, es decir, a un build instalado anterior a los `data-e2e` (la 0.3.0 actual). En el build nuevo la prueba usa los atributos y el orden del JSX deja de importar:

1. **Orden de los conmutadores de vista.** El respaldo usa `MODE_INDEX = { real: 0, dark: 1, text: 2 }` sobre el array de `button[aria-pressed]` fuera de diálogos y exige que sean 3.
2. **Orden de los botones del buscador.** El respaldo pulsa por posición dentro del diálogo: **0 = anterior, 1 = siguiente, 2 = cerrar**.
3. **Un solo `input` en el diálogo.** El respaldo toma el primer `input`; cualquier `input` adicional anterior en el JSX desvía la escritura.
4. **Un solo diálogo con `aria-live`.** El respaldo localiza el buscador por `[role="dialog"]` más `[aria-live="polite"]`.
5. **El conmutador cambia la vista.** Tras el clic, el guion exige el `mode` esperado en el `src` del iframe y el texto proxificado; el estado `aria-pressed` lo cubre `npm test`, no este guion.
6. **Texto del fixture.** Las vistas se validan con `Fixture cross-origin` en el HTML proxificado y con las consultas `Fixture` y `buscador`, que viven en el fixture del propio guion, no en la app.
7. **`Ctrl+F` funciona con el foco dentro del iframe cross-origin.** El paso nativo se envía a propósito con el foco en el iframe REAL. Si el atajo dejara de responder en ese escenario (por ejemplo, al mover el listener de teclado o al aislar el iframe), la prueba falla antes de buscar nada.
8. **Loopback accesible desde el proxy.** El fixture escucha en `127.0.0.1` y la app arranca con `TERMINUS_BLOCK_PRIVATE=0` y `TERMINUS_NETWORK_POLICY=local`; no depende de la configuración del usuario, pero sí de que el proxy alcance loopback.

## Diagnóstico

| Síntoma | Causa probable | Acción |
| --- | --- | --- |
| `No se encontró la app instalada` | Falta el NSIS o cambió la ruta. | Instala el build actual o define `TERMINUS_INSTALLED_EXE`. |
| `La app instalada no contiene el atajo global` | Instalación antigua o build incorrecto. | Vuelve a ejecutar `npm run desktop:build` e instala ese instalador. |
| `Ctrl+F por CDP: …` en el log | Otra ventana conserva el primer plano (o el foco de teclado no siguió a la activación) y la tecla nativa no entró. **No es un fallo**: el guion repite el atajo por CDP, que recorre el mismo `before-input-event` de Chromium y el mismo IPC de la app. El log lo deja escrito y continúa con la ruta `CDP`. | Nada. Si quieres que la corrida use la tecla nativa, deja Terminus en primer plano; el resto de comprobaciones es idéntico. |
| `Ctrl+F no abrió el buscador ni con la tecla nativa ni por CDP` | El atajo no responde en absoluto: renderer sin cargar o build que no registra `before-input-event`. | Revisa el log de la app que imprime el guion, comprueba que el `app.asar` instalado es el actual y reinstala. |
| `CDP no respondió` | La app terminó, el puerto está bloqueado o Electron no arrancó. | Revisa la cola del log de la app que imprime el script; comprueba antivirus/firewall y que el ejecutable sea el instalado. |
| `El iframe REAL no recibió el foco` | Ventana oculta, modal abierto o escritorio no interactivo. | Mantén la sesión visible, cierra diálogos y vuelve a lanzar la prueba. |
| `No se encontró «Fixture»` en OSCURO/TEXTO | El proxy no pudo acceder al fixture loopback. | Comprueba que el firewall permita loopback; el E2E ya define `TERMINUS_BLOCK_PRIVATE=0` y `TERMINUS_NETWORK_POLICY=local` para la instancia de prueba. |
| El instalador termina con código distinto de 0 | Instalación por usuario bloqueada o disco lleno. | Ejecuta el instalador en la misma cuenta del runner y revisa espacio/permisos. |
| `npm ci` falla en el runner | Node incorrecto o lockfile desactualizado. | Usa Node 22+ y no ejecutes `npm ci --force`; regenera el lockfile solo si el cambio de dependencias es intencional. |

## Lista de comprobación

- [ ] El runner está en una sesión interactiva (`SessionId != 0`).
- [ ] La sesión está desbloqueada y sin suspensión.
- [ ] El runner tiene la etiqueta `terminus-e2e`.
- [ ] `TERMINUS_CI_RUNNER=terminus-e2e` está definido.
- [ ] `TERMINUS_RUN_INSTALLED_E2E` está sin definir salvo que se quiera ejecutar en cada push.
- [ ] El instalador se genera y se instala con `/S`.
- [ ] El log contiene los tres `PASS`.
- [ ] El artefacto `e2e-installed-logs` está disponible.
