import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { isBlockedAdUrl } = require('./adblock.cjs') as {
  isBlockedAdUrl: (url: string) => boolean;
};

describe('adblock', () => {
  it('blocks common ad and tracker hosts, including subdomains', () => {
    expect(isBlockedAdUrl('https://doubleclick.net/pixel')).toBe(true);
    expect(isBlockedAdUrl('https://ads.doubleclick.net/pixel')).toBe(true);
    expect(isBlockedAdUrl('https://www.googlesyndication.com/pagead/js/adsbygoogle.js')).toBe(true);
    expect(isBlockedAdUrl('https://criteo.net/script.js')).toBe(true);
  });

  it('blocks conservative ad paths without matching unrelated hosts', () => {
    expect(isBlockedAdUrl('https://example.com/pagead/banner.js')).toBe(true);
    expect(isBlockedAdUrl('https://example.com/not-pagead/banner.js')).toBe(false);
    expect(isBlockedAdUrl('https://notdoubleclick.net/banner.js')).toBe(false);
    expect(isBlockedAdUrl('https://example.com/article')).toBe(false);
  });

  it('ignores non-network URLs', () => {
    expect(isBlockedAdUrl('about:blank')).toBe(false);
    expect(isBlockedAdUrl('data:text/plain,hola')).toBe(false);
    expect(isBlockedAdUrl('not a url')).toBe(false);
  });
});
