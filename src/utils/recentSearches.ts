/**
 * Terminus - Recent searches shown under the start page field.
 *
 * Kept in localStorage like the theme and the page modes: newest first, bounded
 * and deduplicated case-insensitively so the start page keeps a short chip row.
 */

export const RECENT_SEARCHES_STORAGE_KEY = 'termbrowser.recent-searches.v1';
export const MAX_RECENT_SEARCHES = 3;
const MAX_QUERY_LENGTH = 80;

export function loadRecentSearches(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_SEARCHES_STORAGE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
      .slice(0, MAX_RECENT_SEARCHES);
  } catch {
    return [];
  }
}

/** Newest search wins, duplicates collapse and the oldest entry falls off the end. */
export function recordRecentSearch(query: string): string[] {
  const clean = query.trim().slice(0, MAX_QUERY_LENGTH);
  const current = loadRecentSearches();
  if (!clean) return current;

  const searches = [
    clean,
    ...current.filter((entry) => entry.toLowerCase() !== clean.toLowerCase()),
  ].slice(0, MAX_RECENT_SEARCHES);

  try {
    localStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(searches));
  } catch {
    // Storage unavailable: the search still runs, it just is not remembered
  }

  return searches;
}
