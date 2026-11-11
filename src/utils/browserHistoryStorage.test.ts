import { beforeEach, describe, expect, it } from 'vitest';
import {
  BROWSER_HISTORY_STORAGE_KEY,
  browserHistoryUrls,
  clearBrowserHistory,
  loadBrowserHistory,
  recordBrowserHistory,
} from './browserHistoryStorage';

describe('browserHistoryStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('keeps the newest visit first and never duplicates a URL', () => {
    recordBrowserHistory([
      { url: 'https://example.com/a', title: 'A' },
      { url: 'https://example.com/b', title: 'B' },
    ]);
    const updated = recordBrowserHistory([{ url: 'https://example.com/a', title: 'A nueva' }]);

    expect(updated).toHaveLength(2);
    expect(updated[0].url).toBe('https://example.com/a');
    expect(updated[0].title).toBe('A nueva');
    expect(browserHistoryUrls(updated)).toEqual([
      'https://example.com/a',
      'https://example.com/b',
    ]);
  });

  it('ignores internal URLs and survives malformed storage', () => {
    expect(recordBrowserHistory([{ url: 'about:blank' }, { url: 'terminus://search?q=x' }])).toEqual([]);
    localStorage.setItem(BROWSER_HISTORY_STORAGE_KEY, '{not-json');
    expect(loadBrowserHistory()).toEqual([]);
  });

  it('clears the persisted history', () => {
    recordBrowserHistory([{ url: 'https://example.com' }]);
    clearBrowserHistory();
    expect(loadBrowserHistory()).toEqual([]);
  });
});
