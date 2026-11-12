/**
 * Ad-blocking preference shared by the renderer and the desktop shell.
 *
 * The Electron main process owns the switch (it drives EasyList and the request
 * guard), so the renderer mirrors it and only falls back to localStorage when
 * the desktop bridge is not available.
 */
export const ADBLOCK_PREFERENCE_KEY = 'terminus.adblock.v1';

export interface AdblockState {
  enabled: boolean;
  available: boolean;
}

const desktopApi = () =>
  typeof window !== 'undefined' ? window.terminusDesktop : undefined;

export const readAdblockPreference = (): boolean => {
  try {
    const raw = localStorage.getItem(ADBLOCK_PREFERENCE_KEY);
    return raw === null ? true : raw === '1';
  } catch {
    return true;
  }
};

export const writeAdblockPreference = (enabled: boolean): void => {
  try {
    localStorage.setItem(ADBLOCK_PREFERENCE_KEY, enabled ? '1' : '0');
  } catch {
    // Storage unavailable: the desktop shell still holds the real state.
  }
};

export async function readAdblockState(): Promise<AdblockState> {
  const api = desktopApi();
  if (!api?.getAdblockState) {
    return { enabled: readAdblockPreference(), available: false };
  }
  try {
    const state = await api.getAdblockState();
    writeAdblockPreference(state.enabled);
    return state;
  } catch {
    return { enabled: readAdblockPreference(), available: false };
  }
}

export async function applyAdblockEnabled(enabled: boolean): Promise<AdblockState> {
  writeAdblockPreference(enabled);
  const api = desktopApi();
  if (!api?.setAdblockEnabled) {
    return { enabled, available: false };
  }
  try {
    const state = await api.setAdblockEnabled(enabled);
    writeAdblockPreference(state.enabled);
    return state;
  } catch {
    return { enabled, available: false };
  }
}
