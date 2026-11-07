import React, { useState, useRef, useEffect } from 'react';
import { TerminalLogEntry, ThemeConfig, InteractiveFileItem } from '../types';
import { soundEffects } from '../utils/soundEffects';
import { TerminalWebpageView } from './TerminalWebpageView';
import { RetroAssistantEyes } from './RetroAssistantEyes';
import { TerminalNotificationCard } from './TerminalNotificationCard';
import {
  Download,
  Trash2,
  Maximize2,
  Minimize2,
  CornerDownLeft,
  HelpCircle,
  Folder,
  FileCode,
  FileText,
  Play,
  RotateCcw,
  Globe,
  HardDrive,
  FolderUp,
  History,
  Activity,
  Shield,
  FileSearch,
  ExternalLink,
  ChevronRight,
  Terminal as TerminalIcon,
  Code2,
  Zap,
  ChevronDown,
  Bell,
  Mic,
  MicOff,
  Radio,
} from 'lucide-react';
import { VoiceRecognitionController, isSpeechRecognitionSupported } from '../utils/speechRecognition';
import { VirtualFile } from '../utils/interpreter';
import {
  getPersistedCommandHistory,
  appendCommandToHistory,
  clearPersistedCommandHistory,
  HISTORY_SYNC_EVENT,
  HISTORY_STORAGE_KEY,
} from '../utils/commandHistoryStorage';

interface AutocompleteItem {
  value: string;
  label: string;
  kind: 'command' | 'file' | 'dir';
}

interface TerminalViewProps {
  theme: ThemeConfig;
  logs: TerminalLogEntry[];
  onExecuteCommand: (cmd: string) => void;
  onClearLogs: () => void;
  onExportLogs: (format: 'json' | 'txt') => void;
  onOpenHelp?: () => void;
  onOpenFileExplorer?: () => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  currentPath?: string;
  fileSystem?: Record<string, VirtualFile[]>;
  onMountLocalFolder?: () => void;
  onMountWorkspace?: () => void;
  onOpenMonitor?: () => void;
  onOpenSecurity?: () => void;
  onOpenScripts?: () => void;
  onImportLocalFiles?: (files: { name: string; content: string; size: number }[], folderName?: string) => void;
}

const COMMON_COMMANDS = [
  'help',
  'ayuda',
  'home',
  'inicio',
  'whoami',
  'perfil',
  'avatar',
  'ls',
  'dir',
  'cd ',
  'cat ',
  'type ',
  'pwd',
  'mkdir ',
  'touch ',
  'rm ',
  'clear',
  'cls',
  'limpiar',
  'ir a https://',
  'goto https://',
  'web https://',
  'lynx https://',
  'search ',
  'google',
  'github',
  'wikipedia',
  'stackoverflow',
  'hackernews',
  'reddit',
  'pestaña 1',
  'pestaña 2',
  'pestaña nueva',
  'pestaña cerrar',
  'tab new',
  'tab close',
  'tab switch 1',
  'archivos',
  'mc',
  'monitor',
  'top',
  'ps',
  'kill ',
  'asistente',
  'voice',
  'voz',
  'dictar',
  'exit',
  'fs workspace',
  'fs mount',
  'fs status',
  'python ',
  'python benchmark.py',
  'python -c "print(1+1)"',
  'bash ',
  'bash -c "whoami"',
  'curl -X GET ',
  'scrape ',
  'reader',
  'source',
  'speedtest',
  'ping ',
  'dns google.com',
  'ipconfig',
  'ifconfig',
  'base64 -e "hola"',
  'hash "seguridad"',
  'json-pretty \'{"status":"ok"}\'',
  'vault status',
  'vault lock',
  'vault unlock ',
  'mfa status',
  'mfa verify ',
  'sync push',
  'sync pull',
  'notify on',
  'notify off',
  'notify status',
  'notify test script',
  'notify test anomaly',
  'binds',
  'script list',
  'ext list',
  'history',
  'history clear',
  'historial',
  'bw',
  'theme bw',
  'theme blanco-y-negro',
  'theme green',
  'theme amber',
  'theme cyan',
  'theme matrix',
  'sound on',
  'sound off',
];

const FILE_ACCEPTING_COMMANDS = new Set([
  'cd',
  'cat',
  'type',
  'python',
  'py',
  'bash',
  'sh',
  'rm',
  'del',
  'touch',
  'mkdir',
  'ls',
  'dir',
  'edit',
  'nano',
  'vim',
  'head',
  'tail',
  'grep',
  'chmod',
  'script',
]);

/**
 * Parses terminal text to turn URLs and script names into interactive clickable items
 */
