/**
 * Terminus - Persistent Command History Manager (localStorage)
 */

export const HISTORY_STORAGE_KEY = 'termbrowser_cmd_history_v1';
export const HISTORY_SYNC_EVENT = 'termbrowser-history-sync';
const MAX_HISTORY_ENTRIES = 250;

const DEFAULT_BOOT_HISTORY: string[] = [
  'help',
  'fs workspace',
  'goto https://news.ycombinator.com',
  'python -c "print(\'Terminus listo\')"',
  'mc',
  'top',
];

/**
 * Retrieves the persisted command history from localStorage.
 * Falls back to default starter commands only if no history key has been initialized yet.
 */
export function getPersistedCommandHistory(): string[] {
  try {
    const saved = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (saved !== null) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
      }
    } else {
      // Seed initial history on first boot so localStorage is immediately populated
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(DEFAULT_BOOT_HISTORY));
      return [...DEFAULT_BOOT_HISTORY];
    }
  } catch {
    // Ignore storage read errors
  }
  return [...DEFAULT_BOOT_HISTORY];
}

/**
 * Appends a command to the persistent command history in localStorage
 * and notifies any mounted terminal views.
 */
export function appendCommandToHistory(rawCmd: string): string[] {
  const cmd = rawCmd.trim();
  if (!cmd) return getPersistedCommandHistory();

  // Do not re-add history clearing commands after clearing
  const lower = cmd.toLowerCase();
  if (lower === 'history clear' || lower === 'history -c' || lower === 'history purge') {
    return getPersistedCommandHistory();
  }

  const current = getPersistedCommandHistory();
  const isConsecutiveDuplicate = current.length > 0 && current[current.length - 1] === cmd;
  const updated = isConsecutiveDuplicate ? current : [...current, cmd].slice(-MAX_HISTORY_ENTRIES);

  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent(HISTORY_SYNC_EVENT, { detail: updated }));
  } catch {
    // Ignore quota errors
  }

  return updated;
}

/**
 * Clears all persisted command history in localStorage and notifies listeners.
 */
export function clearPersistedCommandHistory(): void {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify([]));
    window.dispatchEvent(new CustomEvent(HISTORY_SYNC_EVENT, { detail: [] }));
  } catch {
    // Ignore storage errors
  }
}
