import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

const SYSTEM_STATS = {
  cpu: { loadAvg: [0.1], count: 8 },
  memory: { used: 512 * 1024 * 1024, total: 16 * 1024 * 1024 * 1024 },
};

beforeEach(() => {
  localStorage.clear();

  // The app polls system stats and talks to its API routes; tests only need a benign answer
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => SYSTEM_STATS,
      text: async () => JSON.stringify(SYSTEM_STATS),
    }))
  );

  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    });
  }

  if (!('ResizeObserver' in window)) {
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  }

  window.scrollTo = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
