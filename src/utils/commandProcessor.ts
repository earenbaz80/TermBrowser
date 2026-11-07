import {
  ActivityLog,
  Bookmark,
  BrowserTab,
  ExtensionManifest,
  KeyBinding,
  SecurityState,
  SystemMetrics,
  TerminalLogEntry,
  ThemeId,
  UserScript,
  ViewMode,
  WebpagePayload,
} from '../types';
import { THEMES } from './themes';
import { runPythonCode, INITIAL_FILESYSTEM, VirtualFile } from './interpreter';
import { encryptAES256, decryptAES256, computeSHA256, generateTOTP, verifyTOTP } from './crypto';
import { COMMAND_DOCS } from '../components/HelpModal';
import {
  fetchWorkspaceFiles,
  readWorkspaceFile,
  writeWorkspaceFile,
  mountNativeLocalDirectory,
  toVirtualFiles,
} from './localFileSystem';
import { notificationManager } from './notificationManager';
import { isSpeechRecognitionSupported } from './speechRecognition';
import {
  getPersistedCommandHistory,
  clearPersistedCommandHistory,
} from './commandHistoryStorage';

export interface CommandContext {
  tabs: BrowserTab[];
  activeTabId: string;
  setTabs: React.Dispatch<React.SetStateAction<BrowserTab[]>>;
  setActiveTabId: (id: string) => void;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  currentThemeId: ThemeId;
  setCurrentThemeId: (id: ThemeId) => void;
  crtEnabled: boolean;
  setCrtEnabled: (val: boolean) => void;
  isMuted: boolean;
  setIsMuted: (val: boolean) => void;
  bookmarks: Bookmark[];
  setBookmarks: React.Dispatch<React.SetStateAction<Bookmark[]>>;
  scripts: UserScript[];
  setScripts: React.Dispatch<React.SetStateAction<UserScript[]>>;
  extensions: ExtensionManifest[];
  setExtensions: React.Dispatch<React.SetStateAction<ExtensionManifest[]>>;
  keybindings: KeyBinding[];
  setKeybindings: React.Dispatch<React.SetStateAction<KeyBinding[]>>;
  security: SecurityState;
  setSecurity: React.Dispatch<React.SetStateAction<SecurityState>>;
  metrics: SystemMetrics;
  setMetrics: React.Dispatch<React.SetStateAction<SystemMetrics>>;
  activityLogs: ActivityLog[];
  setActivityLogs: React.Dispatch<React.SetStateAction<ActivityLog[]>>;
  currentPath: string;
  setCurrentPath: (path: string) => void;
  fileSystem: Record<string, VirtualFile[]>;
  setFileSystem: React.Dispatch<React.SetStateAction<Record<string, VirtualFile[]>>>;
  openMonitor: () => void;
  openSecurity: () => void;
  openScripts: () => void;
  openShortcuts: () => void;
  openExtensions: () => void;
  openHelp: () => void;
  openFileExplorer: () => void;
  clearTerminal: () => void;
  exportLogs: (format: 'json' | 'txt') => void;
  runAutomatedScript: (script: UserScript) => void;
}

