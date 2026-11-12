import React, { useState, useRef, useEffect, useCallback } from 'react';
import { NativeShellId, TerminalLogEntry, TerminalShellMode, ThemeConfig } from '../types';
import { soundEffects } from '../utils/soundEffects';
import { useI18n } from '../i18n';
import { BOOT_ASCII_COMPACT } from '../utils/bootBanner';
import { formatCompactAsciiManual } from '../utils/asciiManual';
import { getLatencyGlow } from '../utils/latencyGlow';
import { TerminalWebpageView } from './TerminalWebpageView';
import { RetroAssistantEyes } from './RetroAssistantEyes';
import { TerminalNotificationCard } from './TerminalNotificationCard';
import { ContextMenu, ContextMenuItem } from './ContextMenu';
import { PtyTerminalPane, type PtyTerminalHandle } from './PtyTerminalPane';
import {
  Download,
  Trash2,
  CornerDownLeft,
  HelpCircle,
  Folder,
  FileText,
  Play,
  Globe,
  History,
  Activity,
  Shield,
  FileSearch,
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
import {
  getNativeShellLabel,
  getNativeShellOptions,
  getNativeShellPlatform,
  getNativeShellPrompt,
} from '../utils/nativeShell';

/** Id of the newest page in the stream: only it may mount a live iframe */
const lastWebpageEntryId = (entries: TerminalLogEntry[]): string | undefined => {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    if (entries[i].type === 'webpage') return entries[i].id;
  }
  return undefined;
};

interface AutocompleteItem {
  value: string;
  label: string;
  kind: 'command' | 'file' | 'dir';
}

