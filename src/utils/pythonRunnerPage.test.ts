import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';
import { pythonRunnerPage, PYTHON_RUNNER_CSP } from './pythonRunnerPage';

const RUNNER_URL = 'http://terminus.test/python-runner.html';

interface RunnerResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

interface RunnerMessage {
  type?: unknown;
  id?: unknown;
  result?: RunnerResult;
  error?: string;
}

async function runInIsolatedPage(code: string): Promise<{
  message: RunnerMessage;
  networkCalls: string[];
}> {
  const networkCalls: string[] = [];

  const dom = new JSDOM(pythonRunnerPage, {
    runScripts: 'dangerously',
    url: RUNNER_URL,
    beforeParse(window) {
      const block = (api: string) => {
        networkCalls.push(api);
        throw new Error(`${api} blocked by the headless test`);
      };

      // If the runner stops shadowing any of these, the test sees the attempt instead of silently
      // allowing jsdom to perform a request.
      Object.defineProperty(window, 'fetch', {
        configurable: true,
        writable: true,
        value: vi.fn(block),
      });
      Object.defineProperty(window, 'XMLHttpRequest', {
        configurable: true,
        writable: true,
        value: vi.fn(block),
      });
      Object.defineProperty(window, 'WebSocket', {
        configurable: true,
        writable: true,
        value: vi.fn(block),
      });
      Object.defineProperty(window, 'EventSource', {
        configurable: true,
        writable: true,
        value: vi.fn(block),
      });
    },
  });

  const id = `headless-${Date.now()}`;

  try {
    const message = await new Promise<RunnerMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        dom.window.removeEventListener('message', onMessage);
        reject(new Error('El runner no respondió al mensaje de prueba.'));
      }, 2000);

      const onMessage = (event: MessageEvent) => {
        const data = event.data as RunnerMessage | null;
        if (!data || data.type !== 'terminus-python-result' || data.id !== id) return;
        clearTimeout(timer);
        dom.window.removeEventListener('message', onMessage);
        resolve(data);
      };

      dom.window.addEventListener('message', onMessage);
      dom.window.dispatchEvent(
        new dom.window.MessageEvent('message', {
          data: { type: 'terminus-python-run', id, code },
          source: dom.window as unknown as MessageEventSource,
        })
      );
    });

    return { message, networkCalls };
  } finally {
    dom.window.close();
  }
}

describe('pythonRunnerPage', () => {
  it('ejecuta Python y no expone APIs de red al código del runner', async () => {
    const { message, networkCalls } = await runInIsolatedPage(
      [
        'print(2 ** 10)',
        'print(typeof fetch)',
        'print(typeof XMLHttpRequest)',
        'print(typeof WebSocket)',
        'print(typeof EventSource)',
        'print(typeof importScripts)',
        'print(typeof window)',
        'print(typeof document)',
        'print(typeof parent)',
        'print(typeof top)',
        'print(typeof postMessage)',
      ].join('\n')
    );

    expect(message.error).toBeUndefined();
    expect(message.result).toEqual({
      stdout: ['1024', 'undefined', 'undefined', 'undefined', 'undefined', 'undefined', 'undefined', 'undefined', 'undefined', 'undefined', 'undefined'].join('\n'),
      stderr: '',
      exitCode: 0,
    });
    expect(networkCalls).toEqual([]);
  });

  it('no realiza una petición cuando el código intenta usar fetch', async () => {
    const { message, networkCalls } = await runInIsolatedPage(
      'fetch("http://127.0.0.1:9/network-leak")'
    );

    expect(message.error).toMatch(/fetch is not a function/i);
    expect(networkCalls).toEqual([]);
  });

  it('declara una CSP sin destinos de red', () => {
    expect(PYTHON_RUNNER_CSP).toContain("default-src 'none'");
    expect(PYTHON_RUNNER_CSP).toContain("connect-src 'none'");
    expect(PYTHON_RUNNER_CSP).toContain("img-src 'none'");
    expect(PYTHON_RUNNER_CSP).toContain("style-src 'none'");
    expect(PYTHON_RUNNER_CSP).toContain("base-uri 'none'");
    expect(PYTHON_RUNNER_CSP).toContain("form-action 'none'");
    expect(PYTHON_RUNNER_CSP).not.toMatch(/\b(?:https?|wss?):/i);
    expect(pythonRunnerPage).not.toMatch(/<(?:script|img|link|iframe)\b[^>]*\bsrc\s*=/i);
  });
});
