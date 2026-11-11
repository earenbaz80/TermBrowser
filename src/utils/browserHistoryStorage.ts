/**
 * Terminus - Persistent global browsing history.
 *
 * Tab history powers back/forward. This store is the browser-wide history used
 * by the address bar across tabs and sessions, kept small and deduplicated.
 */

export const BROWSER_HISTORY_STORAGE_KEY = 'termbrowser.browser-history.v1';
export const BROWSER_HISTORY_SYNC_EVENT = 'termbrowser-browser-history-sync';
const MAX_BROWSER_HISTORY_ENTRIES = 200;

export interface BrowserHistoryEntry {
  url: string;
  title: string;
  visitedAt: number;
}

const isWebUrl = (value: string): boolean => /^https?:\/\//i.test(value);

const normalizeEntry = (value: any): BrowserHistoryEntry | null => {
  if (!value || typeof value.url !== 'string' || !isWebUrl(value.url)) return null;
  return {
    url: value.url,
    title: typeof value.title === 'string' && value.title.trim() ? value.title.slice(0, 180) : value.url,
    visitedAt:
      typeof value.visitedAt === 'number' && Number.isFinite(value.visitedAt)
        ? value.visitedAt
        : Date.now(),
  };
};

export function loadBrowserHistory(): BrowserHistoryEntry[] {
  try {
    const raw = localStorage.getItem(BROWSER_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeEntry)
      .filter((entry: BrowserHistoryEntry | null): entry is BrowserHistoryEntry => entry !== null)
      .slice(0, MAX_BROWSER_HISTORY_ENTRIES);
  } catch {
    return [];
  }
}

/**
 * Record the pages currently held by the app. The newest visit wins, but an
 * entry is never duplicated; the list stays bounded and newest-first.
 */
export function recordBrowserHistory(
  pages: { url: string; title?: string }[]
): BrowserHistoryEntry[] {
  const current = loadBrowserHistory();
  const byUrl = new Map(current.map((entry) => [entry.url, entry]));
  const now = Date.now();

  pages.forEach((page, index) => {
    if (!page || typeof page.url !== 'string' || !isWebUrl(page.url)) return;
    byUrl.set(page.url, {
      url: page.url,
      title: typeof page.title === 'string' && page.title.trim() ? page.title.slice(0, 180) : page.url,
      visitedAt: now - index,
    });
  });

  const entries = [...byUrl.values()]
    .sort((a, b) => b.visitedAt - a.visitedAt)
    .slice(0, MAX_BROWSER_HISTORY_ENTRIES);

  try {
    localStorage.setItem(BROWSER_HISTORY_STORAGE_KEY, JSON.stringify(entries));
    window.dispatchEvent(new CustomEvent(BROWSER_HISTORY_SYNC_EVENT, { detail: entries }));
  } catch {
    // Storage unavailable: keep the in-memory result so this session still has suggestions.
  }

  return entries;
}

export function clearBrowserHistory(): BrowserHistoryEntry[] {
  try {
    localStorage.setItem(BROWSER_HISTORY_STORAGE_KEY, JSON.stringify([]));
    window.dispatchEvent(new CustomEvent(BROWSER_HISTORY_SYNC_EVENT, { detail: [] }));
  } catch {
    // Ignore storage failures.
  }
  return [];
}

export function browserHistoryUrls(entries: BrowserHistoryEntry[]): string[] {
  return entries.map((entry) => entry.url);
}
