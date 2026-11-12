import { afterEach, describe, expect, it } from 'vitest';
import {
  ADBLOCK_PREFERENCE_KEY,
  applyAdblockEnabled,
  readAdblockPreference,
  readAdblockState,
} from './adblockPreference';

afterEach(() => {
  localStorage.removeItem(ADBLOCK_PREFERENCE_KEY);
  delete window.terminusDesktop;
});

describe('adblockPreference', () => {
  it('defaults to enabled when nothing was stored', () => {
    expect(readAdblockPreference()).toBe(true);
  });

  it('persists the choice even without the desktop bridge', async () => {
    const state = await applyAdblockEnabled(false);
    expect(state).toEqual({ enabled: false, available: false });
    expect(localStorage.getItem(ADBLOCK_PREFERENCE_KEY)).toBe('0');
    expect(readAdblockPreference()).toBe(false);

    const read = await readAdblockState();
    expect(read.enabled).toBe(false);
    expect(read.available).toBe(false);
  });
});
