/** Builds the CSP for a sanitized page served by /api/view. */
export function buildProxiedCsp(nonce: string, baseUrl?: string, selfOrigin?: string): string {
  let baseUri = "'self'";
  if (baseUrl) {
    try {
      const parsed = new URL(baseUrl);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        // proxiedPage() injects <base href=response.url>. Allow only that final
        // origin; a sanitized page still cannot redirect its base elsewhere.
        baseUri += ` ${parsed.origin}`;
      }
    } catch {
      // Keep the fail-closed self-only policy for malformed response URLs.
    }
  }

  const imageSources = ["'self'", 'data:', 'blob:'];
  if (selfOrigin) {
    try {
      const parsed = new URL(selfOrigin);
      // The proxied document is sandboxed to an opaque origin, so 'self' does
      // not cover the app's /api/image route. Allow only the local app origin.
      if (['http:', 'https:'].includes(parsed.protocol) && parsed.origin !== 'null') {
        imageSources.push(parsed.origin);
      }
    } catch {
      // Fail closed: no origin is added for a malformed app origin.
    }
  }

  return [
    "default-src 'none'",
    `base-uri ${baseUri}`,
    "object-src 'none'",
    "frame-ancestors 'self'",
    `script-src 'nonce-${nonce}'`,
    // Proxied pages must not issue blind requests to arbitrary origins. Images
    // are rewritten to /api/image (app-origin only); CSS, fonts and media stay
    // limited to the proxy document or inline data.
    "style-src 'self' 'unsafe-inline'",
    `img-src ${imageSources.join(' ')}`,
    "font-src 'self' data:",
    "media-src 'self'",
    "connect-src 'none'",
    "frame-src 'none'",
    "form-action 'none'",
  ].join('; ');
}
