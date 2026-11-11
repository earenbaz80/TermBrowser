import { Bookmark } from '../types';

const STORAGE_KEY = 'termbrowser.bookmarks';

export const DEFAULT_BOOKMARKS: Bookmark[] = [
  { id: 'bm_1', title: 'Hacker News', url: 'https://news.ycombinator.com', tags: ['tech'], createdAt: '2026-11-07' },
  { id: 'bm_2', title: 'Wikipedia', url: 'https://en.wikipedia.org', tags: ['docs'], createdAt: '2026-11-07' },
];

const isBookmark = (value: any): value is Bookmark =>
  Boolean(value) && typeof value.id === 'string' && typeof value.title === 'string' && typeof value.url === 'string';

/** Read the bookmark strip from localStorage, falling back to the built-in defaults */
export function loadBookmarks(): Bookmark[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_BOOKMARKS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_BOOKMARKS;
    return parsed.filter(isBookmark).map((bm) => ({
      ...bm,
      tags: Array.isArray(bm.tags) ? bm.tags : [],
      createdAt: typeof bm.createdAt === 'string' ? bm.createdAt : new Date().toISOString().split('T')[0],
    }));
  } catch {
    return DEFAULT_BOOKMARKS;
  }
}

/** Persist the bookmark strip so it survives reloads and restarts */
export function saveBookmarks(bookmarks: Bookmark[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
  } catch {
    // Storage disabled or full: the session keeps working with in-memory bookmarks
  }
}
