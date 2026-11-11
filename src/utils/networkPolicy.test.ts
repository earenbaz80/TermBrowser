import { describe, expect, it } from 'vitest';
import { isPrivateAddress, isPrivateTargetUrl } from './networkPolicy';

describe('networkPolicy', () => {
  it('detects private hosts and IP literals without DNS', () => {
    expect(isPrivateTargetUrl('http://127.0.0.1:3000/')).toBe(true);
    expect(isPrivateTargetUrl('http://localhost/')).toBe(true);
    expect(isPrivateTargetUrl('https://printer.local/')).toBe(true);
    expect(isPrivateTargetUrl('http://10.20.30.40/')).toBe(true);
    expect(isPrivateTargetUrl('http://[::1]/')).toBe(true);
  });

  it('classifies hexadecimal and expanded IPv4-mapped IPv6 forms', () => {
    expect(isPrivateAddress('::ffff:7f00:1')).toBe(true);
    expect(isPrivateAddress('::ffff:a00:1')).toBe(true);
    expect(isPrivateAddress('::ffff:c0a8:101')).toBe(true);
    expect(isPrivateAddress('::ffff:ac10:1')).toBe(true);
    expect(isPrivateAddress('::ffff:a9fe:a9fe')).toBe(true);
    expect(isPrivateAddress('0:0:0:0:0:ffff:7f00:1')).toBe(true);
    expect(isPrivateAddress('::127.0.0.1')).toBe(true);
    expect(isPrivateAddress('::ffff:808:808')).toBe(false);
    expect(isPrivateAddress('::ffff:2606:4700')).toBe(false);
  });

  it('classifies full IPv6 private ranges and documentation addresses', () => {
    expect(isPrivateAddress('fc00::1')).toBe(true);
    expect(isPrivateAddress('fd12:3456::1')).toBe(true);
    expect(isPrivateAddress('fe80::1')).toBe(true);
    expect(isPrivateAddress('fec0::1')).toBe(true);
    expect(isPrivateAddress('2001:db8::1')).toBe(true);
    expect(isPrivateAddress('2606:4700:4700::1111')).toBe(false);
  });

  it('allows public HTTP(S) targets and ignores non-web URLs', () => {
    expect(isPrivateTargetUrl('https://example.com/')).toBe(false);
    expect(isPrivateTargetUrl('https://8.8.8.8/')).toBe(false);
    expect(isPrivateTargetUrl('file:///etc/passwd')).toBe(false);
    expect(isPrivateTargetUrl('not a url')).toBe(false);
  });
});
