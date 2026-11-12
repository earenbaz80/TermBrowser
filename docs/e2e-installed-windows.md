# E2E instalado en un runner Windows interactivo

Esta guía prepara la ejecución de `npm run test:e2e:installed` en un runner de GitHub Actions con una sesión de escritorio Windows real. El E2E valida la app Electron instalada, no `electron .`:

- arranca el ejecutable instalado con un perfil temporal;
- carga `https://example.com/` para el iframe REAL cross-origin y sirve un fixture HTTP local en otro puerto para las vistas `OSCURO` y `TEXTO`;
- obtiene el control del renderer mediante CDP;
- envía `Ctrl+F` con `SendKeys` nativo de Windows;
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
| `TERMINUS_RUN_INSTALLED_E2E` | `true` | Opcional: ejecutar el E2E también en cada push/PR. |

Recomendación: deja `TERMINUS_RUN_INSTALLED_E2E` sin definir y lanza el E2E solo con `workflow_dispatch`. Así el runner interactivo no ejecuta la prueba en cada cambio.

`TERMINUS_CI_RUNNER` debe contener **una sola etiqueta**. El workflow usa la etiqueta configurada para `push`, `workflow_dispatch` y PRs del mismo repositorio, pero **nunca** la usa para un PR desde un fork:

```yaml
runs-on: ${{ (github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name != github.repository) && 'windows-latest' || vars.TERMINUS_CI_RUNNER || 'windows-latest' }}
```

Si la variable no existe, el job usa `windows-latest`; allí el E2E se omite porque no hay escritorio interactivo. Los pasos de instalación y del E2E también se omiten en PRs desde forks, incluso si `TERMINUS_RUN_INSTALLED_E2E` está activo.

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
13. Ejecuta `npm run test:e2e:installed`, guardando la salida en `artifacts/e2e/e2e-installed.log`.
14. Publica el log del E2E y un resumen del job.

El E2E solo se ejecuta si se cumple una de estas condiciones:

- `workflow_dispatch` con `run_installed_e2e = true`;
- variable `TERMINUS_RUN_INSTALLED_E2E = true`.

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

El script crea su propio servidor de fixture, perfil temporal y puerto CDP, y limpia todo al terminar. No requiere que la app esté abierta; de hecho, conviene cerrar instancias previas. Debe ejecutarse en la misma sesión interactiva y sobre el build recién instalado: el script comprueba que `app.asar` contiene el marcador del atajo global y falla si la instalación está desactualizada.

## Diagnóstico

| Síntoma | Causa probable | Acción |
| --- | --- | --- |
| `No se encontró la app instalada` | Falta el NSIS o cambió la ruta. | Instala el build actual o define `TERMINUS_INSTALLED_EXE`. |
| `La app instalada no contiene el atajo global` | Instalación antigua o build incorrecto. | Vuelve a ejecutar `npm run desktop:build` e instala ese instalador. |
| `No se pudo activar la ventana de Terminus` | Runner como servicio (sesión 0), sesión bloqueada o app elevada. | Arranca el runner con `run.cmd` en sesión interactiva, desbloquea el escritorio y no ejecutes como administrador. |
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
