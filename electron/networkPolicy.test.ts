import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  isPrivateAddress,
  isPrivateHostname,
  isPrivateTargetUrl,
} = require('./networkPolicy.cjs') as {
  isPrivateAddress: (address: string) => boolean;
  isPrivateHostname: (hostname: string) => boolean;
  isPrivateTargetUrl: (url: string) => boolean;
};

describe('electron networkPolicy', () => {
  it('classifies private IPv4, loopback, metadata and IPv6 ranges', () => {
    expect(isPrivateAddress('127.0.0.1')).toBe(true);
    expect(isPrivateAddress('10.20.30.40')).toBe(true);
    expect(isPrivateAddress('172.20.1.5')).toBe(true);
    expect(isPrivateAddress('192.168.1.10')).toBe(true);
    expect(isPrivateAddress('169.254.169.254')).toBe(true);
    expect(isPrivateAddress('::1')).toBe(true);
    expect(isPrivateAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateAddress('::ffff:7f00:1')).toBe(true);
    expect(isPrivateAddress('::ffff:a00:1')).toBe(true);
    expect(isPrivateAddress('::ffff:c0a8:101')).toBe(true);
    expect(isPrivateAddress('::ffff:ac10:1')).toBe(true);
    expect(isPrivateAddress('::ffff:a9fe:a9fe')).toBe(true);
    expect(isPrivateAddress('0:0:0:0:0:ffff:7f00:1')).toBe(true);
    expect(isPrivateAddress('::127.0.0.1')).toBe(true);
    expect(isPrivateAddress('::ffff:808:808')).toBe(false);
    expect(isPrivateAddress('8.8.8.8')).toBe(false);
    expect(isPrivateAddress('2606:4700:4700::1111')).toBe(false);
  });

  it('recognises local hostnames and public URLs', () => {
    expect(isPrivateHostname('localhost')).toBe(true);
    expect(isPrivateHostname('printer.local')).toBe(true);
    expect(isPrivateHostname('metadata.google.internal')).toBe(true);
    expect(isPrivateTargetUrl('http://127.0.0.1:3000/')).toBe(true);
    expect(isPrivateTargetUrl('http://[::1]/')).toBe(true);
    expect(isPrivateTargetUrl('http://[::ffff:7f00:1]/')).toBe(true);
    expect(isPrivateTargetUrl('https://example.com/')).toBe(false);
    expect(isPrivateTargetUrl('https://8.8.8.8/')).toBe(false);
    expect(isPrivateTargetUrl('file:///etc/passwd')).toBe(false);
  });
});