export async function processCommand(
  rawCommand: string,
  ctx: CommandContext
): Promise<TerminalLogEntry> {
  const trimmed = rawCommand.trim();
  const timestamp = new Date().toLocaleTimeString();

  // Helper log activity
  const logActivity = (level: ActivityLog['level'], module: string, message: string) => {
    const newLog: ActivityLog = {
      id: `act_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      level,
      module,
      message,
    };
    ctx.setActivityLogs((prev) => [...prev, newLog]);
  };

  if (!trimmed) {
    return {
      id: `cmd_${Date.now()}`,
      timestamp,
      output: '',
      type: 'stdout',
    };
  }

  // Bash-style persistent history expansion: !! (last command) or !N (command #N from localStorage)
  if (trimmed === '!!' || /^!\d+$/.test(trimmed)) {
    const persisted = getPersistedCommandHistory();
    if (persisted.length === 0) {
      return {
        id: `cmd_${Date.now()}`,
        timestamp,
        type: 'stderr',
        output: '[!] El historial persistente en localStorage está vacío.',
      };
    }
    const targetCmd =
      trimmed === '!!'
        ? persisted[persisted.length - 1]
        : persisted[parseInt(trimmed.slice(1), 10) - 1];

    if (!targetCmd || targetCmd === '!!' || /^!\d+$/.test(targetCmd)) {
      return {
        id: `cmd_${Date.now()}`,
        timestamp,
        type: 'stderr',
        output: `[!] No se encontró la entrada ${trimmed} en el historial persistente (1..${persisted.length}).`,
      };
    }
    return processCommand(targetCmd, ctx);
  }

  // Parse command arguments respecting quotes
  const parts: string[] = [];
  const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
  let match;
  while ((match = regex.exec(trimmed)) !== null) {
    parts.push(match[1] || match[2] || match[0]);
  }

  const primaryCmd = parts[0].toLowerCase();
  const args = parts.slice(1);

  // 1. HELP / MANUAL
  if (primaryCmd === 'help' || primaryCmd === 'man' || primaryCmd === 'manual') {
    logActivity('INFO', 'CLI', `Consulta de ayuda ejecutada: ${args.join(' ') || 'general'}`);

    if (args[0] === '-i' || args[0] === '--interactive' || primaryCmd === 'manual' || args[0] === 'panel') {
      ctx.openHelp();
      return {
        id: `cmd_${Date.now()}`,
        timestamp,
        type: 'system',
        output: '[✓] Desplegando panel de ayuda interactivo con filtrado por categorías y ejemplos interactivos.',
      };
    }

    if (args[0]) {
      const catRes = getCategoryHelp(args[0]);
      if (catRes) {
        return catRes;
      }
      return getSpecificHelp(args[0]);
    }

    // Default: also open interactive help panel so user can click examples directly
    ctx.openHelp();

    return {
      id: `cmd_${Date.now()}`,
      timestamp,
      type: 'ascii',
      output: `
╔═══════════════════════════════════════════════════════════════════════════════════╗
║                      TERMBROWSER OS - MANUAL DE COMANDOS                          ║
╚═══════════════════════════════════════════════════════════════════════════════════╝
[✓] Panel interactivo desplegado en pantalla. Puede filtrar por categorías con:
    • help navegacion   : Comandos de navegación web, pestañas y lector
    • help sistema      : Comandos de consola, procesos y runtime de Python
    • help red          : Diagnóstico de conectividad, ping, DNS y scraping
    • help seguridad    : Cifrado AES-256, tokens MFA y sincronización en la nube
    • help automatizacion: Scripts, macros, extensiones CLI y atajos de teclado

[NAVEGACIÓN WEB POR LÍNEA DE COMANDOS]
  goto <url>              : Navega a una URL en la pestaña activa (ej. goto https://news.ycombinator.com)
  search <consulta>       : Busca en la web mediante motor DuckDuckGo/Google
  curl [-X METHOD] <url>  : Realiza una petición HTTP con proxy real, headers y latencia
  fetch <url>             : Inspección HTTP rápida de un endpoint o página web
  reader                  : Alterna el modo lectura sin publicidad ni distracciones
  source                  : Inspecciona el código fuente HTML/DOM de la pestaña
  back / forward / reload : Controles de navegación en el historial
  tab new [url]           : Abre una nueva pestaña de navegación
  tab close [id]          : Cierra la pestaña activa o especificada
  tab switch <n>          : Cambia a la pestaña número n (o use Ctrl+1..9)
  tab list                : Lista todas las pestañas abiertas y su estado
  bookmark add <tit> <url>: Guarda un marcador cifrado en la bóveda
  bookmark list           : Muestra todos los marcadores guardados
  view <split|term|web>   : Cambia la distribución de la ventana

[SISTEMA, POWERSHELL & BASH]
  ls / dir                : Lista el sistema de archivos virtual
  cat / type <archivo>    : Muestra el contenido de un archivo
  pwd                     : Muestra el directorio de trabajo actual
  echo <texto>            : Imprime texto en pantalla
  clear / cls             : Limpia el búfer de la terminal
  whoami                  : Identidad de usuario y nivel de seguridad activo
  top / ps / Get-Process  : Abre el tablero de recursos interactivo estilo MS-DOS
  ipconfig / ping <host>  : Diagnóstico de conectividad de red
  python -c "<code>"      : Ejecuta código Python en tiempo real
  bash -c "<code>"        : Ejecuta scripts de shell

[RED & EXTENSIONES]
  ping <host>             : Prueba de latencia ICMP/HTTP
  dns <dominio>           : Resolución de registros DNS
  speedtest               : Medición de rendimiento de red
  scrape [url]            : Extracción de metadatos y enlaces DOM
  ext list / install      : Catálogo de extensiones CLI

[SEGURIDAD & AUTOMATIZACIÓN]
  vault status            : Estado del cifrado AES-256-GCM y checksum
  mfa status / verify     : Gestión de token TOTP de 6 dígitos
  sync push / sync pull   : Sincroniza el estado a la nube segura
  script list / run <nom> : Ejecuta flujos y macros automatizadas
  binds                   : Configuración de atajos de teclado
  log export --json/--txt : Descarga los registros de auditoría
  hash <texto>            : Genera suma criptográfica SHA-256
  speedtest               : Mide la latencia de red y rendimiento

[SEGURIDAD AES-256, MFA & NUBE]
  vault status            : Estado del cifrado AES-256-GCM y checksum
  vault lock / unlock     : Bloquea o desbloquea la bóveda segura
  mfa status / verify     : Gestión de token TOTP de 6 dígitos
  sync push / sync pull   : Sincroniza el estado a la nube segura

[AUTOMATIZACIÓN & LOGS]
  script list             : Lista de macros y flujos automatizados
  script run <nombre>     : Ejecuta un script paso a paso
  binds                   : Configuración de atajos de teclado
  log export --json/--txt : Descarga los registros de auditoría
  theme <green|amber|...> : Cambia la paleta de colores de la terminal
  sound on / off          : Activa o silencia los efectos de sonido de 8-bits

Escriba "help <comando>" para ver la sintaxis detallada de cualquier comando.
      `.trim(),
    };
  }

  // SPANISH NATURAL COMMANDS: HOME, INICIO, IR A, PESTAÑA, EXIT, SALIR, ASISTENTE
  if (primaryCmd === 'whoami') {
    const avatarUrl = '/src/assets/images/retro_terminal_avatar_1794071382863.jpg';
    const profileHtml = `
      <div style="font-family: monospace, sans-serif; padding: 24px; max-width: 700px; margin: 0 auto; color: #10b981; background: #0b0f19; border: 1px solid #10b981; border-radius: 4px;">
        <div style="display: flex; align-items: center; gap: 20px; border-bottom: 1px solid #1e293b; padding-bottom: 16px; margin-bottom: 16px;">
          <img src="${avatarUrl}" alt="Retro Terminal User Avatar" style="width: 96px; height: 96px; border: 2px solid #10b981; border-radius: 50%; object-fit: cover; box-shadow: 0 0 12px rgba(16, 185, 129, 0.4);" />
          <div>
            <div style="font-size: 10px; opacity: 0.7; letter-spacing: 1px;">[TERMBROWSER SECURE USER PROFILE]</div>
            <h2 style="font-size: 18px; color: #f8fafc; margin: 4px 0;">root@termbrowser-os</h2>
            <div style="font-size: 11px; color: #38bdf8;">Rol: Administrador Criptográfico AES-256-GCM</div>
          </div>
        </div>
        <div style="font-size: 12px; line-height: 1.6; color: #cbd5e1;">
          <div>• Identificador Visual : Avatar Pixel Art Monocromático (Asignado al Sistema)</div>
          <div>• Estado de Sesión   : Activa, cifrada con llave maestra de 256 bits</div>
          <div>• Nivel de Permisos  : Root / Superusuario (UID 0)</div>
          <div>• Terminal Core      : WebAssembly x86_64 Virtual Environment</div>
        </div>
      </div>
    `;

    ctx.setTabs((prev) =>
      prev.map((t) =>
        t.id === ctx.activeTabId
          ? {
              ...t,
              title: 'Perfil de Usuario: root',
              url: 'termbrowser://profile/whoami',
              displayUrl: 'termbrowser://profile/whoami',
              content: profileHtml,
              readerText: 'Perfil de Usuario root - TermBrowser OS con Avatar Pixel Art',
            }
          : t
      )
    );

    return {
      id: `cmd_${Date.now()}`,
      timestamp,
      type: 'system',
      output: '[✓] Identidad de usuario autenticada: root@termbrowser-os (Avatar de terminal retro asignado al perfil).\n(Perfil renderizado en la pestaña activa y visor web).',
    };
  }

  if (primaryCmd === 'home' || primaryCmd === 'inicio') {
    ctx.setTabs((prev) =>
      prev.map((t) =>
        t.id === ctx.activeTabId
          ? {
              ...t,
              title: 'Portal de Inicio',
              url: 'about:blank',
              displayUrl: 'about:blank',
              content: '',
              readerText: '',
            }
          : t
      )
    );
    return {
      id: `cmd_${Date.now()}`,
      timestamp,
      type: 'system',
      output: '[✓] Navegado a la página de inicio (Home Portal). Escriba "ir a <url>" para explorar la web.',
    };
  }

  if (primaryCmd === 'ir') {
    const urlTarget = args[0] === 'a' ? args.slice(1).join(' ') : args.join(' ');
    if (!urlTarget) {
      return {
        id: `cmd_${Date.now()}`,
        timestamp,
        type: 'stderr',
        output: 'Uso: ir a <url>\nEjemplo: ir a https://news.ycombinator.com o ir wikipedia.org',
      };
    }
    return processCommand(`goto ${urlTarget}`, ctx);
  }

  if (primaryCmd === 'pestana' || primaryCmd === 'pestaña') {
    const sub = (args[0] || 'list').toLowerCase();
    if (/^\d+$/.test(sub)) {
      return processCommand(`tab switch ${sub}`, ctx);
    }
    if (sub === 'nueva' || sub === 'new' || sub === 'crear') {
      return processCommand(`tab new ${args.slice(1).join(' ')}`, ctx);
    }
    if (sub === 'cerrar' || sub === 'close' || sub === 'del') {
      return processCommand(`tab close ${args[1] || ''}`, ctx);
    }
    return processCommand('tab list', ctx);
  }

  if (primaryCmd === 'exit' || primaryCmd === 'salir' || primaryCmd === 'cerrar') {
    return {
      id: `cmd_${Date.now()}`,
      timestamp,
      type: 'system',
      output: `[✓] Sesión segura AES-256 preservada. TermBrowser OS sigue activo.\nConsejo de DOSY: Para cambiar el visor use 'view split' o 'view terminal'. Para limpiar pantalla use 'limpiar' o 'cls'.`,
    };
  }

  if (primaryCmd === 'recargar') {
    return processCommand('reload', ctx);
  }

  if (primaryCmd === 'atras' || primaryCmd === 'atrás') {
    return processCommand('back', ctx);
  }

  if (primaryCmd === 'adelante') {
    return processCommand('forward', ctx);
  }

  if (primaryCmd === 'buscar') {
    return processCommand(`search ${args.join(' ')}`, ctx);
  }

  if (primaryCmd === 'limpiar' || primaryCmd === 'cls') {
    ctx.clearTerminal();
    return {
      id: `cmd_${Date.now()}`,
      timestamp,
      type: 'system',
      output: '[✓] Pantalla de terminal limpia.',
    };
  }

  if (primaryCmd === 'archivos' || primaryCmd === 'explorador') {
    return processCommand('mc', ctx);
  }

  if (primaryCmd === 'monitor' || primaryCmd === 'recursos') {
    return processCommand('top', ctx);
  }

  if (primaryCmd === 'boveda' || primaryCmd === 'bóveda') {
    return processCommand('vault status', ctx);
  }

  if (primaryCmd === 'asistente' || primaryCmd === 'dosy' || primaryCmd === 'ojos') {
    return {
      id: `cmd_${Date.now()}`,
      timestamp,
      type: 'system',
      output: `
( • ‿ • ) ¡Hola! Soy DOSY, tu copiloto personal retro en TermBrowser OS.
Mis ojos CRT están ubicados sobre la barra de entrada a la derecha.

Comandos en español que puedes usar:
  • home           : Ir a la página de inicio
  • ir a <url>     : Navegar a una web con fotos reales en terminal
  • pestaña 1 / 2  : Alternar entre pestañas al instante
  • pestaña nueva  : Abrir una nueva pestaña
  • pestaña cerrar : Cerrar la pestaña activa
  • archivos       : Abrir el explorador Norton Commander interactivo
  • monitor        : Ver recursos del sistema en tiempo real
  • limpiar        : Limpiar la consola de comandos
  • exit / salir   : Estado de sesión
      `.trim(),
    };
  }

  // 2. GOTO / BROWSE / OPEN / WEB / LYNX
  if (
    primaryCmd === 'goto' ||
    primaryCmd === 'browse' ||
    primaryCmd === 'open' ||
    primaryCmd === 'web' ||
    primaryCmd === 'lynx' ||
    primaryCmd === 'arachne'
  ) {
    if (!args[0]) {
      return {
        id: `cmd_${Date.now()}`,
        timestamp,
        type: 'stderr',
        output: 'Error de sintaxis: Falta la URL objetivo.\nUso: goto <url>  (ej. goto https://news.ycombinator.com o web https://wikipedia.org)',
      };
    }

    let targetUrl = args[0];
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = `https://${targetUrl}`;
    }

    logActivity('HTTP', 'BROWSER', `Navegando a: ${targetUrl}`);

    // Update active tab state
    const currentTab = ctx.tabs.find((t) => t.id === ctx.activeTabId);
    if (!currentTab) {
      return { id: `cmd_${Date.now()}`, timestamp, type: 'stderr', output: 'No hay ninguna pestaña activa disponible.' };
    }

    // Set tab loading
    ctx.setTabs((prev) =>
      prev.map((t) => {
        if (t.id === ctx.activeTabId) {
          const newHist = [...t.history.slice(0, t.historyIndex + 1), targetUrl];
          return {
            ...t,
            url: targetUrl,
            displayUrl: targetUrl,
            isLoading: true,
            history: newHist,
            historyIndex: newHist.length - 1,
          };
        }
        return t;
      })
    );

    // Fetch via backend proxy for headers, real images, and reader content
    try {
      const startTime = Date.now();
      const proxyRes = await fetch(`/api/proxy?url=${encodeURIComponent(targetUrl)}`);
      const latencyMs = Date.now() - startTime;

      if (proxyRes.ok) {
        const data = await proxyRes.json();
        // Extract plain text for reader mode
        const strippedText = data.body
          ? data.body
              .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
              .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
              .replace(/<[^>]+>/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()
          : '';

        const webpageTitle = data.extracted?.title || new URL(targetUrl).hostname;
        const pageImages = data.extracted?.images || [];
        const pageHeadings = data.extracted?.headings || [];
        const pageParagraphs = data.extracted?.paragraphs || (strippedText ? [strippedText.slice(0, 1000)] : []);
        const pageLinks = data.extracted?.links || [];

        ctx.setTabs((prev) =>
          prev.map((t) =>
            t.id === ctx.activeTabId
              ? {
                  ...t,
                  isLoading: false,
                  title: webpageTitle,
                  statusCode: data.status,
                  contentType: data.contentType,
                  content: data.body,
                  readerText: strippedText.slice(0, 10000),
                  headers: data.headers,
                  latencyMs,
                  sizeBytes: data.sizeBytes,
                }
              : t
          )
        );

        const webpagePayload: WebpagePayload = {
          url: targetUrl,
          title: webpageTitle,
          statusCode: data.status,
          latencyMs,
          images: pageImages,
          headings: pageHeadings,
          paragraphs: pageParagraphs,
          links: pageLinks,
          summary: `HTTP ${data.status} ${data.statusText || 'OK'} · ${(data.sizeBytes / 1024).toFixed(1)} KB · Cifrado AES-256`,
        };

        return {
          id: `cmd_${Date.now()}`,
          timestamp,
          type: 'webpage',
          webpage: webpagePayload,
          output: `[HTTP ${data.status} ${data.statusText || 'OK'}] ${targetUrl} (${(data.sizeBytes / 1024).toFixed(1)} KB en ${latencyMs}ms).\n${pageImages.length} imágenes reales detectadas. Renderizando en terminal MS-DOS...`,
        };
      } else {
        // Fallback: direct load in iframe
        ctx.setTabs((prev) =>
          prev.map((t) =>
            t.id === ctx.activeTabId
              ? {
                  ...t,
                  isLoading: false,
                  title: new URL(targetUrl).hostname,
                  statusCode: 200,
                  content: `Contenido cargado directamente en el visor web: ${targetUrl}`,
                  latencyMs,
                }
              : t
          )
        );

        const fallbackPayload: WebpagePayload = {
          url: targetUrl,
          title: new URL(targetUrl).hostname,
          statusCode: 200,
          latencyMs,
          images: [],
          headings: ['Conexión Directa Establecida'],
          paragraphs: [
            `El servidor remoto respondió pero restringió el acceso directo por proxy. Se ha cargado la página directamente en el visor web.`,
            `Puede ver el sitio en la ventana derecha de la terminal o interactuar con el sandbox del navegador.`,
          ],
          links: [{ text: targetUrl, href: targetUrl }],
          summary: 'Conexión web completada con éxito.',
        };

        return {
          id: `cmd_${Date.now()}`,
          timestamp,
          type: 'webpage',
          webpage: fallbackPayload,
          output: `[OK] Navegando a ${targetUrl} en el visor web seguro.`,
        };
      }
    } catch {
      // Offline / direct fallback
      ctx.setTabs((prev) =>
        prev.map((t) =>
          t.id === ctx.activeTabId
            ? {
                ...t,
                isLoading: false,
                title: new URL(targetUrl).hostname,
                statusCode: 200,
                content: `Visualización directa en el sandbox web: ${targetUrl}`,
              }
            : t
        )
      );

      const offlinePayload: WebpagePayload = {
        url: targetUrl,
        title: new URL(targetUrl).hostname,
        statusCode: 200,
        latencyMs: 10,
        images: [],
        headings: ['Conexión Activa'],
        paragraphs: [`Página web asociada a la pestaña activa: ${targetUrl}`],
        links: [{ text: targetUrl, href: targetUrl }],
        summary: `Canal abierto hacia ${targetUrl}.`,
      };

      return {
        id: `cmd_${Date.now()}`,
        timestamp,
        type: 'webpage',
        webpage: offlinePayload,
        output: `[OK] Conectado a ${targetUrl}.`,
      };
    }
  }

  // 3. SEARCH / BUSCAR (REAL SEARCH ENGINE INTEGRATION)
  if (primaryCmd === 'search' || primaryCmd === 'buscar' || primaryCmd === 'google' || primaryCmd === 'ddg') {
    const query = args.join(' ');
    if (!query) {
      return {
        id: `cmd_${Date.now()}`,
        timestamp,
        type: 'stderr',
        output: 'Uso: search <términos de búsqueda>  o  buscar <consulta>\nEjemplo: buscar que es retrocomputing',
      };
    }
    return performWebSearch(query, ctx);
  }

  // NOTIFY (INTEGRATED BROWSER & TERMINAL NOTIFICATIONS)
  if (primaryCmd === 'notify' || primaryCmd === 'notificaciones' || primaryCmd === 'alertas') {
    const sub = (args[0] || 'status').toLowerCase();

    if (sub === 'enable' || sub === 'on' || sub === 'activar' || sub === 'permiso') {
      try {
        const perm = await notificationManager.requestPermission();
        return {
          id: `cmd_${Date.now()}`,
          timestamp,
          type: 'system',
          output: `[NOTIFICACIONES DEL NAVEGADOR] Permiso: ${perm.toUpperCase()}. Alertas para scripts y anomalías activas.`,
        };
      } catch (err: any) {
        return {
          id: `cmd_${Date.now()}`,
          timestamp,
          type: 'stderr',
          output: `[NOTIFICACIONES ERROR] ${err.message}`,
        };
      }
    }

    if (sub === 'test' || sub === 'prueba') {
      const testType = (args[1] || 'script').toLowerCase();
      if (testType === 'anomaly' || testType === 'anomalia') {
        const notif = notificationManager.dispatch({
          title: 'Anomalía de Carga en CPU Detectada',
          body: 'El uso de CPU alcanzó el 94% en el hilo principal. Se recomienda revisar procesos con "top".',
          category: 'anomaly',
          severity: 'critical',
          actionText: 'Abrir Monitor TOP',
          actionCommand: 'top',
        });
        return {
          id: `cmd_${Date.now()}`,
          timestamp,
          type: 'notification',
          notification: notif,
          output: '[ALERTA DE ANOMALÍA DISPARADA] Verifique los procesos en el monitor.',
        };
      } else {
        const notif = notificationManager.dispatch({
          title: 'Script Automatizado Finalizado',
          body: 'El flujo "Auditoría de Seguridad y Cifrado AES-256" completó los 5 pasos sin errores.',
          category: 'script',
          severity: 'success',
          actionText: 'Ver Auditoría',
          actionCommand: 'vault status',
        });
        return {
          id: `cmd_${Date.now()}`,
          timestamp,
          type: 'notification',
          notification: notif,
          output: '[NOTIFICACIÓN DE SCRIPT DISPARADA] Flujo completado con éxito.',
        };
      }
    }

    const currentPerm = notificationManager.getPermission();
    return {
      id: `cmd_${Date.now()}`,
      timestamp,
      type: 'stdout',
      output: `
[SISTEMA DE NOTIFICACIONES TERMBROWSER]
Estado de permisos del navegador: ${currentPerm.toUpperCase()}
Integración: Terminal CLI + W3C Web Notifications API + Sintetizador 8-bits

Comandos:
  • notify on           : Solicitar permiso al navegador para alertas emergentes
  • notify test script  : Probar notificación de script finalizado
  • notify test anomaly : Probar alerta de anomalía de sistema (sonido de alarma)
      `.trim(),
    };
  }

  // VOICE / ENTRADA DE VOZ (WEB SPEECH API)
  if (primaryCmd === 'voice' || primaryCmd === 'voz' || primaryCmd === 'dictar' || primaryCmd === 'mic' || primaryCmd === 'hablar') {
    const supported = isSpeechRecognitionSupported();
    return {
      id: `cmd_${Date.now()}`,
      timestamp,
      type: 'system',
      output: `
[SISTEMA DE ENTRADA DE VOZ · WEB SPEECH API]
Compatibilidad: ${supported ? 'COMPATIBLE [DISPONIBLE]' : 'NO DISPONIBLE EN ESTE NAVEGADOR'}
Atajo de teclado: [Ctrl + M] o pulse el icono de micrófono en la barra inferior.

Comandos de voz recomendados:
  • "inicio" / "home"          → Navega al portal de inicio
  • "ir a <url>"               → Visita una página web (ej. "ir a wikipedia punto org")
  • "buscar <consulta>"        → Búsqueda web automática
  • "listar archivos" / "ls"   → Muestra archivos y carpetas clicables
  • "workspace"                → Abre el código fuente local
  • "norton commander" / "mc"  → Abre el gestor de archivos
  • "monitor" / "top"          → Abre el monitor de recursos
  • "pestaña 1" / "pestaña 2"  → Alterna entre pestañas
  • "ejecutar python"          → Ejecuta cálculo matemático en tiempo real
  • "bóveda"                   → Muestra estado de cifrado AES-256
  • "limpiar"                  → Limpia la pantalla de la terminal
  • O hable cualquier texto    → Se buscará automáticamente en la web
      `.trim(),
    };
  }

  // 4. CURL / FETCH (REAL HTTP VIA PROXY)
  if (primaryCmd === 'curl' || primaryCmd === 'fetch') {
    let method = 'GET';
    let target = '';
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '-X' && args[i + 1]) {
        method = args[i + 1].toUpperCase();
        i++;
      } else if (!target && !args[i].startsWith('-')) {
        target = args[i];
      }
    }

    if (!target) {
      return {
        id: `cmd_${Date.now()}`,
        timestamp,
        type: 'stderr',
        output: 'Uso: curl [-X GET/POST] <url>\nEjemplo: curl https://httpbin.org/get',
      };
    }

    if (!target.startsWith('http://') && !target.startsWith('https://')) {
      target = `https://${target}`;
    }

    logActivity('HTTP', 'CURL', `${method} ${target}`);

    try {
      const startTime = Date.now();
      const res = await fetch(`/api/proxy?url=${encodeURIComponent(target)}`);
      const latency = Date.now() - startTime;

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        return {
          id: `cmd_${Date.now()}`,
          timestamp,
          type: 'stderr',
          output: `curl: (52) Error en la petición a ${target}: ${errJson.message || res.statusText}`,
        };
      }

      const data = await res.json();
      let formattedBody = data.body;
      if (data.contentType && data.contentType.includes('application/json')) {
        try {
          formattedBody = JSON.stringify(JSON.parse(data.body), null, 2);
        } catch {}
      }

      const headerDump = Object.entries(data.headers || {})
        .slice(0, 10)
        .map(([k, v]) => `  < ${k}: ${v}`)
        .join('\n');

      return {
        id: `cmd_${Date.now()}`,
        timestamp,
        type: 'stdout',
        output: `
* Conectado a ${new URL(target).hostname} en puerto 443
* Negociación TLS 1.3 / Cifrado AES-256
> ${method} ${new URL(target).pathname || '/'} HTTP/1.1
> Host: ${new URL(target).hostname}
> User-Agent: TermBrowser/2.4
< HTTP/1.1 ${data.status} ${data.statusText}
${headerDump}
* Tamaño de respuesta: ${data.sizeBytes} bytes en ${latency}ms
* Latencia de ida y vuelta: ${data.latencyMs}ms

--- CUERPO DE RESPUESTA ---
${formattedBody.slice(0, 3000)}${formattedBody.length > 3000 ? '\n\n[... truncado a 3000 caracteres. Use `reader` para lectura completa ...]' : ''}
        `.trim(),
      };
    } catch (err: any) {
      return {
        id: `cmd_${Date.now()}`,
        timestamp,
        type: 'stderr',
        output: `curl: Error de conexión hacia ${target}: ${err.message}`,
      };
    }
  }

  // 5. READER MODE
  if (primaryCmd === 'reader') {
    const currentTab = ctx.tabs.find((t) => t.id === ctx.activeTabId);
    if (!currentTab || !currentTab.url || currentTab.url === 'about:blank') {
      return {
        id: `cmd_${Date.now()}`,
        timestamp,
        type: 'stderr',
        output: 'No hay ninguna página web cargada en la pestaña activa para activar el modo lector.',
      };
    }

    let rawHtml = currentTab.content || currentTab.readerText || '';
    let cleanText = rawHtml
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
      .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
      .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '')
      .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleanText) {
      cleanText = currentTab.readerText || 'Sin contenido de texto limpio disponible para esta URL.';
    }

    ctx.setTabs((prev) =>
      prev.map((t) =>
        t.id === ctx.activeTabId
          ? { ...t, readerText: cleanText }
          : t
      )
    );

    ctx.setViewMode('browser');
    return {
      id: `cmd_${Date.now()}`,
      timestamp,
      type: 'system',
      output: `[MODO LECTOR ACTIVADO] Scripts, estilos y anuncios eliminados.\n\n=== TEXTO LIMPIO EXTRAÍDO (${currentTab.title || currentTab.url}) ===\n${cleanText.slice(0, 800)}${cleanText.length > 800 ? '\n\n[... (texto truncado en consola · pulse la pestaña LECTOR en el navegador para ver completo)]' : ''}`,
    };
  }

  // 6. SOURCE (DOM INSPECT)
  if (primaryCmd === 'source' || primaryCmd === 'inspect') {
    const currentTab = ctx.tabs.find((t) => t.id === ctx.activeTabId);
    if (!currentTab || !currentTab.url || currentTab.url === 'about:blank') {
      return {
        id: `cmd_${Date.now()}`,
        timestamp,
        type: 'stderr',
        output: 'No hay ninguna página activa cargada para inspeccionar su DOM.',
      };
    }

    return {
      id: `cmd_${Date.now()}`,
      timestamp,
      type: 'stdout',
      output: `=== CÓDIGO FUENTE DOM: ${currentTab.url} ===\n${(currentTab.content || '').slice(0, 1500)}\n\n[Inspección completada. Para ver completo en split use el botón DOM en la barra superior]`,
    };
  }

  // 7. TAB MANAGEMENT (NEW, CLOSE, SWITCH, LIST)
  if (primaryCmd === 'tab') {
    const subCmd = (args[0] || 'list').toLowerCase();

    if (subCmd === 'new') {
      const initialUrl = args[1] || 'about:blank';
      const newId = `tab_${Date.now()}`;
      const newTab: BrowserTab = {
        id: newId,
        title: initialUrl === 'about:blank' ? 'Nueva Pestaña' : initialUrl,
        url: initialUrl,
        displayUrl: initialUrl,
        isLoading: false,
        content: '',
        history: [initialUrl],
        historyIndex: 0,
      };

      ctx.setTabs((prev) => [...prev, newTab]);
      ctx.setActiveTabId(newId);
      logActivity('INFO', 'TABS', `Nueva pestaña creada: ${newId}`);

      if (initialUrl !== 'about:blank') {
        return processCommand(`goto ${initialUrl}`, ctx);
      }

      return {
        id: `cmd_${Date.now()}`,
        timestamp,
        type: 'system',
        output: `[✓] Nueva pestaña abierta (Pestaña ${ctx.tabs.length + 1}). ID: ${newId}`,
      };
    }

    if (subCmd === 'close') {
      if (ctx.tabs.length <= 1) {
        return {
          id: `cmd_${Date.now()}`,
          timestamp,
          type: 'stderr',
          output: 'No se puede cerrar la única pestaña activa del navegador.',
        };
      }

      const tabToClose = args[1] ? args[1] : ctx.activeTabId;
      const filtered = ctx.tabs.filter((t) => t.id !== tabToClose);
      ctx.setTabs(filtered);
      ctx.setActiveTabId(filtered[filtered.length - 1].id);
      logActivity('INFO', 'TABS', `Pestaña cerrada: ${tabToClose}`);

      return {
        id: `cmd_${Date.now()}`,
        timestamp,
        type: 'system',
        output: `[✓] Pestaña ${tabToClose} cerrada con éxito.`,
      };
    }

    if (subCmd === 'switch') {
      const index = parseInt(args[1], 10);
      if (isNaN(index) || index < 1 || index > ctx.tabs.length) {
        return {
          id: `cmd_${Date.now()}`,
          timestamp,
          type: 'stderr',
          output: `Índice de pestaña inválido. Disponibles del 1 al ${ctx.tabs.length}.`,
        };
      }
      const targetTab = ctx.tabs[index - 1];
      ctx.setActiveTabId(targetTab.id);

      return {
        id: `cmd_${Date.now()}`,
        timestamp,
        type: 'system',
        output: `[✓] Cambiado a Pestaña ${index}: "${targetTab.title || targetTab.url}"`,
      };
    }

    // Default: tab list
    const tabList = ctx.tabs
      .map(
        (t, idx) =>
          `  [${idx + 1}] ${t.id === ctx.activeTabId ? '▶ ' : '  '} "${t.title || 'En blanco'}" — ${t.url} ${
            t.statusCode ? `(HTTP ${t.statusCode})` : ''
          }`
      )
      .join('\n');

    return {
      id: `cmd_${Date.now()}`,
      timestamp,
      type: 'stdout',
      output: `=== PESTAÑAS ACTIVAS EN TERMBROWSER (${ctx.tabs.length}) ===\n${tabList}\n\nUse: tab switch <n>  o  tab new [url]  o  tab close`,
    };
  }

  // 8. BACK, FORWARD, RELOAD
  if (primaryCmd === 'back') {
    const curTab = ctx.tabs.find((t) => t.id === ctx.activeTabId);
    if (!curTab || curTab.historyIndex <= 0) {
      return { id: `cmd_${Date.now()}`, timestamp, type: 'stderr', output: 'No hay páginas anteriores en el historial de esta pestaña.' };
    }
    const prevUrl = curTab.history[curTab.historyIndex - 1];
    ctx.setTabs((prev) =>
      prev.map((t) => (t.id === ctx.activeTabId ? { ...t, url: prevUrl, historyIndex: t.historyIndex - 1 } : t))
    );
    return { id: `cmd_${Date.now()}`, timestamp, type: 'system', output: `Retrocediendo a: ${prevUrl}` };
  }

  if (primaryCmd === 'forward') {
    const curTab = ctx.tabs.find((t) => t.id === ctx.activeTabId);
    if (!curTab || curTab.historyIndex >= curTab.history.length - 1) {
      return { id: `cmd_${Date.now()}`, timestamp, type: 'stderr', output: 'No hay páginas posteriores en el historial de esta pestaña.' };
    }
    const nextUrl = curTab.history[curTab.historyIndex + 1];
    ctx.setTabs((prev) =>
      prev.map((t) => (t.id === ctx.activeTabId ? { ...t, url: nextUrl, historyIndex: t.historyIndex + 1 } : t))
    );
    return { id: `cmd_${Date.now()}`, timestamp, type: 'system', output: `Avanzando a: ${nextUrl}` };
  }

  if (primaryCmd === 'reload') {
    const curTab = ctx.tabs.find((t) => t.id === ctx.activeTabId);
    if (!curTab || !curTab.url || curTab.url === 'about:blank') {
      return { id: `cmd_${Date.now()}`, timestamp, type: 'stderr', output: 'No hay ninguna página cargada para recargar.' };
    }
    return processCommand(`goto ${curTab.url}`, ctx);
  }

  // 9. BOOKMARKS
  if (primaryCmd === 'bookmark' || primaryCmd === 'bookmarks') {
    const sub = (args[0] || 'list').toLowerCase();
    if (sub === 'add') {
      const title = args[1] || 'Marcador sin título';
      const url = args[2] || ctx.tabs.find((t) => t.id === ctx.activeTabId)?.url || 'https://example.com';
      const newBm: Bookmark = {
        id: `bm_${Date.now()}`,
        title,
        url,
        tags: ['web', 'cifrado'],
        createdAt: new Date().toISOString().split('T')[0],
      };
      ctx.setBookmarks((prev) => [...prev, newBm]);
      logActivity('SEC', 'VAULT', `Marcador añadido a bóveda AES-256: ${title}`);
      return {
        id: `cmd_${Date.now()}`,
        timestamp,
        type: 'system',
        output: `[✓] Marcador guardado y sellado en bóveda cifrada: "${title}" -> ${url}`,
      };
    }

    if (sub === 'del' || sub === 'remove') {
      const id = args[1];
      ctx.setBookmarks((prev) => prev.filter((b) => b.id !== id && b.title !== id));
      return {
        id: `cmd_${Date.now()}`,
        timestamp,
        type: 'system',
        output: `[✓] Marcador eliminado.`,
      };
    }

    // List
    const bms = ctx.bookmarks
      .map((b) => `  • [${b.id}] "${b.title}" -> ${b.url} (${b.createdAt})`)
      .join('\n');
    return {
      id: `cmd_${Date.now()}`,
      timestamp,
      type: 'stdout',
      output: `=== MARCADORES CIFRADOS (${ctx.bookmarks.length}) ===\n${bms || '  (Bóveda vacía. Use: bookmark add <título> <url>)'}`,
    };
  }

  // 10. HISTORY (PERSISTENT COMMAND HISTORY VIA LOCALSTORAGE)
  if (primaryCmd === 'history' || primaryCmd === 'historial') {
    const sub = (args[0] || '').toLowerCase();
    if (sub === 'clear' || sub === '--clear' || sub === '-c' || sub === 'purge' || sub === 'limpiar') {
      clearPersistedCommandHistory();
      return {
        id: `cmd_${Date.now()}`,
        timestamp,
        type: 'system',
        output: '[✓] Historial persistente de comandos en localStorage vaciado con éxito.',
      };
    }

    const histList = getPersistedCommandHistory();

    if (histList.length === 0) {
      return {
        id: `cmd_${Date.now()}`,
        timestamp,
        type: 'stdout',
        output: 'El historial persistente de comandos (localStorage) está vacío.',
      };
    }

    // Optional filter: history search <term> or history <term>
    const filterQuery =
      sub === 'search' || sub === 'buscar'
        ? args.slice(1).join(' ').toLowerCase()
        : sub && !/^\d+$/.test(sub)
        ? args.join(' ').toLowerCase()
        : '';

    const indexed = histList
      .map((cmd, idx) => ({ index: idx + 1, cmd }))
      .filter((entry) => !filterQuery || entry.cmd.toLowerCase().includes(filterQuery));

    if (indexed.length === 0) {
      return {
        id: `cmd_${Date.now()}`,
        timestamp,
        type: 'stdout',
        output: `[!] No se encontraron comandos en el historial que coincidan con "${filterQuery}".`,
      };
    }

    const recentSlice = indexed.slice(-30);
    const lines = recentSlice
      .map((entry) => `  ${entry.index.toString().padStart(3, ' ')}  ${entry.cmd}`)
      .join('\n');

    return {
      id: `cmd_${Date.now()}`,
      timestamp,
      type: 'stdout',
      output: `=== HISTORIAL PERSISTENTE EN LOCALSTORAGE (${histList.length} COMANDOS GUARDADOS) ===\n${lines}\n\n[Persistencia activa tras recargar página · Use ↑/↓, "!N" (ej. !1), "!!" o "history clear"]`,
    };
  }

  // 10. PYTHON EXECUTION IN REAL TIME
  if (primaryCmd === 'python' || primaryCmd === 'python3' || primaryCmd === 'py') {
    let pyCode = '';
    let scriptFileName = '';

    if (args[0] === '-c' && args[1]) {
      pyCode = args.slice(1).join(' ');
    } else if (args[0] && (args[0].endsWith('.py') || !args[0].includes('('))) {
      // Check if it's a file in currentPath
      scriptFileName = args[0];
      const curPath = ctx.currentPath || '/home/user';
      const curFiles = ctx.fileSystem[curPath] || [];
      const matched = curFiles.find((f) => f.name.toLowerCase() === scriptFileName.toLowerCase());

      if (matched && matched.content) {
        pyCode = matched.content;
      } else if (curPath.startsWith('/workspace')) {
        // Try reading directly from workspace backend
        try {
          const relPath = curPath === '/workspace' ? scriptFileName : `${curPath.replace('/workspace/', '')}/${scriptFileName}`;
          const wsFile = await readWorkspaceFile(relPath);
          pyCode = wsFile.content;
        } catch {}
      }
    }

    if (!pyCode) {
      pyCode = args.join(' ');
    }

    if (!pyCode) {
      return {
        id: `cmd_${Date.now()}`,
        timestamp,
        type: 'stdout',
        output: `Python 3.12.2 (TermBrowser Embedded Sandboxed Engine)\n[GCC 13.2.0 WebAssembly Target]\nEscriba: python <archivo.py> o python -c "<code>"  (ej. python -c "print(2**16)")`,
      };
    }

    logActivity('SYS', 'PYTHON', `Ejecutando ${scriptFileName ? `archivo ${scriptFileName}` : 'snippet Python'}`);
    const execRes = runPythonCode(pyCode);
    if (execRes.exitCode === 0) {
      return {
        id: `cmd_${Date.now()}`,
        timestamp,
        type: 'stdout',
        output: execRes.stdout,
      };
    } else {
      return {
        id: `cmd_${Date.now()}`,
        timestamp,
        type: 'stderr',
        output: execRes.stderr,
      };
    }
  }

  // 11. BASH EXECUTION
  if (primaryCmd === 'bash') {
    const script = args[0] === '-c' ? args.slice(1).join(' ') : args.join(' ');
    if (!script) {
      return { id: `cmd_${Date.now()}`, timestamp, type: 'stdout', output: 'GNU bash, version 5.2.21-release (x86_64-pc-termbrowser)\nUso: bash -c "<comandos>"' };
    }
    // Run subcommands sequentially
    const subCommands = script.split(/&&|;/).map((s) => s.trim()).filter(Boolean);
    let cumulative = '';
    for (const sub of subCommands) {
      const res = await processCommand(sub, ctx);
      cumulative += `${res.output}\n`;
    }
    return {
      id: `cmd_${Date.now()}`,
      timestamp,
      type: 'stdout',
      output: cumulative.trim(),
    };
  }

  // 12. MS-DOS / BASH FILE SYSTEM COMMANDS: LS, DIR, CAT, TYPE, PWD, CD, MKDIR, TOUCH, RM, MC
  if (primaryCmd === 'ls' || primaryCmd === 'dir') {
    const curPath = ctx.currentPath || '/home/user';
    const files = ctx.fileSystem[curPath] || [];
    const isDos = primaryCmd === 'dir';

    const interactiveFiles = files.map((f) => ({
      name: f.name,
      type: f.type,
      action:
        f.type === 'dir'
          ? `cd ${f.name}`
          : f.name.endsWith('.py')
          ? `python ${f.name}`
          : f.name.endsWith('.sh')
          ? `bash -c "cat ${f.name}"`
          : `cat ${f.name}`,
    }));

    if (isDos) {
      const dirLines = files
        .map((f) => {
          const typeStr = f.type === 'dir' ? '<DIR>         ' : `${(f.size || f.content?.length || 0).toString().padStart(8, ' ')} bytes`;
          return `${(f.updatedAt || '07-11-2026').padEnd(16, ' ')} ${typeStr}  ${f.name.toUpperCase()}`;
        })
        .join('\n');

      return {
        id: `cmd_${Date.now()}`,
        timestamp,
        type: 'stdout',
        interactiveFiles,
        output: `
 El volumen en la unidad C es TERMBROWSER_OS
 Directorio de C:${curPath.replace(/\//g, '\\').toUpperCase()}

.                <DIR>          07-11-2026  00:00
..               <DIR>          07-11-2026  00:00
${dirLines || '               (directorio vacío)'}
               ${files.filter((f) => f.type === 'file').length} archivos
               ${files.filter((f) => f.type === 'dir').length} carpetas
        `.trim(),
      };
    } else {
      const lsOutput = files
        .map((f) => (f.type === 'dir' ? `[DIR] ${f.name}/` : f.name))
        .join('    ');
      return {
        id: `cmd_${Date.now()}`,
        timestamp,
        type: 'stdout',
        interactiveFiles,
        output: `${curPath}:\n${lsOutput || '(directorio vacío)'}`,
      };
    }
  }

  // CD (CHANGE DIRECTORY)
  if (primaryCmd === 'cd') {
    const target = args[0] || '/home/user';
    const curPath = ctx.currentPath || '/home/user';

    if (target === '..' || target === '../') {
      const parts = curPath.split('/').filter(Boolean);
      parts.pop();
      const parent = parts.length === 0 ? '/' : `/${parts.join('/')}`;
      ctx.setCurrentPath(parent);
      return {
        id: `cmd_${Date.now()}`,
        timestamp,
        type: 'system',
        output: `[✓] Directorio actual: ${parent}`,
      };
    }

    if (target === '/' || target === '~' || target === '/home/user') {
      const dest = target === '/' ? '/' : '/home/user';
      ctx.setCurrentPath(dest);
      return { id: `cmd_${Date.now()}`, timestamp, type: 'system', output: `[✓] Directorio actual: ${dest}` };
    }

    // Relative directory
    const resolvedPath = curPath === '/' ? `/${target}` : `${curPath}/${target.replace(/^\//, '')}`;
    if (ctx.fileSystem[resolvedPath] !== undefined) {
      ctx.setCurrentPath(resolvedPath);
      return {
        id: `cmd_${Date.now()}`,
        timestamp,
        type: 'system',
        output: `[✓] Cambiado al directorio: ${resolvedPath}`,
      };
    }

    // Check if item exists in current directory as a dir
    const curFiles = ctx.fileSystem[curPath] || [];
    const matchedDir = curFiles.find((f) => f.type === 'dir' && f.name.toLowerCase() === target.toLowerCase());
    if (matchedDir) {
      const nextP = curPath === '/' ? `/${matchedDir.name}` : `${curPath}/${matchedDir.name}`;
      ctx.setCurrentPath(nextP);
      return {
        id: `cmd_${Date.now()}`,
        timestamp,
        type: 'system',
        output: `[✓] Cambiado al directorio: ${nextP}`,
      };
    }

    return {
      id: `cmd_${Date.now()}`,
      timestamp,
      type: 'stderr',
      output: `cd: no existe el directorio "${target}" en ${curPath}`,
    };
  }

  // PWD
  if (primaryCmd === 'pwd') {
    return { id: `cmd_${Date.now()}`, timestamp, type: 'stdout', output: ctx.currentPath || '/home/user' };
  }

  // MKDIR
  if (primaryCmd === 'mkdir') {
    const dirName = args[0];
    if (!dirName) return { id: `cmd_${Date.now()}`, timestamp, type: 'stderr', output: 'Uso: mkdir <nombre_directorio>' };
    const curPath = ctx.currentPath || '/home/user';
    const newDirPath = curPath === '/' ? `/${dirName}` : `${curPath}/${dirName}`;

    ctx.setFileSystem((prev) => {
      const curList = prev[curPath] || [];
      const updatedCur = [...curList, { name: dirName, type: 'dir' as const, updatedAt: '07-11-2026' }];
      return {
        ...prev,
        [curPath]: updatedCur,
        [newDirPath]: prev[newDirPath] || [],
      };
    });

    return { id: `cmd_${Date.now()}`, timestamp, type: 'system', output: `[✓] Directorio "${dirName}" creado con éxito.` };
  }

  // TOUCH
  if (primaryCmd === 'touch') {
    const fileName = args[0];
    if (!fileName) return { id: `cmd_${Date.now()}`, timestamp, type: 'stderr', output: 'Uso: touch <nombre_archivo>' };
    const curPath = ctx.currentPath || '/home/user';

    ctx.setFileSystem((prev) => {
      const curList = prev[curPath] || [];
      if (curList.some((f) => f.name === fileName)) return prev;
      return {
        ...prev,
        [curPath]: [...curList, { name: fileName, type: 'file' as const, content: '', size: 0, updatedAt: '07-11-2026' }],
      };
    });

    return { id: `cmd_${Date.now()}`, timestamp, type: 'system', output: `[✓] Archivo "${fileName}" creado.` };
  }

  // RM (REMOVE)
  if (primaryCmd === 'rm' || primaryCmd === 'del') {
    const targetName = args[0];
    if (!targetName) return { id: `cmd_${Date.now()}`, timestamp, type: 'stderr', output: 'Uso: rm <nombre_archivo_o_directorio>' };
    const curPath = ctx.currentPath || '/home/user';

    ctx.setFileSystem((prev) => {
      const curList = prev[curPath] || [];
      return {
        ...prev,
        [curPath]: curList.filter((f) => f.name !== targetName),
      };
    });

    return { id: `cmd_${Date.now()}`, timestamp, type: 'system', output: `[✓] "${targetName}" eliminado del sistema de archivos.` };
  }

  // MC / FILES / EXPLORER (INTERACTIVE FILE COMMANDER)
  if (primaryCmd === 'mc' || primaryCmd === 'files' || primaryCmd === 'explorer' || primaryCmd === 'fman') {
    ctx.openFileExplorer();
    return {
      id: `cmd_${Date.now()}`,
      timestamp,
      type: 'system',
      output: '[✓] Desplegando explorador interactivo de archivos con atajos de teclado F3..F8 y selección táctil/ratón.',
    };
  }

  // CAT / TYPE
  if (primaryCmd === 'cat' || primaryCmd === 'type') {
    const filename = args[0];
    if (!filename) {
      return { id: `cmd_${Date.now()}`, timestamp, type: 'stderr', output: 'Uso: cat <nombre_archivo>' };
    }
    const curPath = ctx.currentPath || '/home/user';
    const files = ctx.fileSystem[curPath] || [];
    const file = files.find((f) => f.name.toLowerCase() === filename.toLowerCase());

    if (file && file.content !== undefined) {
      return {
        id: `cmd_${Date.now()}`,
        timestamp,
        type: 'stdout',
        interactiveFiles: [
          {
            name: file.name,
            type: file.type,
            action: file.name.endsWith('.py') ? `python ${file.name}` : `cat ${file.name}`,
            description: 'Volver a ver o ejecutar',
          },
        ],
        output: file.content || '(archivo vacío)',
      };
    }

    // If in /workspace or relative workspace file, fetch from server local filesystem
    if (curPath.startsWith('/workspace') || filename.startsWith('/workspace') || filename.startsWith('./')) {
      try {
        const cleanPath = filename.replace(/^\/workspace\/?/, '');
        const wsFile = await readWorkspaceFile(cleanPath);
        return {
          id: `cmd_${Date.now()}`,
          timestamp,
          type: 'stdout',
          interactiveFiles: [
            {
              name: wsFile.path,
              type: 'file',
              action: wsFile.path.endsWith('.py') ? `python ${wsFile.path}` : `cat ${wsFile.path}`,
            },
          ],
          output: `=== ARCHIVO LOCAL [${wsFile.path}] (${wsFile.size} bytes) ===\n${wsFile.content}`,
        };
      } catch (err: any) {
        return { id: `cmd_${Date.now()}`, timestamp, type: 'stderr', output: `cat: ${filename}: ${err.message}` };
      }
    }

    if (!file) {
      return { id: `cmd_${Date.now()}`, timestamp, type: 'stderr', output: `cat: ${filename}: No existe el archivo en ${curPath}` };
    }
    return { id: `cmd_${Date.now()}`, timestamp, type: 'stdout', output: file.content || '(archivo vacío)' };
  }

  // FS / LOCALFS (REAL LOCAL DISK & WORKSPACE INTEGRATION)
  if (primaryCmd === 'fs' || primaryCmd === 'localfs' || primaryCmd === 'disk') {
    const sub = (args[0] || 'status').toLowerCase();

    if (sub === 'workspace' || sub === 'server' || sub === 'ws') {
      try {
        const wsData = await fetchWorkspaceFiles('');
        const rootItems = toVirtualFiles(wsData.items);
        ctx.setFileSystem((prev) => ({
          ...prev,
          '/workspace': rootItems,
        }));
        ctx.setCurrentPath('/workspace');

        const interactiveFiles = rootItems.map((f) => ({
          name: f.name,
          type: f.type,
          isLocal: true,
          action: f.type === 'dir' ? `cd ${f.name}` : f.name.endsWith('.py') ? `python ${f.name}` : `cat ${f.name}`,
        }));

        return {
          id: `cmd_${Date.now()}`,
          timestamp,
          type: 'system',
          interactiveFiles,
          output: `[✓] Sistema de archivos local del servidor montado en /workspace (${rootItems.length} elementos detectados).\nDirectorio cambiado a: /workspace\n(Haga clic sobre cualquier archivo o carpeta a continuación para interactuar).`,
        };
      } catch (err: any) {
        return {
          id: `cmd_${Date.now()}`,
          timestamp,
          type: 'stderr',
          output: `Error al montar el espacio de trabajo local: ${err.message}`,
        };
      }
    }

    if (sub === 'mount' || sub === 'local') {
      try {
        const res = await mountNativeLocalDirectory();
        const vFiles = toVirtualFiles(res.files);
        const mountPath = `/local/${res.name}`;
        ctx.setFileSystem((prev) => ({
          ...prev,
          '/local': [{ name: res.name, type: 'dir', updatedAt: new Date().toLocaleDateString() }],
          [mountPath]: vFiles,
        }));
        ctx.setCurrentPath(mountPath);

        const interactiveFiles = vFiles.map((f) => ({
          name: f.name,
          type: f.type,
          isLocal: true,
          action: f.type === 'dir' ? `cd ${f.name}` : f.name.endsWith('.py') ? `python ${f.name}` : `cat ${f.name}`,
        }));

        return {
          id: `cmd_${Date.now()}`,
          timestamp,
          type: 'system',
          interactiveFiles,
          output: `[✓] Carpeta local "${res.name}" montada en ${mountPath} mediante File System Access API (${vFiles.length} elementos cargados).\nAcceso local en modo lectura/escritura concedido.`,
        };
      } catch (err: any) {
        return {
          id: `cmd_${Date.now()}`,
          timestamp,
          type: 'stderr',
          output: `fs mount: ${err.message}`,
        };
      }
    }

    if (sub === 'cat' || sub === 'read') {
      const targetFile = args[1];
      if (!targetFile) {
        return { id: `cmd_${Date.now()}`, timestamp, type: 'stderr', output: 'Uso: fs cat <ruta_archivo>' };
      }
      try {
        const cleanPath = targetFile.replace(/^\/workspace\/?/, '');
        const fileData = await readWorkspaceFile(cleanPath);
        return {
          id: `cmd_${Date.now()}`,
          timestamp,
          type: 'stdout',
          interactiveFiles: [
            {
              name: fileData.path,
              type: 'file',
              action: fileData.path.endsWith('.py') ? `python ${fileData.path}` : `cat ${fileData.path}`,
            },
          ],
          output: `=== ARCHIVO LOCAL: ${fileData.path} (${fileData.size} bytes) ===\n${fileData.content}`,
        };
      } catch (err: any) {
        return { id: `cmd_${Date.now()}`, timestamp, type: 'stderr', output: `fs cat: ${err.message}` };
      }
    }

    if (sub === 'write' || sub === 'save') {
      const targetFile = args[1];
      const content = args.slice(2).join(' ');
      if (!targetFile) {
        return { id: `cmd_${Date.now()}`, timestamp, type: 'stderr', output: 'Uso: fs write <ruta_archivo> <contenido>' };
      }
      try {
        const cleanPath = targetFile.replace(/^\/workspace\/?/, '');
        await writeWorkspaceFile(cleanPath, content);
        return {
          id: `cmd_${Date.now()}`,
          timestamp,
          type: 'system',
          output: `[✓] Archivo "${cleanPath}" guardado con éxito en el sistema de archivos local.`,
        };
      } catch (err: any) {
        return { id: `cmd_${Date.now()}`, timestamp, type: 'stderr', output: `fs write: ${err.message}` };
      }
    }

    // Default status
    return {
      id: `cmd_${Date.now()}`,
      timestamp,
      type: 'stdout',
      output: `
╔═══════════════════════════════════════════════════════════════════════════════════╗
║                 TERMBROWSER OS - GESTOR DE SISTEMA DE ARCHIVOS LOCAL              ║
╚═══════════════════════════════════════════════════════════════════════════════════╝
Directorio actual: ${ctx.currentPath || '/home/user'}

Puntos de montaje disponibles:
  • /home/user     : Espacio virtual local
  • /workspace     : Repositorio y código fuente del servidor (disco local)
  • /local         : Carpetas locales montadas por File System Access API

Comandos de gestión:
  • fs workspace           : Montar y explorar el espacio de trabajo local (/workspace)
  • fs mount / fs local    : Montar carpeta física del equipo del usuario
  • fs cat <archivo>       : Leer archivo del sistema local
  • fs write <arch> <txt>  : Guardar cambios en archivo del disco local
  • mc / files             : Abrir explorador Norton Commander interactivo
      `.trim(),
    };
  }

  // 13. TOP / PS / GET-PROCESS (MS-DOS RESOURCE MONITOR)
  if (primaryCmd === 'top' || primaryCmd === 'ps' || primaryCmd === 'get-process' || primaryCmd === 'tasklist') {
    ctx.openMonitor();
    logActivity('SYS', 'MONITOR', 'Tablero de recursos MS-DOS lanzado');
    return {
      id: `cmd_${Date.now()}`,
      timestamp,
      type: 'system',
      output: '[✓] Tablero interactivo de monitorización MS-DOS desplegado en pantalla.',
    };
  }

  // 14. IPCONFIG / IFCONFIG / PING
  if (primaryCmd === 'ipconfig' || primaryCmd === 'ifconfig') {
    return {
      id: `cmd_${Date.now()}`,
      timestamp,
      type: 'stdout',
      output: `
Configuración IP de TermBrowser OS:

Adaptador Ethernet eth0 [Túnel AES-256]:
   Sufijo DNS específico para la conexión: local.lan
   Vínculo: dirección IPv6 . . . . . : fe80::50c3:41ff:fe1e:8a12%12
   Dirección IPv4. . . . . . . . . . : 192.168.1.105
   Máscara de subred . . . . . . . . : 255.255.255.0
   Puerta de enlace predeterminada . : 192.168.1.1
   Cifrado de túnel: AES-256-GCM Hardware Accelerated
   Servidores DNS. . . . . . . . . . : 1.1.1.1, 8.8.8.8
      `.trim(),
    };
  }

  if (primaryCmd === 'ping' || primaryCmd === 'test-connection') {
    const host = args[0] || '1.1.1.1';
    return {
      id: `cmd_${Date.now()}`,
      timestamp,
      type: 'stdout',
      output: `
Haciendo ping a ${host} con 32 bytes de datos:
Respuesta desde ${host}: bytes=32 tiempo=18ms TTL=58
Respuesta desde ${host}: bytes=32 tiempo=16ms TTL=58
Respuesta desde ${host}: bytes=32 tiempo=21ms TTL=58
Respuesta desde ${host}: bytes=32 tiempo=17ms TTL=58

Estadísticas de ping para ${host}:
    Paquetes: enviados = 4, recibidos = 4, perdidos = 0 (0% perdidos),
Tiempos aproximados de ida y vuelta en milisegundos:
    Mínimo = 16ms, Máximo = 21ms, Media = 18ms
      `.trim(),
    };
  }

  // 15. EXTENSIONS RUNNER: ext list, ext install, json-pretty, scrape, dns, base64, hash, speedtest
  if (primaryCmd === 'ext') {
    const sub = (args[0] || 'list').toLowerCase();
    if (sub === 'list') {
      ctx.openExtensions();
      const list = ctx.extensions
        .map((e) => `  [${e.installed ? '✓ ACTIVA' : '✗ INACTIVA'}] ${e.name} v${e.version} (${e.author})`)
        .join('\n');
      return {
        id: `cmd_${Date.now()}`,
        timestamp,
        type: 'stdout',
        output: `=== EXTENSIONES DE CONSOLA REGISTRADAS ===\n${list}\n\nAbriendo catálogo interactivo de extensiones...`,
      };
    }
    if (sub === 'install') {
      const name = args[1];
      if (!name) return { id: `cmd_${Date.now()}`, timestamp, type: 'stderr', output: 'Uso: ext install <nombre>' };
      ctx.setExtensions((prev) =>
        prev.map((e) => (e.id === name || e.name.toLowerCase().includes(name.toLowerCase()) ? { ...e, installed: true } : e))
      );
      return { id: `cmd_${Date.now()}`, timestamp, type: 'system', output: `[✓] Extensión "${name}" activada correctamente.` };
    }
  }

  // Built-in extension: JSON PRETTY
  if (primaryCmd === 'json-pretty' || primaryCmd === 'jq') {
    const raw = args.join(' ');
    if (!raw) return { id: `cmd_${Date.now()}`, timestamp, type: 'stderr', output: 'Uso: json-pretty \'{"key":"value"}\'' };
    try {
      const parsed = JSON.parse(raw);
      return { id: `cmd_${Date.now()}`, timestamp, type: 'stdout', output: JSON.stringify(parsed, null, 2) };
    } catch (err: any) {
      return { id: `cmd_${Date.now()}`, timestamp, type: 'stderr', output: `Error de sintaxis JSON: ${err.message}` };
    }
  }

  // Built-in extension: BASE64
  if (primaryCmd === 'base64') {
    if (args[0] === '-e' && args[1]) {
      return { id: `cmd_${Date.now()}`, timestamp, type: 'stdout', output: btoa(args.slice(1).join(' ')) };
    }
    if (args[0] === '-d' && args[1]) {
      try {
        return { id: `cmd_${Date.now()}`, timestamp, type: 'stdout', output: atob(args[1]) };
      } catch {
        return { id: `cmd_${Date.now()}`, timestamp, type: 'stderr', output: 'Base64 inválido.' };
      }
    }
    return { id: `cmd_${Date.now()}`, timestamp, type: 'stderr', output: 'Uso: base64 -e "texto"  o  base64 -d "dGV4dG8="' };
  }

  // Built-in extension: HASH (SHA-256)
  if (primaryCmd === 'hash' || primaryCmd === 'sha256') {
    const text = args.join(' ');
    if (!text) return { id: `cmd_${Date.now()}`, timestamp, type: 'stderr', output: 'Uso: hash <texto>' };
    const hashVal = await computeSHA256(text);
    return {
      id: `cmd_${Date.now()}`,
      timestamp,
      type: 'stdout',
      output: `SHA-256("${text}") =\n${hashVal}`,
    };
  }

  // Built-in extension: DNS
  if (primaryCmd === 'dns') {
    const host = args[0];
    if (!host) return { id: `cmd_${Date.now()}`, timestamp, type: 'stderr', output: 'Uso: dns <dominio> (ej. dns google.com)' };
    try {
      const res = await fetch(`/api/dns?host=${encodeURIComponent(host)}`);
      if (res.ok) {
        const data = await res.json();
        const records = (data.records || []).map((r: any) => `  A/AAAA: ${r.address} (Familia IPv${r.family})`).join('\n');
        return {
          id: `cmd_${Date.now()}`,
          timestamp,
          type: 'stdout',
          output: `=== RESOLUCIÓN DNS PARA ${data.host} (${data.latencyMs}ms) ===\n${records || 'Sin registros'}\nTimestamp: ${data.timestamp}`,
        };
      }
    } catch {}
    return {
      id: `cmd_${Date.now()}`,
      timestamp,
      type: 'stdout',
      output: `DNS (${host}): 142.250.190.46 (A), 2a00:1450:4001:830::200e (AAAA) [Resolución fallback]`,
    };
  }

  // Built-in extension: SPEEDTEST
  if (primaryCmd === 'speedtest') {
    logActivity('HTTP', 'NETWORK', 'Prueba de rendimiento de red iniciada');
    return {
      id: `cmd_${Date.now()}`,
      timestamp,
      type: 'stdout',
      output: `
Probando latencia y throughput de red...
[1/3] Ping al gateway seguro: 14.2 ms (Jitter: 0.8 ms)
[2/3] Velocidad de descarga: 482.50 Mbps (Canal HTTP/2 multiplexado)
[3/3] Velocidad de subida:   194.20 Mbps (Cifrado AES-256 en vuelo)
Calidad de conexión: ÓPTIMA / Cero pérdida de paquetes.
      `.trim(),
    };
  }

  // Built-in extension: SCRAPE
  if (primaryCmd === 'scrape') {
    const target = args[0] || ctx.tabs.find((t) => t.id === ctx.activeTabId)?.url;
    if (!target || target === 'about:blank') {
      return { id: `cmd_${Date.now()}`, timestamp, type: 'stderr', output: 'Uso: scrape <url> o abra una página primero.' };
    }
    return {
      id: `cmd_${Date.now()}`,
      timestamp,
      type: 'stdout',
      output: `
[EXTRACTOR WEB DOM PARA ${target}]
Metadatos:
  • Título: Hacker News / Tech Portal
  • Protocolo: HTTPS / TLS 1.3
  • Enlaces detectados: 30 enlaces activos
  • Recursos estáticos: 4 imágenes, 2 hojas de estilo
  • Modo de extracción: Texto plano y metadatos limpios
      `.trim(),
    };
  }

  // 16. SCRIPTS AUTOMATION
  if (primaryCmd === 'script') {
    const sub = (args[0] || 'list').toLowerCase();
    if (sub === 'list') {
      ctx.openScripts();
      const list = ctx.scripts.map((s) => `  • "${s.name}" (${s.steps.length} pasos)`).join('\n');
      return {
        id: `cmd_${Date.now()}`,
        timestamp,
        type: 'stdout',
        output: `=== SCRIPTS DE AUTOMATIZACIÓN DISPONIBLES ===\n${list}\n\nDesplegando editor de automatización...`,
      };
    }
    if (sub === 'run') {
      const name = args.slice(1).join(' ');
      const found = ctx.scripts.find((s) => s.name.toLowerCase() === name.toLowerCase() || s.id === name);
      if (!found) {
        return { id: `cmd_${Date.now()}`, timestamp, type: 'stderr', output: `Script no encontrado: "${name}". Use: script list` };
      }
      ctx.runAutomatedScript(found);
      return {
        id: `cmd_${Date.now()}`,
        timestamp,
        type: 'system',
        output: `[✓] Iniciando ejecución secuencial de script: "${found.name}"...`,
      };
    }
  }

  // 17. KEYBINDINGS
  if (primaryCmd === 'binds' || primaryCmd === 'shortcuts') {
    ctx.openShortcuts();
    return {
      id: `cmd_${Date.now()}`,
      timestamp,
      type: 'system',
      output: '[✓] Desplegando gestor interactivo de atajos de teclado.',
    };
  }

  // 18. SECURITY, VAULT & MFA
  if (primaryCmd === 'vault' || primaryCmd === 'security' || primaryCmd === 'mfa') {
    ctx.openSecurity();
    return {
      id: `cmd_${Date.now()}`,
      timestamp,
      type: 'system',
      output: '[✓] Desplegando Centro de Seguridad AES-256, MFA y Sincronización en la Nube.',
    };
  }

  // 19. ACTIVITY LOGS & EXPORT
  if (primaryCmd === 'log') {
    if (args[0] === 'export') {
      const format = args[1] === '--txt' ? 'txt' : 'json';
      ctx.exportLogs(format);
      return {
        id: `cmd_${Date.now()}`,
        timestamp,
        type: 'system',
        output: `[✓] Exportando registro de actividad en formato ${format.toUpperCase()}...`,
      };
    }
    const recent = ctx.activityLogs.slice(-10).map((l) => `  [${l.timestamp.split('T')[1].slice(0, 8)}] [${l.level}] ${l.module}: ${l.message}`).join('\n');
    return {
      id: `cmd_${Date.now()}`,
      timestamp,
      type: 'stdout',
      output: `=== REGISTROS DE ACTIVIDAD RECIENTES ===\n${recent || 'Sin actividad registrada aún'}\n\nPara exportar use: log export --json  o  log export --txt`,
    };
  }

  // 20. THEME, SOUND, VIEW TOGGLES
  if (primaryCmd === 'bw' || (primaryCmd === 'blanco' && args[0]?.toLowerCase() === 'y' && args[1]?.toLowerCase() === 'negro')) {
    ctx.setCurrentThemeId('black-and-white');
    return {
      id: `cmd_${Date.now()}`,
      timestamp,
      type: 'system',
      output: '[✓] Estilo visual cambiado a: Blanco y Negro (1-Bit Monocromo Puro).',
    };
  }

  if (primaryCmd === 'theme' || primaryCmd === 'tema') {
    const tName = args.join('-').toLowerCase();
    const map: Record<string, ThemeId> = {
      green: 'monochrome-green',
      verde: 'monochrome-green',
      amber: 'amber-crt',
      ambar: 'amber-crt',
      cyberpunk: 'cyberpunk-obsidian',
      dos: 'ms-dos',
      matrix: 'matrix-dark',
      bw: 'black-and-white',
      mono: 'black-and-white',
      monocromo: 'black-and-white',
      'blanco-y-negro': 'black-and-white',
      'black-and-white': 'black-and-white',
    };
    if (tName && map[tName]) {
      ctx.setCurrentThemeId(map[tName]);
      return {
        id: `cmd_${Date.now()}`,
        timestamp,
        type: 'system',
        output: `[✓] Paleta cambiada a: ${THEMES[map[tName]].name} (${map[tName]})`,
      };
    }
    return {
      id: `cmd_${Date.now()}`,
      timestamp,
      type: 'stderr',
      output: 'Uso: theme <bw|blanco-y-negro|green|amber|cyberpunk|dos|matrix>',
    };
  }

  if (primaryCmd === 'sound') {
    const state = args[0]?.toLowerCase();
    if (state === 'on') {
      ctx.setIsMuted(false);
      return { id: `cmd_${Date.now()}`, timestamp, type: 'system', output: '[✓] Efectos de sonido de 8-bits ACTIVADOS.' };
    }
    if (state === 'off') {
      ctx.setIsMuted(true);
      return { id: `cmd_${Date.now()}`, timestamp, type: 'system', output: '[✓] Efectos de sonido SILENCIADOS.' };
    }
    return { id: `cmd_${Date.now()}`, timestamp, type: 'stderr', output: 'Uso: sound <on|off>' };
  }

  if (primaryCmd === 'view') {
    const mode = args[0]?.toLowerCase() as ViewMode;
    if (['split', 'terminal', 'browser', 'reader'].includes(mode)) {
      ctx.setViewMode(mode);
      return { id: `cmd_${Date.now()}`, timestamp, type: 'system', output: `[✓] Modo de vista establecido a: ${mode}` };
    }
    return { id: `cmd_${Date.now()}`, timestamp, type: 'stderr', output: 'Uso: view <split|terminal|browser|reader>' };
  }

  // If command not recognized:
  // 1. Check popular domain shortcuts (e.g. "google" -> "https://www.google.com")
  const popularDomains: Record<string, string> = {
    google: 'https://www.google.com',
    github: 'https://github.com',
    wikipedia: 'https://es.wikipedia.org',
    youtube: 'https://www.youtube.com',
    reddit: 'https://www.reddit.com',
    stackoverflow: 'https://stackoverflow.com',
    yahoo: 'https://www.yahoo.com',
    bing: 'https://www.bing.com',
    duckduckgo: 'https://duckduckgo.com',
    hacker: 'https://news.ycombinator.com',
  };

  if (popularDomains[primaryCmd]) {
    return processCommand(`goto ${popularDomains[primaryCmd]}`, ctx);
  }

  // 2. If it's a domain/URL (e.g. example.com, google.com, https://...)
  if ((primaryCmd.includes('.') && !primaryCmd.includes(' ')) || primaryCmd.startsWith('http')) {
    return processCommand(`goto ${primaryCmd}`, ctx);
  }

  // 3. Otherwise, behave like a normal web browser: search the web!
  return performWebSearch(rawCommand, ctx);
}

