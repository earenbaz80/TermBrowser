import { describe, expect, it, vi } from 'vitest';
import {
  assertReachable,
  isNetworkUnavailable,
  probe,
  UnreachableNetworkError,
} from './network-preflight.mjs';

/** Respuesta mínima: el preflight solo mira `ok`, `status` y cancela el cuerpo. */
const response = (status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  body: { cancel: () => Promise.resolve() },
});

const neverWait = () => Promise.resolve();

describe('preflight de red', () => {
  it('acepta un destino que responde al primer intento', async () => {
    const request = vi.fn().mockResolvedValue(response(200));

    const result = await probe('https://example.com/', { request, wait: neverWait });

    expect(result).toEqual({ url: 'https://example.com/', ok: true, status: 200, attempts: 1, reason: null });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('reintenta de forma acotada y se recupera de un fallo transitorio', async () => {
    const waits = [];
    const request = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValue(response(200));

    const result = await probe('https://example.com/', {
      request,
      wait: (ms) => {
        waits.push(ms);
        return Promise.resolve();
      },
    });

    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(3);
    expect(request).toHaveBeenCalledTimes(3);
    // Espera creciente entre intentos, no un bucle apretado.
    expect(waits).toEqual([1500, 3000]);
  });

  it('se rinde tras los intentos y explica por qué', async () => {
    const request = vi.fn().mockRejectedValue(new TypeError('getaddrinfo ENOTFOUND example.com'));

    const result = await probe('https://example.com/', { request, wait: neverWait });

    expect(result.ok).toBe(false);
    expect(result.attempts).toBe(3);
    expect(result.reason).toContain('ENOTFOUND');
    expect(request).toHaveBeenCalledTimes(3);
  });

  it('trata un HTTP de error como destino no disponible', async () => {
    const request = vi.fn().mockResolvedValue(response(503));

    const result = await probe('https://example.com/', { request, wait: neverWait });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('HTTP 503');
  });

  it('nombra cada destino caído en un error propio con código 2', async () => {
    const request = vi.fn(async (url) => {
      if (url.includes('easylist')) throw new TypeError('fetch failed');
      return response(200);
    });

    const error = await assertReachable(
      ['https://example.com/', 'https://raw.githubusercontent.com/ghostty/easylist.txt'],
      { request, wait: neverWait }
    ).catch((failure) => failure);

    expect(isNetworkUnavailable(error)).toBe(true);
    expect(error).toBeInstanceOf(UnreachableNetworkError);
    expect(error.exitCode).toBe(2);
    expect(error.failures.map((failure) => failure.url)).toEqual([
      'https://raw.githubusercontent.com/ghostty/easylist.txt',
    ]);
    expect(error.message).toContain('Sin red para el E2E');
    expect(error.message).toContain('easylist.txt (TypeError: fetch failed)');
  });

  it('no llama error de red a un fallo normal del producto', async () => {
    const request = vi.fn().mockResolvedValue(response(200));

    await expect(assertReachable(['https://example.com/'], { request, wait: neverWait })).resolves.toHaveLength(1);
    expect(isNetworkUnavailable(new Error('Los filtros cosméticos no se aplicaron'))).toBe(false);
    expect(isNetworkUnavailable(undefined)).toBe(false);
  });
});