interface TerminalViewProps {
  /** Active tab id; the PTY session is bound to it so it survives tab switches. */
  tabId?: string;
  theme: ThemeConfig;
  logs: TerminalLogEntry[];
  onExecuteCommand: (cmd: string) => void;
  onClearLogs: () => void;
  onExportLogs: (format: 'json' | 'txt') => void;
  onOpenHelp?: () => void;
  onOpenFileExplorer?: () => void;
  currentPath?: string;
  fileSystem?: Record<string, VirtualFile[]>;
  onMountLocalFolder?: () => void;
  onMountWorkspace?: () => void;
  localMountToRestore?: {
    name: string;
    permission: 'granted' | 'prompt' | 'denied';
    restoring: boolean;
  } | null;
  onRestoreLocalMount?: () => void;
  onOpenMonitor?: () => void;
  onOpenSecurity?: () => void;
  onImportLocalFiles?: (files: { name: string; content: string; size: number }[], folderName?: string) => void;
  onDismissNotification?: (id: string) => void;
  /** "actual/total" for the footer hint */
  tabSummary?: string;
  /** Inline page frames in the stream (off when the web surface owns the real page) */
  allowInlineFrames?: boolean;
  /** Current network latency, shown under the boot sign */
  latencyMs?: number;
  /** TERMINUS uses the internal interpreter; the other values execute real local shells. */
  shellMode?: TerminalShellMode;
  nativeShellAvailable?: boolean;
  nativeShellCwd?: string;
  onSelectShellMode?: (mode: TerminalShellMode) => void;
  onExecuteShellCommand?: (cmd: string) => void;
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
  'theme retro',
  'theme retro-futurista',
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
  onExecuteCommand: (cmd: string) => void;
}> = ({ text, onExecuteCommand }) => {
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
  tabId,
  theme,
  logs,
  onExecuteCommand,
  onClearLogs,
  onExportLogs,
  onOpenHelp,
  onOpenFileExplorer,
  currentPath = '/home/user',
  fileSystem = {},
  onMountLocalFolder,
  onMountWorkspace,
  localMountToRestore,
  onRestoreLocalMount,
  onOpenMonitor,
  onOpenSecurity,
  onImportLocalFiles,
  onDismissNotification,
  tabSummary = '1/1',
  allowInlineFrames = true,
  latencyMs,
  shellMode = 'terminus',
  nativeShellAvailable = false,
  nativeShellCwd,
  onSelectShellMode,
  onExecuteShellCommand,
}) => {
  const nativeShellPlatform = getNativeShellPlatform();
  const shellOptions = getNativeShellOptions(nativeShellPlatform);
  const isNativeShellMode = shellMode !== 'terminus';
  const nativeShellLabel = getNativeShellLabel(shellMode, nativeShellPlatform);
  const promptSymbol = isNativeShellMode
    ? getNativeShellPrompt(shellMode, nativeShellPlatform, nativeShellCwd)
    : theme.promptSymbol;
  const latencyLabel =
    typeof latencyMs === 'number' && Number.isFinite(latencyMs) ? `${Math.round(latencyMs)} ms` : '—';
  const latencyGlow = getLatencyGlow(latencyMs);
  const glowStyle = {
    color: theme.accent,
    '--ascii-glow-color': latencyGlow.color,
  } as React.CSSProperties;

  // Interactive PTY: only the desktop bridge can host a real shell process.
  const [ptyFailed, setPtyFailed] = useState(false);
  const [ptyError, setPtyError] = useState('');
  const ptyBridgeAvailable =
    typeof window !== 'undefined' && Boolean(window.terminusPty?.available);
  const ptyEnabled = isNativeShellMode && ptyBridgeAvailable && Boolean(tabId) && !ptyFailed;

  const handlePtyUnavailable = useCallback((message: string) => {
    setPtyFailed(true);
    setPtyError(message);
  }, []);

  // A different shell or tab needs a fresh session, so drop the previous failure.
  useEffect(() => {
    setPtyFailed(false);
    setPtyError('');
  }, [shellMode, tabId]);

  const { t } = useI18n();
  const [inputVal, setInputVal] = useState('');
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [draftInput, setDraftInput] = useState<string>('');
  const [inputFocused, setInputFocused] = useState(false);
  const [inputCaretVisible, setInputCaretVisible] = useState(false);
  const [inputCaretLeft, setInputCaretLeft] = useState(0);

  const [commandHistory, setCommandHistory] = useState<string[]>(() => getPersistedCommandHistory());
  const [isHistoryMenuOpen, setIsHistoryMenuOpen] = useState(false);

  const [suggestions, setSuggestions] = useState<AutocompleteItem[]>([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState<number>(0);
  const isTabCyclingRef = useRef<boolean>(false);

  const [isQuickMenuOpen, setIsQuickMenuOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputMeasureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dirInputRef = useRef<HTMLInputElement>(null);
  const ptyRef = useRef<PtyTerminalHandle | null>(null);
  const quickMenuRef = useRef<HTMLDivElement>(null);
  const quickMenuBtnRef = useRef<HTMLButtonElement>(null);
  const [quickMenuPos, setQuickMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    selection: string;
  } | null>(null);
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
  const handleToggleVoice = useCallback((e?: React.MouseEvent) => {
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
  }, [isListening]);

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
  }, [handleToggleVoice]);

  // Auto-scroll to bottom on new log entries
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Keep focus in terminal input
  const focusInput = () => {
    inputRef.current?.focus();
  };

  // Measure the text before the insertion point so the steady cursor follows the caret
  const updateInputCaretPosition = () => {
    const input = inputRef.current;
    if (!input || document.activeElement !== input) {
      setInputFocused(false);
      setInputCaretVisible(false);
      return;
    }

    setInputFocused(true);
    const selectionStart = input.selectionStart ?? 0;
    const selectionEnd = input.selectionEnd ?? 0;
    if (selectionStart !== selectionEnd) {
      setInputCaretVisible(false);
      return;
    }

    const canvas = inputMeasureCanvasRef.current ?? document.createElement('canvas');
    inputMeasureCanvasRef.current = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      setInputCaretVisible(false);
      return;
    }

    const style = window.getComputedStyle(input);
    context.font = style.font || `${style.fontSize} ${style.fontFamily}`;
    const textBeforeCaret = input.value.slice(0, selectionStart);
    setInputCaretLeft(context.measureText(textBeforeCaret).width - input.scrollLeft);
    setInputCaretVisible(true);
  };

  // The terminal owns the prompt: focusing on mount also lets the cursor paint
  // before any user interaction.
  useEffect(() => {
    inputRef.current?.focus();
    updateInputCaretPosition();
  }, []);

  // Place cursor at the end of input when navigating history
  useEffect(() => {
    if (historyIndex !== -1 && inputRef.current) {
      const len = inputRef.current.value.length;
      inputRef.current.setSelectionRange(len, len);
    }
  }, [historyIndex]);

  // Reposition the steady cursor after value changes and history recall
  useEffect(() => {
    updateInputCaretPosition();
  }, [inputVal]);

  useEffect(() => {
    if (!inputFocused) return;
    const handleResize = () => updateInputCaretPosition();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [inputFocused]);

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

  const computeSuggestionsRef = useRef(computeSuggestions);
  computeSuggestionsRef.current = computeSuggestions;

  // Autocomplete matching on user typing
  useEffect(() => {
    if (isNativeShellMode) {
      setSuggestions([]);
      return;
    }
    if (isTabCyclingRef.current) {
      return;
    }
    const matches = computeSuggestionsRef.current(inputVal, false);
    setSuggestions(matches);
    setSelectedSuggestionIndex(0);
  }, [inputVal, currentPath, fileSystem, isNativeShellMode]);

  useEffect(() => {
    if (!isNativeShellMode) return;
    setSuggestions([]);
    setIsHistoryMenuOpen(false);
  }, [isNativeShellMode]);

  const runCommandFromPrompt = (cmd: string) => {
    if (isNativeShellMode && onExecuteShellCommand) {
      onExecuteShellCommand(cmd);
      return;
    }
    onExecuteCommand(cmd);
  };

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
    runCommandFromPrompt(cmd);
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
      if (isNativeShellMode) return;
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

  const copyText = async (value: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard access can be unavailable outside a secure context.
    }
  };

  const inputSelection = (() => {
    const input = inputRef.current;
    if (!input || input.selectionStart === input.selectionEnd) return '';
    return inputVal.slice(input.selectionStart ?? 0, input.selectionEnd ?? 0);
  })();

  const copyTerminalSelection = () => {
    const selected = contextMenu?.selection || inputSelection || logContainerRef.current?.innerText || '';
    void copyText(selected);
  };

  const selectTerminalLogs = () => {
    const node = logContainerRef.current;
    if (!node) return;
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  };

  const pasteIntoPrompt = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      const input = inputRef.current;
      const start = input?.selectionStart ?? inputVal.length;
      const end = input?.selectionEnd ?? inputVal.length;
      const next = `${inputVal.slice(0, start)}${text}${inputVal.slice(end)}`;
      setInputVal(next);
      requestAnimationFrame(() => {
        input?.focus();
        const caret = start + text.length;
        input?.setSelectionRange(caret, caret);
      });
    } catch {
      // Clipboard read can require permission; leave the prompt untouched.
    }
  };

  const extractTextToFile = (value: string, source: string) => {
    if (!value.trim()) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const blob = new Blob([value], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `terminus-${source}-${stamp}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const pasteIntoPty = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      ptyRef.current?.paste(text);
    } catch {
      // Clipboard read can require permission; leave the terminal untouched.
    }
  };

  const extractArchive = async () => {
    const api = window.terminusArchive;
    if (!api?.available) return;
    const selection = contextMenu?.selection.trim() ?? '';
    try {
      const result = await api.extract({
        defaultPath: selection || undefined,
        cwd: nativeShellCwd || undefined,
      });
      if (result.canceled) return;
      const message = result.ok
        ? `Extraído ${result.archivePath ?? 'archivo'} en ${result.destination ?? 'destino'}`
        : `No se pudo extraer: ${result.error ?? 'error desconocido'}`;
      if (ptyEnabled) ptyRef.current?.writeNotice(message);
      else onExecuteCommand(`echo "${message.replace(/"/g, "'")}"`);
    } catch (error) {
      const message = `No se pudo extraer: ${error instanceof Error ? error.message : String(error)}`;
      if (ptyEnabled) ptyRef.current?.writeNotice(message);
      else onExecuteCommand(`echo "${message.replace(/"/g, "'")}"`);
    }
  };

  const compressArchive = async () => {
    const api = window.terminusArchive;
    if (!api?.available) return;
    const selection = contextMenu?.selection.trim() ?? '';
    try {
      const result = await api.create({
        defaultPath: selection || undefined,
        cwd: nativeShellCwd || undefined,
      });
      if (result.canceled) return;
      const message = result.ok
        ? `Comprimido ${result.sourcePath ?? 'origen'} en ${result.destination ?? 'destino'}`
        : `No se pudo comprimir: ${result.error ?? 'error desconocido'}`;
      if (ptyEnabled) ptyRef.current?.writeNotice(message);
      else onExecuteCommand(`echo "${message.replace(/"/g, "'")}"`);
    } catch (error) {
      const message = `No se pudo comprimir: ${error instanceof Error ? error.message : String(error)}`;
      if (ptyEnabled) ptyRef.current?.writeNotice(message);
      else onExecuteCommand(`echo "${message.replace(/"/g, "'")}"`);
    }
  };

  const openContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    setIsHistoryMenuOpen(false);
    setIsQuickMenuOpen(false);
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      selection: ptyEnabled ? ptyRef.current?.getSelection() ?? '' : window.getSelection()?.toString() ?? '',
    });
  };

  const terminalPath = isNativeShellMode ? nativeShellCwd || currentPath : currentPath;
  const emulatedMenuItems: ContextMenuItem[] = [
    {
      id: 'copy-selection',
      label: t('menu.copySelection'),
      hint: 'Ctrl+Shift+C',
      disabled: !contextMenu?.selection && !inputSelection,
      onSelect: copyTerminalSelection,
    },
    {
      id: 'copy-output',
      label: t('menu.copyOutput'),
      disabled: logs.length === 0,
      onSelect: () => void copyText(logContainerRef.current?.innerText ?? ''),
    },
    {
      id: 'extract-output',
      label: t('menu.extractOutput'),
      hint: 'TXT',
      disabled: !contextMenu?.selection && !inputSelection && logs.length === 0,
      onSelect: () =>
        extractTextToFile(
          contextMenu?.selection || inputSelection || logContainerRef.current?.innerText || '',
          'terminal',
        ),
    },
    {
      id: 'extract-archive',
      label: t('menu.extractArchive'),
      hint: 'ZIP/TAR',
      disabled: !window.terminusArchive?.available,
      onSelect: () => void extractArchive(),
    },
    {
      id: 'compress-archive',
      label: t('menu.compressArchive'),
      hint: 'ZIP/TAR',
      disabled: !window.terminusArchive?.available,
      onSelect: () => void compressArchive(),
    },
    { id: 'paste', label: t('menu.pastePrompt'), hint: 'Ctrl+V', onSelect: () => void pasteIntoPrompt() },
    {
      id: 'copy-path',
      label: t('menu.copyPath'),
      disabled: !terminalPath,
      separatorBefore: true,
      onSelect: () => void copyText(terminalPath),
    },
    {
      id: 'select-all',
      label: t('menu.selectOutput'),
      disabled: logs.length === 0,
      onSelect: selectTerminalLogs,
    },
    {
      id: 'clear',
      label: t('menu.clear'),
      hint: 'clear',
      disabled: logs.length === 0,
      onSelect: onClearLogs,
    },
    {
      id: 'help',
      label: t('menu.openHelp'),
      disabled: !onOpenHelp,
      separatorBefore: true,
      onSelect: () => onOpenHelp?.(),
    },
    {
      id: 'files',
      label: t('menu.openFiles'),
      disabled: !onOpenFileExplorer,
      onSelect: () => onOpenFileExplorer?.(),
    },
  ];

  const ptyMenuItems: ContextMenuItem[] = [
    {
      id: 'pty-copy-selection',
      label: t('menu.copySelection'),
      hint: 'Ctrl+Shift+C',
      disabled: !contextMenu?.selection,
      onSelect: () => void copyText(ptyRef.current?.getSelection() ?? ''),
    },
    {
      id: 'pty-copy-output',
      label: t('menu.copyOutput'),
      onSelect: () => void copyText(ptyRef.current?.getBufferText() ?? ''),
    },
    {
      id: 'pty-extract',
      label: t('menu.extractOutput'),
      hint: 'TXT',
      onSelect: () => {
        const text = ptyRef.current?.getSelection() || ptyRef.current?.getBufferText() || '';
        extractTextToFile(text, 'pty');
      },
    },
    {
      id: 'pty-extract-archive',
      label: t('menu.extractArchive'),
      hint: 'ZIP/TAR',
      disabled: !window.terminusArchive?.available,
      onSelect: () => void extractArchive(),
    },
    {
      id: 'pty-compress-archive',
      label: t('menu.compressArchive'),
      hint: 'ZIP/TAR',
      disabled: !window.terminusArchive?.available,
      onSelect: () => void compressArchive(),
    },
    { id: 'pty-paste', label: t('menu.paste'), hint: 'Ctrl+Shift+V', onSelect: () => void pasteIntoPty() },
    {
      id: 'pty-copy-path',
      label: t('menu.copyPath'),
      disabled: !terminalPath,
      separatorBefore: true,
      onSelect: () => void copyText(terminalPath),
    },
    { id: 'pty-select-all', label: t('menu.selectAll'), onSelect: () => ptyRef.current?.selectAll() },
    { id: 'pty-clear', label: t('menu.clear'), onSelect: () => ptyRef.current?.clear() },
    {
      id: 'pty-help',
      label: t('menu.openHelp'),
      disabled: !onOpenHelp,
      separatorBefore: true,
      onSelect: () => onOpenHelp?.(),
    },
    {
      id: 'pty-files',
      label: t('menu.openFiles'),
      disabled: !onOpenFileExplorer,
      onSelect: () => onOpenFileExplorer?.(),
    },
  ];

  const terminalMenuItems = ptyEnabled ? ptyMenuItems : emulatedMenuItems;

  return (
    <div
      onClick={ptyEnabled ? undefined : focusInput}
      onContextMenu={openContextMenu}
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
            <span>{t('terminal.consoleTitle')}</span>
          </span>
          <span className="text-[10px] opacity-60 hidden sm:inline">
            {isNativeShellMode ? t('terminal.hintNative') : t('terminal.hintEmulated')}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          {/* Shell selector: TERMINUS is the internal interpreter; the rest run real local shells. */}
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[9px] opacity-50">{t('terminal.shellLabel')}</span>
            <select
              value={shellMode}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => onSelectShellMode?.(event.target.value as TerminalShellMode)}
              className="px-1.5 py-0.5 text-[10px] font-bold border rounded-xs cursor-pointer focus:outline-hidden"
              style={{
                backgroundColor: isNativeShellMode ? 'rgba(245, 158, 11, 0.16)' : theme.bg,
                borderColor: isNativeShellMode ? '#f59e0b' : theme.border,
                color: isNativeShellMode ? '#fbbf24' : theme.accent,
              }}
              title={
                nativeShellAvailable
                  ? ptyBridgeAvailable
                    ? t('terminal.shellTitleNative')
                    : t('terminal.shellTitleNativeNoPty')
                  : t('terminal.shellTitleWeb')
              }
              aria-label={t('terminal.shellAria')}
            >
              {shellOptions.map((option) => (
                <option
                  key={option.id}
                  value={option.id}
                  disabled={option.id !== 'terminus' && !nativeShellAvailable}
                  title={option.title}
                >
                  {option.label}
                </option>
              ))}
            </select>
          </div>

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
              title={t('terminal.quickMenuTitle')}
            >
              <Zap className="w-3 h-3 text-amber-400" />
              <span>{t('terminal.quickMenu')}</span>
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
                    <span>{t('terminal.quickHeading')}</span>
                  </span>
                  <span className="text-[9px] opacity-40">[ESC]</span>
                </div>

                <div className="py-1 space-y-0.5">
                  <button
                    onClick={() => {
                      soundEffects.playKeyClick();
                      setIsQuickMenuOpen(false);
                      runCommandFromPrompt(
                        shellMode === 'cmd'
                          ? 'dir'
                          : shellMode === 'powershell'
                            ? 'Get-ChildItem'
                            : 'ls'
                      );
                    }}
                    className="w-full flex items-center gap-2 px-2 py-1 rounded-xs hover:bg-white/10 cursor-pointer text-left text-slate-200 hover:text-white"
                  >
                    <Folder className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="font-semibold text-[11px]">{t('terminal.quickList')}</span>
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
                    <span className="font-semibold text-[11px]">{t('terminal.quickWorkspace')}</span>
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
                    <span className="font-semibold text-[11px]">{t('terminal.quickNews')}</span>
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
                    <span className="font-semibold text-[11px]">{t('terminal.quickPython')}</span>
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
                      <span className="font-semibold text-[11px]">{t('terminal.quickFiles')}</span>
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
                      <span className="font-semibold text-[11px]">{t('terminal.quickMonitor')}</span>
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
                      <span className="font-semibold text-[11px]">{t('terminal.quickVault')}</span>
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
                    <span className="font-semibold text-[11px]">{t('terminal.quickVoice')}</span>
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
                    <span className="font-semibold text-[11px]">{t('terminal.quickLogsJson')}</span>
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
                    <span className="font-semibold text-[11px]">{t('terminal.quickLogsTxt')}</span>
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
                    <span className="font-semibold text-[11px]">{t('terminal.quickNotify')}</span>
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
              title={t('terminal.helpTitle')}
            >
              <HelpCircle className="w-3 h-3" />
              <span>{t('terminal.help')}</span>
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
            title={t('terminal.clearTitle')}
          >
            <Trash2 className="w-3 h-3" />
          </button>

        </div>
      </div>

      {isNativeShellMode && (
        <div
          className="px-3 py-1.5 border-b flex flex-wrap items-center justify-between gap-2 text-[10px] select-none font-mono shrink-0"
          style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="opacity-50">{t('terminal.shellLabel')}:</span>
            <span className="font-bold" style={{ color: '#fbbf24' }}>{nativeShellLabel}</span>
            <span className="opacity-40">·</span>
            <span className="opacity-50">{t('terminal.cwd')}</span>
            <span
              className="font-bold truncate max-w-[44ch]"
              style={{ color: '#fbbf24' }}
              title={nativeShellCwd || 'workspace'}
            >
              {nativeShellCwd || 'workspace'}
            </span>
            <span className="opacity-40">·</span>
            <span className="opacity-60">cd &lt;ruta&gt; · cd ~</span>
          </div>
          <span className="text-[9px] opacity-50">
            {ptyEnabled
              ? t('terminal.ptyInteractive')
              : ptyFailed
                ? t('terminal.nonInteractivePersist')
                : t('terminal.nonInteractive')}
          </span>
        </div>
      )}

      {/* Terminal Location Bar (Clean Clickable Monospace Text) */}
      <div
        className="px-3 py-1.5 border-b flex items-center justify-between gap-2 text-[11px] select-none font-mono shrink-0"
        style={{
          display: isNativeShellMode ? 'none' : undefined,
          backgroundColor: theme.cardBg,
          borderColor: theme.border,
        }}
      >
        {/* Clickable breadcrumbs */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="opacity-50">{t('terminal.dir')}</span>
          <span
            onClick={(e) => {
              e.stopPropagation();
              soundEffects.playKeyClick();
              onExecuteCommand('cd /');
            }}
            className="cursor-pointer hover:underline font-bold text-amber-400"
            title={t('terminal.rootTitle')}
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
                  title={t('terminal.branchTitle', { path: subPath })}
                >
                  {part}
                </span>
              </React.Fragment>
            );
          })}
        </div>

        {/* Minimal text-based mount & system triggers */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-mono">
          <span
            onClick={(e) => {
              e.stopPropagation();
              soundEffects.playKeyClick();
              if (onMountLocalFolder) onMountLocalFolder();
              else onExecuteCommand('fs mount');
            }}
            className="cursor-pointer hover:underline text-amber-400 font-semibold"
            title={t('terminal.mountTitle')}
          >
            {t('terminal.mount')}
          </span>

          <span
            onClick={(e) => {
              e.stopPropagation();
              soundEffects.playKeyClick();
              fileInputRef.current?.click();
            }}
            className="cursor-pointer hover:underline opacity-80 hover:opacity-100"
            title={t('terminal.loadFilesTitle')}
          >
            {t('terminal.loadFiles')}
          </span>

          <span
            onClick={(e) => {
              e.stopPropagation();
              soundEffects.playKeyClick();
              if (onMountWorkspace) onMountWorkspace();
              else onExecuteCommand('fs workspace');
            }}
            className="cursor-pointer hover:underline text-cyan-400 font-semibold"
            title={t('terminal.workspaceTitle')}
          >
            {t('terminal.workspace')}
          </span>

          {localMountToRestore && localMountToRestore.permission !== 'granted' && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                if (localMountToRestore.permission === 'prompt' && !localMountToRestore.restoring) {
                  onRestoreLocalMount?.();
                }
              }}
              disabled={
                localMountToRestore.permission !== 'prompt' ||
                localMountToRestore.restoring ||
                !onRestoreLocalMount
              }
              className="max-w-[240px] truncate border-0 bg-transparent p-0 font-mono text-[10px] font-semibold text-amber-300 cursor-pointer hover:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline"
              title={
                localMountToRestore.permission === 'denied'
                  ? t('terminal.restoreDeniedTitle', { name: localMountToRestore.name })
                  : t('terminal.restoreRenewTitle', { name: localMountToRestore.name })
              }
            >
              {localMountToRestore.restoring
                ? t('terminal.restoring', { name: localMountToRestore.name })
                : localMountToRestore.permission === 'denied'
                ? t('terminal.permissionDenied', { name: localMountToRestore.name })
                : t('terminal.restore', { name: localMountToRestore.name })}
            </button>
          )}
        </div>
      </div>

      {/* Real interactive shell: the PTY lives in the Electron main process. */}
      {ptyEnabled && tabId && (
        <div className="min-h-0 flex-1">
          <PtyTerminalPane
            ref={ptyRef}
            tabId={tabId}
            shell={shellMode as NativeShellId}
            cwd={nativeShellCwd}
            theme={theme}
            onUnavailable={handlePtyUnavailable}
          />
        </div>
      )}

      {isNativeShellMode && ptyFailed && (
        <div
          className="px-3 py-1.5 border-b flex items-center justify-between gap-2 text-[10px] font-mono shrink-0"
          style={{ backgroundColor: 'rgba(127, 29, 29, 0.35)', borderColor: '#ef4444', color: '#fca5a5' }}
        >
          <span className="truncate" title={ptyError}>
            [PTY] {ptyError || t('terminal.ptyError')}
          </span>
          <span className="opacity-75 shrink-0">{t('terminal.nonInteractiveActive')}</span>
        </div>
      )}

      {/* Terminal Logs Output Scrollback */}
      <div
        ref={logContainerRef}
        className="flex-1 p-3 overflow-y-auto space-y-2 selection:bg-emerald-500/30"
        style={{ display: ptyEnabled ? 'none' : undefined }}
      >
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
                title={t('terminal.commandReloadTitle')}
              >
                <span style={{ color: theme.accent }} className="shrink-0 select-none">
                  {isNativeShellMode
                    ? getNativeShellPrompt(shellMode, nativeShellPlatform, log.cwd || nativeShellCwd)
                    : theme.promptSymbol}
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
                  onDismiss={onDismissNotification}
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
                <ClickableTerminalText text={log.output} onExecuteCommand={onExecuteCommand} />
                {/* Clickable files attached to system event - clean monospace text */}
                {log.interactiveFiles && log.interactiveFiles.length > 0 && (
                  <div className="pt-1.5 font-mono text-[11px]">
                    <div className="opacity-50 text-[10px] mb-1">
                      {t('terminal.contentHint')}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1">
                      {log.interactiveFiles.map((file, fileIndex) => {
                        const isDir = file.type === 'dir';
                        return (
                          <button
                            key={file.name}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              soundEffects.playKeyClick();
                              onExecuteCommand(file.action);
                            }}
                            className="group flex w-full items-center gap-2 cursor-pointer py-0.5 text-left touch-manipulation"
                            title={t('terminal.fileRunTitle', { action: file.action })}
                          >
                            <span className="shrink-0 opacity-40">{String(fileIndex + 1).padStart(2, '0')}</span>
                            <span className={`shrink-0 font-bold ${isDir ? 'text-amber-400' : 'text-emerald-400'}`}>
                              {isDir ? '[DIR] ' : '[FILE]'}
                            </span>
                            <span className="truncate group-hover:underline text-slate-200 group-hover:text-white">
                              {file.name}{isDir ? '/' : ''}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          }

          if (log.type === 'ascii') {
            // Only the boot sign swaps to the compact variant; manual/category blocks keep their readable size.
            const isBootSign = log.output.includes('NAVEGADOR WEB BASADO EN LÍNEA DE COMANDOS');
            if (isBootSign) {
              return (
                <div key={log.id} className="ascii-boot opacity-90" style={glowStyle}>
                  <pre
                    className="ascii-sign ascii-sign-wide font-mono select-none"
                    aria-hidden="true"
                    data-text={log.output}
                  >
                    {log.output}
                  </pre>
                  <pre
                    className="ascii-sign ascii-sign-compact font-mono select-none"
                    aria-hidden="true"
                    data-text={BOOT_ASCII_COMPACT}
                  >
                    {BOOT_ASCII_COMPACT}
                  </pre>
                  <div
                    className="ascii-latency"
                    title={`Latencia de red actual: ${latencyLabel}`}
                  >
                    <span className="ascii-latency-dot" aria-hidden="true" />
                    <span>[ LATENCIA {latencyLabel} ]</span>
                  </div>
                </div>
              );
            }
            const isManual = log.output.includes('MANUAL DE COMANDOS');
            if (isManual) {
              const compactManual = formatCompactAsciiManual(log.output);
              return (
                <div key={log.id} className="ascii-manual-block">
                  <pre
                    className="ascii-manual ascii-manual-wide mx-auto w-fit max-w-full font-mono text-[10px] leading-tight select-none opacity-90 overflow-x-auto"
                    style={{ color: theme.accent }}
                    aria-label={t('terminal.manualAria')}
                  >
                    {log.output}
                  </pre>
                  <pre
                    className="ascii-manual ascii-manual-compact mx-auto w-fit max-w-full font-mono text-[10px] leading-tight select-none opacity-90"
                    style={{ color: theme.accent }}
                    aria-label={t('terminal.manualMobileAria')}
                  >
                    {compactManual}
                  </pre>
                </div>
              );
            }
            return (
              <pre
                key={log.id}
                className="mx-auto w-fit max-w-full font-mono text-[10px] leading-tight select-none opacity-90 overflow-x-auto"
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
                  isLatest={allowInlineFrames && log.id === lastWebpageEntryId(logs)}
                  onNavigate={(url) => onExecuteCommand(`goto ${url}`)}
                />
              </div>
            );
          }

          // Standard output with tactile clickable links and files
          return (
            <div key={log.id} className="pl-4 space-y-1.5 leading-relaxed opacity-95">
              {log.output && (
                <ClickableTerminalText text={log.output} onExecuteCommand={onExecuteCommand} />
              )}

              {/* Interactive Clickable Files & Directories Strip - clean monospace text */}
              {log.interactiveFiles && log.interactiveFiles.length > 0 && (
                <div className="pt-1.5 font-mono text-[11px]">
                  <div className="opacity-50 text-[10px] mb-1">
                    {t('terminal.contentHint')}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1">
                    {log.interactiveFiles.map((file, fileIndex) => {
                      const isDir = file.type === 'dir';
                      return (
                        <button
                          key={file.name}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            soundEffects.playKeyClick();
                            onExecuteCommand(file.action);
                          }}
                          className="group flex w-full items-center gap-2 cursor-pointer py-0.5 text-left touch-manipulation"
                          title={t('terminal.fileRunTitle', { action: file.action })}
                        >
                          <span className="shrink-0 opacity-40">{String(fileIndex + 1).padStart(2, '0')}</span>
                          <span className={`shrink-0 font-bold ${isDir ? 'text-amber-400' : 'text-emerald-400'}`}>
                            {isDir ? '[DIR] ' : '[FILE]'}
                          </span>
                          <span className="truncate group-hover:underline text-slate-200 group-hover:text-white">
                            {file.name}{isDir ? '/' : ''}
                          </span>
                        </button>
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
          <span className="opacity-60 font-bold shrink-0">{t('terminal.autocompleteHeading')}</span>
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
                title={t('terminal.autocompleteTitle', { value: sug.value })}
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
            {t('terminal.autocompleteCycling')}
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
            <span>TERMINUS</span>
          </span>
          <span className="opacity-50 hidden sm:inline truncate">
            {isNativeShellMode
              ? ptyEnabled
                ? t('terminal.assistantNativePty', { shell: nativeShellLabel })
                : t('terminal.assistantNative', { shell: nativeShellLabel })
              : t('terminal.assistantEmulated', { tab: tabSummary })}
          </span>
        </div>

        {/* Pair of retro CRT eyes personal assistant on the right */}
        <div className="ml-auto flex items-center pl-2">
          <RetroAssistantEyes
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
                <span>{t('terminal.voiceRecording')}</span>
              </span>
              <span className="opacity-60 hidden sm:inline">{t('terminal.voiceSpeak')}</span>
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
                {t('terminal.voiceCancel')}
              </button>
            </div>
          </div>

          {/* Transcribed text with retro phosphor aesthetic */}
          <div className="flex items-center gap-2 pt-0.5 min-h-[22px]">
            <span className="text-amber-400 font-bold shrink-0 text-xs">{t('terminal.voicePrompt')}</span>
            <span className="font-mono text-xs text-emerald-300 font-semibold truncate flex-1">
              {voiceInterim || voiceFinal || (
                <span className="opacity-40 italic">{t('terminal.voiceListening')}</span>
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
            <span>{t('terminal.voiceError', { error: voiceError })}</span>
          </div>
          <button
            onClick={() => setVoiceError(null)}
            className="text-[10px] hover:underline cursor-pointer opacity-80 hover:opacity-100"
          >
            {t('terminal.voiceDismiss')}
          </button>
        </div>
      )}

      {/* Command Input Bar */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center px-3 py-2 border-t select-none shrink-0 relative"
        style={{
          display: ptyEnabled ? 'none' : undefined,
          backgroundColor: theme.cardBg,
          borderColor: theme.border,
        }}
      >
        <span
          className="font-bold mr-2 max-w-[52vw] truncate text-xs select-none sm:max-w-[46ch]"
          style={{ color: isNativeShellMode ? '#fbbf24' : theme.accent }}
          title={
            isNativeShellMode
              ? t('terminal.promptShellTitle', { shell: nativeShellLabel, cwd: nativeShellCwd || 'workspace' })
              : t('terminal.promptInternalTitle')
          }
        >
          {promptSymbol}
        </span>

        {historyIndex !== -1 && commandHistory.length > 0 && (
          <span
            className="mr-2 px-1.5 py-0.5 text-[9px] font-bold border rounded-xs shrink-0"
            style={{
              borderColor: theme.accent,
              color: theme.accent,
              backgroundColor: theme.bg,
            }}
            title={t('terminal.historyNavigating')}
          >
            HIST {historyIndex + 1}/{commandHistory.length}
          </span>
        )}

        <div className="relative min-w-0 flex-1 overflow-hidden">
          <input
            ref={inputRef}
            type="text"
            value={inputVal}
            onChange={(e) => {
              isTabCyclingRef.current = false;
              setInputVal(e.target.value);
              updateInputCaretPosition();
            }}
            onKeyDown={handleKeyDown}
            onKeyUp={updateInputCaretPosition}
            onClick={updateInputCaretPosition}
            onSelect={updateInputCaretPosition}
            onScroll={updateInputCaretPosition}
            onFocus={updateInputCaretPosition}
            onBlur={() => {
              setInputFocused(false);
              setInputCaretVisible(false);
            }}
            autoFocus
            placeholder={
              isNativeShellMode
                ? t('terminal.inputNativePlaceholder', { shell: nativeShellLabel })
                : t('terminal.inputPlaceholder')
            }
            className="w-full min-w-0 bg-transparent border-0 p-0 outline-hidden font-mono text-xs focus:ring-0 placeholder:opacity-45"
            style={{ color: theme.text, caretColor: 'transparent' }}
          />
          {inputFocused && inputCaretVisible && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 h-3.5 w-[2px] -translate-y-1/2 rounded-xs"
              style={{
                left: `${inputCaretLeft}px`,
                backgroundColor: theme.cursorColor || theme.accent,
                boxShadow: `0 0 5px ${theme.cursorColor || theme.accent}`,
              }}
            />
          )}
        </div>

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
            title={t('terminal.historyTitle', { n: commandHistory.length })}
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
                  <span>{t('terminal.historyHeading', { n: commandHistory.length })}</span>
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
                    title={t('terminal.historyClearTitle')}
                  >
                    {t('terminal.historyClear')}
                  </button>
                )}
              </div>

              <div className="overflow-y-auto flex-1 divide-y divide-white/5 p-1">
                {commandHistory.length === 0 ? (
                  <div className="py-4 text-center opacity-50 text-[10px]">
                    {t('terminal.historyEmpty')}
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
                          title={t('terminal.historyLoadTitle')}
                        >
                          <span className="opacity-40 text-[9px] w-5 shrink-0">#{item.idx}</span>
                          <span className="truncate font-semibold">{item.cmd}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            soundEffects.playExecute();
                            setIsHistoryMenuOpen(false);
                            runCommandFromPrompt(item.cmd);
                          }}
                          className="opacity-60 group-hover:opacity-100 hover:underline text-[9px] font-bold px-1 shrink-0 cursor-pointer"
                          style={{ color: theme.accent }}
                          title={t('terminal.historyRunTitle')}
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
                <span>{t('terminal.historyFooterKeys')}</span>
                <span>{t('terminal.historyFooterPersist')}</span>
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
          title={isListening ? t('terminal.voiceStopTitle') : t('terminal.voiceStartTitle')}
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
          title={t('terminal.runTitle')}
        >
          <CornerDownLeft className="w-3.5 h-3.5" />
        </button>
      </form>

      {contextMenu && (
        <ContextMenu
          theme={theme}
          x={contextMenu.x}
          y={contextMenu.y}
          title={
            isNativeShellMode
              ? t('terminal.menuTitleShell', { shell: nativeShellLabel })
              : t('terminal.menuTitleInternal')
          }
          items={terminalMenuItems}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
};