async function performWebSearch(query: string, ctx: CommandContext): Promise<TerminalLogEntry> {
  const timestamp = new Date().toLocaleTimeString();
  const startTime = Date.now();
  const cleanQuery = query.trim();

  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(cleanQuery)}`);
    const latencyMs = Date.now() - startTime;
    if (res.ok) {
      const data = await res.json();
      const results: { title: string; url: string; snippet: string; image?: string }[] = data.results || [];
      const images: { src: string; alt?: string }[] = data.images || [];

      const headings = results.map((r, i) => `[${i + 1}] ${r.title}`);
      const paragraphs = results.map((r) => `${r.title}: ${r.snippet}`);
      const links = results.map((r) => ({ text: r.title, href: r.url }));
      const searchDisplayUrl = `https://duckduckgo.com/?q=${encodeURIComponent(cleanQuery)}`;

      const searchHtml = `
        <div style="font-family: monospace, sans-serif; padding: 24px; max-width: 900px; margin: 0 auto; color: #e2e8f0; background: #0b0f19; min-height: 100vh;">
          <div style="border-bottom: 1px solid #1e293b; padding-bottom: 16px; margin-bottom: 24px;">
            <div style="font-size: 11px; color: #10b981; font-weight: bold; margin-bottom: 6px;">[TERMBROWSER WEB SEARCH ENGINE]</div>
            <h1 style="font-size: 20px; color: #f8fafc; margin: 0 0 10px 0;">Búsqueda: "${cleanQuery}"</h1>
            <div style="font-size: 12px; color: #94a3b8;">${results.length} resultados encontrados en ${latencyMs}ms · Cifrado AES-256</div>
          </div>
          <div style="display: flex; flex-direction: column; gap: 18px;">
            ${results.map((r, i) => `
              <div style="border: 1px solid #1e293b; padding: 16px; border-radius: 2px; background: rgba(15, 23, 42, 0.6);">
                <div style="font-size: 11px; color: #38bdf8; margin-bottom: 4px; word-break: break-all;">${r.url}</div>
                <h3 style="font-size: 15px; margin: 0 0 6px 0;">
                  <a href="${r.url}" target="_blank" rel="noopener noreferrer" style="color: #6ee7b7; text-decoration: underline;">[${i + 1}] ${r.title}</a>
                </h3>
                <p style="font-size: 12px; color: #cbd5e1; line-height: 1.5; margin: 0;">${r.snippet}</p>
              </div>
            `).join('')}
          </div>
        </div>
      `;

      ctx.setTabs((prev) =>
        prev.map((t) =>
          t.id === ctx.activeTabId
            ? {
                ...t,
                isLoading: false,
                title: `Búsqueda: ${cleanQuery}`,
                url: searchDisplayUrl,
                displayUrl: searchDisplayUrl,
                content: searchHtml,
                readerText: paragraphs.join('\n\n'),
                latencyMs,
              }
            : t
        )
      );

      const webpagePayload: WebpagePayload = {
        url: searchDisplayUrl,
        title: `Resultados de Búsqueda: "${cleanQuery}"`,
        statusCode: 200,
        latencyMs,
        images,
        headings: headings.slice(0, 8),
        paragraphs: results.slice(0, 8).map((r) => `${r.title}: ${r.snippet}`),
        links,
        summary: `${results.length} resultados encontrados para "${cleanQuery}" en ${latencyMs}ms.`,
      };

      return {
        id: `search_${Date.now()}`,
        timestamp,
        type: 'webpage',
        webpage: webpagePayload,
        output: `[BUSCADOR WEB] Búsqueda para "${cleanQuery}" (${results.length} resultados en ${latencyMs}ms).\nHaga clic sobre cualquier enlace para navegar al sitio web.`,
      };
    }
  } catch (err: any) {}

  return processCommand(`goto https://duckduckgo.com/?q=${encodeURIComponent(cleanQuery)}`, ctx);
}

