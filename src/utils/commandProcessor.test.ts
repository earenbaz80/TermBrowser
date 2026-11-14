import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BrowserTab } from '../types';
import {
  HOME_FOCUS_EVENT,
  processCommand,
  type CommandContext,
} from './commandProcessor';
import { translateConsole } from '../i18n';

const makeTab = () =>
  ({
    id: 'tab_1',
    kind: 'web',
    title: 'Inicio',
    url: 'about:blank',
    displayUrl: 'about:blank',
    history: [],
    historyIndex: 0,
    isLoading: false,
  }) as unknown as BrowserTab;

/** Only the pieces goto touches; the rest answer as empty state or no-ops. */
const makeContext = (initialTabs: BrowserTab[] = [makeTab()]) => {
  let tabs: BrowserTab[] = initialTabs;
  const seed: Record<string, unknown> = {
    activeTabId: 'tab_1',
    bookmarks: [],
    scripts: [],
    extensions: [],
    keybindings: [],
    activityLogs: [],
    metrics: {},
    security: {},
    fileSystem: {},
    currentPath: '/workspace',
    locale: 'es',
    tc: (key: Parameters<typeof translateConsole>[1], vars?: Record<string, string | number>) =>
      translateConsole('es', key, vars),
  };
  const setTabs: CommandContext['setTabs'] = (next) => {
    const previous = tabs;
    tabs = typeof next === 'function' ? (next as (prev: BrowserTab[]) => BrowserTab[])(previous) : next;
  };
  const ctx = new Proxy(seed, {
    get: (target, prop) => {
      if (prop === 'tabs') return tabs;
      if (prop === 'setTabs') return setTabs;
      if (prop in target) return target[prop as string];
      return () => {};
    },
  }) as unknown as CommandContext;

  return { ctx, tab: () => tabs[0] };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('home', () => {
  it('returns the tab to the start screen and appends it to the history', async () => {
    const pageTab = {
      ...makeTab(),
      title: 'Example Domain',
      url: 'https://example.com',
      displayUrl: 'https://example.com',
      history: ['about:blank', 'https://example.com'],
      historyIndex: 1,
    } as BrowserTab;
    const { ctx, tab } = makeContext([pageTab]);

    await processCommand('home', ctx);

    expect(tab().url).toBe('about:blank');
    expect(tab().displayUrl).toBe('about:blank');
    expect(tab().title).toBe('Nueva Pestaña');
    expect(tab().history).toEqual(['about:blank', 'https://example.com', 'about:blank']);
    expect(tab().historyIndex).toBe(2);
  });

  it('avisa para que el inicio recupere el foco aunque ya estuviera allí', async () => {
    const { ctx } = makeContext([makeTab()]);
    const listener = vi.fn();
    window.addEventListener(HOME_FOCUS_EVENT, listener);

    await processCommand('home', ctx);

    window.removeEventListener(HOME_FOCUS_EVENT, listener);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('proxy failures', () => {
  it('records the proxy status so the surface can show the error scene', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502 }));
    const { ctx, tab } = makeContext();

    const entry = await processCommand('goto https://example.com', ctx);

    expect(tab().statusCode).toBe(502);
    expect(entry.output).toContain('No se pudo cargar');
  });

  it('treats an unreachable proxy as a 502 failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const { ctx, tab } = makeContext();

    await processCommand('goto https://example.com', ctx);

    expect(tab().statusCode).toBe(502);
  });

  it('keeps non-ok statuses that are not 5xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    const { ctx, tab } = makeContext();

    await processCommand('goto https://example.com', ctx);

    expect(tab().statusCode).toBe(403);
  });
});
