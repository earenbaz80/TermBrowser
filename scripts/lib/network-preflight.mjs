/**
 * Preflight de red para los E2E que dependen de internet.
 *
 * Un E2E que navega a un dominio público o descarga listas de filtros puede
 * fallar por la red del runner (DNS, proxy, CDN caída) y no por el producto.
 * Comprobar los destinos antes de arrancar la app convierte ese caso en un
 * error propio: `UnreachableNetworkError` con `exitCode = 2`, que el CI trata
 * como aviso en vez de como regresión.
 *
 * El reintento es acotado a propósito: tres intentos por destino, separados por
 * una espera creciente. Si tras eso sigue sin haber red, no es un fallo
 * transitorio del producto.
 */

export const NETWORK_UNAVAILABLE_NAME = 'NetworkUnavailableError';

export class UnreachableNetworkError extends Error {
  constructor(failures, { attempts } = {}) {
    const detail = failures.map((failure) => `${failure.url} (${failure.reason})`).join('; ');
    super(`Sin red para el E2E: ${detail}`);
    this.name = NETWORK_UNAVAILABLE_NAME;
    /** Código de salida que los guiones y el CI reconocen como infraestructura. */
    this.exitCode = 2;
    this.failures = failures;
    this.attempts = attempts;
  }
}

/** True cuando el fallo es de red del runner y no del producto. */
export function isNetworkUnavailable(error) {
  return error instanceof UnreachableNetworkError || error?.name === NETWORK_UNAVAILABLE_NAME;
}

const defaultWait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Pide una URL y devuelve si respondió, cuántos intentos hicieron falta y por
 * qué falló. No lanza: el llamador decide qué hacer con el resultado.
 */
export async function probe(
  url,
  {
    attempts = 3,
    timeoutMs = 10000,
    delayMs = 1500,
    request = fetch,
    wait = defaultWait,
  } = {}
) {
  let reason = 'sin intentos';
  let status = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await request(url, {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
      });
      status = response.status;
      // Solo interesa que responda: no se descarga la lista entera.
      await response.body?.cancel?.().catch?.(() => {});
      if (response.ok) return { url, ok: true, status, attempts: attempt, reason: null };
      reason = `HTTP ${status}`;
    } catch (error) {
      reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    }

    if (attempt < attempts) await wait(delayMs * attempt);
  }

  return { url, ok: false, status, attempts, reason };
}

/**
 * Comprueba todos los destinos; si alguno no responde lanza
 * `UnreachableNetworkError` nombrando cada uno con su motivo.
 */
export async function assertReachable(urls, options = {}) {
  const { onAttempt, ...probeOptions } = options;
  const results = await Promise.all(
    urls.map(async (url) => {
      const result = await probe(url, probeOptions);
      onAttempt?.(result);
      return result;
    })
  );

  const failures = results.filter((result) => !result.ok);
  if (failures.length > 0) {
    throw new UnreachableNetworkError(failures, { attempts: probeOptions.attempts ?? 3 });
  }
  return results;
}
