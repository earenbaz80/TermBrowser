import http from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  assertRemoteTarget,
  blockPrivateNetworks,
  closePinnedAgents,
  fetchRemote,
  isMetadataHost,
  isPrivateAddress,
  isPrivateHostname,
  isSameOriginRequest,
  resolveListenHost,
  resolveRemoteTarget,
  safeDownloadFilename,
  sanitizeProxiedHtml,
  type RemoteResolver,
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

  describe('private network policy', () => {
    const policyKeys = [
      'TERMINUS_BLOCK_PRIVATE',
      'TERMINUS_ALLOW_PRIVATE',
      'TERMINUS_NETWORK_POLICY',
    ] as const;
    const original = Object.fromEntries(policyKeys.map((key) => [key, process.env[key]]));

    beforeEach(() => {
      for (const key of policyKeys) delete process.env[key];
    });

    afterEach(() => {
      for (const key of policyKeys) {
        const value = original[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });

    it('blocks private destinations by default', async () => {
      expect(blockPrivateNetworks()).toBe(true);
      await expect(assertRemoteTarget(new URL('http://127.0.0.1:3000/'))).rejects.toThrow(
        /destinos privados/
      );
      await expect(assertRemoteTarget(new URL('http://localhost/'))).rejects.toThrow(
        /destinos privados/
      );
    });

    it('allows private destinations only with an explicit local opt-in', async () => {
      process.env.TERMINUS_ALLOW_PRIVATE = '1';
      expect(blockPrivateNetworks()).toBe(false);
      await expect(assertRemoteTarget(new URL('http://127.0.0.1:3000/'))).resolves.toBeUndefined();

      delete process.env.TERMINUS_ALLOW_PRIVATE;
      process.env.TERMINUS_BLOCK_PRIVATE = '0';
      expect(blockPrivateNetworks()).toBe(false);
      await expect(assertRemoteTarget(new URL('http://127.0.0.1:3000/'))).resolves.toBeUndefined();

      delete process.env.TERMINUS_BLOCK_PRIVATE;
      process.env.TERMINUS_NETWORK_POLICY = 'local';
      expect(blockPrivateNetworks()).toBe(false);
    });

    it('keeps block flags fail-closed when they conflict with an opt-in', () => {
      process.env.TERMINUS_ALLOW_PRIVATE = '1';
      process.env.TERMINUS_BLOCK_PRIVATE = '1';
      expect(blockPrivateNetworks()).toBe(true);

      delete process.env.TERMINUS_BLOCK_PRIVATE;
      process.env.TERMINUS_NETWORK_POLICY = 'public';
      expect(blockPrivateNetworks()).toBe(true);
    });

    it('never allows cloud metadata, even with private networking enabled', async () => {
      process.env.TERMINUS_ALLOW_PRIVATE = '1';
      await expect(assertRemoteTarget(new URL('http://169.254.169.254/'))).rejects.toThrow(
        /metadata/
      );
    });

    it('rejects resolver results in hexadecimal IPv4-mapped IPv6 form', async () => {
      const resolver: RemoteResolver = async () => [{ address: '::ffff:7f00:1', family: 6 }];
      await expect(resolveRemoteTarget(new URL('http://rebind.test/'), resolver)).rejects.toThrow(
        /destinos privados/
      );
    });

    it('keeps the first public resolution when the next lookup would return a private address', async () => {
      let calls = 0;
      const resolver: RemoteResolver = async () => {
        calls += 1;
        return calls === 1
          ? [{ address: '8.8.8.8', family: 4 }]
          : [{ address: '127.0.0.1', family: 4 }];
      };

      const target = await resolveRemoteTarget(new URL('http://rebind.test/'), resolver);

      expect(target).toEqual({ address: '8.8.8.8', family: 4 });
      expect(calls).toBe(1);
    });

    it('pins the validated address when a simulated resolver would rebind', async () => {
      process.env.TERMINUS_ALLOW_PRIVATE = '1';
      delete process.env.TERMINUS_BLOCK_PRIVATE;
      delete process.env.TERMINUS_NETWORK_POLICY;

      const server = http.createServer((_request, response) => {
        response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('pinned-ok');
      });
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => resolve());
      });

      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('El fixture no expuso un puerto.');

      let calls = 0;
      const rebindingResolver: RemoteResolver = async () => {
        calls += 1;
        return calls === 1
          ? [{ address: '127.0.0.1', family: 4 }]
          : [{ address: '192.0.2.10', family: 4 }];
      };

      try {
        const response = await fetchRemote(
          `http://rebind.test:${address.port}/`,
          {},
          5,
          rebindingResolver
        );
        expect(await response.text()).toBe('pinned-ok');
        expect(calls).toBe(1);
      } finally {
        await closePinnedAgents();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
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

  it('removes parser-sensitive payloads that bypassed the old regex sanitizer', () => {
    const html = [
      '<img src=x onerror=alert(1)>',
      '<a href=javascript:alert(1)>js</a>',
      '<a href="data:text/html,<script>alert(1)</script>">data</a>',
      '<svg onload=alert(1)><script>alert(2)</script><a xlink:href="javascript:alert(3)">svg</a></svg>',
      '<math><mtext><img src=x onerror=alert(4)></mtext></math>',
      '<iframe srcdoc="<script>alert(5)</script>">frame</iframe>',
      '<form action=javascript:alert(6)><button formaction=javascript:alert(7)>go</button></form>',
      '<img srcset="javascript:alert(8) 1x, /ok.png 2x">',
      '<p>contenido <b>seguro</b></p>',
    ].join('');

    const sanitized = sanitizeProxiedHtml(html);
    expect(sanitized).not.toMatch(/onerror|onload|javascript:|<svg|<math|<iframe|srcdoc|formaction|xlink/i);
    expect(sanitized).toContain('<p>contenido <b>seguro</b></p>');
    expect(sanitized).toContain('<img src="x"');
    // sanitize-html drops the whole srcset when any candidate uses a forbidden
    // scheme, which is safer than trying to preserve the remaining candidate.
    expect(sanitizeProxiedHtml('<img srcset="/ok.png 1x, /ok-2x.png 2x">')).toContain(
      '/ok.png 1x, /ok-2x.png 2x'
    );
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
