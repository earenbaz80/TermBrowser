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

## Vigilancia del nocturno

El cron de CI (`30 3 * * *`) dispara las tres suites en `main`. Que GitHub deje de lanzarlo —el cron se desactiva tras semanas de inactividad, el YAML pierde `on.schedule` o el workflow se renombra— no lo nota nadie: simplemente dejan de existir corridas y los PRs siguen en verde.

`nightly-watchdog.yml` corre a las 09:00 UTC y falla si el workflow de CI no tiene ninguna corrida **programada** en las últimas 36 h. La ventana tolera el retraso habitual del cron (24 h entre corridas más 12 h de margen) pero no una noche perdida, que a esa hora ya serían 48 h. Consulta el endpoint del workflow (`/actions/workflows/ci.yml/runs?event=schedule`), no el del repositorio, para que su propia corrida programada no tape el hueco; y no cuenta los `workflow_dispatch`, porque lo que se vigila es que dispare el cron.

Si falla, la anotación del check dice el motivo y el resumen repite la ventana y el workflow. Para probarlo a mano: `node scripts/nightly-watchdog.mjs` con `GITHUB_TOKEN` y `GITHUB_REPOSITORY`, o con `--runs-file <json>` para evaluar corridas guardadas sin red.

## Disparar la ejecución

### Desde GitHub

1. Abre **Actions → CI**.
2. Pulsa **Run workflow**.
3. Selecciona la rama.
4. Marca `run_installed_e2e`.
5. Ejecuta el workflow.

Para ensayar el camino «sin red» del E2E de adblock sin cortar la red del runner, marca `adblock_offline`: el paso recibe `TERMINUS_E2E_ADBLOCK_PROBE_URLS=http://127.0.0.1:9/`, sale con código 2 y el job tiene que quedar **verde** con el `::warning` «E2E de adblock omitido» y el resumen «Omitido (sin red) - ensayo con workflow_dispatch». Es la forma de comprobar en Actions que un fallo de red no se confunde con una regresión.

### Desde la CLI

```bash
gh workflow run ci.yml --ref <rama> -f run_installed_e2e=true
gh run list --workflow ci.yml --limit 1
gh run watch <run-id>
```

No lances dos ejecuciones simultáneas sobre la misma rama: la política de concurrencia del workflow cancela la anterior.

## Qué hace el workflow

Si el E2E está solicitado, antes de instalar dependencias se ejecuta un preflight que exige una sesión interactiva (`SessionId != 0` y `[Environment]::UserInteractive`). Si falla, el job termina antes de compilar o instalar nada.

El workflow se parte en dos jobs encadenados para que el primer veredicto llegue en minutos y el build no se gaste en código que no pasa el lint (`windows` declara `needs: checks` y se salta si `checks` falla): `checks` (checkout, Node.js 22, actionlint —binario con versión y SHA-256 fijados—, `npm ci`, `npm run lint`, `npm run test:coverage` con el artefacto `coverage-lcov`, `npm audit` y la prueba Chromium del sandbox Python) y `windows` (gate del E2E, preflight, build, instalador, suites y artefactos). Un tercer job, `requerido`, no ejecuta nada: espera a los dos y falla si alguno falló, y conserva el nombre `Windows - lint, tests, cobertura y E2E opcional`, que es el contexto que exige la protección de `main`, así que el check obligatorio sigue siendo uno solo.

Los pasos 1 a 7 son del job `checks`; el resto, de `windows`, que ejecuta en orden:

1. Checkout, Node.js 22 y, si corresponde, el preflight interactivo.
2. `npm ci`.
3. `npx playwright install chromium`.
4. `npm audit --audit-level=moderate` (incluye dependencias de desarrollo).
5. `npm run lint`.
6. `npm run test:coverage`, que publica el artefacto `coverage-lcov`.
7. `npm run test:e2e:python-sandbox`.
8. `npm run desktop:build`.
9. `npm run test:e2e:adblock`: Playwright lanza `release/win-unpacked/Terminus.exe` contra un fixture local y comprueba el proxy, el bloqueo de red y los cosméticos de EasyList, el bloqueo de la red privada en las vistas proxificada y REAL, el popup bloqueado y el contenido legítimo visible. Corre en todos los runs, no depende del gate del E2E instalado, y publica en el artefacto `e2e-adblock` su captura `artifacts/adblock-electron.png` y la salida completa del paso en `artifacts/e2e/adblock-electron.log` (UTF-8, la escribe el propio guion), también cuando el paso falla: el log lleva los `NETWORK …` del preflight, el estado del fixture y el marcador final, así que un fallo se diagnostica desde el artefacto sin abrir el log del run. Como depende de internet, el guion comprueba antes de arrancar `example.com` y las listas de EasyList con tres intentos acotados; si no responden sale con **código 2** (`E2E_ADBLOCK_UNREACHABLE`), que el paso traduce a un `::warning` y a `skipped=true` para que el job siga verde y el resumen diga «Omitido (sin red)». Un fallo del producto sigue saliendo con código 1 y pone el check en rojo. El mismo código 2 cubre una caché del motor ausente, ilegible o con menos filtros de los mínimos: `scripts/lib/adblock-engine-state.mjs` deserializa `adblock-engine.bin` con la misma librería que la app y cuenta los filtros (un motor sano trae ~120.000 de red y ~36.000 cosméticos; el mínimo es 1.000 de cada). Una lista vacía o truncada se queda muy por debajo, así que se clasifica como red en vez de como regresión de cosméticos. El guion arranca con un perfil temporal propio (`--user-data-dir` en un directorio de `os.tmpdir()`, borrado al terminar) y comprueba que `app.getPath('userData')` es ese directorio: así local y CI ejecutan el mismo escenario frío —descarga de listas incluida— sin leer ni escribir la caché del usuario, y la espera del motor es una consulta al `.bin` hasta que tiene filtros (90 s como máximo) en vez de un tiempo fijo; un `.bin` que deserializa pero no llega al mínimo se da por definitivo, porque el producto no vuelve a descargar listas si la caché se puede leer. Con el motor inservible se clasifica como red **cualquier** fallo del guion, no solo la comprobación de cosméticos: sin filtros, la comprobación de red falla antes y también daría un diagnóstico falso. Para reproducir ese caso sin cortar la red, `TERMINUS_E2E_ADBLOCK_SEED_EMPTY_ENGINE=1` siembra un motor vacío válido en el perfil temporal y el guion sale con código 2, el motivo del motor y la primera comprobación que falló. En el nocturno esos modos de fallo se vigilan solos: dos pasos ejecutan el guion con `TERMINUS_E2E_ADBLOCK_SEED_EMPTY_ENGINE=1` y con `TERMINUS_E2E_ADBLOCK_PROBE_URLS=http://127.0.0.1:9/`, exigen **código 2** y que el log lleve el motivo («motor sin listas» o `E2E_ADBLOCK_UNREACHABLE`), y dejan sus logs en el artefacto `e2e-adblock-drills`. Si una clasificación se rompe, el nocturno se pone rojo sin que nadie tenga que probarla a mano.
10. Publica el instalador NSIS como artefacto.
11. Instala el instalador más reciente con `/S`.
12. Detiene cualquier instancia de Terminus que el instalador haya abierto.
13. Define `TERMINUS_INSTALLED_EXE` apuntando a `%LOCALAPPDATA%\Programs\Terminus\Terminus.exe`.
14. Ejecuta `node scripts/e2e-run.mjs`: recorre `scripts/e2e-suites.mjs`, lanza cada suite con `npm run`, guarda su salida en `artifacts/e2e/<log>` y falla con el primer código distinto de cero. Las suites que corre cada ejecución salen de `pr: true` en `scripts/e2e-suites.mjs`, y una prueba compara esa lista con la del workflow para que no se desincronicen. Las tres corren también en un PR cuando el gate lo pide: medido sobre la app instalada el 14 de noviembre de 2026, `ui` tarda 12 s, `ui-de` otros 12 s y `ctrl-f` 14 s, así que condicionar la de alemán a cambios de textos o i18n ahorraría doce segundos y perdería la cobertura de disposición, chips y pestañas con cadenas alemanas, que se rompen por CSS o por estructura y no solo cuando cambian los textos. `ui-de` es la misma suite con `TERMINUS_E2E_LOCALE=de`.
15. Compara el recuento: cada log tiene que cerrar con `STEPS: n/m` igual al total que declara su entrada de `scripts/e2e-suites.mjs`, la misma lista que leen los guiones, así que el esperado no se puede desincronizar. El resumen del paso queda `ctrl-f 5/5 · ui 11/11 · ui-de 11/11`.
16. Publica los logs del E2E y un resumen del job, que incluye el estado del E2E de adblock (`OK`, `FAIL` u `Omitido (sin red)`) con el enlace a su captura.

El E2E se ejecuta cuando se cumple una de estas condiciones:

- un PR del propio repositorio que toque `src/`, `electron/`, `scripts/`, `assets/`, `package.json`/`package-lock.json` o la configuración del build (corre `ctrl-f` y `ui`);
- el nocturno de `main` (`cron` a las 03:30 UTC), que corre las tres suites;
- `workflow_dispatch` con `run_installed_e2e = true`;
- la variable `TERMINUS_RUN_INSTALLED_E2E = true`, salvo en PRs desde forks.

Un dispatch sobre una rama ya no cancela la corrida del PR: solo un push nuevo cancela la anterior de la misma referencia. En cualquier otro caso el E2E se omite, pero el build y el instalador sí se generan.

