import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bookmark, BrowserTab, PageMode, ThemeConfig } from '../types';
import { soundEffects } from '../utils/soundEffects';
import { BOOT_ASCII, BOOT_ASCII_COMPACT } from '../utils/bootBanner';
import { getLatencyGlow } from '../utils/latencyGlow';
import { expectedFrameMessageOrigin, isTrustedFrameMessage } from '../utils/frameMessageSecurity';
import { RetroAssistantEyes } from './RetroAssistantEyes';
import {
  HISTORY_STORAGE_KEY,
  HISTORY_SYNC_EVENT,
  getPersistedCommandHistory,
} from '../utils/commandHistoryStorage';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark as BookmarkIcon,
  ChevronDown,
  ChevronUp,
  Clock3,
  Download,
  Globe2,
  Home,
  Loader2,
  Minus,
  Plus,
  RotateCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Star,
  X,
} from 'lucide-react';
import { TerminusSearchPage } from './TerminusSearchPage';
import { getTerminusSearchQuery, isTerminusSearchUrl } from '../utils/terminusSearch';
import { isPrivateTargetUrl } from '../utils/networkPolicy';
import { ContextMenu, ContextMenuItem } from './ContextMenu';

/** App forwards the standard Ctrl/Cmd+L browser shortcut through this event. */
export const FOCUS_ADDRESS_EVENT = 'termbrowser:focus-address';

interface WebBrowserSurfaceProps {
  theme: ThemeConfig;
  tab?: BrowserTab;
  onCommand: (cmd: string) => void;
  bookmarks: Bookmark[];
  onAddBookmark: (title: string, url: string) => void;
  onRemoveBookmark: (id: string) => void;
  onSetViewMode: (mode: PageMode) => void;
  /** URLs from the browser-wide history, merged into address suggestions. */
  globalHistory?: string[];
  /** Clear the browser-wide history from the compact history panel. */
  onClearHistory?: () => void;
  /** Persist this tab's page zoom. */
  onSetZoom?: (zoom: number) => void;
  latencyMs?: number;
}

const sameUrl = (a: string, b: string) => a.replace(/\/+$/, '') === b.replace(/\/+$/, '');

const PAGE_MODES: { id: PageMode; label: string; title: string }[] = [
  { id: 'real', label: 'REAL', title: 'Página real, tal como la sirve el sitio' },
  { id: 'dark', label: 'OSCURO', title: 'Misma página con el tema retro oscuro inyectado (vía proxy)' },
  { id: 'text', label: 'TEXTO', title: 'Solo el texto legible de la página, sin maquetación' },
];

const MODE_STORAGE_KEY = 'termbrowser.page-mode';

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
};

