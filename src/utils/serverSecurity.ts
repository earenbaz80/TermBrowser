/**
 * Server-only security helpers.
 *
 * Kept separate from server.ts so path traversal, metadata blocking, private
 * network policy and proxy sanitization can be unit tested without starting
 * Express or Vite.
 */

import { lookup } from 'node:dns/promises';
import type { LookupFunction } from 'node:net';
import sanitizeHtml from 'sanitize-html';
import { Agent, fetch as undiciFetch } from 'undici';
import { isPrivateAddress, isPrivateHostname } from './networkPolicy';

export { isPrivateAddress, isPrivateHostname } from './networkPolicy';

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

/**
 * Private destinations are blocked by default. A local/intranet opt-in must be
 * explicit; the legacy block switch and the public policy still win, so a mixed
 * configuration always fails closed.
 */
export function blockPrivateNetworks(): boolean {
  if (process.env.TERMINUS_BLOCK_PRIVATE === '1') return true;
  if (process.env.TERMINUS_NETWORK_POLICY === 'public') return true;
  if (process.env.TERMINUS_BLOCK_PRIVATE === '0') return false;
  if (process.env.TERMINUS_ALLOW_PRIVATE === '1') return false;
  if (
    process.env.TERMINUS_NETWORK_POLICY === 'local' ||
    process.env.TERMINUS_NETWORK_POLICY === 'private'
  ) {
    return false;
  }
  return true;
}

export type RemoteResolver = (
  hostname: string,
  options: { all: true }
) => Promise<Array<{ address: string; family: number }>>;

export type ResolvedRemoteTarget = {
  address: string;
  family: number;
};

/**
 * Validate a target and return the single address that must be used for the
 * actual connection. Resolving once and pinning avoids the DNS rebinding gap
 * between assertRemoteTarget() and fetch(). The resolver is injectable so the
 * rebinding path can be tested deterministically.
 */
export async function resolveRemoteTarget(
  url: URL,
  resolver: RemoteResolver = lookup
): Promise<ResolvedRemoteTarget> {
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Solo se permiten destinos HTTP y HTTPS.');
  }
  if (isMetadataHost(url.hostname)) {
    throw new Error('Los endpoints de metadata cloud están bloqueados.');
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = await resolver(hostname, { all: true });
  if (addresses.length === 0) {
    throw new Error('No se pudo resolver el destino remoto.');
  }

  if (blockPrivateNetworks()) {
    const blockedMessage =
      'La política de red bloquea destinos privados. Define TERMINUS_ALLOW_PRIVATE=1 solo si confías en la red local.';
    if (isPrivateHostname(hostname) || addresses.some((entry) => isPrivateAddress(entry.address))) {
      throw new Error(blockedMessage);
    }
  }

  return { address: addresses[0].address, family: addresses[0].family };
}

/** Reject metadata endpoints and, by default, private destinations. */
export async function assertRemoteTarget(
  url: URL,
  resolver: RemoteResolver = lookup
): Promise<void> {
  await resolveRemoteTarget(url, resolver);
}

const MAX_PINNED_AGENTS = 32;
const pinnedAgents = new Map<string, Agent>();

function pinnedAgentFor(url: URL, target: ResolvedRemoteTarget): Agent {
  const port = url.port || (url.protocol === 'https:' ? '443' : '80');
  const key = `${url.protocol}//${url.hostname}:${port}|${target.address}|${target.family}`;
  const existing = pinnedAgents.get(key);
  if (existing) return existing;

  const lookup: LookupFunction = (_hostname, options, callback) => {
    if (options.all) {
      callback(null, [{ address: target.address, family: target.family }]);
      return;
    }
    callback(null, target.address, target.family);
  };
  const agent = new Agent({ connect: { lookup } });
  pinnedAgents.set(key, agent);

  if (pinnedAgents.size > MAX_PINNED_AGENTS) {
    const oldestKey = pinnedAgents.keys().next().value;
    if (oldestKey) {
      const oldest = pinnedAgents.get(oldestKey);
      pinnedAgents.delete(oldestKey);
      void oldest?.close().catch(() => undefined);
    }
  }

  return agent;
}

/** Release cached sockets; useful for server shutdown and test isolation. */
export async function closePinnedAgents(): Promise<void> {
  const agents = [...pinnedAgents.values()];
  pinnedAgents.clear();
  await Promise.all(agents.map((agent) => agent.close().catch(() => undefined)));
}

/**
 * Fetch with per-hop validation. Redirects are followed manually so a public
 * URL cannot bounce into a private address or metadata endpoint.
 */
