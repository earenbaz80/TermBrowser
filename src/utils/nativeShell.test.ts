import { describe, expect, it } from 'vitest';
import {
  formatNativeShellResult,
  getNativeShellLabel,
  getNativeShellOptions,
  getNativeShellPrompt,
  parseNativeCdCommand,
} from './nativeShell';
import { NativeShellResult } from '../types';

const result = (overrides: Partial<NativeShellResult> = {}): NativeShellResult => ({
  ok: true,
  stdout: '',
  stderr: '',
  exitCode: 0,
  shell: 'CMD',
  cwd: 'C:\\Terminus',
  durationMs: 12,
  truncated: false,
  timedOut: false,
  ...overrides,
});

describe('native shell helpers', () => {
  it('offers cmd only on Windows and labels Bash consistently', () => {
    const windows = getNativeShellOptions('win32').map((option) => option.id);
    const linux = getNativeShellOptions('linux').map((option) => option.id);

    expect(windows).toContain('cmd');
    expect(linux).not.toContain('cmd');
    expect(getNativeShellLabel('bash', 'win32')).toBe('BASH');
    expect(getNativeShellLabel('bash', 'linux')).toBe('BASH');
    expect(getNativeShellPrompt('bash', 'win32')).toBe('bash:~$');
    expect(getNativeShellPrompt('powershell', 'win32')).toBe('PS>');
    expect(getNativeShellPrompt('cmd', 'win32', 'C:\\Users\\Admin')).toBe('C:\\Users\\Admin>');
    expect(getNativeShellPrompt('powershell', 'win32', 'C:\\Users\\Admin')).toBe(
      'PS C:\\Users\\Admin>'
    );
    expect(getNativeShellPrompt('bash', 'win32', 'C:\\Users\\Admin')).toBe(
      'bash:C:\\Users\\Admin$'
    );
    expect(getNativeShellPrompt('cmd', 'win32', 'C:\\')).toBe('C:\\>');
  });

  it('recognizes standalone cd commands and leaves shell chains alone', () => {
    expect(parseNativeCdCommand('cd C:\\Users', 'cmd')).toEqual({ target: 'C:\\Users' });
    expect(parseNativeCdCommand('cd /d "D:\\Mi carpeta"', 'cmd')).toEqual({
      target: 'D:\\Mi carpeta',
    });
    expect(parseNativeCdCommand('cd .. && dir', 'cmd')).toBeNull();
    expect(parseNativeCdCommand('Set-Location -Path "C:\\Temp"', 'powershell')).toEqual({
      target: 'C:\\Temp',
    });
    expect(parseNativeCdCommand('cd ~', 'bash')).toEqual({ target: '~' });
    expect(parseNativeCdCommand('cd', 'bash')).toEqual({ target: '' });
    expect(parseNativeCdCommand('cd -', 'bash')).toBeNull();
  });

  it('formats stdout, stderr, exit codes and truncated output', () => {
    expect(formatNativeShellResult(result({ stdout: 'hola\n' }))).toBe('hola');

    expect(
      formatNativeShellResult(
        result({ ok: false, stdout: '', stderr: 'falló', exitCode: 2, truncated: true })
      )
    ).toBe('falló\n[shell] Salida truncada al límite de 1 MB.\n[shell] exit 2');

    expect(formatNativeShellResult(result({ stdout: '', timedOut: true }))).toBe(
      '[shell] Tiempo de ejecución agotado (120 s).'
    );
  });
});