const loadModeMap = (): Record<string, PageMode> => {
  try {
    const raw = localStorage.getItem(MODE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const saveModeMap = (map: Record<string, PageMode>): void => {
  try {
    localStorage.setItem(MODE_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Storage unavailable: the choice still applies to this page for the session
  }
};

const rememberMode = (host: string, mode: PageMode): void => {
  if (!host) return;
  saveModeMap({ ...loadModeMap(), [host]: mode });
};

const MODE_LABELS: Record<PageMode, string> = { real: 'real', dark: 'oscuro', text: 'texto' };

const START_LINKS = [
  { label: 'Wikipedia', url: 'https://es.wikipedia.org/wiki/Wikipedia:Portada' },
  { label: 'Hacker News', url: 'https://news.ycombinator.com' },
  { label: 'MDN', url: 'https://developer.mozilla.org/es/' },
  { label: 'Example', url: 'https://example.com' },
];

interface WebCommandOption {
  command: string;
  label: string;
  hint: string;
  needsValue?: boolean;
}

/** Mouse-friendly shortcuts for the commands a web session needs most often. */
const WEB_COMMAND_OPTIONS: WebCommandOption[] = [
  { command: 'goto ', label: 'Ir a una dirección', hint: 'goto https://…', needsValue: true },
  { command: 'search ', label: 'Buscar en Terminus Search', hint: 'search términos', needsValue: true },
  { command: 'home', label: 'Página de inicio', hint: 'home' },
  { command: 'back', label: 'Atrás', hint: 'back' },
  { command: 'forward', label: 'Adelante', hint: 'forward' },
  { command: 'reload', label: 'Recargar', hint: 'reload' },
  { command: 'tab new', label: 'Nueva pestaña', hint: 'tab new' },
  { command: 'reader', label: 'Modo lectura', hint: 'reader' },
  { command: 'help', label: 'Manual de comandos', hint: 'help' },
  { command: 'top', label: 'Monitor de recursos', hint: 'top' },
];

interface AddressSuggestion {
  kind: 'search' | 'bookmark' | 'history';
  label: string;
  detail: string;
  command: string;
}

type ConnectionKind = 'secure' | 'insecure' | 'internal' | 'local' | 'none';

const hostLabel = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return url;
  }
};

const getConnectionState = (url: string): { kind: ConnectionKind; label: string } => {
  if (!url) return { kind: 'none', label: 'Sin página cargada' };
  if (/^https:\/\//i.test(url)) return { kind: 'secure', label: 'HTTPS · conexión cifrada' };
  if (/^http:\/\//i.test(url)) return { kind: 'insecure', label: 'HTTP · conexión sin cifrar' };
  if (isTerminusSearchUrl(url)) return { kind: 'internal', label: 'Página interna de Terminus' };
  return { kind: 'local', label: 'Página local' };
};

/** Bookmarks and visited URLs turn the address bar into a browser-style suggestion list. */
const buildAddressSuggestions = (
  raw: string,
  bookmarks: Bookmark[],
  history: string[],
  globalHistory: string[] = []
): AddressSuggestion[] => {
  const query = raw.trim();
  if (!query) return [];

  const lower = query.toLowerCase();
  const suggestions: AddressSuggestion[] = [];
  const seen = new Set<string>();
  const push = (suggestion: AddressSuggestion) => {
    const key = `${suggestion.kind}:${suggestion.command}`;
    if (seen.has(key)) return;
    seen.add(key);
    suggestions.push(suggestion);
  };

  const looksLikeCommand = /^(goto|browse|open|web|lynx|search|buscar|google|ddg|reader|home|help|tab|history|theme|sound)\b/i.test(query);
  const looksLikeUrl = /^(?:[a-z][a-z0-9+.-]*:\/\/|localhost(?::\d+)?(?:[/?#]|$)|(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?(?:[/?#]|$)|[^\s/]+\.[a-z]{2,}(?:[/?#]|$))/i.test(query);

  if (!looksLikeCommand && !looksLikeUrl) {
    push({
      kind: 'search',
      label: `Buscar “${query}”`,
      detail: 'Terminus Search',
      command: `search ${query}`,
    });
  }

  for (const bookmark of bookmarks) {
    if (!/^https?:\/\//i.test(bookmark.url)) continue;
    if (lower && !`${bookmark.title} ${bookmark.url}`.toLowerCase().includes(lower)) continue;
    push({
      kind: 'bookmark',
      label: bookmark.title || bookmark.url,
      detail: `Marcador · ${hostLabel(bookmark.url)}`,
      command: `goto ${bookmark.url}`,
    });
    if (suggestions.length >= 6) return suggestions;
  }

  for (const url of [...new Set([...history, ...globalHistory])].reverse()) {
    if (!/^https?:\/\//i.test(url)) continue;
    if (lower && !url.toLowerCase().includes(lower)) continue;
    push({
      kind: 'history',
      label: url.replace(/^https?:\/\//i, ''),
      detail: `Historial · ${hostLabel(url)}`,
      command: `goto ${url}`,
    });
    if (suggestions.length >= 6) break;
  }

  return suggestions.slice(0, 6);
};

/**
 * A normal browser surface: address bar for URLs or searches, history controls and the
 * active tab's page at full size. Pages that forbid framing are served via /api/view.
 */
export const WebBrowserSurface: React.FC<WebBrowserSurfaceProps> = ({
  theme,
  tab,
  onCommand,
  bookmarks,
  onAddBookmark,
  onRemoveBookmark,
  onSetViewMode,
  globalHistory = [],
  onClearHistory,
  onSetZoom,
  latencyMs,
}) => {
  const latencyLabel =
    typeof latencyMs === 'number' && Number.isFinite(latencyMs) ? `${Math.round(latencyMs)} ms` : '—';
  const latencyGlow = getLatencyGlow(latencyMs);
  const glowStyle = {
    color: theme.accent,
    '--ascii-glow-color': latencyGlow.color,
  } as React.CSSProperties;
  const [address, setAddress] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>(() => getPersistedCommandHistory());
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [draftCommand, setDraftCommand] = useState('');
  const [mode, setMode] = useState<PageMode>('dark');
  const [savedModes, setSavedModes] = useState<Record<string, PageMode>>(() => loadModeMap());
  const [savedOpen, setSavedOpen] = useState(false);
  const [commandsOpen, setCommandsOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    linkURL?: string;
    selectionText?: string;
  } | null>(null);
  const addressInputRef = useRef<HTMLInputElement>(null);
  const measureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [inputFocused, setInputFocused] = useState(false);
  const [caretVisible, setCaretVisible] = useState(false);
  const [caretLeft, setCaretLeft] = useState(0);
  const [pendingCaret, setPendingCaret] = useState<number | null>(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(-1);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [findStatus, setFindStatus] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [localZoom, setLocalZoom] = useState(1);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const addressSuggestions = buildAddressSuggestions(address, bookmarks, tab?.history ?? [], globalHistory);
  const zoom = Math.min(2, Math.max(0.5, tab?.zoom ?? localZoom));

  // Measure the text before the insertion point so the blinking cursor follows the caret
  const updateCaretPosition = () => {
    const input = addressInputRef.current;
    if (!input || document.activeElement !== input) {
      setInputFocused(false);
      setCaretVisible(false);
      return;
    }

    setInputFocused(true);
    const selectionStart = input.selectionStart ?? 0;
    const selectionEnd = input.selectionEnd ?? 0;
    if (selectionStart !== selectionEnd) {
      setCaretVisible(false);
      return;
    }

    const canvas = measureCanvasRef.current ?? document.createElement('canvas');
    measureCanvasRef.current = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      setCaretVisible(false);
      return;
    }

    const style = window.getComputedStyle(input);
    context.font = style.font || `${style.fontSize} ${style.fontFamily}`;
    const textBeforeCaret = input.value.slice(0, selectionStart);
    setCaretLeft(context.measureText(textBeforeCaret).width - input.scrollLeft);
    setCaretVisible(true);
  };

  const currentTabId = tab?.id;
  const currentTabUrl = tab?.url ?? '';

  // Keep the bar in sync with the active tab (switching tabs or navigating updates it)
  useEffect(() => {
    setAddress(currentTabUrl && currentTabUrl !== 'about:blank' ? currentTabUrl : '');
    setHistoryIndex(-1);
    setDraftCommand('');
    setCommandsOpen(false);
    setContextMenu(null);
    setSuggestionsOpen(false);
    setSuggestionIndex(-1);
    setFindOpen(false);
    setFindQuery('');
    setFindStatus('');
    setHistoryOpen(false);
  }, [currentTabId, currentTabUrl]);

  useEffect(() => {
    setContextMenu(null);
  }, [mode]);

  // The page lives in an iframe, so React never sees its right-click. Electron forwards
  // subframe context menus here with viewport coordinates.
  useEffect(() => {
    const api = window.terminusDesktop;
    if (!api?.onFrameContextMenu) return undefined;
    return api.onFrameContextMenu((event) => {
      setCommandsOpen(false);
      setSavedOpen(false);
      setContextMenu({
        x: event.x,
        y: event.y,
        linkURL: event.linkURL,
        selectionText: event.selectionText,
      });
    });
  }, []);

  // Electron catches Ctrl/Cmd+F before Chromium handles it, including when the
  // focused document is a cross-origin REAL iframe whose keys never reach us.
  useEffect(() => {
    const api = window.terminusDesktop;
    if (!api?.onFindShortcut) return undefined;
    return api.onFindShortcut(() => setFindOpen(true));
  }, []);

  // The tab's own choice wins; otherwise a saved site preference, and finally dark by default
  useEffect(() => {
    const host = hostOf(tab?.url ?? '');
    setMode(tab?.viewMode ?? (host ? loadModeMap()[host] : undefined) ?? 'dark');
  }, [tab?.id, tab?.url, tab?.viewMode]);

  // Mirror the shared history so ↑/↓ walks the same commands as the terminal
  useEffect(() => {
    const handleHistorySync = (event: Event) => {
      const customEvent = event as CustomEvent<string[]>;
      setCommandHistory(Array.isArray(customEvent.detail) ? customEvent.detail : getPersistedCommandHistory());
      setHistoryIndex(-1);
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== HISTORY_STORAGE_KEY) return;
      setCommandHistory(getPersistedCommandHistory());
      setHistoryIndex(-1);
    };

    window.addEventListener(HISTORY_SYNC_EVENT, handleHistorySync);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(HISTORY_SYNC_EVENT, handleHistorySync);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  // Reposition the blinking cursor after value changes, history recall and resizes
  useEffect(() => {
    if (!inputFocused) return;
    const frame = requestAnimationFrame(updateCaretPosition);
    return () => cancelAnimationFrame(frame);
  }, [address, inputFocused]);

  useEffect(() => {
    if (!inputFocused) return;
    const handleResize = () => updateCaretPosition();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [inputFocused]);

  // Focus after the command menu unmounts, so picking a template with the mouse
  // leaves the bar ready for typing instead of dropping focus onto the page.
  useEffect(() => {
    if (pendingCaret === null) return;
    const input = addressInputRef.current;
    if (!input) return;
    input.focus();
    input.setSelectionRange(pendingCaret, pendingCaret);
    updateCaretPosition();
    setPendingCaret(null);
  }, [pendingCaret]);

  // Ctrl/Cmd+L is handled by the app and lands here: focus and select the address.
  useEffect(() => {
    const focusAddress = () => {
      const input = addressInputRef.current;
      if (!input) return;
      input.focus();
      input.select();
      requestAnimationFrame(updateCaretPosition);
    };
    window.addEventListener(FOCUS_ADDRESS_EVENT, focusAddress);
    return () => window.removeEventListener(FOCUS_ADDRESS_EVENT, focusAddress);
  }, []);

  useEffect(() => {
    if (!commandsOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setCommandsOpen(false);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [commandsOpen]);

  const selectMode = (next: PageMode) => {
    if (next === mode) return;
    soundEffects.playKeyClick();
    setMode(next);
    onSetViewMode(next);
    rememberMode(hostOf(tab?.url ?? ''), next);
    setSavedModes(loadModeMap());
  };

  const forgetMode = (host: string) => {
    soundEffects.playKeyClick();
    const next = loadModeMap();
    delete next[host];
    saveModeMap(next);
    setSavedModes(next);
  };

  const forgetAllModes = () => {
    soundEffects.playKeyClick();
    saveModeMap({});
    setSavedModes({});
  };

  const directFrameForMessages = Boolean(
    mode === 'real' &&
      tab?.url &&
      tab.url !== 'about:blank' &&
      tab.frameable &&
      !isPrivateTargetUrl(tab.url)
  );
  const expectedFrameOrigin = expectedFrameMessageOrigin(tab?.url, !directFrameForMessages);

  // Proxied pages report link clicks and browser shortcuts through a sandboxed shim.
  // Only the exact iframe window, posting from the expected origin, may navigate.
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Only the proxied document has a navigation shim. A direct REAL frame
      // must navigate itself; accepting its messages would let the remote page
      // drive the chrome even when source and origin are correct.
      if (expectedFrameOrigin !== 'null') return;
      if (!isTrustedFrameMessage(event, iframeRef.current, expectedFrameOrigin)) return;
      const data = event.data;
      if (!data) return;
      if (data.source === 'termbrowser-shortcut') {
        if (data.action === 'find') setFindOpen(true);
        return;
      }
      if (data.source !== 'termbrowser-view' || typeof data.url !== 'string') return;
      if (!/^https?:\/\//i.test(data.url)) return;
      onCommand(`goto ${data.url}`);
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onCommand, expectedFrameOrigin]);

  const selectSuggestion = (suggestion: AddressSuggestion) => {
    soundEffects.playKeyClick();
    setSuggestionsOpen(false);
    setSuggestionIndex(-1);
    setHistoryIndex(-1);
    setDraftCommand('');
    addressInputRef.current?.blur();
    onCommand(suggestion.command);
  };

  const clearAddress = () => {
    soundEffects.playKeyClick();
    setAddress('');
    setHistoryIndex(-1);
    setDraftCommand('');
    setSuggestionsOpen(false);
    setSuggestionIndex(-1);
    addressInputRef.current?.focus();
    requestAnimationFrame(updateCaretPosition);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (suggestionsOpen && suggestionIndex >= 0 && addressSuggestions[suggestionIndex]) {
      selectSuggestion(addressSuggestions[suggestionIndex]);
      return;
    }

    const raw = address.trim();
    if (!raw) return;
    soundEffects.playKeyClick();
    setSuggestionsOpen(false);
    setSuggestionIndex(-1);
    setHistoryIndex(-1);
    setDraftCommand('');
    // Release the field so the page can take keyboard focus; the custom caret stays visible.
    addressInputRef.current?.blur();
    onCommand(raw);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setAddress(tab && tab.url && tab.url !== 'about:blank' ? tab.url : '');
      setHistoryIndex(-1);
      setDraftCommand('');
      setSuggestionsOpen(false);
      setSuggestionIndex(-1);
      event.currentTarget.blur();
      return;
    }

    if (suggestionsOpen && addressSuggestions.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        soundEffects.playKeyClick();
        setSuggestionIndex((previous) =>
          previous >= addressSuggestions.length - 1 ? 0 : previous + 1
        );
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        soundEffects.playKeyClick();
        setSuggestionIndex((previous) =>
          previous <= 0 ? addressSuggestions.length - 1 : previous - 1
        );
        return;
      }

      if (event.key === 'Enter' && suggestionIndex >= 0) {
        event.preventDefault();
        selectSuggestion(addressSuggestions[suggestionIndex]);
        return;
      }
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (commandHistory.length === 0) return;
      soundEffects.playKeyClick();
      if (historyIndex === -1) {
        setDraftCommand(address);
        const lastIndex = commandHistory.length - 1;
        setHistoryIndex(lastIndex);
        setAddress(commandHistory[lastIndex]);
      } else if (historyIndex > 0) {
        const nextIndex = historyIndex - 1;
        setHistoryIndex(nextIndex);
        setAddress(commandHistory[nextIndex]);
      }
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (historyIndex === -1) return;
      soundEffects.playKeyClick();
      if (historyIndex < commandHistory.length - 1) {
        const nextIndex = historyIndex + 1;
        setHistoryIndex(nextIndex);
        setAddress(commandHistory[nextIndex]);
      } else {
        setHistoryIndex(-1);
        setAddress(draftCommand);
      }
    }
  };

  const go = (command: string) => {
    soundEffects.playKeyClick();
    onCommand(command);
  };

  const chooseWebCommand = (option: WebCommandOption) => {
    soundEffects.playKeyClick();
    setCommandsOpen(false);
    setSavedOpen(false);

    if (option.needsValue) {
      setAddress(option.command);
      setHistoryIndex(-1);
      setDraftCommand('');
      setPendingCaret(option.command.length);
      return;
    }

    addressInputRef.current?.blur();
    onCommand(option.command);
  };

  const hasPage = Boolean(tab && tab.url && tab.url !== 'about:blank');
  const isTerminusSearch = Boolean(tab && isTerminusSearchUrl(tab.url));
  const hasExternalPage = hasPage && !isTerminusSearch;
  const currentUrl = hasPage && tab ? tab.url : '';
  const savedBookmark = bookmarks.find((bm) => sameUrl(bm.url, currentUrl));
  const proxied = (view: PageMode) => `/api/view?url=${encodeURIComponent(tab?.url ?? '')}&mode=${view}`;
  // Never let a stale frameable flag or a persisted tab bypass the network policy.
  const directFrame = Boolean(hasExternalPage && tab?.frameable && !isPrivateTargetUrl(currentTabUrl));
  const src = !tab
    ? 'about:blank'
    : mode === 'real'
    ? directFrame
      ? tab.url
      : proxied('real')
    : proxied(mode);
  const usesProxy = Boolean(hasExternalPage && (mode !== 'real' || !directFrame));
  const connection = getConnectionState(address.trim() || currentUrl);

  const applyZoom = useCallback((next: number) => {
    const bounded = Math.min(2, Math.max(0.5, Math.round(next * 10) / 10));
    if (onSetZoom) onSetZoom(bounded);
    else setLocalZoom(bounded);
  }, [onSetZoom]);

  const sendFind = useCallback((backwards = false) => {
    if (!findQuery.trim()) {
      setFindStatus('');
      return;
    }
    if (!usesProxy) {
      setFindStatus('Cambia a OSCURO o TEXTO para buscar dentro de esta página.');
      return;
    }
    iframeRef.current?.contentWindow?.postMessage(
      { source: 'termbrowser-find', query: findQuery, backwards },
      '*'
    );
  }, [findQuery, usesProxy]);

  const applyProxiedCosmetics = useCallback(async () => {
    if (!usesProxy || !tab?.url) return;
    const frame = iframeRef.current;
    const api = window.terminusDesktop;
    if (!frame?.contentWindow || !api?.getAdblockCosmetics) return;
    try {
      const css = await api.getAdblockCosmetics(tab.url);
      if (css.trim()) {
        frame.contentWindow.postMessage({ source: 'termbrowser-cosmetics', css }, '*');
      }
    } catch {
      // The blocker is optional in a regular browser tab; never break the page for it.
    }
  }, [tab?.url, usesProxy]);

  // Ctrl/Cmd+F, Ctrl/Cmd+ +/-/0 work in the web surface without opening the terminal menu.
  useEffect(() => {
    const handleBrowserShortcut = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (!mod) return;

      if (event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setFindOpen(true);
        return;
      }
      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        applyZoom(zoom + 0.1);
        return;
      }
      if (event.key === '-') {
        event.preventDefault();
        applyZoom(zoom - 0.1);
        return;
      }
      if (event.key === '0') {
        event.preventDefault();
        applyZoom(1);
      }
    };

    window.addEventListener('keydown', handleBrowserShortcut);
    return () => window.removeEventListener('keydown', handleBrowserShortcut);
  }, [zoom, onSetZoom, applyZoom]);

  useEffect(() => {
    if (!findOpen) return;
    const frame = requestAnimationFrame(() => findInputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [findOpen]);

  useEffect(() => {
    if (!findOpen) return;
    if (!findQuery.trim()) {
      setFindStatus('');
      return;
    }
    const timer = window.setTimeout(() => sendFind(false), 100);
    return () => window.clearTimeout(timer);
  }, [findQuery, findOpen, usesProxy, sendFind]);

  // The proxied iframe reports whether window.find() located a match.
  useEffect(() => {
    const handleFindResult = (event: MessageEvent) => {
      if (expectedFrameOrigin !== 'null') return;
      if (!isTrustedFrameMessage(event, iframeRef.current, expectedFrameOrigin)) return;
      const data = event.data;
      if (!data || data.source !== 'termbrowser-find-result' || !findOpen) return;
      setFindStatus(data.found ? 'Coincidencia encontrada' : 'Sin coincidencias');
    };
    window.addEventListener('message', handleFindResult);
    return () => window.removeEventListener('message', handleFindResult);
  }, [findOpen, expectedFrameOrigin]);

  useEffect(() => {
    const closeFindWithEscape = (event: KeyboardEvent) => {
      if (!findOpen || event.key !== 'Escape') return;
      event.preventDefault();
      setFindOpen(false);
      setFindStatus('');
    };
    window.addEventListener('keydown', closeFindWithEscape);
    return () => window.removeEventListener('keydown', closeFindWithEscape);
  }, [findOpen]);

  const openCommandMenu = () => {
    soundEffects.playKeyClick();
    setSavedOpen(false);
    setContextMenu(null);
    setCommandsOpen(true);
  };

  const toggleCurrentBookmark = () => {
    if (!tab || !currentUrl || isTerminusSearch) return;
    soundEffects.playKeyClick();
    if (savedBookmark) onRemoveBookmark(savedBookmark.id);
    else onAddBookmark(tab.title || currentUrl, currentUrl);
  };

  const copyText = async (value: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard access can be unavailable outside a secure context.
    }
  };

  const pasteIntoAddress = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      setAddress(text);
      setHistoryIndex(-1);
      setDraftCommand('');
      setPendingCaret(text.length);
    } catch {
      // Clipboard read can require permission; leave the field untouched.
    }
  };

  const openContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    setCommandsOpen(false);
    setSavedOpen(false);
    setContextMenu({ x: event.clientX, y: event.clientY });
  };

  const canGoBack = Boolean(tab && tab.historyIndex > 0);
  const canGoForward = Boolean(tab && tab.historyIndex >= 0 && tab.historyIndex < tab.history.length - 1);
  const selectionQuery = contextMenu?.selectionText?.trim() ?? '';
  const webMenuTitle = tab && currentUrl ? `WEB · ${hostOf(currentUrl) || 'local'}` : 'WEB · inicio';
  const webMenuItems: ContextMenuItem[] = [
    { id: 'back', label: 'Atrás', hint: 'back', disabled: !canGoBack, onSelect: () => go('back') },
    { id: 'forward', label: 'Adelante', hint: 'forward', disabled: !canGoForward, onSelect: () => go('forward') },
    { id: 'reload', label: 'Recargar', hint: 'reload', disabled: !hasPage, onSelect: () => go('reload') },
    { id: 'home', label: 'Página de inicio', hint: 'home', onSelect: () => go('home') },
    {
      id: 'bookmark',
      label: savedBookmark ? 'Quitar marcador' : 'Guardar en marcadores',
      disabled: !currentUrl || isTerminusSearch,
      separatorBefore: true,
      onSelect: toggleCurrentBookmark,
    },
    {
      id: 'copy-url',
      label: 'Copiar dirección',
      disabled: !currentUrl,
      onSelect: () => {
        void copyText(currentUrl);
      },
    },
    { id: 'paste-url', label: 'Pegar en la barra', onSelect: () => void pasteIntoAddress() },
    {
      id: 'find-in-page',
      label: 'Buscar en la página',
      hint: 'Ctrl+F',
      disabled: !hasPage || isTerminusSearch,
      separatorBefore: true,
      onSelect: () => setFindOpen(true),
    },
    ...(contextMenu?.linkURL
      ? [
          {
            id: 'copy-link',
            label: 'Copiar enlace',
            onSelect: () => void copyText(contextMenu.linkURL ?? ''),
          },
        ]
      : []),
    ...(selectionQuery
      ? [
          {
            id: 'search-selection',
            label: 'Buscar selección',
            hint: 'search',
            onSelect: () => go(`search ${selectionQuery}`),
          },
        ]
      : []),
    {
      id: 'mode-real',
      label: 'Vista real',
      checked: mode === 'real',
      disabled: !hasExternalPage,
      separatorBefore: true,
      onSelect: () => selectMode('real'),
    },
    {
      id: 'mode-dark',
      label: 'Vista oscura',
      checked: mode === 'dark',
      disabled: !hasExternalPage,
      onSelect: () => selectMode('dark'),
    },
    {
      id: 'mode-text',
      label: 'Vista de texto',
      checked: mode === 'text',
      disabled: !hasExternalPage,
      onSelect: () => selectMode('text'),
    },
    {
      id: 'reader',
      label: 'Modo lectura',
      disabled: !hasExternalPage,
      separatorBefore: true,
      onSelect: () => go('reader'),
    },
    { id: 'help', label: 'Manual de comandos', hint: 'help', onSelect: () => go('help') },
  ];

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      style={{ backgroundColor: theme.bg, color: theme.text }}
      onContextMenu={openContextMenu}
    >
      {/* Bookmark strip: every saved site is one click away, and each chip can be removed */}
      <div
        className="flex shrink-0 touch-manipulation items-center gap-1.5 overflow-x-auto border-b px-2 py-1 font-mono"
        style={{ backgroundColor: theme.bg, borderColor: theme.border }}
      >
        <span className="shrink-0 text-[9px] uppercase tracking-wide opacity-40" style={{ color: theme.accent }}>
          Marcadores
        </span>
        {bookmarks.length === 0 ? (
          <span className="text-[10px] opacity-40">Pulsa la estrella en una página para guardarla aquí.</span>
        ) : (
          bookmarks.map((bm) => (
            <div
              key={bm.id}
              className="flex shrink-0 items-center border rounded-xs"
              style={{ borderColor: theme.border }}
            >
              <button
                type="button"
                onClick={() => go(`goto ${bm.url}`)}
                title={bm.url}
                className="max-w-[170px] truncate px-1.5 py-0.5 text-[10px] cursor-pointer hover:opacity-75"
                style={{ color: theme.text }}
              >
                {bm.title}
              </button>
              <button
                type="button"
                onClick={() => {
                  soundEffects.playKeyClick();
                  onRemoveBookmark(bm.id);
                }}
                title={`Eliminar marcador: ${bm.title}`}
                aria-label={`Eliminar marcador ${bm.title}`}
                className="border-l px-1 py-0.5 cursor-pointer opacity-50 hover:opacity-100"
                style={{ borderColor: theme.border, color: theme.accent }}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Page */}
      <div className="relative min-h-0 flex-1">
        {isTerminusSearch && tab ? (
          <TerminusSearchPage
            theme={theme}
            query={tab.search?.query || getTerminusSearchQuery(tab.url)}
            state={tab.search}
            onSearch={(query) => onCommand(`search ${query}`)}
            onOpenResult={(url) => onCommand(`goto ${url}`)}
            onGoHome={() => onCommand('home')}
          />
        ) : hasPage && tab ? (
          <iframe
            ref={iframeRef}
            key={`${tab.id}-${tab.url}-${mode}`}
            src={src}
            onLoad={applyProxiedCosmetics}
            title={tab.title || tab.url}
            className="h-full w-full border-0"
            style={
              {
                backgroundColor: mode === 'real' && directFrame ? '#ffffff' : '#080b0a',
                zoom,
              } as React.CSSProperties
            }
            referrerPolicy="no-referrer"
            sandbox={
              mode === 'real' && directFrame
                ? 'allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads'
                : 'allow-scripts'
            }
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center font-mono">
            <div className="ascii-boot ascii-glow" style={glowStyle}>
              <pre
                className="ascii-sign ascii-sign-wide select-none font-mono"
                aria-hidden="true"
                data-text={BOOT_ASCII}
              >
                {BOOT_ASCII}
              </pre>
              <pre
                className="ascii-sign ascii-sign-compact select-none font-mono"
                aria-hidden="true"
                data-text={BOOT_ASCII_COMPACT}
              >
                {BOOT_ASCII_COMPACT}
              </pre>
              <div
                className="ascii-latency"
                title={`Glow ${latencyGlow.label} · Latencia de red actual: ${latencyLabel}`}
              >
                <span className="ascii-latency-dot" aria-hidden="true" />
                <span>[ GLOW ] · [ LATENCIA {latencyLabel} ]</span>
              </div>
            </div>
            <div
              className="text-[10px] font-bold uppercase tracking-[0.35em] opacity-70"
              style={{ color: theme.accent }}
            >
              Modo web
            </div>
            <button
              type="button"
              onClick={() => go('home')}
              className="flex items-center gap-2 border px-3 py-1.5 text-[11px] font-bold cursor-pointer hover:opacity-80"
              style={{ borderColor: theme.accent, backgroundColor: theme.accent, color: theme.bg }}
              title="Abrir Terminus Search"
            >
              <Search className="h-3.5 w-3.5" />
              ABRIR TERMINUS SEARCH
            </button>
            <p className="max-w-md text-[11px] opacity-70">
              Escribe un comando en la barra: <span style={{ color: theme.accent }}>goto &lt;url&gt;</span>,{' '}
              <span style={{ color: theme.accent }}>search &lt;texto&gt;</span> o{' '}
              <span style={{ color: theme.accent }}>help</span>. También acepta una URL o búsqueda directa. Cada pestaña
              conserva su propia página e historial.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {START_LINKS.map((link) => (
                <button
                  key={link.url}
                  type="button"
                  onClick={() => go(`goto ${link.url}`)}
                  className="border px-2.5 py-1 text-[11px] cursor-pointer hover:opacity-80"
                  style={{ borderColor: theme.border, color: theme.text }}
                  title={link.url}
                >
                  {link.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] opacity-55">
              ¿No recuerdas la sintaxis? Pulsa <span className="font-bold" style={{ color: theme.accent }}>CMD</span>{' '}
              en la barra y elige un comando con el ratón.
            </p>
            <p className="text-[10px] opacity-45">
              Interacción por comandos · ↑/↓ recupera el historial · la salida de consola queda en MODO TERMINAL.
            </p>
          </div>
        )}

        {findOpen && hasPage && !isTerminusSearch && (
          <div
            className="absolute right-2 top-2 z-40 flex max-w-[calc(100%-1rem)] items-center gap-1 rounded-xs border px-1.5 py-1 font-mono text-[10px] shadow-[0_12px_32px_rgba(0,0,0,0.5)]"
            style={{ backgroundColor: theme.cardBg, borderColor: theme.accent, color: theme.text }}
            role="dialog"
            aria-label="Buscar en la página"
          >
            <Search className="h-3 w-3 shrink-0" style={{ color: theme.accent }} />
            <input
              ref={findInputRef}
              value={findQuery}
              onChange={(event) => setFindQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  sendFind(event.shiftKey);
                }
              }}
              className="min-w-0 flex-1 bg-transparent px-1 py-0.5 text-[10px] outline-hidden"
              style={{ color: theme.text }}
              placeholder="Buscar en la página…"
              aria-label="Texto a buscar en la página"
              spellCheck={false}
            />
            <span className="max-w-32 truncate opacity-55" aria-live="polite">
              {findStatus}
            </span>
            <button
              type="button"
              onClick={() => sendFind(true)}
              className="shrink-0 cursor-pointer p-0.5 opacity-65 hover:opacity-100"
              title="Coincidencia anterior (Shift+Enter)"
              aria-label="Coincidencia anterior"
            >
              <ChevronUp className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => sendFind(false)}
              className="shrink-0 cursor-pointer p-0.5 opacity-65 hover:opacity-100"
              title="Siguiente coincidencia (Enter)"
              aria-label="Siguiente coincidencia"
            >
              <ChevronDown className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => {
                setFindOpen(false);
                setFindQuery('');
                setFindStatus('');
              }}
              className="shrink-0 cursor-pointer p-0.5 opacity-65 hover:opacity-100"
              title="Cerrar búsqueda (Esc)"
              aria-label="Cerrar búsqueda en la página"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
      {/* Browser chrome */}
      <div
        className="relative flex shrink-0 touch-manipulation items-center gap-1.5 border-t px-2 py-1.5 font-mono"
        style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
      >
        <div
          className="flex shrink-0 items-center overflow-hidden rounded-xs border"
          style={{ borderColor: theme.border }}
          role="group"
          aria-label="Controles de navegación"
        >
          <button
            type="button"
            onClick={() => go('back')}
            disabled={!tab || tab.historyIndex <= 0}
            className="border-r p-1.5 cursor-pointer transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
            style={{ borderColor: theme.border, color: theme.text }}
            title="Atrás (historial de la pestaña)"
            aria-label="Atrás"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => go('forward')}
            disabled={!tab || tab.historyIndex >= tab.history.length - 1}
            className="border-r p-1.5 cursor-pointer transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
            style={{ borderColor: theme.border, color: theme.text }}
            title="Adelante"
            aria-label="Adelante"
          >
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => go('reload')}
            disabled={!hasPage}
            className="border-r p-1.5 cursor-pointer transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
            style={{ borderColor: theme.border, color: theme.text }}
            title={tab?.isLoading ? 'Cargando la página…' : 'Recargar la página'}
            aria-label="Recargar"
          >
            {tab?.isLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RotateCw className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={() => go('home')}
            className="border-r p-1.5 cursor-pointer transition-colors hover:bg-white/10"
            style={{ borderColor: theme.border, color: theme.text }}
            title="Página de inicio de la pestaña"
            aria-label="Página de inicio"
          >
            <Home className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={toggleCurrentBookmark}
            disabled={!currentUrl || isTerminusSearch}
            className="p-1.5 cursor-pointer transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
            style={{ borderColor: theme.border, color: savedBookmark ? theme.accent : theme.text }}
            title={
              isTerminusSearch
                ? 'Terminus Search es una página interna'
                : savedBookmark
                ? `Quitar de marcadores: ${savedBookmark.title}`
                : 'Guardar esta página en marcadores'
            }
            aria-label={savedBookmark ? 'Quitar de marcadores' : 'Añadir a marcadores'}
          >
            <Star className="w-3.5 h-3.5" fill={savedBookmark ? 'currentColor' : 'none'} />
          </button>
          {currentUrl && !isTerminusSearch && (
            <a
              href={`/api/download?url=${encodeURIComponent(currentUrl)}&name=${encodeURIComponent(tab?.title || hostOf(currentUrl))}`}
              download
              onClick={() => soundEffects.playKeyClick()}
              className="border-l p-1.5 cursor-pointer transition-colors hover:bg-white/10"
              style={{ borderColor: theme.border, color: theme.text }}
              title="Descargar el código fuente de esta página"
              aria-label="Descargar página"
            >
              <Download className="w-3.5 h-3.5" />
            </a>
          )}
          <button
            type="button"
            onClick={() => {
              soundEffects.playKeyClick();
              setFindOpen(true);
            }}
            disabled={!hasPage || isTerminusSearch}
            className="border-l p-1.5 cursor-pointer transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
            style={{ borderColor: theme.border, color: findOpen ? theme.accent : theme.text }}
            title="Buscar en la página (Ctrl+F)"
            aria-label="Buscar en la página"
            aria-keyshortcuts="Control+F"
            aria-expanded={findOpen}
          >
            <Search className="w-3.5 h-3.5" />
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                soundEffects.playKeyClick();
                setHistoryOpen((open) => !open);
              }}
              className="border-l p-1.5 cursor-pointer transition-colors hover:bg-white/10"
              style={{ borderColor: theme.border, color: historyOpen ? theme.accent : theme.text }}
              title="Historial global de navegación"
              aria-label="Abrir historial global"
              aria-expanded={historyOpen}
            >
              <Clock3 className="w-3.5 h-3.5" />
            </button>
            {historyOpen && (
              <>
                <button
                  type="button"
                  aria-label="Cerrar historial global"
                  onClick={() => setHistoryOpen(false)}
                  className="fixed inset-0 z-40 cursor-default"
                />
                <div
                  className="absolute bottom-full left-0 z-50 mb-1 w-80 max-w-[85vw] border rounded-xs font-mono text-[10px] shadow-[0_12px_32px_rgba(0,0,0,0.5)]"
                  style={{ backgroundColor: theme.cardBg, borderColor: theme.border, color: theme.text }}
                  role="dialog"
                  aria-label="Historial global de navegación"
                >
                  <div
                    className="flex items-center justify-between border-b px-2 py-1 text-[9px] uppercase tracking-wide opacity-55"
                    style={{ borderColor: theme.border }}
                  >
                    <span>Historial global</span>
                    <span>{globalHistory.length} páginas</span>
                  </div>
                  {globalHistory.length === 0 ? (
                    <div className="px-2 py-2 opacity-50">Aún no hay páginas visitadas.</div>
                  ) : (
                    <div className="max-h-56 overflow-y-auto">
                      {globalHistory.slice(0, 12).map((url) => (
                        <button
                          key={url}
                          type="button"
                          onClick={() => {
                            setHistoryOpen(false);
                            go(`goto ${url}`);
                          }}
                          className="block w-full border-b px-2 py-1.5 text-left last:border-b-0 hover:bg-white/10"
                          style={{ borderColor: theme.border }}
                          title={url}
                        >
                          <span className="block truncate font-bold">{hostLabel(url)}</span>
                          <span className="block truncate text-[9px] opacity-50">{url}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      onClearHistory?.();
                      setHistoryOpen(false);
                    }}
                    disabled={globalHistory.length === 0}
                    className="w-full border-t px-2 py-1 text-left hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-30"
                    style={{ borderColor: theme.border, color: theme.accent }}
                  >
                    Borrar historial
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <form onSubmit={submit} className="flex min-w-0 flex-1 items-center gap-1.5">
          <div className="relative min-w-0 flex-1">
            <div
              className="flex min-w-0 items-center gap-1.5 border px-2 py-1 transition-colors"
              style={{
                borderColor: inputFocused ? theme.accent : theme.border,
                backgroundColor: theme.bg,
                boxShadow: inputFocused ? `inset 0 0 0 1px ${theme.accent}22` : 'none',
              }}
            >
              <span
                className="shrink-0"
                title={connection.label}
                aria-label={connection.label}
                style={{
                  color:
                    connection.kind === 'secure'
                      ? '#4ade80'
                      : connection.kind === 'insecure'
                      ? '#fbbf24'
                      : connection.kind === 'internal'
                      ? theme.accent
                      : theme.muted,
                }}
              >
                {connection.kind === 'secure' ? (
                  <ShieldCheck className="h-3.5 w-3.5" />
                ) : connection.kind === 'insecure' ? (
                  <ShieldAlert className="h-3.5 w-3.5" />
                ) : connection.kind === 'internal' ? (
                  <Search className="h-3.5 w-3.5" />
                ) : (
                  <Globe2 className="h-3.5 w-3.5" />
                )}
              </span>
              <div className="relative min-w-0 flex-1 overflow-hidden">
                <input
                  ref={addressInputRef}
                  value={address}
                  onChange={(event) => {
                    const value = event.target.value;
                    setAddress(value);
                    setSuggestionsOpen(value.trim().length > 0);
                    setSuggestionIndex(-1);
                    requestAnimationFrame(updateCaretPosition);
                  }}
                  onKeyDown={handleKeyDown}
                  onKeyUp={updateCaretPosition}
                  onClick={updateCaretPosition}
                  onSelect={updateCaretPosition}
                  onScroll={updateCaretPosition}
                  onFocus={() => {
                    setSuggestionsOpen(address.trim().length > 0);
                    setSuggestionIndex(-1);
                    requestAnimationFrame(updateCaretPosition);
                  }}
                  onBlur={() => {
                    setInputFocused(false);
                    setCaretVisible(false);
                    setSuggestionsOpen(false);
                  }}
                  placeholder="Escribe una dirección o busca en la web…"
                  spellCheck={false}
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  inputMode="url"
                  enterKeyHint="go"
                  aria-label="Barra de direcciones y búsqueda"
                  aria-autocomplete="list"
                  aria-controls="terminus-address-suggestions"
                  aria-expanded={suggestionsOpen && addressSuggestions.length > 0}
                  title="Dirección o búsqueda · Enter para abrir · ↑/↓ sugerencias · Ctrl+L para enfocar"
                  className="w-full min-w-0 bg-transparent p-0 text-[11px] outline-hidden placeholder:opacity-40"
                  style={{ color: theme.text, caretColor: 'transparent' }}
                />
                {(!inputFocused || caretVisible) && (
                  <span
                    aria-hidden="true"
                    className="tb-caret-blink pointer-events-none absolute top-1/2 h-3.5 w-[2px] -translate-y-1/2 rounded-xs text-[11px]"
                    style={{
                      left: inputFocused ? `${caretLeft}px` : `${address.length}ch`,
                      backgroundColor: theme.cursorColor || theme.accent,
                      boxShadow: `0 0 5px ${theme.cursorColor || theme.accent}`,
                    }}
                  />
                )}
              </div>
              {address && (
                <button
                  type="button"
                  onClick={clearAddress}
                  className="shrink-0 cursor-pointer p-0.5 opacity-45 transition-opacity hover:opacity-100"
                  style={{ color: theme.text }}
                  title="Limpiar la barra de direcciones"
                  aria-label="Limpiar dirección"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {suggestionsOpen && addressSuggestions.length > 0 && (
              <div
                id="terminus-address-suggestions"
                role="listbox"
                aria-label="Sugerencias de dirección"
                className="absolute bottom-full left-0 right-0 z-50 mb-1 overflow-hidden rounded-xs border font-mono text-[10px] shadow-[0_12px_32px_rgba(0,0,0,0.5)]"
                style={{ backgroundColor: theme.cardBg, borderColor: theme.border, color: theme.text }}
              >
                <div
                  className="flex items-center justify-between border-b px-2 py-1 text-[9px] uppercase tracking-wide opacity-55"
                  style={{ borderColor: theme.border }}
                >
                  <span>Sugerencias</span>
                  <span>↑↓ mover · Enter abrir</span>
                </div>
                {addressSuggestions.map((suggestion, index) => (
                  <button
                    key={`${suggestion.kind}-${suggestion.command}`}
                    type="button"
                    role="option"
                    aria-selected={index === suggestionIndex}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setSuggestionIndex(index)}
                    onClick={() => selectSuggestion(suggestion)}
                    className="flex w-full items-center gap-2 border-b px-2 py-1.5 text-left last:border-b-0 cursor-pointer"
                    style={{
                      borderColor: theme.border,
                      backgroundColor: index === suggestionIndex ? `${theme.accent}20` : 'transparent',
                      color: theme.text,
                    }}
                  >
                    <span className="shrink-0" style={{ color: theme.accent }}>
                      {suggestion.kind === 'bookmark' ? (
                        <BookmarkIcon className="h-3 w-3" />
                      ) : suggestion.kind === 'history' ? (
                        <Clock3 className="h-3 w-3" />
                      ) : (
                        <Search className="h-3 w-3" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{suggestion.label}</span>
                    <span className="shrink-0 text-[9px] opacity-45">{suggestion.detail}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="submit"
            className="shrink-0 border px-2 py-1 text-[10px] font-bold cursor-pointer transition-colors hover:bg-white/10"
            style={{ borderColor: theme.border, color: theme.accent }}
            title="Ejecutar comando (Enter)"
          >
            RUN
          </button>

          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => {
                soundEffects.playKeyClick();
                setSavedOpen(false);
                setCommandsOpen((open) => !open);
              }}
              className="shrink-0 border rounded-xs px-1.5 py-1 text-[9px] font-bold cursor-pointer hover:opacity-80"
              style={{
                borderColor: commandsOpen ? theme.accent : theme.border,
                backgroundColor: commandsOpen ? theme.accent : 'transparent',
                color: commandsOpen ? theme.bg : theme.accent,
              }}
              title="Abrir menú de comandos para elegir con el ratón"
              aria-haspopup="menu"
              aria-expanded={commandsOpen}
            >
              CMD
            </button>

            {commandsOpen && (
              <>
                <button
                  type="button"
                  aria-label="Cerrar menú de comandos"
                  onClick={() => setCommandsOpen(false)}
                  className="fixed inset-0 z-40 cursor-default"
                />
                <div
                  className="absolute right-0 bottom-full z-50 mb-1 w-72 max-w-[80vw] overflow-hidden border rounded-xs font-mono text-[10px]"
                  style={{ backgroundColor: theme.cardBg, borderColor: theme.border, color: theme.text }}
                  role="menu"
                  aria-label="Comandos de navegación"
                >
                  <div
                    className="border-b px-2 py-1 text-[9px] uppercase tracking-wide opacity-50"
                    style={{ borderColor: theme.border }}
                  >
                    Comandos de navegación
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {WEB_COMMAND_OPTIONS.map((option) => (
                      <button
                        key={option.command}
                        type="button"
                        role="menuitem"
                        onClick={() => chooseWebCommand(option)}
                        className="flex w-full items-center justify-between gap-2 border-b px-2 py-1.5 text-left cursor-pointer hover:opacity-80 last:border-b-0"
                        style={{ borderColor: theme.border }}
                      >
                        <span className="min-w-0">
                          <span className="block font-bold">{option.label}</span>
                          <span className="block text-[9px] opacity-50">{option.hint}</span>
                        </span>
                        {option.needsValue && (
                          <span className="shrink-0 text-[9px] opacity-40">completar</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </form>

        {hasExternalPage && (
          <div
            className="hidden shrink-0 items-center overflow-hidden rounded-xs border text-[9px] font-bold sm:flex"
            style={{ borderColor: theme.border }}
            title="Cómo se muestra esta página (se recuerda por sitio)"
          >
            {PAGE_MODES.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => selectMode(option.id)}
                className="px-1.5 py-0.5 cursor-pointer"
                style={{
                  backgroundColor: mode === option.id ? theme.accent : 'transparent',
                  color: mode === option.id ? theme.bg : theme.text,
                }}
                title={option.title}
                aria-pressed={mode === option.id}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}

        <div
          className="hidden shrink-0 items-center overflow-hidden rounded-xs border text-[9px] font-bold sm:flex"
          style={{ borderColor: theme.border }}
          role="group"
          aria-label="Zoom de página"
        >
          <button
            type="button"
            onClick={() => applyZoom(zoom - 0.1)}
            disabled={zoom <= 0.5}
            className="p-1 cursor-pointer hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
            title="Reducir zoom (Ctrl+-)"
            aria-label="Reducir zoom"
          >
            <Minus className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => applyZoom(1)}
            className="min-w-9 border-x px-1 py-0.5 cursor-pointer hover:bg-white/10"
            style={{ borderColor: theme.border, color: theme.accent }}
            title="Restablecer zoom al 100% (Ctrl+0)"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            onClick={() => applyZoom(zoom + 0.1)}
            disabled={zoom >= 2}
            className="p-1 cursor-pointer hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
            title="Aumentar zoom (Ctrl++)"
            aria-label="Aumentar zoom"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>

        {/* Saved per-site views, with a way to forget each one or all of them */}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => {
              soundEffects.playKeyClick();
              setCommandsOpen(false);
              setSavedModes(loadModeMap());
              setSavedOpen((open) => !open);
            }}
            className="border rounded-xs px-1.5 py-1 text-[9px] font-bold cursor-pointer hover:opacity-80"
            style={{ borderColor: theme.border, color: theme.text }}
            title="Ver y borrar los modos de vista guardados por sitio"
            aria-expanded={savedOpen}
          >
            SITIOS
            <span className="ml-1 opacity-60">{Object.keys(savedModes).length}</span>
          </button>

          {savedOpen && (
            <>
              <button
                type="button"
                aria-label="Cerrar lista de sitios"
                onClick={() => setSavedOpen(false)}
                className="fixed inset-0 z-40 cursor-default"
              />
              <div
                className="absolute right-0 bottom-full z-50 mb-1 w-64 border rounded-xs font-mono text-[10px]"
                style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
              >
                <div
                  className="border-b px-2 py-1 text-[9px] uppercase tracking-wide opacity-50"
                  style={{ borderColor: theme.border }}
                >
                  Vista guardada por sitio
                </div>
                {Object.keys(savedModes).length === 0 ? (
                  <div className="px-2 py-2 opacity-50">Ningún sitio tiene vista fija: todos abren en REAL.</div>
                ) : (
                  Object.entries(savedModes).map(([host, saved]) => (
                    <div
                      key={host}
                      className="flex items-center gap-1 border-b px-2 py-1"
                      style={{ borderColor: theme.border }}
                    >
                      <span className="min-w-0 flex-1 truncate" title={host}>
                        {host}
                      </span>
                      <span className="shrink-0 text-[9px] uppercase opacity-60" style={{ color: theme.accent }}>
                        {MODE_LABELS[saved] ?? saved}
                      </span>
                      <button
                        type="button"
                        onClick={() => forgetMode(host)}
                        className="shrink-0 px-1 cursor-pointer opacity-60 hover:opacity-100"
                        style={{ color: theme.accent }}
                        title={`Olvidar la vista de ${host}`}
                        aria-label={`Olvidar vista de ${host}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))
                )}
                <button
                  type="button"
                  onClick={forgetAllModes}
                  disabled={Object.keys(savedModes).length === 0}
                  className="w-full px-2 py-1 text-left cursor-pointer disabled:cursor-not-allowed disabled:opacity-30 hover:opacity-80"
                  style={{ color: theme.accent }}
                  title="Borrar todas las preferencias de vista"
                >
                  Olvidar todas
                </button>
              </div>
            </>
          )}
        </div>

        <span className="hidden shrink-0 text-[10px] opacity-50 sm:inline">
          {tab?.isLoading ? 'CARGANDO…' : tab?.statusCode ? `HTTP ${tab.statusCode}` : 'EN BLANCO'}
          {usesProxy ? (mode === 'text' ? ' · texto' : mode === 'dark' ? ' · oscuro' : ' · proxy') : ''}
        </span>

        {/* DOSY floats frameless above the address bar, out of the controls row */}
        <div className="absolute bottom-full right-10 z-30 mb-1">
          <RetroAssistantEyes
            variant="web"
            lastCommand={commandHistory[commandHistory.length - 1]}
            onExecuteCommand={onCommand}
            onOpenCommandMenu={openCommandMenu}
            onToggleBookmark={toggleCurrentBookmark}
            bookmarkActive={Boolean(savedBookmark)}
            hasPage={hasPage}
            viewMode={mode}
            onSelectViewMode={selectMode}
          />
        </div>
      </div>

      {contextMenu && (
        <ContextMenu
          theme={theme}
          x={contextMenu.x}
          y={contextMenu.y}
          title={webMenuTitle}
          items={webMenuItems}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
};
