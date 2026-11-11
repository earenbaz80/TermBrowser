import { describe, expect, it } from 'vitest';
import {
  isMetadataHost,
  isPrivateAddress,
  isPrivateHostname,
  isSameOriginRequest,
  resolveListenHost,
  safeDownloadFilename,
  sanitizeProxiedHtml,
} from './serverSecurity';

describe('serverSecurity', () => {
  it('blocks cloud metadata and private destinations', () => {
    expect(isMetadataHost('169.254.169.254')).toBe(true);
    expect(isMetadataHost('metadata.google.internal')).toBe(true);
    expect(isMetadataHost('example.com')).toBe(false);
    expect(isPrivateAddress('127.0.0.1')).toBe(true);
    expect(isPrivateAddress('10.20.30.40')).toBe(true);
    expect(isPrivateAddress('172.20.1.5')).toBe(true);
    expect(isPrivateAddress('192.168.1.10')).toBe(true);
    expect(isPrivateAddress('169.254.10.20')).toBe(true);
    expect(isPrivateAddress('8.8.8.8')).toBe(false);
    expect(isPrivateAddress('2606:4700:4700::1111')).toBe(false);
    expect(isPrivateHostname('localhost')).toBe(true);
    expect(isPrivateHostname('printer.local')).toBe(true);
  });

  it('only accepts same-origin browser requests', () => {
    expect(isSameOriginRequest(undefined, '127.0.0.1:3000', undefined)).toBe(true);
    expect(isSameOriginRequest('http://127.0.0.1:3000', '127.0.0.1:3000', 'same-origin')).toBe(true);
    expect(isSameOriginRequest('http://evil.example', '127.0.0.1:3000', 'cross-site')).toBe(false);
    expect(isSameOriginRequest(undefined, '127.0.0.1:3000', 'cross-site')).toBe(false);
  });

  it('removes refresh redirects, base injection and script URLs from proxied pages', () => {
    const html = [
      '<head><base href="https://evil.example/"><meta http-equiv="refresh" content="0;url=https://evil.example"></head>',
      '<body><a href="javascript:alert(1)">bad</a><embed src="https://evil.example/x">',
      '<p>contenido</p></body>',
    ].join('');

    const sanitized = sanitizeProxiedHtml(html);
    expect(sanitized).not.toContain('<base');
    expect(sanitized).not.toContain('http-equiv="refresh"');
    expect(sanitized).not.toContain('javascript:');
    expect(sanitized).not.toContain('<embed');
    expect(sanitized).toContain('<p>contenido</p>');
  });

  it('binds loopback unless LAN exposure is explicitly enabled', () => {
    expect(resolveListenHost(undefined)).toBe('127.0.0.1');
    expect(resolveListenHost('localhost')).toBe('127.0.0.1');
    expect(resolveListenHost('127.0.0.1')).toBe('127.0.0.1');
    expect(resolveListenHost('0.0.0.0')).toBe('127.0.0.1');

    const previous = process.env.TERMINUS_ALLOW_LAN;
    process.env.TERMINUS_ALLOW_LAN = '1';
    try {
      expect(resolveListenHost('0.0.0.0')).toBe('0.0.0.0');
      expect(resolveListenHost('192.168.1.20')).toBe('192.168.1.20');
    } finally {
      if (previous === undefined) delete process.env.TERMINUS_ALLOW_LAN;
      else process.env.TERMINUS_ALLOW_LAN = previous;
    }
  });

  it('creates safe download filenames', () => {
    expect(safeDownloadFilename('../../Mi página: secreta?.html')).toBe('Mi-pagina-secreta.html');
    expect(safeDownloadFilename('...', 'terminus-pagina')).toBe('terminus-pagina');
  });
});
