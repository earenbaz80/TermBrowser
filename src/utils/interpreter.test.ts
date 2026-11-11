import { afterEach, describe, expect, it, vi } from 'vitest';
import { runPythonCode } from './interpreter';

const MAX_CODE_LENGTH = 200000;
const PYTHON_TIMEOUT_MS = 10000;

function getRunnerIframe(): HTMLIFrameElement {
  const iframe = document.querySelector('iframe');
  expect(iframe).toBeInstanceOf(HTMLIFrameElement);
  return iframe as HTMLIFrameElement;
}

function getRequestId(iframe: HTMLIFrameElement): string {
  const contentWindow = iframe.contentWindow;
  expect(contentWindow).not.toBeNull();
  const postMessage = vi.spyOn(contentWindow as Window, 'postMessage');
  iframe.onload?.(new Event('load'));

  const request = postMessage.mock.calls.at(-1)?.[0] as { id?: unknown } | undefined;
  expect(typeof request?.id).toBe('string');
  return request?.id as string;
}

function sendResult(
  iframe: HTMLIFrameElement,
  id: string,
  result: { stdout: string; stderr: string; exitCode: number }
) {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { type: 'terminus-python-result', id, result },
      source: iframe.contentWindow as unknown as MessageEventSource,
    })
  );
}

afterEach(() => {
  vi.useRealTimers();
  for (const iframe of document.querySelectorAll('iframe')) {
    iframe.remove();
  }
});

describe('runPythonCode', () => {
  it('crea un iframe sandbox sin acceso al origen de la app y lo elimina al terminar', async () => {
    const promise = runPythonCode('print(2)');
    const iframe = getRunnerIframe();

    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts');
    expect(iframe.getAttribute('sandbox')).not.toContain('allow-same-origin');
    expect(iframe.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(iframe.getAttribute('aria-hidden')).toBe('true');
    expect(iframe.getAttribute('title')).toBe('Intérprete Python aislado');
    expect(iframe.src).toContain('/python-runner.html');
    expect(iframe.style.display).toBe('none');

    const id = getRequestId(iframe);
    sendResult(iframe, id, { stdout: '2', stderr: '', exitCode: 0 });

    await expect(promise).resolves.toEqual({ stdout: '2', stderr: '', exitCode: 0 });
    expect(iframe.isConnected).toBe(false);
  });

  it('devuelve un error de timeout y limpia el iframe', async () => {
    vi.useFakeTimers();

    const promise = runPythonCode('print(1)');
    const iframe = getRunnerIframe();

    await vi.advanceTimersByTimeAsync(PYTHON_TIMEOUT_MS);
    await expect(promise).resolves.toEqual({
      stdout: '',
      stderr: 'PythonTraceback (most recent call last):\n  Tiempo de ejecución agotado (10 s).',
      exitCode: 1,
    });
    expect(iframe.isConnected).toBe(false);
  });

  it('rechaza el código que supera el límite antes de crear el iframe', async () => {
    const result = await runPythonCode('x'.repeat(MAX_CODE_LENGTH + 1));

    expect(result).toEqual({
      stdout: '',
      stderr: 'PythonTraceback (most recent call last):\n  El código Python supera el límite permitido.',
      exitCode: 1,
    });
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('rechaza un resultado inválido y limpia el iframe', async () => {
    const promise = runPythonCode('print(1)');
    const iframe = getRunnerIframe();
    const id = getRequestId(iframe);

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'terminus-python-result',
          id,
          result: { stdout: 'incompleto' },
        },
        source: iframe.contentWindow as unknown as MessageEventSource,
      })
    );

    await expect(promise).resolves.toEqual({
      stdout: '',
      stderr: 'PythonTraceback (most recent call last):\n  El intérprete devolvió un resultado inválido.',
      exitCode: 1,
    });
    expect(iframe.isConnected).toBe(false);
  });
});
