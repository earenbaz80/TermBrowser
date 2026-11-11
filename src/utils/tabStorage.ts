import { BrowserTab, PageMode, TabKind, TerminusSearchState, TerminalLogEntry } from '../types';
import { TERMINUS_SEARCH_PROVIDER } from './terminusSearch';
import { BOOT_ASCII } from './bootBanner';

const STORAGE_KEY = 'termbrowser.tabs';
const BANNER_MARKER = 'NAVEGADOR WEB BASADO EN LÍNEA DE COMANDOS';

/** Keep the stored session small: last entries only, and never full page payloads */
const MAX_PERSISTED_LOGS = 60;
const MAX_LOG_OUTPUT = 4000;

export interface SavedSession {
  tabs: BrowserTab[];
  activeTabId: string;
  /** Terminal stream of each tab, keyed by tab id */
  logs: Record<string, TerminalLogEntry[]>;
}

const isTabKind = (value: unknown): value is TabKind => value === 'web' || value === 'terminal';

const isPageMode = (value: unknown): value is PageMode => value === 'real' || value === 'dark' || value === 'text';

function normalizeSearch(value: any): TerminusSearchState | undefined {
  if (!value || typeof value.query !== 'string' || !value.query.trim()) return undefined;
  const results = Array.isArray(value.results)
    ? value.results
        .filter(
          (result: any) =>
            result &&
            typeof result.title === 'string' &&
            typeof result.url === 'string' &&
            /^https?:\/\//i.test(result.url)
        )
        .slice(0, 12)
        .map((result: any) => ({
          title: result.title,
          url: result.url,
          snippet: typeof result.snippet === 'string' ? result.snippet : '',
          image: typeof result.image === 'string' ? result.image : undefined,
        }))
    : [];

  return {
    query: value.query.slice(0, 240),
    status: value.status === 'error' ? 'error' : 'ready',
    results,
    latencyMs: typeof value.latencyMs === 'number' && Number.isFinite(value.latencyMs) ? Math.max(0, Math.round(value.latencyMs)) : 0,
    provider: typeof value.provider === 'string' && value.provider ? value.provider : TERMINUS_SEARCH_PROVIDER,
    error: typeof value.error === 'string' ? value.error.slice(0, 500) : undefined,
  };
}

/** Rebuild a tab from stored JSON, dropping anything untrusted or out of range */
function normalizeTab(value: any): BrowserTab | null {
  if (!value || typeof value.id !== 'string' || typeof value.url !== 'string') return null;

  const history = Array.isArray(value.history)
    ? value.history.filter((entry: unknown): entry is string => typeof entry === 'string')
    : [];
  const safeHistory = history.length > 0 ? history : [value.url || 'about:blank'];
  const rawIndex = typeof value.historyIndex === 'number' ? Math.round(value.historyIndex) : safeHistory.length - 1;
  const historyIndex = Math.min(Math.max(rawIndex, 0), safeHistory.length - 1);

  return {
    id: value.id,
    kind: isTabKind(value.kind) ? value.kind : 'web',
    title: typeof value.title === 'string' && value.title ? value.title : 'Nueva Pestaña',
    url: value.url || 'about:blank',
    displayUrl: typeof value.displayUrl === 'string' ? value.displayUrl : value.url || 'about:blank',
    frameable: typeof value.frameable === 'boolean' ? value.frameable : undefined,
    statusCode: typeof value.statusCode === 'number' ? value.statusCode : undefined,
    isLoading: false,
    content: '',
    history: safeHistory,
    historyIndex,
    viewMode: isPageMode(value.viewMode) ? value.viewMode : undefined,
    search: normalizeSearch(value.search),
    zoom:
      typeof value.zoom === 'number' && Number.isFinite(value.zoom)
        ? Math.min(2, Math.max(0.5, value.zoom))
        : undefined,
  };
}

/** Drop page payloads and huge outputs; a webpage entry is a page, not terminal history */
function trimLogEntry(value: any): TerminalLogEntry | null {
  if (!value || typeof value.id !== 'string' || typeof value.output !== 'string') return null;
  if (value.type === 'webpage') return null;

  const type = typeof value.type === 'string' ? value.type : 'stdout';
  const output = value.output.slice(0, MAX_LOG_OUTPUT);

  return {
    id: value.id,
    timestamp: typeof value.timestamp === 'string' ? value.timestamp : '',
    type,
    // Sessions stored before the fix may still carry the old banner without the final R
    output: type === 'ascii' && output.includes(BANNER_MARKER) ? BOOT_ASCII : output,
    command: typeof value.command === 'string' ? value.command : undefined,
    tabId: typeof value.tabId === 'string' ? value.tabId : undefined,
    exitCode: typeof value.exitCode === 'number' ? value.exitCode : undefined,
    interactiveFiles: Array.isArray(value.interactiveFiles) ? value.interactiveFiles.slice(0, 20) : undefined,
    notification: value.notification && typeof value.notification === 'object' ? value.notification : undefined,
  };
}

function trimLogsForTab(value: any): TerminalLogEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(trimLogEntry)
    .filter((entry: TerminalLogEntry | null): entry is TerminalLogEntry => entry !== null)
    .slice(-MAX_PERSISTED_LOGS);
}

/** Read the last session (tabs and active tab), or null when there is nothing usable */
export function loadSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.tabs)) return null;

    const tabs = parsed.tabs
      .map(normalizeTab)
      .filter((tab: BrowserTab | null): tab is BrowserTab => tab !== null);
    if (tabs.length === 0) return null;

    const activeTabId =
      typeof parsed.activeTabId === 'string' && tabs.some((tab: BrowserTab) => tab.id === parsed.activeTabId)
        ? parsed.activeTabId
        : tabs[0].id;

    const rawLogs = parsed.logs && typeof parsed.logs === 'object' ? parsed.logs : {};
    const logs: Record<string, TerminalLogEntry[]> = {};
    tabs.forEach((tab: BrowserTab) => {
      const entries = trimLogsForTab(rawLogs[tab.id]);
      if (entries.length > 0) logs[tab.id] = entries;
    });

    return { tabs, activeTabId, logs };
  } catch {
    return null;
  }
}

/** Persist the open tabs, without page bodies, so a reload restores the session */
export function saveSession(
  tabs: BrowserTab[],
  activeTabId: string,
  logsByTab: Record<string, TerminalLogEntry[]>
): void {
  try {
    const logs: Record<string, TerminalLogEntry[]> = {};
    tabs.forEach((tab) => {
      const entries = trimLogsForTab(logsByTab[tab.id] ?? []);
      if (entries.length > 0) logs[tab.id] = entries;
    });

    const slim: BrowserTab[] = tabs.map((tab) => ({
      id: tab.id,
      kind: tab.kind,
      title: tab.title,
      url: tab.url,
      displayUrl: tab.displayUrl,
      frameable: tab.frameable,
      statusCode: tab.statusCode,
      zoom: tab.zoom,
      history: tab.history,
      historyIndex: tab.historyIndex,
      viewMode: tab.viewMode,
      search:
        tab.search && tab.search.status !== 'loading'
          ? { ...tab.search, results: tab.search.results.slice(0, 12) }
          : undefined,
      isLoading: false,
      content: '',
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ tabs: slim, activeTabId, logs }));
  } catch {
    // Storage unavailable: the session simply is not restored next time
  }
}