const ClickableTerminalText: React.FC<{
  text: string;
  theme: ThemeConfig;
  onExecuteCommand: (cmd: string) => void;
}> = ({ text, theme, onExecuteCommand }) => {
  // Regex to detect URLs: https?://[^\s]+
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);

  return (
    <div className="whitespace-pre-wrap leading-relaxed">
      {parts.map((part, i) => {
        if (part.match(urlRegex)) {
          return (
            <span
              key={i}
              onClick={(e) => {
                e.stopPropagation();
                soundEffects.playKeyClick();
                onExecuteCommand(`goto ${part}`);
              }}
              className="underline cursor-pointer hover:opacity-80 transition-opacity font-bold font-mono text-cyan-400"
              title={`Haga clic para navegar a: ${part}`}
            >
              {part}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </div>
  );
};

export const TerminalView: React.FC<TerminalViewProps> = ({
  theme,
  logs,
  onExecuteCommand,
  onClearLogs,
  onExportLogs,
  onOpenHelp,
  onOpenFileExplorer,
  isExpanded = false,
  onToggleExpand,
  currentPath = '/home/user',
  fileSystem = {},
  onMountLocalFolder,
  onMountWorkspace,
  onOpenMonitor,
  onOpenSecurity,
  onOpenScripts,
  onImportLocalFiles,
}) => {
  const [inputVal, setInputVal] = useState('');
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [draftInput, setDraftInput] = useState<string>('');

  const [commandHistory, setCommandHistory] = useState<string[]>(() => getPersistedCommandHistory());
  const [isHistoryMenuOpen, setIsHistoryMenuOpen] = useState(false);

  const [suggestions, setSuggestions] = useState<AutocompleteItem[]>([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState<number>(0);
  const isTabCyclingRef = useRef<boolean>(false);

  const [isQuickMenuOpen, setIsQuickMenuOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dirInputRef = useRef<HTMLInputElement>(null);
  const quickMenuRef = useRef<HTMLDivElement>(null);
  const quickMenuBtnRef = useRef<HTMLButtonElement>(null);
  const [quickMenuPos, setQuickMenuPos] = useState<{ top: number; right: number } | null>(null);
  const historyMenuRef = useRef<HTMLDivElement>(null);

  const [isListening, setIsListening] = useState(false);
  const [voiceInterim, setVoiceInterim] = useState('');
  const [voiceFinal, setVoiceFinal] = useState('');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [audioMeterStep, setAudioMeterStep] = useState(0);
  const voiceControllerRef = useRef<VoiceRecognitionController | null>(null);

  // Synchronize commandHistory state with localStorage updates across actions and tabs
  useEffect(() => {
    const handleHistorySync = (e: Event) => {
      const customEvt = e as CustomEvent<string[]>;
      if (Array.isArray(customEvt.detail)) {
        setCommandHistory(customEvt.detail);
      } else {
        setCommandHistory(getPersistedCommandHistory());
      }
      setHistoryIndex(-1);
    };

    const handleStorageEvent = (e: StorageEvent) => {
      if (e.key === HISTORY_STORAGE_KEY) {
        setCommandHistory(getPersistedCommandHistory());
        setHistoryIndex(-1);
      }
    };

    window.addEventListener(HISTORY_SYNC_EVENT, handleHistorySync);
    window.addEventListener('storage', handleStorageEvent);
    return () => {
      window.removeEventListener(HISTORY_SYNC_EVENT, handleHistorySync);
      window.removeEventListener('storage', handleStorageEvent);
    };
  }, []);

  // Close quick menu or history menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (quickMenuRef.current && !quickMenuRef.current.contains(e.target as Node)) {
        setIsQuickMenuOpen(false);
      }
      if (historyMenuRef.current && !historyMenuRef.current.contains(e.target as Node)) {
        setIsHistoryMenuOpen(false);
      }
    };
    if (isQuickMenuOpen || isHistoryMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isQuickMenuOpen, isHistoryMenuOpen]);

  // Initialize Speech Recognition Controller
  useEffect(() => {
    const controller = new VoiceRecognitionController('es-ES');
    voiceControllerRef.current = controller;

    controller.setCallbacks({
      onStart: () => {
        setIsListening(true);
        setVoiceInterim('');
        setVoiceFinal('');
        setVoiceError(null);
        soundEffects.playVoiceStart();
      },
      onInterim: (text) => {
        setVoiceInterim(text);
      },
      onFinal: (finalText, normalizedCmd) => {
        setVoiceFinal(finalText);
        setVoiceInterim('');
        soundEffects.playVoiceRecognized();
        setInputVal(normalizedCmd);
        // Automatically execute recognized command after a short visual pause
        setTimeout(() => {
          onExecuteCommand(normalizedCmd);
          setIsListening(false);
          setVoiceFinal('');
          setVoiceInterim('');
        }, 550);
      },
      onError: (errMsg) => {
        setVoiceError(errMsg);
        setIsListening(false);
        soundEffects.playVoiceError();
        setTimeout(() => setVoiceError(null), 4500);
      },
      onEnd: () => {
        setIsListening(false);
      },
    });

    return () => {
      controller.stop();
    };
  }, [onExecuteCommand]);

  // Audio meter pulse animation while listening
  useEffect(() => {
    if (!isListening) return;
    const interval = setInterval(() => {
      setAudioMeterStep((prev) => (prev + 1) % 6);
    }, 160);
    return () => clearInterval(interval);
  }, [isListening]);

  // Toggle voice recognition
  const handleToggleVoice = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!isSpeechRecognitionSupported()) {
      soundEffects.playVoiceError();
      setVoiceError('Web Speech API no disponible en este navegador. Use Google Chrome, Edge o Safari.');
      setTimeout(() => setVoiceError(null), 4500);
      return;
    }

    if (isListening) {
      voiceControllerRef.current?.stop();
      setIsListening(false);
    } else {
      voiceControllerRef.current?.start();
    }
  };

  // Keyboard shortcut Ctrl+M / Cmd+M to toggle voice input
  useEffect(() => {
    const handleVoiceKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        handleToggleVoice();
      }
    };
    window.addEventListener('keydown', handleVoiceKey);
    return () => window.removeEventListener('keydown', handleVoiceKey);
  }, [isListening]);

  // Auto-scroll to bottom on new log entries
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Keep focus in terminal input
  const focusInput = () => {
    inputRef.current?.focus();
  };

  // Place cursor at the end of input when navigating history
  useEffect(() => {
    if (historyIndex !== -1 && inputRef.current) {
      const len = inputRef.current.value.length;
      inputRef.current.setSelectionRange(len, len);
    }
  }, [historyIndex]);

  // Build autocomplete suggestions for commands and files/directories in currentPath
  const computeSuggestions = (rawInput: string, includeEmpty = false): AutocompleteItem[] => {
    const currentEntries = fileSystem[currentPath] || [];
    const results: AutocompleteItem[] = [];
    const seenValues = new Set<string>();

    const addSuggestion = (item: AutocompleteItem) => {
      const key = item.value.toLowerCase();
      if (!seenValues.has(key)) {
        seenValues.add(key);
        results.push(item);
      }
    };

    // When input is empty and Tab is pressed explicitly, suggest current directory items + top commands
    if (!rawInput.trim()) {
      if (!includeEmpty) return [];

      currentEntries.forEach((f) => {
        if (f.type === 'dir') {
          addSuggestion({
            value: `cd ${f.name}`,
            label: `${f.name}/`,
            kind: 'dir',
          });
        } else {
          const defaultCmd = f.name.endsWith('.py')
            ? `python ${f.name}`
            : f.name.endsWith('.sh')
            ? `bash ${f.name}`
            : `cat ${f.name}`;
          addSuggestion({
            value: defaultCmd,
            label: f.name,
            kind: 'file',
          });
        }
      });

      ['help', 'ls', 'whoami', 'mc', 'top', 'voice', 'fs workspace'].forEach((cmd) => {
        addSuggestion({ value: cmd, label: cmd, kind: 'command' });
      });

      return results.slice(0, 10);
    }

    const spaceIdx = rawInput.indexOf(' ');

    // Case 1: Completing an argument or multi-word command (input contains space)
    if (spaceIdx !== -1) {
      const firstWord = rawInput.slice(0, spaceIdx).trim().toLowerCase();
      const lastSpaceIdx = rawInput.lastIndexOf(' ');
      const cmdPart = rawInput.slice(0, lastSpaceIdx + 1); // Includes trailing space
      const argPartial = rawInput.slice(lastSpaceIdx + 1);

      // 1a. If the command accepts file/directory names (or user is typing a path), match files & directories
      if (FILE_ACCEPTING_COMMANDS.has(firstWord) || argPartial.includes('/') || currentEntries.length > 0) {
        let targetDir = currentPath;
        let filePrefix = argPartial;
        let pathPrefix = '';

        if (argPartial.includes('/')) {
          const slashIdx = argPartial.lastIndexOf('/');
          const subDir = argPartial.slice(0, slashIdx);
          filePrefix = argPartial.slice(slashIdx + 1);
          pathPrefix = `${subDir}/`;

          if (subDir.startsWith('/')) {
            targetDir = subDir || '/';
          } else if (subDir === '..') {
            const parts = currentPath.split('/').filter(Boolean);
            parts.pop();
            targetDir = parts.length > 0 ? `/${parts.join('/')}` : '/';
          } else if (subDir) {
            targetDir = currentPath === '/' ? `/${subDir}` : `${currentPath}/${subDir}`;
          }
        }

        const dirEntries = fileSystem[targetDir] || [];
        const sortedEntries = [...dirEntries].sort((a, b) => {
          if (firstWord === 'cd') {
            if (a.type === 'dir' && b.type !== 'dir') return -1;
            if (a.type !== 'dir' && b.type === 'dir') return 1;
          }
          return a.name.localeCompare(b.name);
        });

        sortedEntries.forEach((f) => {
          if (f.name.toLowerCase().startsWith(filePrefix.toLowerCase())) {
            // If command is 'cd', prioritize directories
            if (firstWord === 'cd' && f.type !== 'dir' && sortedEntries.some((e) => e.type === 'dir')) {
              return;
            }
            const completedArg = `${pathPrefix}${f.name}`;
            const fullValue = `${cmdPart}${completedArg}`;
            if (fullValue.toLowerCase() !== rawInput.toLowerCase() || includeEmpty) {
              addSuggestion({
                value: fullValue,
                label: f.type === 'dir' ? `${completedArg}/` : completedArg,
                kind: f.type === 'dir' ? 'dir' : 'file',
              });
            }
          }
        });
      }

      // 1b. Also match multi-word commands starting with the current input
      const normalizedInput = rawInput.toLowerCase();
      COMMON_COMMANDS.forEach((cmd) => {
        if (
          cmd.toLowerCase().startsWith(normalizedInput) &&
          (cmd.toLowerCase() !== normalizedInput || includeEmpty)
        ) {
          addSuggestion({
            value: cmd,
            label: cmd,
            kind: 'command',
          });
        }
      });

      return results.slice(0, 10);
    }

    // Case 2: First token completion (no space yet) -> match both commands and files/dirs in currentPath
    const prefix = rawInput.trim().toLowerCase();

    // 2a. Match CLI commands starting with prefix
    COMMON_COMMANDS.forEach((cmd) => {
      if (cmd.toLowerCase().startsWith(prefix) && (cmd.toLowerCase() !== prefix || includeEmpty)) {
        addSuggestion({
          value: cmd,
          label: cmd,
          kind: 'command',
        });
      }
    });

    // 2b. Match files and directories in currentPath starting with prefix
    currentEntries.forEach((f) => {
      if (f.name.toLowerCase().startsWith(prefix)) {
        if (f.type === 'dir') {
          addSuggestion({
            value: `cd ${f.name}`,
            label: `${f.name}/`,
            kind: 'dir',
          });
        } else {
          const defaultCmd = f.name.endsWith('.py')
            ? `python ${f.name}`
            : f.name.endsWith('.sh')
            ? `bash ${f.name}`
            : `cat ${f.name}`;
          addSuggestion({
            value: defaultCmd,
            label: f.name,
            kind: 'file',
          });
        }
      }
    });

    return results.slice(0, 10);
  };

  // Autocomplete matching on user typing
  useEffect(() => {
    if (isTabCyclingRef.current) {
      return;
    }
    const matches = computeSuggestions(inputVal, false);
    setSuggestions(matches);
    setSelectedSuggestionIndex(0);
  }, [inputVal, currentPath, fileSystem]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = inputVal.trim();
    if (!cmd) return;

    soundEffects.playExecute();

    // Persist to localStorage history and sync state
    const updated = appendCommandToHistory(cmd);
    setCommandHistory(updated);

    isTabCyclingRef.current = false;
    setIsHistoryMenuOpen(false);
    setHistoryIndex(-1);
    setDraftInput('');
    setInputVal('');
    setSuggestions([]);
    onExecuteCommand(cmd);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    soundEffects.playKeyClick();

    // Escape closes active suggestions
    if (e.key === 'Escape') {
      if (suggestions.length > 0) {
        e.preventDefault();
        isTabCyclingRef.current = false;
        setSuggestions([]);
      }
      return;
    }

    // Tab autocomplete (supports both commands and filenames, plus cycling with Tab / Shift+Tab)
    if (e.key === 'Tab') {
      e.preventDefault();

      // If no suggestions are currently active, compute them (even on empty prompt)
      if (suggestions.length === 0) {
        const computed = computeSuggestions(inputVal, true);
        if (computed.length === 1) {
          isTabCyclingRef.current = false;
          setInputVal(computed[0].value);
          setSuggestions([]);
        } else if (computed.length > 1) {
          isTabCyclingRef.current = true;
          setSuggestions(computed);
          setSelectedSuggestionIndex(0);
          setInputVal(computed[0].value);
        }
        return;
      }

      // Single suggestion -> complete immediately and close bar
      if (suggestions.length === 1) {
        const completedVal = suggestions[0].value;
        isTabCyclingRef.current = false;
        setInputVal(completedVal);
        setSuggestions([]);
        return;
      }

      // Multiple suggestions -> complete first item on initial Tab, then cycle on subsequent Tabs
      if (!isTabCyclingRef.current) {
        isTabCyclingRef.current = true;
        setInputVal(suggestions[selectedSuggestionIndex].value);
      } else {
        const nextIdx = e.shiftKey
          ? (selectedSuggestionIndex - 1 + suggestions.length) % suggestions.length
          : (selectedSuggestionIndex + 1) % suggestions.length;
        setSelectedSuggestionIndex(nextIdx);
        setInputVal(suggestions[nextIdx].value);
      }
      return;
    }

    // Up Arrow: History backward
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      isTabCyclingRef.current = false;
      if (commandHistory.length === 0) return;

      if (historyIndex === -1) {
        setDraftInput(inputVal);
        const lastIdx = commandHistory.length - 1;
        setHistoryIndex(lastIdx);
        setInputVal(commandHistory[lastIdx]);
      } else if (historyIndex > 0) {
        const nextIdx = historyIndex - 1;
        setHistoryIndex(nextIdx);
        setInputVal(commandHistory[nextIdx]);
      }
      return;
    }

    // Down Arrow: History forward
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      isTabCyclingRef.current = false;
      if (historyIndex === -1) return;

      if (historyIndex < commandHistory.length - 1) {
        const nextIdx = historyIndex + 1;
        setHistoryIndex(nextIdx);
        setInputVal(commandHistory[nextIdx]);
      } else {
        setHistoryIndex(-1);
        setInputVal(draftInput);
      }
      return;
    }
  };

  // Handle local file picking through standard HTML file input
  const handleLocalFileSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const filesToRead: File[] = Array.from(fileList);
    const loadedFiles: { name: string; content: string; size: number }[] = [];
    let processed = 0;

    filesToRead.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const textContent = (event.target?.result as string) || '';
        loadedFiles.push({
          name: file.name,
          content: textContent,
          size: file.size,
        });
        processed++;
        if (processed === filesToRead.length) {
          if (onImportLocalFiles) {
            onImportLocalFiles(loadedFiles, 'disco_local');
          } else {
            onExecuteCommand(`echo "[✓] ${loadedFiles.length} archivos locales cargados desde el disco."`);
          }
        }
      };
      reader.readAsText(file.slice(0, 500 * 1024)); // Read up to 500KB text
    });
  };

  // Break currentPath into clickable breadcrumbs
  const pathParts = currentPath.split('/').filter(Boolean);

  return (
    <div
      onClick={focusInput}
      className="flex flex-col flex-1 h-full font-mono text-xs overflow-hidden select-text relative"
      style={{
        backgroundColor: theme.bg,
        color: theme.text,
      }}
    >
      {/* Hidden file and folder input elements for local filesystem access */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleLocalFileSelection}
      />
      <input
        ref={dirInputRef}
        type="file"
        multiple
        // @ts-ignore
        webkitdirectory="true"
        className="hidden"
        onChange={handleLocalFileSelection}
      />

      {/* Terminal Title & Controls Strip (Siempre en línea, con scroll lateral automático por táctil y rueda del ratón) */}
      <div
        className="px-3 py-1.5 border-b flex items-center justify-between gap-3 select-none shrink-0 overflow-x-auto whitespace-nowrap font-mono"
        style={{
          backgroundColor: theme.cardBg,
          borderColor: theme.border,
        }}
        onWheel={(e) => {
          if (e.deltaY !== 0) {
            e.preventDefault();
            e.currentTarget.scrollLeft += e.deltaY;
          }
        }}
      >
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-bold text-[11px] flex items-center gap-1.5" style={{ color: theme.accent }}>
            <TerminalIcon className="w-3.5 h-3.5" />
            <span>CONSOLA & NAVEGADOR WEB</span>
          </span>
          <span className="text-[10px] opacity-60 hidden sm:inline">
            Tab: autocompletar · ↑↓: historial
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          {/* Small Collapsible Quick Actions Menu (Menú pequeño plegable sin emojis, solo iconos vectoriales) */}
          <div className="relative" ref={quickMenuRef}>
            <button
              ref={quickMenuBtnRef}
              onClick={(e) => {
                e.stopPropagation();
                soundEffects.playKeyClick();
                if (!isQuickMenuOpen && quickMenuBtnRef.current) {
                  const rect = quickMenuBtnRef.current.getBoundingClientRect();
                  setQuickMenuPos({
                    top: rect.bottom + 4,
                    right: window.innerWidth - rect.right,
                  });
                }
                setIsQuickMenuOpen(!isQuickMenuOpen);
              }}
              className="flex items-center gap-1 px-2 py-0.5 border text-[10px] font-bold hover:opacity-90 cursor-pointer rounded-xs"
              style={{
                borderColor: isQuickMenuOpen ? theme.accent : theme.border,
                backgroundColor: isQuickMenuOpen ? theme.accent : theme.bg,
                color: isQuickMenuOpen ? theme.bg : theme.accent,
              }}
              title="Menú plegable de acciones rápidas"
            >
              <Zap className="w-3 h-3 text-amber-400" />
              <span>ACCIONES</span>
              <ChevronDown className={`w-3 h-3 transition-transform duration-150 ${isQuickMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {isQuickMenuOpen && (
              <div
                className="fixed w-56 border rounded-xs shadow-2xl z-50 p-1 font-mono text-[11px] backdrop-blur-md animate-in fade-in slide-in-from-top-1 duration-150"
                style={{
                  top: quickMenuPos ? `${quickMenuPos.top}px` : '40px',
                  right: quickMenuPos ? `${quickMenuPos.right}px` : '16px',
                  backgroundColor: 'rgba(10, 15, 29, 0.98)',
                  borderColor: theme.accent,
                  color: theme.text,
                }}
              >
                <div className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider opacity-60 border-b border-white/10 flex items-center justify-between">
                  <span className="flex items-center gap-1 text-amber-400">
                    <Zap className="w-2.5 h-2.5" />
                    <span>Acciones Rápidas</span>
                  </span>
                  <span className="text-[9px] opacity-40">[ESC]</span>
                </div>

                <div className="py-1 space-y-0.5">
                  <button
                    onClick={() => {
                      soundEffects.playKeyClick();
                      setIsQuickMenuOpen(false);
                      onExecuteCommand('ls');
                    }}
                    className="w-full flex items-center gap-2 px-2 py-1 rounded-xs hover:bg-white/10 cursor-pointer text-left text-slate-200 hover:text-white"
                  >
                    <Folder className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="font-semibold text-[11px]">Listar Archivos (ls)</span>
                  </button>

                  <button
                    onClick={() => {
                      soundEffects.playKeyClick();
                      setIsQuickMenuOpen(false);
                      if (onMountWorkspace) onMountWorkspace();
                      else onExecuteCommand('fs workspace');
                    }}
                    className="w-full flex items-center gap-2 px-2 py-1 rounded-xs hover:bg-white/10 cursor-pointer text-left text-slate-200 hover:text-white"
                  >
                    <Code2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span className="font-semibold text-[11px]">Workspace Local</span>
                  </button>

                  <button
                    onClick={() => {
                      soundEffects.playKeyClick();
                      setIsQuickMenuOpen(false);
                      onExecuteCommand('goto https://news.ycombinator.com');
                    }}
                    className="w-full flex items-center gap-2 px-2 py-1 rounded-xs hover:bg-white/10 cursor-pointer text-left text-slate-200 hover:text-white"
                  >
                    <Globe className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="font-semibold text-[11px]">Web: Hacker News</span>
                  </button>

                  <button
                    onClick={() => {
                      soundEffects.playKeyClick();
                      setIsQuickMenuOpen(false);
                      onExecuteCommand('python -c "print(\'Cálculo factorial:\', sum([x**2 for x in range(30)]))"');
                    }}
                    className="w-full flex items-center gap-2 px-2 py-1 rounded-xs hover:bg-white/10 cursor-pointer text-left text-slate-200 hover:text-white"
                  >
                    <Play className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                    <span className="font-semibold text-[11px]">Ejecutar Python</span>
                  </button>

                  {onOpenFileExplorer && (
                    <button
                      onClick={() => {
                        soundEffects.playKeyClick();
                        setIsQuickMenuOpen(false);
                        onOpenFileExplorer();
                      }}
                      className="w-full flex items-center gap-2 px-2 py-1 rounded-xs hover:bg-white/10 cursor-pointer text-left text-slate-200 hover:text-white"
                    >
                      <FileSearch className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      <span className="font-semibold text-[11px]">Norton Commander</span>
                    </button>
                  )}

                  {onOpenMonitor && (
                    <button
                      onClick={() => {
                        soundEffects.playKeyClick();
                        setIsQuickMenuOpen(false);
                        onOpenMonitor();
                      }}
                      className="w-full flex items-center gap-2 px-2 py-1 rounded-xs hover:bg-white/10 cursor-pointer text-left text-slate-200 hover:text-white"
                    >
                      <Activity className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      <span className="font-semibold text-[11px]">Monitor del Sistema</span>
                    </button>
                  )}

                  {onOpenSecurity && (
                    <button
                      onClick={() => {
                        soundEffects.playKeyClick();
                        setIsQuickMenuOpen(false);
                        onOpenSecurity();
                      }}
                      className="w-full flex items-center gap-2 px-2 py-1 rounded-xs hover:bg-white/10 cursor-pointer text-left text-slate-200 hover:text-white"
                    >
                      <Shield className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="font-semibold text-[11px]">Bóveda & MFA</span>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      soundEffects.playKeyClick();
                      setIsQuickMenuOpen(false);
                      handleToggleVoice();
                    }}
                    className="w-full flex items-center gap-2 px-2 py-1 rounded-xs hover:bg-white/10 cursor-pointer text-left text-slate-200 hover:text-white"
                  >
                    <Mic className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    <span className="font-semibold text-[11px]">Dictar por Voz (Ctrl+M)</span>
                  </button>

                  <button
                    onClick={() => {
                      soundEffects.playKeyClick();
                      setIsQuickMenuOpen(false);
                      onExportLogs('json');
                    }}
                    className="w-full flex items-center gap-2 px-2 py-1 rounded-xs hover:bg-white/10 cursor-pointer text-left text-slate-200 hover:text-white"
                  >
                    <Download className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span className="font-semibold text-[11px]">Exportar Logs (JSON)</span>
                  </button>

                  <button
                    onClick={() => {
                      soundEffects.playKeyClick();
                      setIsQuickMenuOpen(false);
                      onExportLogs('txt');
                    }}
                    className="w-full flex items-center gap-2 px-2 py-1 rounded-xs hover:bg-white/10 cursor-pointer text-left text-slate-200 hover:text-white"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="font-semibold text-[11px]">Exportar Logs (TXT)</span>
                  </button>

                  <button
                    onClick={() => {
                      soundEffects.playKeyClick();
                      setIsQuickMenuOpen(false);
                      onExecuteCommand('notify test script');
                    }}
                    className="w-full flex items-center gap-2 px-2 py-1 rounded-xs hover:bg-white/10 cursor-pointer text-left text-slate-200 hover:text-white"
                  >
                    <Bell className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                    <span className="font-semibold text-[11px]">Probar Notificación</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Tactile Help button */}
          {onOpenHelp && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                soundEffects.playKeyClick();
                onOpenHelp();
              }}
              className="flex items-center gap-1 px-2 py-0.5 border text-[10px] font-bold hover:opacity-90 cursor-pointer rounded-xs"
              style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.accent }}
              title="Abrir panel de ayuda interactivo (F1)"
            >
              <HelpCircle className="w-3 h-3" />
              <span>AYUDA (F1)</span>
            </button>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              soundEffects.playKeyClick();
              onClearLogs();
            }}
            className="p-1 border text-red-400 hover:text-red-300 hover:bg-red-900/30 cursor-pointer"
            style={{ borderColor: theme.border }}
            title="Limpiar terminal (Comando: clear)"
          >
            <Trash2 className="w-3 h-3" />
          </button>

          {onToggleExpand && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                soundEffects.playKeyClick();
                onToggleExpand();
              }}
              className="p-1 border hover:opacity-80 cursor-pointer"
              style={{ borderColor: theme.border }}
              title={isExpanded ? 'Restaurar vista dividida' : 'Maximizar terminal (Modo solo terminal)'}
            >
              {isExpanded ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
            </button>
          )}
        </div>
      </div>

      {/* Terminal Location Bar (Clean Clickable Monospace Text) */}
      <div
        className="px-3 py-1.5 border-b flex items-center justify-between gap-2 text-[11px] select-none font-mono shrink-0"
        style={{
          backgroundColor: theme.cardBg,
          borderColor: theme.border,
        }}
      >
        {/* Clickable breadcrumbs */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="opacity-50">DIR:</span>
          <span
            onClick={(e) => {
              e.stopPropagation();
              soundEffects.playKeyClick();
              onExecuteCommand('cd /');
            }}
            className="cursor-pointer hover:underline font-bold text-amber-400"
            title="Ir a /"
          >
            /
          </span>
          {pathParts.map((part, idx) => {
            const subPath = `/${pathParts.slice(0, idx + 1).join('/')}`;
            const isLast = idx === pathParts.length - 1;
            return (
              <React.Fragment key={subPath}>
                <span className="opacity-40">/</span>
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    soundEffects.playKeyClick();
                    onExecuteCommand(`cd ${subPath}`);
                  }}
                  className={`cursor-pointer hover:underline font-bold ${
                    isLast ? 'text-emerald-400' : 'text-cyan-400 opacity-90'
                  }`}
                  title={`Cambiar a ${subPath}`}
                >
                  {part}
                </span>
              </React.Fragment>
            );
          })}
        </div>

        {/* Minimal text-based mount & system triggers */}
        <div className="flex items-center gap-3 text-[10px] font-mono">
          <span
            onClick={(e) => {
              e.stopPropagation();
              soundEffects.playKeyClick();
              if (onMountLocalFolder) onMountLocalFolder();
              else onExecuteCommand('fs mount');
            }}
            className="cursor-pointer hover:underline text-amber-400 font-semibold"
            title="Montar carpeta real del equipo local con File System Access API"
          >
            [montar disco]
          </span>

          <span
            onClick={(e) => {
              e.stopPropagation();
              soundEffects.playKeyClick();
              fileInputRef.current?.click();
            }}
            className="cursor-pointer hover:underline opacity-80 hover:opacity-100"
            title="Cargar archivos locales"
          >
            [cargar archivos]
          </span>

          <span
            onClick={(e) => {
              e.stopPropagation();
              soundEffects.playKeyClick();
              if (onMountWorkspace) onMountWorkspace();
              else onExecuteCommand('fs workspace');
            }}
            className="cursor-pointer hover:underline text-cyan-400 font-semibold"
            title="Montar código fuente del servidor"
          >
            [workspace]
          </span>
        </div>
      </div>

      {/* Terminal Logs Output Scrollback */}
      <div className="flex-1 p-3 overflow-y-auto space-y-2 selection:bg-emerald-500/30">
        {logs.map((log) => {
          // Command Echo: Clean clickable text line to re-run or edit
          if (log.type === 'command') {
            return (
              <div
                key={log.id}
                onClick={(e) => {
                  e.stopPropagation();
                  soundEffects.playKeyClick();
                  if (log.command) {
                    setInputVal(log.command);
                    focusInput();
                  }
                }}
                className="group flex items-start gap-2 pt-1 font-bold cursor-pointer hover:opacity-80 py-0.5 px-1 transition-opacity"
                title="Haga clic para cargar este comando en la barra de entrada"
              >
                <span style={{ color: theme.accent }} className="shrink-0 select-none">
                  {theme.promptSymbol}
                </span>
                <span className="flex-1 whitespace-pre-wrap">{log.command}</span>
              </div>
            );
          }

          // Browser & Terminal Notification Card
          if (log.type === 'notification' && log.notification) {
            return (
              <div key={log.id} className="pl-1 pr-1">
                <TerminalNotificationCard
                  theme={theme}
                  notification={log.notification}
                  onExecuteCommand={onExecuteCommand}
                />
              </div>
            );
          }

          if (log.type === 'stderr') {
            return (
              <div
                key={log.id}
                className="pl-4 py-1 text-red-400 border-l-2 border-red-500/50 whitespace-pre-wrap font-mono text-[11px]"
              >
                {log.output}
              </div>
            );
          }

          if (log.type === 'system') {
            return (
              <div key={log.id} className="pl-4 py-1 text-cyan-400 font-mono text-[11px] space-y-1.5">
                <ClickableTerminalText
                  text={log.output}
                  theme={theme}
                  onExecuteCommand={onExecuteCommand}
                />
                {/* Clickable files attached to system event - clean monospace text */}
                {log.interactiveFiles && log.interactiveFiles.length > 0 && (
                  <div className="pt-1.5 font-mono text-[11px]">
                    <div className="opacity-50 text-[10px] mb-1">
                      [ARCHIVOS DISPONIBLES · CLIC PARA INTERACTUAR]:
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1">
                      {log.interactiveFiles.map((file) => {
                        const isDir = file.type === 'dir';
                        return (
                          <div
                            key={file.name}
                            onClick={(e) => {
                              e.stopPropagation();
                              soundEffects.playKeyClick();
                              onExecuteCommand(file.action);
                            }}
                            className="group flex items-center gap-2 cursor-pointer py-0.5"
                            title={`Clic para ejecutar: ${file.action}`}
                          >
                            <span className={`shrink-0 font-bold ${isDir ? 'text-amber-400' : 'text-emerald-400'}`}>
                              {isDir ? '[DIR] ' : '[FILE]'}
                            </span>
                            <span className="truncate group-hover:underline text-slate-200 group-hover:text-white">
                              {file.name}{isDir ? '/' : ''}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          }

          if (log.type === 'ascii') {
            return (
              <pre
                key={log.id}
                className="font-mono text-[10px] leading-tight select-none opacity-90 overflow-x-auto"
                style={{ color: theme.accent }}
              >
                {log.output}
              </pre>
            );
          }

          // MS-DOS Web View in Terminal with Real Images
          if (log.type === 'webpage' && log.webpage) {
            return (
              <div key={log.id} className="pl-1 sm:pl-2">
                <TerminalWebpageView
                  theme={theme}
                  webpage={log.webpage}
                  onNavigate={(url) => onExecuteCommand(`goto ${url}`)}
                  onOpenSplitWeb={(url) => onExecuteCommand(`goto ${url}`)}
                />
              </div>
            );
          }

          // Standard output with tactile clickable links and files
          return (
            <div key={log.id} className="pl-4 space-y-1.5 leading-relaxed opacity-95">
              {log.output && (
                <ClickableTerminalText
                  text={log.output}
                  theme={theme}
                  onExecuteCommand={onExecuteCommand}
                />
              )}

              {/* Interactive Clickable Files & Directories Strip - clean monospace text */}
              {log.interactiveFiles && log.interactiveFiles.length > 0 && (
                <div className="pt-1.5 font-mono text-[11px]">
                  <div className="opacity-50 text-[10px] mb-1">
                    [ARCHIVOS DISPONIBLES · CLIC PARA INTERACTUAR]:
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1">
                    {log.interactiveFiles.map((file) => {
                      const isDir = file.type === 'dir';
                      return (
                        <div
                          key={file.name}
                          onClick={(e) => {
                            e.stopPropagation();
                            soundEffects.playKeyClick();
                            onExecuteCommand(file.action);
                          }}
                          className="group flex items-center gap-2 cursor-pointer py-0.5"
                          title={`Clic para ejecutar: ${file.action}`}
                        >
                          <span className={`shrink-0 font-bold ${isDir ? 'text-amber-400' : 'text-emerald-400'}`}>
                            {isDir ? '[DIR] ' : '[FILE]'}
                          </span>
                          <span className="truncate group-hover:underline text-slate-200 group-hover:text-white">
                            {file.name}{isDir ? '/' : ''}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Autocomplete Floating Bar (if active suggestions exist) */}
      {suggestions.length > 0 && (
        <div
          className="px-3 py-1.5 border-t border-b flex items-center gap-2 text-[10px] select-none shrink-0 overflow-x-auto whitespace-nowrap"
          style={{
            backgroundColor: theme.cardBg,
            borderColor: theme.border,
          }}
        >
          <span className="opacity-60 font-bold shrink-0">TAB AUTOCOMPLETAR:</span>
          {suggestions.map((sug, idx) => {
            const isSelected = idx === selectedSuggestionIndex;
            return (
              <button
                key={sug.value}
                onClick={(e) => {
                  e.stopPropagation();
                  soundEffects.playKeyClick();
                  isTabCyclingRef.current = false;
                  setInputVal(sug.value);
                  setSuggestions([]);
                  focusInput();
                }}
                className={`px-1.5 py-0.5 border rounded-xs cursor-pointer flex items-center gap-1 shrink-0 ${
                  isSelected ? 'font-bold' : 'opacity-75 hover:opacity-100'
                }`}
                style={{
                  borderColor: isSelected ? theme.accent : theme.border,
                  backgroundColor: isSelected ? theme.accent : theme.bg,
                  color: isSelected ? theme.bg : theme.text,
                }}
                title={`Autocompletar: ${sug.value}`}
              >
                {sug.kind === 'dir' ? (
                  <Folder className="w-2.5 h-2.5 shrink-0" />
                ) : sug.kind === 'file' ? (
                  <FileText className="w-2.5 h-2.5 shrink-0" />
                ) : (
                  <TerminalIcon className="w-2.5 h-2.5 shrink-0" />
                )}
                <span>{sug.label}</span>
              </button>
            );
          })}
          <span className="opacity-40 ml-auto hidden sm:inline shrink-0">
            [TAB] siguiente · [SHIFT+TAB] anterior
          </span>
        </div>
      )}

      {/* Assistant & Navigation Strip directly above typing bar on the right */}
      <div
        className="px-3 py-1 flex items-center justify-between border-t select-none shrink-0"
        style={{
          backgroundColor: theme.bg,
          borderColor: theme.border,
        }}
      >
        <div className="flex items-center gap-2 text-[10px] opacity-75 truncate">
          <span className="font-bold flex items-center gap-1" style={{ color: theme.accent }}>
            <span>❯</span>
            <span>TERMBROWSER</span>
          </span>
          <span className="opacity-50 hidden sm:inline truncate">
            home · ir a &lt;url&gt; · pestaña 1/2 · archivos · monitor · limpiar · exit
          </span>
        </div>

        {/* Pair of retro CRT eyes personal assistant on the right */}
        <div className="ml-auto flex items-center pl-2">
          <RetroAssistantEyes
            theme={theme}
            lastCommand={[...logs].reverse().find((l) => l.type === 'command')?.command}
            lastLogType={logs[logs.length - 1]?.type}
            onExecuteCommand={onExecuteCommand}
            isVoiceActive={isListening}
          />
        </div>
      </div>

      {/* Retro Voice Recognition Banner / Active Speech HUD */}
      {isListening && (
        <div
          className="px-3 py-2 border-t font-mono text-xs select-none animate-in fade-in slide-in-from-bottom-2 duration-150"
          style={{
            backgroundColor: 'rgba(8, 14, 26, 0.98)',
            borderColor: '#ef4444',
            color: theme.text,
          }}
        >
          <div className="flex items-center justify-between pb-1 mb-1 border-b border-red-500/30 text-[10px]">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 font-bold text-red-400 animate-pulse">
                <Radio className="w-3 h-3 text-red-500 animate-pulse" />
                <span>[GRABANDO VOZ · WEB SPEECH API]</span>
              </span>
              <span className="opacity-60 hidden sm:inline">Hable claramente hacia el micrófono</span>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-[9px] text-emerald-400 font-bold">
                VU: {['■ □ □ □ □', '■ ■ □ □ □', '■ ■ ■ □ □', '■ ■ ■ ■ □', '■ ■ ■ ■ ■', '■ ■ ■ □ □'][audioMeterStep]}
              </span>
              <button
                type="button"
                onClick={handleToggleVoice}
                className="text-red-400 hover:text-red-300 hover:underline cursor-pointer text-[10px] font-bold"
              >
                [CANCELAR]
              </button>
            </div>
          </div>

          {/* Transcribed text with retro phosphor aesthetic */}
          <div className="flex items-center gap-2 pt-0.5 min-h-[22px]">
            <span className="text-amber-400 font-bold shrink-0 text-xs">VOZ❯</span>
            <span className="font-mono text-xs text-emerald-300 font-semibold truncate flex-1">
              {voiceInterim || voiceFinal || (
                <span className="opacity-40 italic">Escuchando... diga "inicio", "ir a wikipedia", "listar archivos", o cualquier búsqueda</span>
              )}
            </span>
            <span className="w-1.5 h-3.5 bg-emerald-400 animate-pulse shrink-0 inline-block"></span>
          </div>
        </div>
      )}

      {/* Voice Error Notice (Retro dismissable banner) */}
      {voiceError && !isListening && (
        <div
          className="px-3 py-1.5 border-t border-red-500/40 bg-red-950/40 text-red-400 font-mono text-[11px] flex items-center justify-between"
        >
          <div className="flex items-center gap-1.5">
            <MicOff className="w-3.5 h-3.5 shrink-0" />
            <span>[VOZ]: {voiceError}</span>
          </div>
          <button
            onClick={() => setVoiceError(null)}
            className="text-[10px] hover:underline cursor-pointer opacity-80 hover:opacity-100"
          >
            [CERRAR]
          </button>
        </div>
      )}

      {/* Command Input Bar */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center px-3 py-2 border-t select-none shrink-0 relative"
        style={{
          backgroundColor: theme.cardBg,
          borderColor: theme.border,
        }}
      >
        <span
          className="font-bold mr-2 whitespace-nowrap text-xs select-none"
          style={{ color: theme.accent }}
        >
          {theme.promptSymbol}
        </span>

        {historyIndex !== -1 && commandHistory.length > 0 && (
          <span
            className="mr-2 px-1.5 py-0.5 text-[9px] font-bold border rounded-xs shrink-0"
            style={{
              borderColor: theme.accent,
              color: theme.accent,
              backgroundColor: theme.bg,
            }}
            title="Navegando el historial persistente de localStorage (↑/↓)"
          >
            HIST {historyIndex + 1}/{commandHistory.length}
          </span>
        )}

        <input
          ref={inputRef}
          type="text"
          value={inputVal}
          onChange={(e) => {
            isTabCyclingRef.current = false;
            setInputVal(e.target.value);
          }}
          onKeyDown={handleKeyDown}
          autoFocus
          placeholder="Escriba cualquier búsqueda o comando (Tab: autocompletar · ↑/↓: historial persistente)..."
          className="flex-1 bg-transparent border-0 outline-hidden font-mono text-xs focus:ring-0 placeholder:opacity-45"
          style={{ color: theme.text }}
        />

        {/* Retro Blinking CRT Cursor */}
        <span
          className="inline-block w-2 h-3.5 ml-0.5 animate-pulse shrink-0 select-none"
          style={{ backgroundColor: theme.cursorColor || theme.accent }}
          title="Cursor CRT parpadeante"
        />

        {/* Persistent Command History Popover Button (localStorage) */}
        <div className="relative ml-1" ref={historyMenuRef}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              soundEffects.playKeyClick();
              setIsHistoryMenuOpen((prev) => !prev);
            }}
            className={`px-1.5 py-1 rounded-xs border transition-all cursor-pointer flex items-center gap-1 text-[10px] font-bold ${
              isHistoryMenuOpen ? 'opacity-100' : 'opacity-75 hover:opacity-100 hover:bg-white/10'
            }`}
            style={{
              borderColor: isHistoryMenuOpen ? theme.accent : theme.border,
              backgroundColor: isHistoryMenuOpen ? theme.accent : 'transparent',
              color: isHistoryMenuOpen ? theme.bg : theme.accent,
            }}
            title={`Historial persistente en localStorage (${commandHistory.length} comandos guardados · Use ↑/↓ para recuperar)`}
          >
            <History className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{commandHistory.length}</span>
          </button>

          {isHistoryMenuOpen && (
            <div
              className="absolute right-0 bottom-full mb-2 w-80 max-h-64 border rounded-xs shadow-2xl z-50 flex flex-col font-mono text-[11px]"
              style={{
                backgroundColor: theme.cardBg,
                borderColor: theme.accent,
                color: theme.text,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="px-2.5 py-1.5 border-b flex items-center justify-between text-[10px] font-bold"
                style={{ borderColor: theme.border }}
              >
                <span className="flex items-center gap-1.5" style={{ color: theme.accent }}>
                  <History className="w-3 h-3" />
                  <span>HISTORIAL LOCALSTORAGE ({commandHistory.length})</span>
                </span>
                {commandHistory.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      soundEffects.playKeyClick();
                      clearPersistedCommandHistory();
                      setCommandHistory([]);
                      setHistoryIndex(-1);
                    }}
                    className="text-red-400 hover:underline cursor-pointer text-[9px]"
                    title="Vaciar historial persistente de localStorage"
                  >
                    [VACIAR]
                  </button>
                )}
              </div>

              <div className="overflow-y-auto flex-1 divide-y divide-white/5 p-1">
                {commandHistory.length === 0 ? (
                  <div className="py-4 text-center opacity-50 text-[10px]">
                    Sin comandos en localStorage.
                  </div>
                ) : (
                  [...commandHistory]
                    .map((cmd, idx) => ({ cmd, idx: idx + 1 }))
                    .reverse()
                    .map((item) => (
                      <div
                        key={`${item.idx}_${item.cmd}`}
                        className="flex items-center justify-between gap-2 px-2 py-1 hover:bg-white/10 rounded-xs group"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            soundEffects.playKeyClick();
                            setInputVal(item.cmd);
                            setIsHistoryMenuOpen(false);
                            focusInput();
                          }}
                          className="flex-1 text-left truncate cursor-pointer flex items-center gap-2"
                          title="Clic para cargar en el prompt"
                        >
                          <span className="opacity-40 text-[9px] w-5 shrink-0">#{item.idx}</span>
                          <span className="truncate font-semibold">{item.cmd}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            soundEffects.playExecute();
                            setIsHistoryMenuOpen(false);
                            onExecuteCommand(item.cmd);
                          }}
                          className="opacity-60 group-hover:opacity-100 hover:underline text-[9px] font-bold px-1 shrink-0 cursor-pointer"
                          style={{ color: theme.accent }}
                          title="Ejecutar inmediatamente"
                        >
                          [RUN]
                        </button>
                      </div>
                    ))
                )}
              </div>

              <div
                className="px-2.5 py-1 border-t text-[9px] opacity-60 flex items-center justify-between"
                style={{ borderColor: theme.border }}
              >
                <span>↑/↓: navegar en barra</span>
                <span>Persiste al recargar</span>
              </div>
            </div>
          )}
        </div>

        {/* Voice Input Button (Web Speech API) */}
        <button
          type="button"
          onClick={handleToggleVoice}
          className={`p-1.5 rounded-xs border transition-all cursor-pointer ml-1 flex items-center justify-center ${
            isListening
              ? 'bg-red-500/25 border-red-500 text-red-400 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.5)]'
              : 'hover:bg-white/10 opacity-75 hover:opacity-100'
          }`}
          style={{
            borderColor: isListening ? '#ef4444' : theme.border,
            color: isListening ? '#f87171' : theme.accent,
          }}
          title={
            isListening
              ? 'Detener dictado por voz (Escuchando...)'
              : 'Activar dictado por voz [Ctrl+M] (Web Speech API)'
          }
        >
          {isListening ? (
            <MicOff className="w-3.5 h-3.5 text-red-400" />
          ) : (
            <Mic className="w-3.5 h-3.5" />
          )}
        </button>

        <button
          type="submit"
          className="p-1 hover:opacity-80 cursor-pointer ml-1"
          style={{ color: theme.accent }}
          title="Ejecutar comando (Enter)"
        >
          <CornerDownLeft className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
};
