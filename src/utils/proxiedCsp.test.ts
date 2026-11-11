import { describe, expect, it } from 'vitest';
import { buildProxiedCsp } from './proxiedCsp';

const baseDirective = (csp: string): string | undefined =>
  csp.split('; ').find((directive) => directive.startsWith('base-uri '));

describe('buildProxiedCsp', () => {
  it('keeps base-uri self-only when no final URL is supplied', () => {
    const csp = buildProxiedCsp('nonce-test');

    expect(baseDirective(csp)).toBe("base-uri 'self'");
    expect(csp).toContain("script-src 'nonce-nonce-test'");
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("connect-src 'none'");
    expect(csp.match(/base-uri/g)).toHaveLength(1);
  });

  it('does not allow remote CSS, images, fonts or media subresources', () => {
    const csp = buildProxiedCsp('nonce-test', 'https://example.com/', 'http://127.0.0.1:3000');

    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain("img-src 'self' data: blob: http://127.0.0.1:3000");
    expect(csp).toContain("font-src 'self' data:");
    expect(csp).toContain("media-src 'self'");
    expect(csp).not.toMatch(/(?:style-src|font-src|media-src)[^;]*https?:/);
    expect(csp).toContain("img-src 'self' data: blob: http://127.0.0.1:3000");
    expect(csp).toContain("base-uri 'self' https://example.com");
  });

  it.each([
    {
      name: 'HTTPS with path, query and fragment',
      url: 'https://example.com/nota?q=1#seccion',
      origin: 'https://example.com',
    },
    {
      name: 'HTTP with an explicit port',
      url: 'http://127.0.0.1:8787/',
      origin: 'http://127.0.0.1:8787',
    },
    {
      name: 'HTTPS with an explicit port',
      url: 'https://example.com:8443/ruta',
      origin: 'https://example.com:8443',
    },
    {
      name: 'credentials omitted from the CSP origin',
      url: 'https://user:secret@example.com/privado',
      origin: 'https://example.com',
    },
    {
      name: 'IPv6 origin',
      url: 'https://[::1]:9443/ruta',
      origin: 'https://[::1]:9443',
    },
  ])('allows only the final HTTP(S) origin for $name', ({ url, origin }) => {
    const csp = buildProxiedCsp('nonce-test', url);

    expect(baseDirective(csp)).toBe(`base-uri 'self' ${origin}`);
    expect(csp).not.toContain('secret');
    expect(csp).not.toContain('/nota');
  });

  it.each([
    { name: 'malformed URL', url: 'not a url' },
    { name: 'empty URL', url: '' },
    { name: 'FTP URL', url: 'ftp://example.com/archivo' },
    { name: 'javascript URL', url: 'javascript:alert(1)' },
    { name: 'data URL', url: 'data:text/html,<base href="https://evil.example">' },
  ])('fails closed for $name', ({ url }) => {
    const csp = buildProxiedCsp('nonce-test', url);

    expect(baseDirective(csp)).toBe("base-uri 'self'");
    expect(csp).not.toContain('evil.example');
  });
});
