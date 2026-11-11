/**
 * Same-origin API client with a per-process session token.
 *
 * The token is fetched from /api/session and sent on privileged local APIs
 * (filesystem and vault). The session cookie is HttpOnly and the server also
 * checks Origin/Sec-Fetch-Site, so a cross-site page cannot read the token or
 * reuse a session.
 */

const SESSION_ENDPOINT = '/api/session';
let tokenPromise: Promise<string> | null = null;

export function resetApiSession(): void {
  tokenPromise = null;
}

async function fetchSessionToken(): Promise<string> {
  const response = await fetch(SESSION_ENDPOINT, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`No se pudo iniciar la sesión local (HTTP ${response.status}).`);
  }

  const data = await response.json().catch(() => null);
  if (!data || typeof data.token !== 'string' || !data.token) {
    throw new Error('El servidor no devolvió un token de sesión válido.');
  }
  return data.token;
}

/** Resolve the session token once per page load; concurrent callers share it. */
export function ensureApiSession(): Promise<string> {
  if (!tokenPromise) {
    tokenPromise = fetchSessionToken().catch((error) => {
      tokenPromise = null;
      throw error;
    });
  }
  return tokenPromise;
}

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token = await ensureApiSession();
  const headers = new Headers(init.headers);
  headers.set('X-Terminus-Token', token);
  headers.set('Accept', headers.get('Accept') || 'application/json');

  return fetch(input, {
    ...init,
    headers,
    credentials: 'same-origin',
  });
}
