import { describe, expect, it, vi } from 'vitest';
import {
  queryNativeMountPermission,
  requestNativeMountPermission,
} from './lastMountStorage';

describe('last native mount permissions', () => {
  it('queries read/write access on the remembered handle', async () => {
    const handle = { queryPermission: vi.fn().mockResolvedValue('granted') };

    await expect(queryNativeMountPermission(handle)).resolves.toBe('granted');
    expect(handle.queryPermission).toHaveBeenCalledWith({ mode: 'readwrite' });
  });

  it('treats a failed permission query as pending', async () => {
    const handle = {
      queryPermission: vi.fn().mockRejectedValue(new Error('blocked')),
    };

    await expect(queryNativeMountPermission(handle)).resolves.toBe('prompt');
  });

  it('requests read/write access from a user gesture', async () => {
    const handle = { requestPermission: vi.fn().mockResolvedValue('granted') };

    await expect(requestNativeMountPermission(handle)).resolves.toBe('granted');
    expect(handle.requestPermission).toHaveBeenCalledWith({ mode: 'readwrite' });
  });

  it('assumes granted when the browser exposes no permission API', async () => {
    await expect(queryNativeMountPermission({})).resolves.toBe('granted');
  });
});