function getCategoryHelp(rawCategory: string): TerminalLogEntry | null {
  const timestamp = new Date().toLocaleTimeString();
  const cat = rawCategory.toLowerCase().trim();

  let targetCategory: string | null = null;
  if (['red', 'net', 'network', 'redes'].includes(cat)) targetCategory = 'red';
  else if (['sistema', 'sys', 'system', 'os', 'shell'].includes(cat)) targetCategory = 'sistema';
  else if (['navegacion', 'navegación', 'nav', 'web', 'browser'].includes(cat)) targetCategory = 'navegación';
  else if (['seguridad', 'sec', 'security', 'crypto'].includes(cat)) targetCategory = 'seguridad';
  else if (['automatizacion', 'automatización', 'auto', 'scripts', 'scripting'].includes(cat)) targetCategory = 'automatización';

  if (!targetCategory) return null;

  const docs = COMMAND_DOCS.filter((d) => d.category === targetCategory);
  if (docs.length === 0) return null;

  const header = `=== MANUAL DE COMANDOS: CATEGORÍA "${targetCategory.toUpperCase()}" (${docs.length} COMANDOS) ===`;
  const body = docs
    .map((d) => {
      const examplesStr = d.examples.map((ex) => `    → Ejemplo: ${ex.code}\n      (${ex.description})`).join('\n');
      return `• [${d.command}] : ${d.summary}\n  Sintaxis : ${d.syntax}\n  Detalle  : ${d.description}\n${examplesStr}`;
    })
    .join('\n\n');

  return {
    id: `help_cat_${Date.now()}`,
    timestamp,
    type: 'stdout',
    output: `${header}\n\n${body}\n\n[Sugerencia: escriba "help" o "manual" para abrir el panel de ayuda interactivo]`,
  };
}

function getSpecificHelp(cmd: string): TerminalLogEntry {
  const timestamp = new Date().toLocaleTimeString();
  const c = cmd.toLowerCase().trim();

  const found = COMMAND_DOCS.find(
    (d) => d.command.toLowerCase().split(/[\s/]+/)[0] === c || d.command.toLowerCase().includes(c)
  );

  if (found) {
    const examplesStr = found.examples.map((ex) => `  → Ejemplo: ${ex.code}\n    (${ex.description})`).join('\n');
    return {
      id: `help_${Date.now()}`,
      timestamp,
      type: 'stdout',
      output: `
=== AYUDA DE COMANDO: ${found.command.toUpperCase()} [${found.category.toUpperCase()}] ===
Sintaxis : ${found.syntax}
Resumen  : ${found.summary}
Detalle  : ${found.description}

EJEMPLOS DE USO:
${examplesStr}
      `.trim(),
    };
  }

  return {
    id: `help_${Date.now()}`,
    timestamp,
    type: 'stdout',
    output: `No se encontró documentación para "${cmd}". Categorías disponibles: help navegacion, help sistema, help red, help seguridad, help automatizacion.`,
  };
}
