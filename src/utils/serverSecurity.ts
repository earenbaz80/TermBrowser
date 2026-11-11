/**
 * Server-only security helpers.
 *
 * Kept separate from server.ts so path traversal, metadata blocking, private
 * network policy and proxy sanitization can be unit tested without starting
 * Express or Vite.
 */

import { lookup } from 'node:dns/promises';

export const API_SESSION_COOKIE = 'terminus_local_session';
export const API_TOKEN_HEADER = 'x-terminus-token';

const METADATA_HOSTS = new Set([
  '169.254.169.254',
  'metadata.google.internal',
  'metadata',
  'instance-data',
]);

export function isMetadataHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return METADATA_HOSTS.has(host) || host === 'fd00:ec2::254';
}

/** RFC1918, loopback, link-local, CGNAT, documentation and reserved ranges. */
export function isPrivateAddress(rawAddress: string): boolean {
  const address = rawAddress.toLowerCase().split('%')[0];
  const mapped = address.startsWith('::ffff:') ? address.slice(7) : address;

  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(mapped)) {
    const [a, b, c] = mapped.split('.').map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
    if (a === 198 && b === 51 && c === 100) return true;
    if (a === 203 && b === 0 && c === 113) return true;
    if (a >= 224) return true;
  }

  if (mapped === '::1' || mapped === '::') return true;
  if (/^(?:fc|fd|fe8|fe9|fea|feb)/.test(mapped)) return true;
  if (mapped.startsWith('2001:db8:')) return true;
  return false;
}

export function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.home.arpa')
  );
}

/**
 * Bind loopback by default. LAN exposure requires both HOST=<address> and the explicit
 * TERMINUS_ALLOW_LAN=1 opt-in, because the local filesystem API has no per-user auth.
 */
export function resolveListenHost(rawHost: string | undefined): string {
  const host = (rawHost ?? '').trim();
  if (!host) return '127.0.0.1';
  if (host === 'localhost') return '127.0.0.1';
  if (host === '127.0.0.1' || host === '::1') return host;
  return process.env.TERMINUS_ALLOW_LAN === '1' ? host : '127.0.0.1';
}

export function blockPrivateNetworks(): boolean {
  return (
    process.env.TERMINUS_BLOCK_PRIVATE === '1' ||
    process.env.TERMINUS_NETWORK_POLICY === 'public'
  );
}

/** Reject metadata endpoints and, in public-only mode, private destinations. */
export async function assertRemoteTarget(url: URL): Promise<void> {
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Solo se permiten destinos HTTP y HTTPS.');
  }
  if (isMetadataHost(url.hostname)) {
    throw new Error('Los endpoints de metadata cloud están bloqueados.');
  }
  if (!blockPrivateNetworks()) return;

  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (isPrivateHostname(hostname)) {
    throw new Error('La política de red solo permite destinos públicos.');
  }

  const addresses = await lookup(hostname, { all: true });
  if (addresses.length === 0 || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new Error('La política de red solo permite destinos públicos.');
  }
}

/**
 * Fetch with per-hop validation. Redirects are followed manually so a public
 * URL cannot bounce into a private address or metadata endpoint.
 */
export async function fetchRemote(
  rawUrl: string | URL,
  init: RequestInit = {},
  maxRedirects = 5
): Promise<Response> {
  let current = rawUrl instanceof URL ? rawUrl : new URL(rawUrl);

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    await assertRemoteTarget(current);
    const response = await fetch(current, {
      ...init,
      redirect: 'manual',
    });

    if (response.status < 300 || response.status >= 400) return response;
    const location = response.headers.get('location');
    if (!location) return response;
    current = new URL(location, current);
  }

  throw new Error('Demasiadas redirecciones al cargar el destino.');
}

/** Cookie/session helpers used by the API guard. */
export function hasApiSessionCookie(cookieHeader: string | undefined): boolean {
  if (!cookieHeader) return false;
  return cookieHeader
    .split(';')
    .some((part) => part.trim().startsWith(`${API_SESSION_COOKIE}=`));
}

export function isSameOriginRequest(
  origin: string | undefined,
  host: string | undefined,
  secFetchSite: string | undefined
): boolean {
  if (secFetchSite && secFetchSite !== 'same-origin' && secFetchSite !== 'none') {
    return false;
  }
  if (!origin) return true;
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * Remove document-level escape hatches before serving a proxied page. Scripts,
 * inline handlers and iframes are already stripped by the caller; this covers
 * refresh redirects, injected base URLs, plugins and javascript: destinations.
 */
export function sanitizeProxiedHtml(html: string): string {
  return html
    .replace(/<meta\b[^>]*http-equiv\s*=\s*["']?\s*refresh[^>]*>/gi, ' ')
    .replace(/<base\b[^>]*>/gi, ' ')
    .replace(/<(?:object|embed|portal)\b[^>]*>[\s\S]*?<\/(?:object|embed|portal)>/gi, ' ')
    .replace(/<(?:object|embed|portal)\b[^>]*\/?>/gi, ' ')
    .replace(
      /\s(?:href|src|action|formaction)\s*=\s*(["'])\s*(?:javascript|vbscript|data:text\/html)[\s\S]*?\1/gi,
      ''
    );
}

/** Turn a page title or hostname into a safe download filename. */
export function safeDownloadFilename(value: string, fallback = 'terminus-descarga'): string {
  const cleaned = value
    .normalize('NFKD')
    .replace(/[^\w.\- ]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 100);
  return cleaned || fallback;
}
