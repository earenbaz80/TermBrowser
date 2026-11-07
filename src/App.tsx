/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * TermBrowser OS - Command-Line Web Browser & Dev Console
 */

import React, { useState, useEffect, useCallback } from 'react';
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
} from './types';
import { THEMES } from './utils/themes';
import { soundEffects } from './utils/soundEffects';
import { BUILT_IN_EXTENSIONS } from './utils/extensions';
import { DEFAULT_KEYBINDINGS, ShortcutsModal } from './components/ShortcutsModal';
import { ResourceMonitorHUD } from './components/ResourceMonitorHUD';
import { AutomationScriptsModal } from './components/AutomationScriptsModal';
import { SecurityMfaModal } from './components/SecurityMfaModal';
import { ExtensionsModal } from './components/ExtensionsModal';
import { HelpModal } from './components/HelpModal';
import { FileManagerHUD } from './components/FileManagerHUD';
import { HeaderBar } from './components/HeaderBar';
import { TerminalView } from './components/TerminalView';
import { BrowserView } from './components/BrowserView';
import { processCommand } from './utils/commandProcessor';
import { computeSHA256, encryptAES256, decryptAES256, generateMfaSecret } from './utils/crypto';
import { INITIAL_FILESYSTEM, VirtualFile } from './utils/interpreter';
import { notificationManager } from './utils/notificationManager';
import { appendCommandToHistory } from './utils/commandHistoryStorage';

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
  const [viewMode, setViewMode] = useState<ViewMode>('split');

  // Persist theme changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('termbrowser_theme_v1', currentThemeId);
    } catch {}
  }, [currentThemeId]);

  // Tabs Management
  const [tabs, setTabs] = useState<BrowserTab[]>([
    {
      id: 'tab_1',
      title: 'Portal de Inicio',
      url: 'about:blank',
      displayUrl: 'about:blank',
      isLoading: false,
      content: '',
      history: ['about:blank'],
      historyIndex: 0,
    },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>('tab_1');

  // Terminal Logs & Boot Sequence
  const [logs, setLogs] = useState<TerminalLogEntry[]>([
    {
      id: 'boot_ascii',
      timestamp: new Date().toLocaleTimeString(),
      type: 'ascii',
      output: `
 ╔═══════════════════════════════════════════════════════════════════════════════════════╗
 ║  ████████╗███████╗██████╗ ███╗   ███╗██████╗ ██████╗  ██████╗ ██╗    ██╗███████╗███████╗║
 ║  ╚══██╔══╝██╔════╝██╔══██╗████╗ ████║██╔══██╗██╔══██╗██╔═══██╗██║    ██║██╔════╝██╔════╝║
 ║     ██║   █████╗  ██████╔╝██╔████╔██║██████╔╝██████╔╝██║   ██║██║ █╗ ██║███████╗█████╗  ║
 ║     ██║   ██╔══╝  ██╔══██╗██║╚██╔╝██║██╔══██╗██╔══██╗██║   ██║██║███╗██║╚════██║██╔══╝  ║
 ║     ██║   ███████╗██║  ██║██║ ╚═╝ ██║██████╔╝██║  ██║╚██████╔╝╚███╔███╔╝███████║███████╗║
 ║     ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝╚═════╝ ╚═╝  ╚═╝ ╚═════╝  ╚══╝╚══╝ ╚══════╝╚══════╝║
 ║                      NAVEGADOR WEB BASADO EN LÍNEA DE COMANDOS                        ║
 ║  [CIFRADO AES-256-GCM] · [MFA TOTP] · [SCRIPTS PYTHON & BASH] · [MONITOR MS-DOS]      ║
 ╚═══════════════════════════════════════════════════════════════════════════════════════╝
      `.trim(),
    },
    {
      id: 'boot_welcome',
      timestamp: new Date().toLocaleTimeString(),
      type: 'system',
      output: `[✓] Sistema inicializado. Núcleo WebAssembly activo. Cifrado AES-256-GCM preparado.\nEscriba "help" para ver la lista de comandos o use "goto <url>" para navegar.`,
    },
  ]);

  // Ecosystem & Storage State
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([
    { id: 'bm_1', title: 'Hacker News', url: 'https://news.ycombinator.com', tags: ['tech'], createdAt: '2026-11-07' },
    { id: 'bm_2', title: 'Wikipedia', url: 'https://en.wikipedia.org', tags: ['docs'], createdAt: '2026-11-07' },
  ]);
  const [scripts, setScripts] = useState<UserScript[]>(INITIAL_SCRIPTS);
  const [extensions, setExtensions] = useState<ExtensionManifest[]>(BUILT_IN_EXTENSIONS);
  const [keybindings, setKeybindings] = useState<KeyBinding[]>(DEFAULT_KEYBINDINGS);

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

  // Activity Logs (for JSON / TXT export)
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([
    { id: 'act_1', timestamp: new Date().toISOString(), level: 'SYS', module: 'BOOT', message: 'TermBrowser OS kernel v2.4 initialized.' },
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

  // File System State
  const [currentPath, setCurrentPath] = useState<string>('/home/user');
  const [fileSystem, setFileSystem] = useState<Record<string, VirtualFile[]>>(INITIAL_FILESYSTEM);

  const theme = THEMES[currentThemeId] || THEMES['cyberpunk-obsidian'];
  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

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
  }, []);

  // Compute checksum for security integrity verification
  useEffect(() => {
    const rawState = JSON.stringify({ tabs, bookmarks, scripts: scripts.map((s) => s.id) });
    computeSHA256(rawState).then((hash) => {
      setSecurity((prev) => ({ ...prev, integrityChecksum: hash }));
    });
  }, [tabs.length, bookmarks.length, scripts.length]);

  // Execute terminal command helper
  const handleExecuteCommand = useCallback(
    async (cmd: string) => {
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
        viewMode,
        setViewMode,
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
        exportLogs: handleExportLogs,
        runAutomatedScript,
      });

      if (resultLog && (resultLog.output || resultLog.interactiveFiles)) {
        setLogs((prev) => [...prev, resultLog]);
      }
    },
    [tabs, activeTabId, viewMode, currentThemeId, crtEnabled, isMuted, bookmarks, scripts, extensions, keybindings, security, metrics, activityLogs, currentPath, fileSystem]
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
    let content = '';
    let filename = '';
    let mime = '';

    if (format === 'json') {
      content = JSON.stringify(activityLogs, null, 2);
      filename = `termbrowser-activity-audit-${Date.now()}.json`;
      mime = 'application/json';
    } else {
      content = activityLogs
        .map((l) => `[${l.timestamp}] [${l.level}] [${l.module}] ${l.message}`)
        .join('\n');
      filename = `termbrowser-activity-log-${Date.now()}.txt`;
      mime = 'text/plain';
    }

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

      const res = await fetch('/api/vault/backup', {
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
  const handleSyncPull = async (passkey: string, token: string): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await fetch('/api/vault/restore');
      if (!res.ok) {
        throw new Error('No se encontró ninguna bóveda en la nube para restaurar.');
      }
      const data = await res.json();

      const decrypted = await decryptAES256(data.data, passkey);
      const parsed = JSON.parse(decrypted);

      if (parsed.tabs) setTabs(parsed.tabs);
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

      // Check keybindings
      const matched = keybindings.find((kb) => kb.key.toLowerCase() === combo);
      if (matched) {
        e.preventDefault();
        soundEffects.playKeyClick();

        if (matched.command === 'tab new') {
          const newId = `tab_${Date.now()}`;
          setTabs((prev) => [
            ...prev,
            { id: newId, title: 'Nueva Pestaña', url: 'about:blank', displayUrl: 'about:blank', isLoading: false, content: '', history: ['about:blank'], historyIndex: 0 },
          ]);
          setActiveTabId(newId);
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

        if (matched.command === 'view toggle') {
          setViewMode((prev) => (prev === 'split' ? 'browser' : prev === 'browser' ? 'terminal' : 'split'));
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
  }, [keybindings, tabs, activeTabId, handleExecuteCommand]);

  // Tab operations
  const handleNewTab = () => {
    const newId = `tab_${Date.now()}`;
    const newTab: BrowserTab = {
      id: newId,
      title: 'Nueva Pestaña',
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

  const handleCloseTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    soundEffects.playKeyClick();
    if (tabs.length <= 1) return;
    const filtered = tabs.filter((t) => t.id !== id);
    setTabs(filtered);
    if (activeTabId === id) {
      setActiveTabId(filtered[filtered.length - 1].id);
    }
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

  const handleNavigateTab = (url: string) => {
    handleExecuteCommand(`goto ${url}`);
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
        onCloseTab={handleCloseTab}
        viewMode={viewMode}
        onSetViewMode={(mode) => setViewMode(mode)}
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
      />

      {/* Main Workspace (Split View / Full Terminal / Full Web) */}
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        {/* Terminal Pane */}
        {(viewMode === 'split' || viewMode === 'terminal') && (
          <div
            className={`flex-1 flex flex-col overflow-hidden ${
              viewMode === 'split' ? 'md:w-1/2' : 'w-full'
            }`}
          >
            <TerminalView
              theme={theme}
              logs={logs}
              onExecuteCommand={handleExecuteCommand}
              onClearLogs={() => setLogs([])}
              onExportLogs={handleExportLogs}
              onOpenHelp={() => setIsHelpOpen(true)}
              onOpenFileExplorer={() => setIsFileManagerOpen(true)}
              isExpanded={viewMode === 'terminal'}
              onToggleExpand={() => setViewMode(viewMode === 'terminal' ? 'split' : 'terminal')}
              currentPath={currentPath}
              fileSystem={fileSystem}
              onMountLocalFolder={handleMountLocalFolder}
              onMountWorkspace={handleMountWorkspace}
              onOpenMonitor={() => setIsMonitorOpen(true)}
              onOpenSecurity={() => setIsSecurityOpen(true)}
              onOpenScripts={() => setIsScriptsOpen(true)}
              onImportLocalFiles={handleImportLocalFiles}
            />
          </div>
        )}

        {/* Browser Pane */}
        {(viewMode === 'split' || viewMode === 'browser') && (
          <div
            className={`flex-1 flex flex-col overflow-hidden ${
              viewMode === 'split' ? 'md:w-1/2' : 'w-full'
            }`}
          >
            <BrowserView
              theme={theme}
              tab={activeTab}
              onNavigate={handleNavigateTab}
              onBack={() => handleExecuteCommand('back')}
              onForward={() => handleExecuteCommand('forward')}
              onReload={() => handleExecuteCommand('reload')}
              onAddBookmark={(title, url) => handleExecuteCommand(`bookmark add "${title}" ${url}`)}
            />
          </div>
        )}
      </main>

      {/* Interactive MS-DOS Resource Monitor HUD Modal */}
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

      {/* Keybindings Modal */}
      <ShortcutsModal
        theme={theme}
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
        keybindings={keybindings}
        onUpdateKeybinding={(updated) => setKeybindings(updated)}
      />

      {/* Automation Scripts Modal */}
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

      {/* Security & MFA Modal */}
      <SecurityMfaModal
        theme={theme}
        isOpen={isSecurityOpen}
        onClose={() => setIsSecurityOpen(false)}
        security={security}
        onUpdateSecurity={(sec) => setSecurity(sec)}
        onSyncPush={handleSyncPush}
        onSyncPull={handleSyncPull}
      />

      {/* Extensions Modal */}
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

      {/* Interactive Help Panel (with category filters and click-to-run examples) */}
      <HelpModal
        theme={theme}
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
        onExecuteCommand={(cmd) => handleExecuteCommand(cmd)}
      />

      {/* Interactive File Commander (Norton Commander / MS-DOS style) */}
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
    </div>
  );
}
