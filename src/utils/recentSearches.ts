/**
 * Terminus - Recent searches shown under the start page field.
 *
 * Kept in localStorage like the theme and the page modes. The list is bounded,
 * newest first and deduplicated case-insensitively so the start page keeps a
 * single row of chips.
 */

export const RECENT_SEARCHES_STORAGE_KEY = 'termbrowser.recent-searches.v1';
export const MAX_RECENT_SEARCHES = 3;
const MAX_QUERY_LENGTH = 80;

const normalizeQuery = (value: unknown): string =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, MAX_QUERY_LENGTH) : '';

export function loadRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const seen = new Set<string>();
    const searches: string[] = [];
    for (const entry of parsed) {
      const clean = normalizeQuery(entry);
      if (!clean) continue;
      const key = clean.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      searches.push(clean);
      if (searches.length >= MAX_RECENT_SEARCHES) break;
    }
    return searches;
  } catch {
    return [];
  }
}

/** Newest search wins, duplicates collapse and the oldest entry falls off the end. */
export function recordRecentSearch(query: string): string[] {
  const clean = normalizeQuery(query);
  const current = loadRecentSearches();
  if (!clean) return current;

  const key = clean.toLowerCase();
  const searches = [clean, ...current.filter((entry) => entry.toLowerCase() !== key)].slice(
    0,
    MAX_RECENT_SEARCHES
  );

  try {
    localStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(searches));
  } catch {
    // Storage unavailable: the search still runs, it just is not remembered
  }

  return searches;
}