export async function fetchRemote(
  rawUrl: string | URL,
  init: RequestInit = {},
  maxRedirects = 5,
  resolver: RemoteResolver = lookup
): Promise<Response> {
  let current = rawUrl instanceof URL ? rawUrl : new URL(rawUrl);

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const target = await resolveRemoteTarget(current, resolver);
    // Use undici's fetch, not the runtime's global fetch: Electron bundles a
    // different undici version, and its Request object is incompatible with
    // this Agent's dispatcher interface. The casts bridge undici's in-package
    // RequestInit/Response types with the DOM types used by our callers.
    const response = (await undiciFetch(current, {
      ...init,
      redirect: 'manual',
      dispatcher: pinnedAgentFor(current, target),
    } as unknown as Parameters<typeof undiciFetch>[1])) as unknown as Response;

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
 * Parser-based allowlist for pages served by /api/view. A regex cannot safely
 * model malformed tags, SVG/MathML or unquoted attributes; sanitize-html uses an
 * HTML parser and only admits the tags and attributes below. CSP and the iframe
 * sandbox remain the primary defence, not a substitute for this pass.
 */
const PROXIED_TAGS = [
  'html',
  'head',
  'body',
  'title',
  'meta',
  'style',
  'link',
  'img',
  'picture',
  'source',
  'video',
  'audio',
  'track',
  'form',
  'label',
  'input',
  'button',
  'select',
  'option',
  'textarea',
  'fieldset',
  'legend',
  ...sanitizeHtml.defaults.allowedTags,
];

const GLOBAL_ATTRIBUTES = ['class', 'id', 'title', 'lang', 'dir', 'style', 'role'];

const PROXIED_ATTRIBUTES: Record<string, string[]> = {
  '*': [...GLOBAL_ATTRIBUTES, 'aria-label', 'aria-hidden', 'aria-live', 'data-*'],
  a: ['href', 'name', 'target', 'rel', 'type'],
  area: ['href', 'alt', 'coords', 'shape', 'target', 'rel'],
  img: [
    'src',
    'srcset',
    'sizes',
    'alt',
    'width',
    'height',
    'loading',
    'decoding',
    'referrerpolicy',
    'crossorigin',
  ],
  source: ['src', 'srcset', 'sizes', 'type', 'media'],
  video: [
    'src',
    'poster',
    'controls',
    'width',
    'height',
    'loop',
    'muted',
    'autoplay',
    'preload',
    'playsinline',
  ],
  audio: ['src', 'controls', 'loop', 'muted', 'autoplay', 'preload'],
  track: ['src', 'kind', 'srclang', 'label', 'default'],
  form: ['action', 'method', 'name', 'target', 'enctype', 'accept-charset'],
  input: [
    'type',
    'name',
    'value',
    'placeholder',
    'checked',
    'disabled',
    'readonly',
    'required',
    'maxlength',
    'min',
    'max',
    'step',
    'size',
    'autocomplete',
    'multiple',
    'accept',
    'pattern',
    'minlength',
  ],
  button: ['type', 'name', 'value', 'disabled'],
  select: ['name', 'multiple', 'disabled', 'size'],
  option: ['value', 'selected', 'disabled', 'label'],
  textarea: ['name', 'rows', 'cols', 'placeholder', 'disabled', 'readonly', 'required', 'maxlength'],
  meta: ['charset', 'name', 'content', 'property'],
  link: ['href', 'rel', 'type', 'media', 'sizes'],
  style: ['media', 'type'],
};

export function sanitizeProxiedHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: PROXIED_TAGS,
    allowedAttributes: PROXIED_ATTRIBUTES,
    allowedSchemes: ['http', 'https'],
    allowedSchemesByTag: {
      a: ['http', 'https', 'mailto', 'tel'],
      img: ['http', 'https', 'data'],
      source: ['http', 'https'],
      video: ['http', 'https'],
      audio: ['http', 'https'],
      track: ['http', 'https'],
      link: ['http', 'https'],
    },
    // `formaction`, `poster` and `srcset` are URL-bearing too; sanitize them
    // instead of trusting a post-pass to catch every spelling.
    allowedSchemesAppliedToAttributes: ['href', 'src', 'cite', 'poster', 'action', 'formaction', 'srcset'],
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    // Keep <style> contents; only script-like raw text is discarded. The proxied
    // CSP restricts styles, scripts and network destinations, and the sandbox
    // keeps the document at an opaque origin.
    allowVulnerableTags: true,
    nonTextTags: ['script', 'noscript', 'textarea', 'option'],
  });
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