## Evidencias esperadas

Al terminar, el resumen del workflow debe indicar:

```text
E2E: PASS (código 0)
Runner del E2E: GitHub Actions 1000002614 (alojado por GitHub)
```

La línea del runner deja claro dónde corrió el E2E: el preflight solo comprueba que hay escritorio, no el tipo de runner.

El log debe contener líneas equivalentes a:

```text
[e2e-installed-ctrl-f] PASS 1/5: Ctrl+F abrió el buscador en la app instalada. (2,9 s)
[e2e-installed-ctrl-f] PASS 2/5: búsqueda en OSCURO (Coincidencia encontrada). (1,7 s)
[e2e-installed-ctrl-f] PASS 3/5: búsqueda en TEXTO (Coincidencia encontrada). (1,5 s)
[e2e-installed-ctrl-f] PASS 4/5: siguiente y anterior buscan otra coincidencia (1 y 1 búsquedas, Coincidencia encontrada). (1,4 s)
[e2e-installed-ctrl-f] PASS 5/5: Escape cerró el buscador y el conmutador volvió a su sitio. (0,0 s)
[e2e-installed-ctrl-f] STEPS: 5/5
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

`npm run test:e2e:installed:ui` comparte requisitos y aislamiento, y añade las comprobaciones de interfaz: cabecera única, cambio de tema persistido tras recargar y búsqueda del inicio en un paso. La búsqueda del inicio se ancla en `[data-e2e="start-search-input"]` dentro de `form[role="search"]`, sin depender de la posición del campo ni del idioma; tras enviar, la comprobación pasa a la página de resultados, que tiene su propio formulario. De vuelta al inicio con `home`, la consulta enviada se comprueba como chip reciente anclado en `[data-e2e="recent-search"]` y se exige que el campo tenga el foco: es la forma de verificar en la app empaquetada que el inicio recuerda la búsqueda y que la dibuja como chip. Después se repite `home` sin cambiar de pantalla y se exige otra vez el foco, para cubrir que el comando reenfoca el campo aunque el inicio ya estuviera abierto. El paso 7 pulsa chips del inicio: una **fija** (la primera del grupo que no lleva `data-e2e`, así que vale en cualquier idioma porque se lee su propio texto) y una **reciente** (`[data-e2e="recent-search"]` con la primera consulta), y exige en cada caso la página de resultados de esa consulta, comprobada por el campo de la página y la dirección. Al volver con `home`, la consulta de la chip fija no puede aparecer duplicada como reciente: es la regla de `mergeStartChips`, y la chip fija sigue visible. El paso 8 repite el foco del campo con el sinónimo `inicio` desde la página de resultados, para cubrir la rama que comparte con `home` en el procesador de comandos. El paso 6 reduce la ventana con `Emulation.setDeviceMetricsOverride` a 432 px y exige que el cartel ASCII siga entero (no desborda su caja, cabe en el ancho, la fuente baja de 10 px y la página no gana scroll horizontal) y que las nuevas recientes se recorten a la más nueva: la etiqueta del grupo queda oculta, solo esa chip conserva rectángulos de cliente y las sugerencias fijas siguen visibles. Los pasos 9 a 11 cubren las pestañas: `tab new web` abre una segunda (se compara el `id`, que no se repita el de la primera, y que la primera conserve su URL e historial mientras la nueva navega a su propia búsqueda), volver a la primera con su tira de pestañas exige que siga intacta y que `back`/`forward` recorran solo su historial (la segunda no cambia ni una entrada), y una recarga del renderer con `Page.reload` exige que las dos pestañas vuelvan con su `id`, URL, historial e índice, y que la primera siga activa. Se comparan los datos guardados en `termbrowser.tabs` y los atributos del DOM (`aria-selected`), nunca el texto de las etiquetas, así que el paso vale igual en la suite alemana. Los dos guiones numeran sus pasos (Ctrl+F `PASS 1/5` … `5/5`; UI `PASS 1/11` … `11/11`) y cierran con `STEPS: n/m`; `scripts/e2e-run.mjs` exige ese mismo recuento en cada log y falla si falta la línea o no coincide, de modo que un paso perdido no pasa por verde. El resumen muestra un recuento por suite (`ctrl-f 5/5 · ui 11/11 · ui-de 11/11`). Cada `PASS` anota entre paréntesis lo que tardó, para ver un paso que empieza a rozar su espera. El guion de Ctrl+F cubre además los botones del buscador: con la palabra `cross-origin` (varias veces en el fixture) comprueba que «siguiente» y «anterior» vuelven a buscar y siguen encontrando, y cierra con `Escape`, exigiendo que el diálogo desaparezca y el conmutador quede en `aria-expanded="false"`. Como el iframe va con `sandbox` y su documento no se puede leer desde la app, la navegación se comprueba por el aviso `termbrowser-find-result` que el documento proxied devuelve, no por la selección interna. El recuento también aparece en el resumen, en «Pasos del E2E». Ambos guiones comparten `scripts/lib/installed-app.mjs`: arranque del ejecutable con perfil temporal, cliente CDP, esperas y limpieza. El script crea su propio servidor de fixture, perfil temporal y puerto CDP, y limpia todo al terminar. No requiere que la app esté abierta; de hecho, conviene cerrar instancias previas. Debe ejecutarse en la misma sesión interactiva y sobre el build recién instalado: el script comprueba que `app.asar` contiene el marcador del atajo global y, cuando existe `release/win-unpacked`, que el `app.asar` instalado es idéntico al del build local; si no coincide, falla al principio diciendo que hay que reinstalar. Cuando un paso falla, el guion guarda una captura en `artifacts/e2e/failure-<guion>-<fecha>.png`, que viaja en el artefacto `e2e-installed-logs`.

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
| Chip reciente del inicio | `[data-e2e="recent-search"]` | Que las chips de búsquedas recordadas llevan ese atributo, que la más nueva va la primera y que la chip está visible (tiene rectángulos de cliente). | Sin el atributo falla el paso 5: no hay respaldo por posición que distinga una reciente de una sugerencia fija. |
| Grupo de chips del inicio | `[data-e2e="start-chips"]` y `[data-e2e="start-chips-label"]` | Que las chips cuelgan de ese contenedor y que la etiqueta del grupo («Prueba con») es hija suya. El paso 6 cuenta ahí recientes y fijas, y comprueba que la etiqueta no tiene rectángulos a 432 px. | Sin el contenedor no se pueden separar recientes de fijas; sin la etiqueta no se puede comprobar su recorte. |
| Iframe proxificado | primer `iframe` del documento y el parámetro `mode` de su `src` | Que el `src` proxificado lleva `?mode=real\|dark\|text` y que no hay otro `iframe` antes en el DOM. | Sin el parámetro `mode` fallan las esperas de `OSCURO` y `TEXTO`. |

### Supuestos posicionales

Solo aplican al **respaldo**, es decir, a un build instalado anterior a los `data-e2e` (la 0.3.0 actual). En el build nuevo la prueba usa los atributos y el orden del JSX deja de importar:

1. **Orden de los conmutadores de vista.** El respaldo usa `MODE_INDEX = { real: 0, dark: 1, text: 2 }` sobre el array de `button[aria-pressed]` fuera de diálogos y exige que sean 3.
2. **Orden de los botones del buscador.** El respaldo pulsa por posición dentro del diálogo: **0 = anterior, 1 = siguiente, 2 = cerrar**.
3. **Un solo `input` en el diálogo.** El respaldo toma el primer `input`; cualquier `input` adicional anterior en el JSX desvía la escritura.
4. **Un solo diálogo con `aria-live`.** El respaldo localiza el buscador por `[role="dialog"]` más `[aria-live="polite"]`.
5. **El conmutador cambia la vista.** Tras el clic, el guion exige el `mode` esperado en el `src` del iframe y el texto proxificado; el estado `aria-pressed` lo cubre `npm test`, no este guion.
6. **Texto del fixture.** Las vistas se validan con `Fixture cross-origin` en el HTML proxificado y con las consultas `Fixture` y `buscador`, que viven en el fixture del propio guion, no en la app.
7. **El iframe proxificado va con `sandbox`.** Su documento no es accesible desde la app (`contentDocument` es `null`), así que la navegación entre coincidencias se comprueba con el mensaje `termbrowser-find-result` que el documento proxied envía a la app, no leyendo su selección.
8. **`Ctrl+F` funciona con el foco dentro del iframe cross-origin.** El paso nativo se envía a propósito con el foco en el iframe REAL. Si el atajo dejara de responder en ese escenario (por ejemplo, al mover el listener de teclado o al aislar el iframe), la prueba falla antes de buscar nada.
9. **Loopback accesible desde el proxy.** El fixture escucha en `127.0.0.1` y la app arranca con `TERMINUS_BLOCK_PRIVATE=0` y `TERMINUS_NETWORK_POLICY=local`; no depende de la configuración del usuario, pero sí de que el proxy alcance loopback.

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
- [ ] El log contiene los cinco `PASS` de Ctrl+F (incluidos navegación y cierre con Escape).
- [ ] Los tres logs cierran con su recuento (`STEPS: 5/5` en Ctrl+F y `STEPS: 8/8` en cada suite de UI); `scripts/e2e-run.mjs` falla si no coincide con el esperado, aunque el guion salga con 0.
- [ ] El paso anota la duración de cada `PASS` entre paréntesis, útil para ver un paso que empieza a rozar su espera.
- [ ] El artefacto `e2e-installed-logs` está disponible.
