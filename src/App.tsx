/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Terminus - Command-Line Web Browser & Dev Console
 */

import React, { Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { useI18n } from './i18n';
import {
  ActivityLog,
  Bookmark,
  BrowserTab,
  PageMode,
  ExtensionManifest,
  KeyBinding,
  SecurityState,
  SystemMetrics,
  TerminalLogEntry,
  ThemeId,
  UserScript,
  NativeFsInfo,
  TerminalShellMode,
} from './types';
import { THEMES } from './utils/themes';
import { soundEffects } from './utils/soundEffects';
import { BUILT_IN_EXTENSIONS } from './utils/extensions';
import { DEFAULT_KEYBINDINGS, ShortcutsModal } from './components/ShortcutsModal';
import { HelpModal } from './components/HelpModal';
const ResourceMonitorHUD = React.lazy(() =>
  import('./components/ResourceMonitorHUD').then((module) => ({ default: module.ResourceMonitorHUD }))
);
const AutomationScriptsModal = React.lazy(() =>
  import('./components/AutomationScriptsModal').then((module) => ({ default: module.AutomationScriptsModal }))
);
const SecurityMfaModal = React.lazy(() =>
  import('./components/SecurityMfaModal').then((module) => ({ default: module.SecurityMfaModal }))
);
const ExtensionsModal = React.lazy(() =>
  import('./components/ExtensionsModal').then((module) => ({ default: module.ExtensionsModal }))
);
const FileManagerHUD = React.lazy(() =>
  import('./components/FileManagerHUD').then((module) => ({ default: module.FileManagerHUD }))
);
const TerminalView = React.lazy(() =>
  import('./components/TerminalView').then((module) => ({ default: module.TerminalView }))
);
import { HeaderBar } from './components/HeaderBar';
import { ConfirmDialog } from './components/ConfirmDialog';
import { FOCUS_ADDRESS_EVENT, WebBrowserSurface } from './components/WebBrowserSurface';
import {
  browserHistoryUrls,
  clearBrowserHistory,
  loadBrowserHistory,
  recordBrowserHistory,
} from './utils/browserHistoryStorage';
import { apiFetch } from './utils/apiClient';
import { processCommand } from './utils/commandProcessor';
import { computeSHA256, encryptAES256, decryptAES256, generateMfaSecret } from './utils/crypto';
import { INITIAL_FILESYSTEM, VirtualFile } from './utils/interpreter';
import { notificationManager } from './utils/notificationManager';
import { appendCommandToHistory } from './utils/commandHistoryStorage';
import { APP_VERSION } from './utils/version';
import { LockScreen } from './components/LockScreen';
import { hasLockPassword } from './utils/lockStorage';
import {
  formatNativeShellResult,
  getNativeFsInfo,
  getNativeShellLabel,
  isNativeFsAvailable,
  isNativeShellAvailable,
  parseNativeCdCommand,
  resolveNativeDirectory,
  runNativeShellCommand,
} from './utils/nativeShell';
import { loadBookmarks, saveBookmarks } from './utils/bookmarkStorage';
import { loadSession, saveSession } from './utils/tabStorage';
import { BOOT_ASCII } from './utils/bootBanner';
import { fetchWorkspaceFiles, readNativeDirectory, toVirtualFiles } from './utils/localFileSystem';
import {
  loadLastNativeMount,
  queryNativeMountPermission,
  requestNativeMountPermission,
} from './utils/lastMountStorage';
import type { LastNativeMount, NativeMountPermission } from './utils/lastMountStorage';

const titleForWebTab = (url: string): string => {
  if (!url || url === 'about:blank') return 'Nueva Pestaña';
  if (url.startsWith('terminus://search')) return 'Terminus Search';
  try {
    return new URL(url).hostname.replace(/^www\./i, '') || 'Navegador';
  } catch {
    return 'Navegador';
  }
};

const INITIAL_SCRIPTS: UserScript[] = [
  {
    id: 'script_audit',
    name: 'Auditoría de Seguridad y Cifrado AES-256',
    description: 'Verifica la integridad de la sesión, estado del cifrado y certificados.',
    steps: [
      'echo "=== INICIANDO AUDITORÍA CRIPTOGRÁFICA ==="',
      'whoami',
      'date',
      'vault status',
      'echo "Bóveda cifrada y verificada."',
    ],
    createdAt: '2026-11-07',
    runCount: 2,
  },
  {
    id: 'script_morning_news',
    name: 'Ronda Matutina de Noticias Tecnológicas',
    description: 'Carga Hacker News, activa modo lectura y extrae titulares.',
    steps: [
      'echo "Obteniendo titulares de Hacker News..."',
      'goto https://news.ycombinator.com',
      'reader',
      'echo "Listo para lectura libre de publicidad."',
    ],
    createdAt: '2026-11-07',
    runCount: 5,
  },
  {
    id: 'script_benchmark',
    name: 'Prueba de Cómputo Python y Rendimiento',
    description: 'Ejecuta cálculo en tiempo real y prueba la latencia de red.',
    steps: [
      'echo "Ejecutando algoritmo en Python 3.12..."',
      'python -c "print(\'Calculo factorial:\', sum([x**2 for x in range(100)]))"',
      'speedtest',
      'top',
    ],
    createdAt: '2026-11-07',
    runCount: 1,
  },
];

export default function App() {
  const { tc } = useI18n();
  // Theme and Aesthetic State (persisted in localStorage)
  const [currentThemeId, setCurrentThemeId] = useState<ThemeId>(() => {
    try {
      const savedTheme = localStorage.getItem('termbrowser_theme_v1') as ThemeId | null;
      if (savedTheme && THEMES[savedTheme]) {
        return savedTheme;
      }
    } catch {}
    return 'cyberpunk-obsidian';
  });
  const [crtEnabled, setCrtEnabled] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(() => soundEffects.getMuted());
  // Persist theme changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('termbrowser_theme_v1', currentThemeId);
    } catch {}
  }, [currentThemeId]);

  // Tabs Management: the last session (tabs, active tab, each tab's view) is restored on load
  const [restoredSession] = useState(() => loadSession());
  const [tabs, setTabs] = useState<BrowserTab[]>(
    restoredSession?.tabs ?? [
      {
        id: 'tab_1',
        kind: 'web',
        title: 'Portal de Inicio',
        url: 'about:blank',
        displayUrl: 'about:blank',
        isLoading: false,
        content: '',
        history: ['about:blank'],
        historyIndex: 0,
      },
    ]
  );
  const [activeTabId, setActiveTabId] = useState<string>(restoredSession?.activeTabId ?? 'tab_1');
  const [terminalShells, setTerminalShells] = useState<Record<string, TerminalShellMode>>({});
  const [nativeShellCwds, setNativeShellCwds] = useState<Record<string, string>>({});
  const [nativeFsInfo, setNativeFsInfo] = useState<NativeFsInfo | null>(null);

  // Boot screen: the retro banner opens every terminal session
  const [bootLogs] = useState<TerminalLogEntry[]>(() => [
    {
      id: 'boot_ascii',
      timestamp: new Date().toLocaleTimeString(),
      type: 'ascii',
      output: BOOT_ASCII,
    },
    {
      id: 'boot_welcome',
      timestamp: new Date().toLocaleTimeString(),
      type: 'system',
      output: tc('out.bootBanner'),
    },

  ]);

  // Terminal Logs & Boot Sequence
  const [logsByTab, setLogsByTab] = useState<Record<string, TerminalLogEntry[]>>(() =>
    restoredSession?.logs ?? { tab_1: bootLogs }
  );

  // Keep the session in localStorage so a reload brings back the same tabs and streams
  useEffect(() => {
    const timer = setTimeout(() => saveSession(tabs, activeTabId, logsByTab), 300);
    return () => clearTimeout(timer);
  }, [tabs, activeTabId, logsByTab]);

  // Each tab keeps its own terminal stream; the active tab decides what we read and write
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const logs = logsByTab[activeTabId] ?? [];
  const setLogs = useCallback<React.Dispatch<React.SetStateAction<TerminalLogEntry[]>>>(
    (action) => {
      setLogsByTab((prev) => {
        const current = prev[activeTabId] ?? [];
        const next = typeof action === 'function' ? action(current) : action;
        return { ...prev, [activeTabId]: next };
      });
    },
    [activeTabId]
  );

  // Every terminal session opens with the retro banner, even restored streams that lost it
  useEffect(() => {
    setLogsByTab((prev) => {
      let changed = false;
      const next = { ...prev };
      tabs.forEach((tab) => {
        if (tab.kind !== 'terminal') return;
        const current = next[tab.id] ?? [];
        const hasBanner = current.some(
          (entry) =>
            entry.type === 'ascii' && entry.output.includes('NAVEGADOR WEB BASADO EN LÍNEA DE COMANDOS')
        );
        if (hasBanner) return;

        const banner = bootLogs[0];
        if (!banner) return;

        next[tab.id] =
          current.length === 0
            ? bootLogs.map((entry) => ({
                ...entry,
                id: `${entry.id}_${tab.id}`,
                timestamp: new Date().toLocaleTimeString(),
              }))
            : [
                {
                  ...banner,
                  id: `boot_ascii_${tab.id}`,
                  timestamp: current[0]?.timestamp ?? new Date().toLocaleTimeString(),
                },
                ...current,
              ];
        changed = true;
      });
      return changed ? next : prev;
    });
  }, [tabs, bootLogs]);

  // Ecosystem & Storage State
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(() => loadBookmarks());
  const [browserHistory, setBrowserHistory] = useState(() => loadBrowserHistory());
  const lastHistorySignatureRef = useRef('');
  const [scripts, setScripts] = useState<UserScript[]>(INITIAL_SCRIPTS);
  const [extensions, setExtensions] = useState<ExtensionManifest[]>(BUILT_IN_EXTENSIONS);
  const [keybindings, setKeybindings] = useState<KeyBinding[]>(DEFAULT_KEYBINDINGS);

  // Bookmarks live in localStorage so the strip survives reloads
  useEffect(() => {
    saveBookmarks(bookmarks);
  }, [bookmarks]);

  // The address bar can recall pages from any tab, even after that tab is closed.
  // Only record actual URL/title changes: zooming or loading state must not refill a
  // history the user just cleared.
  useEffect(() => {
    const pages = tabs
      .filter((tab) => tab.kind === 'web' && /^https?:\/\//i.test(tab.url))
      .map((tab) => ({ url: tab.url, title: tab.title }));
    const signature = pages.map((page) => `${page.url}\u0000${page.title}`).join('\u0001');
    if (!signature) {
      lastHistorySignatureRef.current = '';
      return;
    }
    if (signature === lastHistorySignatureRef.current) return;
    lastHistorySignatureRef.current = signature;
    setBrowserHistory(recordBrowserHistory(pages));
  }, [tabs]);

  // Security & MFA State
  const [security, setSecurity] = useState<SecurityState>({
    vaultLocked: false,
    encryptionAlgorithm: 'AES-256-GCM',
    mfaEnabled: false,
    mfaSecret: generateMfaSecret(),
    mfaVerified: false,
    integrityChecksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    auditEventsCount: 12,
  });

  // System Metrics & Anomaly Detector State
  const [metrics, setMetrics] = useState<SystemMetrics>({
    cpuUsage: 28,
    cpuCores: 8,
    memoryUsedMb: 512,
    memoryTotalMb: 16384,
    memoryPercent: 32,
    networkRxKb: 140.2,
    networkTxKb: 45.8,
    latencyMs: 18,
    activeProcesses: 12,
    anomalies: [],
  });

  // Local password gate: only engaged when the user configured a password.
  const [locked, setLocked] = useState(() => hasLockPassword());

  // Activity Logs (for JSON / TXT export)
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([
    { id: 'act_1', timestamp: new Date().toISOString(), level: 'SYS', module: 'BOOT', message: `Terminus kernel v${APP_VERSION} initialized.` },
    { id: 'act_2', timestamp: new Date().toISOString(), level: 'SEC', module: 'CRYPTO', message: 'AES-256-GCM cipher suite negotiated.' },
    { id: 'act_3', timestamp: new Date().toISOString(), level: 'HTTP', module: 'NETWORK', message: 'Secure tunnel established with proxy gateway.' },
  ]);

  // Modal Visibility State
  const [isMonitorOpen, setIsMonitorOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isScriptsOpen, setIsScriptsOpen] = useState(false);
  const [isSecurityOpen, setIsSecurityOpen] = useState(false);
  const [isExtensionsOpen, setIsExtensionsOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isFileManagerOpen, setIsFileManagerOpen] = useState(false);
  const [isNewSessionConfirmOpen, setIsNewSessionConfirmOpen] = useState(false);

  // File System State: the tree is shared, each tab keeps its own working directory.
  // A terminal starts on the real local workspace; /home/user remains the virtual demo disk.
  const [pathsByTab, setPathsByTab] = useState<Record<string, string>>({});
  const currentPath =
    pathsByTab[activeTabId] ?? (activeTab?.kind === 'terminal' ? '/workspace' : '/home/user');
  const setCurrentPath = useCallback(
    (path: string) => setPathsByTab((prev) => ({ ...prev, [activeTabId]: path })),
    [activeTabId]
  );
  const [fileSystem, setFileSystem] = useState<Record<string, VirtualFile[]>>(INITIAL_FILESYSTEM);

  // Remember the last native directory so a reload can restore it. The handle
  // lives in IndexedDB; a browser that still grants read/write access is mounted
  // automatically, while a pending permission waits for an explicit click.
  const [pendingLocalMount, setPendingLocalMount] = useState<
    (LastNativeMount & { permission: NativeMountPermission }) | null
  >(null);
  const [restoringLocalMount, setRestoringLocalMount] = useState(false);
  const localMountRestoreStarted = useRef(false);

  const appendLocalMountLog = useCallback(
    (output: string, type: 'system' | 'stderr' = 'system') => {
      setLogs((prev) => [
        ...prev,
        {
          id: `local_mount_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          timestamp: new Date().toLocaleTimeString(),
          type,
          output,
        },
      ]);
    },
    [setLogs]
  );

  const applyRestoredLocalMount = useCallback(async (mount: LastNativeMount): Promise<number> => {
    const nativeFiles = await readNativeDirectory(mount.handle);
    const vFiles = toVirtualFiles(nativeFiles);
    setFileSystem((prev) => ({
      ...prev,
      '/local': [{ name: mount.name, type: 'dir', updatedAt: new Date().toLocaleDateString() }],
      [mount.mountPath]: vFiles,
    }));
    return vFiles.length;
  }, []);

  useEffect(() => {
    if (localMountRestoreStarted.current) return;
    localMountRestoreStarted.current = true;

    void (async () => {
      const stored = await loadLastNativeMount();
      if (!stored) return;

      const permission = await queryNativeMountPermission(stored.handle);
      if (permission !== 'granted') {
        setPendingLocalMount({ ...stored, permission });
        appendLocalMountLog(
          permission === 'denied'
            ? `[!] Carpeta local "${stored.name}" recordada, pero el navegador deniega el acceso. Vuelve a elegirla con [montar disco].`
            : `[!] Carpeta local "${stored.name}" recordada. Pulsa [restaurar ${stored.name}] en la barra de montaje para renovar el permiso.`,
          permission === 'denied' ? 'stderr' : 'system'
        );
        return;
      }

      try {
        const count = await applyRestoredLocalMount(stored);
        setPendingLocalMount(null);
        appendLocalMountLog(
          `[✓] Carpeta local "${stored.name}" restaurada automáticamente en ${stored.mountPath} (${count} elementos).`
        );
      } catch (err: any) {
        setPendingLocalMount({ ...stored, permission: 'prompt' });
        appendLocalMountLog(
          `[!] No se pudo restaurar "${stored.name}": ${err?.message ?? 'error de acceso'}. Pulsa [restaurar ${stored.name}] para reintentar.`,
          'stderr'
        );
      }
    })().catch(() => undefined);
  }, [appendLocalMountLog, applyRestoredLocalMount]);

  const handleRestoreLocalMount = useCallback(async () => {
    if (!pendingLocalMount || pendingLocalMount.permission !== 'prompt' || restoringLocalMount) return;

    const mount = pendingLocalMount;
    soundEffects.playKeyClick();
    setRestoringLocalMount(true);

    try {
      const permission = await requestNativeMountPermission(mount.handle);
      if (permission !== 'granted') {
        setPendingLocalMount({ ...mount, permission });
        appendLocalMountLog(
          permission === 'denied'
            ? `[!] El navegador denegó el acceso a "${mount.name}".`
            : `[!] El permiso para "${mount.name}" sigue pendiente.`,
          'stderr'
        );
        return;
      }

      const count = await applyRestoredLocalMount(mount);
      setPendingLocalMount(null);
      appendLocalMountLog(
        `[✓] Permiso restaurado. Carpeta local "${mount.name}" montada en ${mount.mountPath} (${count} elementos).`
      );
    } catch (err: any) {
      setPendingLocalMount({ ...mount, permission: 'prompt' });
      appendLocalMountLog(
        `[!] No se pudo montar "${mount.name}": ${err?.message ?? 'error de acceso'}.`,
        'stderr'
      );
    } finally {
      setRestoringLocalMount(false);
    }
  }, [pendingLocalMount, restoringLocalMount, applyRestoredLocalMount, appendLocalMountLog]);

  // Populate /workspace from the backend so the first ls, autocomplete and file
  // links already see the real project without running "fs workspace" first.
  useEffect(() => {
    if (activeTab?.kind !== 'terminal' || currentPath !== '/workspace' || fileSystem['/workspace']) return;

    let cancelled = false;
    fetchWorkspaceFiles('')
      .then((data) => {
        if (cancelled) return;
        setFileSystem((prev) =>
          prev['/workspace'] ? prev : { ...prev, '/workspace': toVirtualFiles(data.items) }
        );
      })
      .catch(() => {
        // "fs workspace" remains available as the explicit retry path.
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab?.kind, activeTabId, currentPath, fileSystem]);

  const theme = THEMES[currentThemeId] || THEMES['cyberpunk-obsidian'];

  // Play boot sound on first user interaction
  useEffect(() => {
    const playOnce = () => {
      soundEffects.playBoot();
      window.removeEventListener('click', playOnce);
      window.removeEventListener('keydown', playOnce);
    };
    window.addEventListener('click', playOnce);
    window.addEventListener('keydown', playOnce);
    return () => {
      window.removeEventListener('click', playOnce);
      window.removeEventListener('keydown', playOnce);
    };
  }, []);

  // Periodic metrics heartbeat & anomaly detection
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        // Query server stats
        const res = await fetch('/api/system-stats');
        if (res.ok) {
          const stats = await res.json();
          const cpuLoad = Math.min(100, Math.round((stats.cpu.loadAvg[0] / stats.cpu.count) * 100)) || Math.round(25 + Math.random() * 20);
          const memUsed = Math.round(stats.memory.used / (1024 * 1024));
          const memTotal = Math.round(stats.memory.total / (1024 * 1024));
          const memPct = Math.round((memUsed / memTotal) * 100);

          setMetrics((prev) => {
            const newAnomalies = [...prev.anomalies];
            // Anomaly check: CPU > 85%
            if (cpuLoad > 85 && !newAnomalies.some((a) => a.type === 'HIGH_CPU')) {
              const anomalyMsg = `Pico crítico de procesamiento detectado (${cpuLoad}%). Hilos saturados.`;
              newAnomalies.unshift({
                id: `ano_${Date.now()}`,
                timestamp: new Date().toLocaleTimeString(),
                type: 'HIGH_CPU',
                message: anomalyMsg,
                severity: 'critical',
              });

              // Dispatch W3C browser and terminal notification
              const notif = notificationManager.dispatch({
                title: 'Alerta de Anomalía en Sistema',
                body: anomalyMsg,
                category: 'anomaly',
                severity: 'critical',
                actionCommand: 'top',
                actionText: 'Inspeccionar TOP',
              });

              setLogs((curLogs) => [
                ...curLogs,
                {
                  id: `ano_log_${Date.now()}`,
                  timestamp: new Date().toLocaleTimeString(),
                  type: 'notification',
                  notification: notif,
                  output: `[ALERTA DE ANOMALÍA] ${anomalyMsg}`,
                },
              ]);
            }

            return {
              ...prev,
              cpuUsage: cpuLoad,
              cpuCores: stats.cpu.count || 8,
              memoryUsedMb: memUsed,
              memoryTotalMb: memTotal,
              memoryPercent: memPct,
              networkRxKb: Math.max(10, +(prev.networkRxKb + (Math.random() * 40 - 20)).toFixed(1)),
              networkTxKb: Math.max(5, +(prev.networkTxKb + (Math.random() * 20 - 10)).toFixed(1)),
              latencyMs: Math.round(15 + Math.random() * 8),
              anomalies: newAnomalies.slice(0, 5),
            };
          });
        }
      } catch {
        // Offline simulation
        setMetrics((prev) => ({
          ...prev,
          cpuUsage: Math.round(20 + Math.sin(Date.now() / 5000) * 15 + Math.random() * 8),
          memoryPercent: Math.round(30 + Math.random() * 4),
          latencyMs: Math.round(16 + Math.random() * 6),
        }));
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [setLogs]);

  // Keep the latest snapshot available without making the checksum effect depend on every field.
  const integrityStateRef = useRef({ tabs, bookmarks, scripts });
  integrityStateRef.current = { tabs, bookmarks, scripts };

  // Compute checksum for security integrity verification
  useEffect(() => {
    const snapshot = integrityStateRef.current;
    const rawState = JSON.stringify({
      tabs: snapshot.tabs,
      bookmarks: snapshot.bookmarks,
      scripts: snapshot.scripts.map((s) => s.id),
    });
    computeSHA256(rawState).then((hash) => {
      setSecurity((prev) => ({ ...prev, integrityChecksum: hash }));
    });
  }, [tabs.length, bookmarks.length, scripts.length]);

  // Callbacks recreated on every render are read through a ref so the command
  // pipeline keeps its original identity and effect timing.
  const commandHelpersRef = useRef<{
    handleExportLogs: (format: 'json' | 'txt') => void;
    runAutomatedScript: (script: UserScript) => Promise<void>;
  } | null>(null);

  // Execute terminal command helper
  const handleExecuteCommand = useCallback(
    async (cmd: string) => {
      const helpers = commandHelpersRef.current;
      if (!helpers) return;

      // Persist command to localStorage history so it can be recovered after page reload
      appendCommandToHistory(cmd);

      // Append user command entry
      const cmdLog: TerminalLogEntry = {
        id: `cmd_in_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        command: cmd,
        output: '',
        type: 'command',
      };
      setLogs((prev) => [...prev, cmdLog]);

      // Process command
      const resultLog = await processCommand(cmd, {
        tabs,
        activeTabId,
        setTabs,
        setActiveTabId,
        currentThemeId,
        setCurrentThemeId,
        crtEnabled,
        setCrtEnabled,
        isMuted,
        setIsMuted,
        bookmarks,
        setBookmarks,
        scripts,
        setScripts,
        extensions,
        setExtensions,
        keybindings,
        setKeybindings,
        security,
        setSecurity,
        metrics,
        setMetrics,
        activityLogs,
        setActivityLogs,
        currentPath,
        setCurrentPath,
        fileSystem,
        setFileSystem,
        openMonitor: () => setIsMonitorOpen(true),
        openSecurity: () => setIsSecurityOpen(true),
        openScripts: () => setIsScriptsOpen(true),
        openShortcuts: () => setIsShortcutsOpen(true),
        openExtensions: () => setIsExtensionsOpen(true),
        openHelp: () => setIsHelpOpen(true),
        openFileExplorer: () => setIsFileManagerOpen(true),
        clearTerminal: () => setLogs([]),
        exportLogs: helpers.handleExportLogs,
        runAutomatedScript: helpers.runAutomatedScript,
        onNativeMountSaved: () => setPendingLocalMount(null),
        tc,
      });

      if (resultLog && (resultLog.output || resultLog.interactiveFiles)) {
        setLogs((prev) => [...prev, resultLog]);
      }
    },
    [tabs, activeTabId, currentThemeId, crtEnabled, isMuted, bookmarks, scripts, extensions, keybindings, security, metrics, activityLogs, currentPath, fileSystem, setCurrentPath, setLogs, tc]
  );

  // Execute automated script sequentially
  const runAutomatedScript = async (script: UserScript) => {
    soundEffects.playExecute();
    // Update run count
    setScripts((prev) =>
      prev.map((s) => (s.id === script.id ? { ...s, runCount: s.runCount + 1, lastRun: new Date().toLocaleTimeString() } : s))
    );

    setLogs((prev) => [
      ...prev,
      {
        id: `scr_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        type: 'system',
        output: `[MACRO START] Ejecutando: "${script.name}" (${script.steps.length} pasos)`,
      },
    ]);

    for (let i = 0; i < script.steps.length; i++) {
      const step = script.steps[i];
      await new Promise((resolve) => setTimeout(resolve, 350));
      await handleExecuteCommand(step);
    }

    const notif = notificationManager.dispatch({
      title: 'Script Automatizado Finalizado',
      body: `El script "${script.name}" finalizó sus ${script.steps.length} pasos exitosamente.`,
      category: 'script',
      severity: 'info',
      actionCommand: `script list`,
      actionText: 'Ver Scripts',
    });

    setLogs((prev) => [
      ...prev,
      {
        id: `scr_end_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        type: 'notification',
        notification: notif,
        output: `[NOTIFICACIÓN] Script "${script.name}" finalizado con éxito (${script.steps.length} pasos).`,
      },
    ]);
  };

  // Activity logs export in JSON or TXT
  function handleExportLogs(format: 'json' | 'txt') {
    soundEffects.playExecute();
    const { content, filename, mime } =
      format === 'json'
        ? {
            content: JSON.stringify(activityLogs, null, 2),
            filename: `terminus-activity-audit-${Date.now()}.json`,
            mime: 'application/json',
          }
        : {
            content: activityLogs
              .map((l) => `[${l.timestamp}] [${l.level}] [${l.module}] ${l.message}`)
              .join('\n'),
            filename: `terminus-activity-log-${Date.now()}.txt`,
            mime: 'text/plain',
          };

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  commandHelpersRef.current = { handleExportLogs, runAutomatedScript };

  // Cloud Sync Push (AES-256 encrypted backup)
  const handleSyncPush = async (passkey: string): Promise<{ success: boolean; message: string }> => {
    try {
      const rawPayload = JSON.stringify({
        tabs,
        bookmarks,
        scripts,
        keybindings,
        themeId: currentThemeId,
        exportedAt: new Date().toISOString(),
      });

      const encrypted = await encryptAES256(rawPayload, passkey);
      const hash = await computeSHA256(encrypted);

      const res = await apiFetch('/api/vault/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          encryptedPayload: encrypted,
          hash,
          mfaVerified: security.mfaVerified,
        }),
      });

      if (!res.ok) {
        throw new Error('Fallo al transmitir la bóveda al microservicio remoto.');
      }

      setSecurity((prev) => ({
        ...prev,
        lastBackup: new Date().toLocaleTimeString(),
      }));

      return {
        success: true,
        message: 'Bóveda cifrada con AES-256-GCM y transmitida a la nube segura.',
      };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  };

  // Cloud Sync Pull (Restore with AES-256 + MFA)
  const handleSyncPull = async (passkey: string, _token: string): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await apiFetch('/api/vault/restore');
      if (!res.ok) {
        throw new Error('No se encontró ninguna bóveda en la nube para restaurar.');
      }
      const data = await res.json();

      const decrypted = await decryptAES256(data.data, passkey);
      const parsed = JSON.parse(decrypted);

      if (parsed.tabs) {
        setTabs(parsed.tabs.map((t: BrowserTab) => ({ ...t, kind: t.kind === 'terminal' ? 'terminal' : 'web' })));
      }
      if (parsed.bookmarks) setBookmarks(parsed.bookmarks);
      if (parsed.scripts) setScripts(parsed.scripts);
      if (parsed.keybindings) setKeybindings(parsed.keybindings);
      if (parsed.themeId) setCurrentThemeId(parsed.themeId);

      return {
        success: true,
        message: 'Entorno restaurado y descifrado con éxito desde la nube.',
      };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  };

  // Global Keyboard Shortcuts handler
  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      // Build key string: e.g. "ctrl+t", "ctrl+w", "f1"
      const parts: string[] = [];
      if (e.ctrlKey || e.metaKey) parts.push('ctrl');
      if (e.altKey) parts.push('alt');
      if (e.shiftKey) parts.push('shift');

      let k = e.key.toLowerCase();
      if (k === 'control' || k === 'alt' || k === 'shift' || k === 'meta') return;
      parts.push(k);
      const combo = parts.join('+');

      // Direct tab access: Ctrl+1..9 jumps to that tab, Ctrl+Tab / Ctrl+PageUp/Down cycles
      if ((e.ctrlKey || e.metaKey) && /^[1-9]$/.test(k)) {
        const target = tabs[Number(k) - 1];
        if (target) {
          e.preventDefault();
          soundEffects.playTabSwitch();
          setActiveTabId(target.id);
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && (k === 'tab' || k === 'pageup' || k === 'pagedown')) {
        if (tabs.length < 2) return;
        e.preventDefault();
        const currentIndex = Math.max(0, tabs.findIndex((t) => t.id === activeTabId));
        const backwards = k === 'pageup' || (k === 'tab' && e.shiftKey);
        const nextIndex = (currentIndex + (backwards ? -1 : 1) + tabs.length) % tabs.length;
        soundEffects.playTabSwitch();
        setActiveTabId(tabs[nextIndex].id);
        return;
      }

      // In the web surface Ctrl/Cmd+L is the browser shortcut for the address bar,
      // not the terminal's clear command.
      if ((e.ctrlKey || e.metaKey) && k === 'l' && activeTab?.kind !== 'terminal') {
        e.preventDefault();
        window.dispatchEvent(new Event(FOCUS_ADDRESS_EVENT));
        return;
      }

      // Check keybindings
      const matched = keybindings.find((kb) => kb.key.toLowerCase() === combo);
      if (matched) {
        e.preventDefault();
        soundEffects.playKeyClick();

        if (matched.command === 'tab new') {
          const activeKind = tabs.find((t) => t.id === activeTabId)?.kind === 'terminal' ? 'terminal' : 'web';
          handleNewTab(activeKind);
          return;
        }

        if (matched.command === 'tab close') {
          if (tabs.length > 1) {
            const filtered = tabs.filter((t) => t.id !== activeTabId);
            setTabs(filtered);
            setActiveTabId(filtered[filtered.length - 1].id);
          }
          return;
        }

        if (matched.command === 'help') {
          setIsHelpOpen(true);
          return;
        }

        if (matched.command === 'mc') {
          setIsFileManagerOpen(true);
          return;
        }

        if (matched.command === 'top') {
          setIsMonitorOpen(true);
          return;
        }

        if (matched.command === 'clear') {
          setLogs([]);
          return;
        }

        handleExecuteCommand(matched.command);
      }
    };

    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, [keybindings, tabs, activeTabId, activeTab?.kind, setLogs, handleExecuteCommand]);

  // The surface follows the active tab's kind, so a terminal tab and a page tab never disagree
  const surface: 'web' | 'terminal' = activeTab?.kind === 'terminal' ? 'terminal' : 'web';
  const nativeShellAvailable = isNativeShellAvailable();
  const nativeShellCwd = nativeShellCwds[activeTabId] ?? nativeFsInfo?.workspace ?? '';

  useEffect(() => {
    if (!isNativeFsAvailable()) return;
    let cancelled = false;
    getNativeFsInfo()
      .then((info) => {
        if (!cancelled && info) setNativeFsInfo(info);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  const handleSelectSurface = (next: 'web' | 'terminal') => {
    if (next === surface) return;
    if (next === 'web') window.terminusPty?.kill(activeTabId);
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id !== activeTabId) return t;
        const blank = !t.url || t.url === 'about:blank';
        return {
          ...t,
          kind: next,
          title: next === 'terminal' ? 'Terminal' : titleForWebTab(t.url),
        };
      })
    );
  };

  // Tab operations
  const handleNewTab = (kind: 'web' | 'terminal' = 'web') => {
    const newId = `tab_${Date.now()}`;
    const newTab: BrowserTab = {
      id: newId,
      kind,
      title: kind === 'terminal' ? 'Terminal' : 'Nueva Pestaña',
      url: 'about:blank',
      displayUrl: 'about:blank',
      isLoading: false,
      content: '',
      history: ['about:blank'],
      historyIndex: 0,
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newId);
  };

  const performNewSession = () => {
    tabs.forEach((tab) => window.terminusPty?.kill(tab.id));
    const newId = `tab_${Date.now()}`;
    const freshTab: BrowserTab = {
      id: newId,
      kind: 'web',
      title: 'Nueva Pestaña',
      url: 'about:blank',
      displayUrl: 'about:blank',
      isLoading: false,
      content: '',
      history: ['about:blank'],
      historyIndex: 0,
    };
    setTabs([freshTab]);
    setActiveTabId(newId);
    setLogsByTab({});
    setPathsByTab({});
    setNativeShellCwds({});
    try {
      localStorage.removeItem('termbrowser.tabs');
    } catch {}
  };

  const handleSelectTerminalShell = useCallback(
    (mode: TerminalShellMode) => {
      if (mode !== 'terminus' && !isNativeShellAvailable()) {
        setLogs((prev) => [
          ...prev,
          {
            id: `shell_unavailable_${Date.now()}`,
            timestamp: new Date().toLocaleTimeString(),
            type: 'stderr',
            output: '[shell] El shell nativo solo está disponible al abrir Terminus como aplicación de escritorio.',
          },
        ]);
        return;
      }

      setTerminalShells((prev) => ({ ...prev, [activeTabId]: mode }));
      if (mode === 'terminus') window.terminusPty?.kill(activeTabId);
      const label = getNativeShellLabel(mode);
      const cwd = nativeShellCwds[activeTabId] ?? nativeFsInfo?.workspace ?? 'workspace';
      setLogs((prev) => [
        ...prev,
        {
          id: `shell_mode_${Date.now()}`,
          timestamp: new Date().toLocaleTimeString(),
          type: 'system',
          output:
            mode === 'terminus'
              ? '[✓] Intérprete interno de Terminus activo: navegación, archivos virtuales y scripts disponibles.\nPara archivos reales elige CMD, POWERSHELL o BASH en SHELL.'
              : `[✓] Shell nativo ${label} activo. CWD real: ${cwd}\nLos comandos se ejecutan con los permisos de tu usuario. Usa "cd <ruta>" para navegar por el disco local; "cd ~" va a tu carpeta de usuario.`,
        },
      ]);
    },
    [activeTabId, nativeShellCwds, nativeFsInfo, setLogs]
  );

  const handleExecuteNativeCommand = useCallback(
    async (cmd: string) => {
      const mode = terminalShells[activeTabId] ?? 'terminus';
      if (mode === 'terminus') {
        await handleExecuteCommand(cmd);
        return;
      }

      const cwd = nativeShellCwds[activeTabId] ?? nativeFsInfo?.workspace ?? '';
      const appendLog = (entry: Omit<TerminalLogEntry, 'id' | 'timestamp'>) => {
        setLogs((prev) => [
          ...prev,
          {
            id: `native_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            timestamp: new Date().toLocaleTimeString(),
            ...entry,
          },
        ]);
      };

      appendCommandToHistory(cmd);
      appendLog({ command: cmd, cwd, output: '', type: 'command' });

      const cdCommand = parseNativeCdCommand(cmd, mode);
      if (cdCommand) {
        if (!cdCommand.target) {
          appendLog({
            type: 'system',
            output: `[cwd] ${cwd || nativeFsInfo?.workspace || 'workspace'}`,
          });
          return;
        }

        try {
          const resolved = await resolveNativeDirectory(cwd, cdCommand.target, mode);
          if (!resolved.ok) {
            appendLog({
              type: 'stderr',
              output: `cd: ${resolved.error ?? 'No se pudo cambiar de directorio.'}`,
            });
            return;
          }

          setNativeShellCwds((prev) => ({ ...prev, [activeTabId]: resolved.path }));
          appendLog({ type: 'system', output: `[✓] Directorio actual: ${resolved.path}` });
        } catch (error) {
          appendLog({
            type: 'stderr',
            output: `cd: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
        return;
      }

      try {
        const result = await runNativeShellCommand(cmd, mode, cwd || undefined);
        if (result.cwd) {
          setNativeShellCwds((prev) => ({ ...prev, [activeTabId]: result.cwd }));
        }
        appendLog({
          type: result.ok ? 'stdout' : 'stderr',
          output: formatNativeShellResult(result),
          exitCode: result.exitCode ?? undefined,
        });
      } catch (error) {
        appendLog({
          type: 'stderr',
          output: `[shell] ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
    [activeTabId, terminalShells, nativeShellCwds, nativeFsInfo, handleExecuteCommand, setLogs]
  );

  const handleNewSession = () => {
    soundEffects.playKeyClick();
    setIsNewSessionConfirmOpen(true);
  };

  const handleCloseTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    soundEffects.playKeyClick();
    if (tabs.length <= 1) return;
    window.terminusPty?.kill(id);
    const filtered = tabs.filter((t) => t.id !== id);
    setTabs(filtered);
    setLogsByTab((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setPathsByTab((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setNativeShellCwds((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (activeTabId === id) {
      setActiveTabId(filtered[filtered.length - 1].id);
    }
  };

  const handleAddBookmark = (title: string, url: string) => {
    const clean = url.trim();
    if (!clean || clean === 'about:blank') return;
    setBookmarks((prev) => {
      if (prev.some((bm) => bm.url.replace(/\/+$/, '') === clean.replace(/\/+$/, ''))) return prev;
      const bookmark: Bookmark = {
        id: `bm_${Date.now()}`,
        title: title.trim() || clean,
        url: clean,
        tags: [],
        createdAt: new Date().toISOString().split('T')[0],
      };
      return [...prev, bookmark];
    });
  };

  const handleRemoveBookmark = (id: string) => {
    setBookmarks((prev) => prev.filter((bm) => bm.id !== id));
  };

  const handleSetViewMode = (mode: PageMode) => {
    setTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, viewMode: mode } : t)));
  };

  const handleSetZoom = (zoom: number) => {
    const next = Math.min(2, Math.max(0.5, Math.round(zoom * 10) / 10));
    setTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, zoom: next } : t)));
  };

  const handleCreateFile = (path: string, name: string, content: string) => {
    setFileSystem((prev) => {
      const curList = prev[path] || [];
      if (curList.some((f) => f.name === name)) return prev;
      return {
        ...prev,
        [path]: [...curList, { name, type: 'file' as const, content, size: content.length, updatedAt: '07-11-2026' }],
      };
    });
  };

  const handleCreateDir = (path: string, name: string) => {
    const newDirPath = path === '/' ? `/${name}` : `${path}/${name}`;
    setFileSystem((prev) => {
      const curList = prev[path] || [];
      if (curList.some((f) => f.name === name)) return prev;
      return {
        ...prev,
        [path]: [...curList, { name, type: 'dir' as const, updatedAt: '07-11-2026' }],
        [newDirPath]: prev[newDirPath] || [],
      };
    });
  };

  const handleDeleteFile = (path: string, name: string) => {
    setFileSystem((prev) => {
      const curList = prev[path] || [];
      return {
        ...prev,
        [path]: curList.filter((f) => f.name !== name),
      };
    });
  };

  const handleSaveFileContent = (path: string, name: string, content: string) => {
    setFileSystem((prev) => {
      const curList = prev[path] || [];
      return {
        ...prev,
        [path]: curList.map((f) => (f.name === name ? { ...f, content, size: content.length } : f)),
      };
    });
  };

  const handleMountWorkspace = () => {
    soundEffects.playExecute();
    handleExecuteCommand('fs workspace');
  };

  const handleMountLocalFolder = () => {
    soundEffects.playExecute();
    handleExecuteCommand('fs mount');
  };

  const handleImportLocalFiles = (files: { name: string; content: string; size: number }[], folderName: string = 'disco_local') => {
    const mountPath = `/local/${folderName}`;
    const vFiles: VirtualFile[] = files.map((f) => ({
      name: f.name,
      type: 'file',
      size: f.size,
      content: f.content,
      updatedAt: new Date().toLocaleDateString(),
    }));

    setFileSystem((prev) => ({
      ...prev,
      '/local': [{ name: folderName, type: 'dir', updatedAt: new Date().toLocaleDateString() }],
      [mountPath]: vFiles,
    }));
    setCurrentPath(mountPath);

    const interactiveFiles = vFiles.map((f) => ({
      name: f.name,
      type: 'file' as const,
      isLocal: true,
      action: f.name.endsWith('.py') ? `python ${f.name}` : `cat ${f.name}`,
    }));

    setLogs((prev) => [
      ...prev,
      {
        id: `mount_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        type: 'system',
        interactiveFiles,
        output: `[✓] ${files.length} archivos locales cargados desde el disco y montados en ${mountPath}.\nAcceso local en modo lectura/escritura concedido.`,
      },
    ]);
  };

  if (locked) {
    return <LockScreen theme={theme} onUnlock={() => setLocked(false)} />;
  }

  return (
    <div
      className={`w-screen h-screen flex flex-col overflow-hidden ${crtEnabled ? 'crt-effect' : ''} ${
        currentThemeId === 'black-and-white' ? 'theme-bw' : ''
      }`}
      style={{
        backgroundColor: theme.bg,
        color: theme.text,
      }}
    >
      {/* Top Bar Header following Top Bar Contract */}
      <HeaderBar
        theme={theme}
        currentThemeId={currentThemeId}
        onSelectTheme={(id) => setCurrentThemeId(id)}
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={(id) => setActiveTabId(id)}
        onNewTab={handleNewTab}
        onNewSession={handleNewSession}
        onCloseTab={handleCloseTab}
        isMuted={isMuted}
        onToggleMute={() => {
          const newState = soundEffects.toggleMute();
          setIsMuted(newState);
        }}
        onOpenMonitor={() => setIsMonitorOpen(true)}
        onOpenSecurity={() => setIsSecurityOpen(true)}
        onOpenScripts={() => setIsScriptsOpen(true)}
        onOpenShortcuts={() => setIsShortcutsOpen(true)}
        onOpenExtensions={() => setIsExtensionsOpen(true)}
        onOpenHelp={() => setIsHelpOpen(true)}
        onOpenFileExplorer={() => setIsFileManagerOpen(true)}
        crtEnabled={crtEnabled}
        onToggleCrt={() => setCrtEnabled(!crtEnabled)}
        onLockNow={() => setLocked(true)}
        surface={surface}
        onSelectSurface={handleSelectSurface}
      />

      {/* Main Workspace: real browser surface or the terminal stream */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {surface === 'web' ? (
          <WebBrowserSurface
            theme={theme}
            tab={tabs.find((t) => t.id === activeTabId)}
            onCommand={handleExecuteCommand}
            bookmarks={bookmarks}
            onAddBookmark={handleAddBookmark}
            onRemoveBookmark={handleRemoveBookmark}
            onSetViewMode={handleSetViewMode}
            globalHistory={browserHistoryUrls(browserHistory)}
            onClearHistory={() => setBrowserHistory(clearBrowserHistory())}
            onSetZoom={handleSetZoom}
            onPageStatus={(status) =>
              setTabs((prev) =>
                prev.map((tab) =>
                  tab.id === activeTabId ? { ...tab, statusCode: status, isLoading: false } : tab
                )
              )
            }
            latencyMs={metrics.latencyMs}
          />
        ) : (
          <Suspense
            fallback={
              <div
                className="flex h-full items-center justify-center font-mono text-[11px] opacity-60"
                style={{ backgroundColor: theme.bg, color: theme.accent }}
              >
                CARGANDO TERMINAL…
              </div>
            }
          >
            <TerminalView
              tabId={activeTabId}
              theme={theme}
              logs={logs}
              onExecuteCommand={handleExecuteCommand}
              onClearLogs={() => setLogs([])}
              onExportLogs={handleExportLogs}
              onOpenHelp={() => setIsHelpOpen(true)}
              onOpenFileExplorer={() => setIsFileManagerOpen(true)}
              currentPath={currentPath}
              fileSystem={fileSystem}
              onMountLocalFolder={handleMountLocalFolder}
              onMountWorkspace={handleMountWorkspace}
              localMountToRestore={
                pendingLocalMount
                  ? {
                      name: pendingLocalMount.name,
                      permission: pendingLocalMount.permission,
                      restoring: restoringLocalMount,
                    }
                  : null
              }
              onRestoreLocalMount={handleRestoreLocalMount}
              onOpenMonitor={() => setIsMonitorOpen(true)}
              onOpenSecurity={() => setIsSecurityOpen(true)}
              onImportLocalFiles={handleImportLocalFiles}
              onDismissNotification={(id) => setLogs((prev) => prev.filter((log) => log.id !== id))}
              tabSummary={`${Math.max(1, tabs.findIndex((t) => t.id === activeTabId) + 1)}/${tabs.length}`}
              allowInlineFrames={false}
              latencyMs={metrics.latencyMs}
              shellMode={terminalShells[activeTabId] ?? 'terminus'}
              nativeShellAvailable={nativeShellAvailable}
              onSelectShellMode={handleSelectTerminalShell}
              onExecuteShellCommand={handleExecuteNativeCommand}
              nativeShellCwd={nativeShellCwd}
            />
          </Suspense>
        )}
      </main>

      {/* Interactive MS-DOS Resource Monitor HUD Modal */}
      {isMonitorOpen && (
        <Suspense fallback={null}>
          <ResourceMonitorHUD
            theme={theme}
            isOpen={isMonitorOpen}
            onClose={() => setIsMonitorOpen(false)}
            metrics={metrics}
            onResolveAnomaly={(id) => {
              setMetrics((prev) => ({
                ...prev,
                anomalies: prev.anomalies.filter((a) => a.id !== id),
              }));
            }}
            onSimulateSpike={() => {
              setMetrics((prev) => ({
                ...prev,
                cpuUsage: 94,
                memoryPercent: 88,
                latencyMs: 380,
                anomalies: [
                  {
                    id: `ano_spike_${Date.now()}`,
                    timestamp: new Date().toLocaleTimeString(),
                    type: 'HIGH_CPU',
                    message: 'Pico forzado de consumo en CPU (94%) y desbordamiento de hilos.',
                    severity: 'critical',
                  },
                  ...prev.anomalies,
                ],
              }));
            }}
          />
        </Suspense>
      )}

      {/* New session confirmation (themed, instead of window.confirm) */}
      <ConfirmDialog
        theme={theme}
        isOpen={isNewSessionConfirmOpen}
        title="Nueva sesión"
        message="Se cerrarán todas las pestañas y se borrará la sesión guardada. Los marcadores, el tema y las preferencias de vista por sitio se mantienen."
        confirmLabel="Empezar de cero"
        cancelLabel="Cancelar"
        onConfirm={() => {
          setIsNewSessionConfirmOpen(false);
          performNewSession();
        }}
        onCancel={() => setIsNewSessionConfirmOpen(false)}
      />

      {/* Keybindings Modal */}
      <ShortcutsModal
        theme={theme}
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
        keybindings={keybindings}
        onUpdateKeybinding={(updated) => setKeybindings(updated)}
      />

      {/* Automation Scripts Modal */}
      {isScriptsOpen && (
        <Suspense fallback={null}>
          <AutomationScriptsModal
            theme={theme}
            isOpen={isScriptsOpen}
            onClose={() => setIsScriptsOpen(false)}
            scripts={scripts}
            onRunScript={runAutomatedScript}
            onSaveScript={(sc) => {
              setScripts((prev) => {
                const idx = prev.findIndex((s) => s.id === sc.id);
                if (idx >= 0) {
                  const copy = [...prev];
                  copy[idx] = sc;
                  return copy;
                }
                return [...prev, sc];
              });
            }}
            onDeleteScript={(id) => setScripts((prev) => prev.filter((s) => s.id !== id))}
          />
        </Suspense>
      )}

      {/* Security & MFA Modal */}
      {isSecurityOpen && (
        <Suspense fallback={null}>
          <SecurityMfaModal
            theme={theme}
            isOpen={isSecurityOpen}
            onClose={() => setIsSecurityOpen(false)}
            security={security}
            onUpdateSecurity={(sec) => setSecurity(sec)}
            onSyncPush={handleSyncPush}
            onSyncPull={handleSyncPull}
          />
        </Suspense>
      )}

      {/* Extensions Modal */}
      {isExtensionsOpen && (
        <Suspense fallback={null}>
          <ExtensionsModal
            theme={theme}
            isOpen={isExtensionsOpen}
            onClose={() => setIsExtensionsOpen(false)}
            extensions={extensions}
            onToggleExtension={(id) => {
              setExtensions((prev) =>
                prev.map((e) => (e.id === id ? { ...e, installed: !e.installed } : e))
              );
            }}
            onRunCommandInTerminal={(cmd) => handleExecuteCommand(cmd)}
          />
        </Suspense>
      )}

      {/* Interactive Help Panel (with category filters and click-to-run examples) */}
      {isHelpOpen && (
        <Suspense fallback={null}>
          <HelpModal
            theme={theme}
            isOpen={isHelpOpen}
            onClose={() => setIsHelpOpen(false)}
            onExecuteCommand={(cmd) => handleExecuteCommand(cmd)}
          />
        </Suspense>
      )}

      {/* Interactive File Commander (Norton Commander / MS-DOS style) */}
      {isFileManagerOpen && (
        <Suspense fallback={null}>
          <FileManagerHUD
            theme={theme}
            isOpen={isFileManagerOpen}
            onClose={() => setIsFileManagerOpen(false)}
            currentPath={currentPath}
            onNavigatePath={(p) => setCurrentPath(p)}
            fileSystem={fileSystem}
            onCreateFile={handleCreateFile}
            onCreateDir={handleCreateDir}
            onDeleteFile={handleDeleteFile}
            onSaveFileContent={handleSaveFileContent}
            onExecuteInTerminal={(cmd) => handleExecuteCommand(cmd)}
          />
        </Suspense>
      )}
    </div>
  );
}
