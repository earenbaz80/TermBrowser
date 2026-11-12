import { afterEach, describe, expect, it } from 'vitest';
import {
  clearLockPassword,
  hasLockPassword,
  loadLockRecord,
  setLockPassword,
  verifyLockPassword,
} from './lockStorage';

afterEach(() => {
  clearLockPassword();
});

// 5.000 iteraciones de SHA-256 por derivación: holgado en CI, donde la suite corre en paralelo.
describe('lockStorage', { timeout: 20000 }, () => {
  it('starts without a password and accepts anything', async () => {
    expect(hasLockPassword()).toBe(false);
    await expect(verifyLockPassword('cualquier-cosa')).resolves.toBe(true);
  });

  it('rejects passwords below the minimum length', async () => {
    await expect(setLockPassword('corta')).rejects.toThrow();
    expect(hasLockPassword()).toBe(false);
  });

  it('stores a salted hash instead of the password', async () => {
    const record = await setLockPassword('caballo-correcto');
    expect(record.salt).toHaveLength(32);
    expect(record.hash).toHaveLength(64);
    expect(record.hash).not.toContain('caballo');
    expect(loadLockRecord()?.iterations).toBeGreaterThan(1000);
  });

  it('verifies the right password and rejects a wrong one', async () => {
    await setLockPassword('caballo-correcto');
    await expect(verifyLockPassword('caballo-correcto')).resolves.toBe(true);
    await expect(verifyLockPassword('caballo-incorrecto')).resolves.toBe(false);
  });

  it('clears the protection on demand', async () => {
    await setLockPassword('otra-clave-larga');
    clearLockPassword();
    expect(hasLockPassword()).toBe(false);
  });
});
