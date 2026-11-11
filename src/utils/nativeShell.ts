import {
  NativeFsInfo,
  NativeFsResolveResult,
  NativeShellId,
  NativeShellResult,
  TerminalShellMode,
} from '../types';

export interface NativeShellOption {
  id: TerminalShellMode;
  label: string;
  title: string;
}

/** The desktop bridge reports the real platform; the browser preview only gets a hint. */
export function getNativeShellPlatform(): string {
  if (typeof window !== 'undefined' && window.terminusShell?.platform) {
    return window.terminusShell.platform;
  }
  if (typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent)) {
    return 'win32';
  }
  return 'linux';
}

export function isNativeShellAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.terminusShell?.available;
}

export function isNativeFsAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.terminusFs?.available;
}

export async function getNativeFsInfo(): Promise<NativeFsInfo | null> {
  const api = typeof window !== 'undefined' ? window.terminusFs : undefined;
  if (!api?.available) return null;

  try {
    return await api.info();
  } catch {
    return null;
  }
}

export async function resolveNativeDirectory(
  cwd: string,
  target: string,
  shell: NativeShellId
): Promise<NativeFsResolveResult> {
  const api = typeof window !== 'undefined' ? window.terminusFs : undefined;
  if (!api?.available) {
    return {
      ok: false,
      path: '',
      cwd,
      home: '',
      drives: [],
      error: 'El acceso nativo al sistema de archivos solo está disponible en la aplicación de escritorio.',
    };
  }

  return api.resolveDirectory({ cwd, target, shell });
}

export function getNativeShellOptions(platform: string): NativeShellOption[] {
  const options: NativeShellOption[] = [
    {
      id: 'terminus',
      label: 'TERMINUS',
      title: 'Intérprete interno de Terminus (navegación, archivos virtuales, scripts)',
    },
    {
      id: 'auto',
      label: 'AUTO',
      title: 'Shell automático del sistema (PowerShell en Windows, Bash en Linux/macOS)',
    },
  ];

  if (platform === 'win32') {
    options.push({
      id: 'cmd',
      label: 'CMD',
      title: 'Símbolo del sistema de Windows (cmd.exe)',
    });
  }

  options.push({
    id: 'powershell',
    label: platform === 'win32' ? 'POWERSHELL' : 'PWSH',
    title: platform === 'win32' ? 'Windows PowerShell' : 'PowerShell Core (pwsh)',
  });
  options.push({
    id: 'bash',
    label: 'BASH',
    title: platform === 'win32' ? 'Bash local (Git Bash) o WSL (Linux)' : 'Bash del sistema',
  });

  return options;
}

export function getNativeShellLabel(
  mode: TerminalShellMode,
  platform: string = getNativeShellPlatform()
): string {
  if (mode === 'terminus') return 'TERMINUS';
  if (mode === 'auto') return 'AUTO';
  if (mode === 'cmd') return 'CMD';
  if (mode === 'powershell') return platform === 'win32' ? 'POWERSHELL' : 'PWSH';
  return 'BASH';
}

export function getNativeShellPrompt(
  mode: TerminalShellMode,
  platform: string = getNativeShellPlatform(),
  cwd?: string
): string {
  const currentPath = cwd?.trim() ? compactPromptPath(cwd) : '';
  if (currentPath) {
    if (mode === 'cmd') return `${currentPath}>`;
    if (mode === 'powershell') return `PS ${currentPath}>`;
    if (mode === 'bash') return `bash:${currentPath}$`;
    return `AUTO ${currentPath}>`;
  }

  if (mode === 'cmd') return 'CMD>';
  if (mode === 'powershell') return 'PS>';
  if (mode === 'bash') return 'bash:~$';
  return 'AUTO>';
}

/** Keeps the useful tail of long Windows/Unix paths from squeezing the input bar. */
function compactPromptPath(value: string): string {
  const trimmed = value.trim();
  const maxLength = 46;
  return trimmed.length <= maxLength ? trimmed : `…${trimmed.slice(-(maxLength - 1))}`;
}

function unquoteShellPath(value: string): string {
  let result = value.trim();
  if (
    result.length >= 2 &&
    ((result.startsWith('"') && result.endsWith('"')) ||
      (result.startsWith("'") && result.endsWith("'")))
  ) {
    result = result.slice(1, -1);
  }
  return result;
}

/**
 * Recognizes a standalone cd/chdir command so the terminal can persist its cwd.
 * Commands chained with operators are left to the shell and do not change the tab cwd.
 */
export function parseNativeCdCommand(
  command: string,
  shell: NativeShellId
): { target: string } | null {
  const trimmed = command.trim();
  if (!trimmed || /[;&|><\r\n]/.test(trimmed)) return null;

  const platform = getNativeShellPlatform();
  const effectiveShell = shell === 'auto' ? (platform === 'win32' ? 'powershell' : 'bash') : shell;
  let raw: string | undefined;

  if (effectiveShell === 'cmd') {
    const match = /^(?:cd|chdir)(?:\s+\/d)?(?:\s+(.*))?$/i.exec(trimmed);
    if (!match) return null;
    raw = match[1];
  } else if (effectiveShell === 'powershell') {
    const match = /^(?:cd|chdir|set-location|sl)(?:\s+(.*))?$/i.exec(trimmed);
    if (!match) return null;
    raw = match[1];
  } else {
    const match = /^cd(?:\s+(.*))?$/.exec(trimmed);
    if (!match) return null;
    raw = match[1];
  }

  let target = (raw ?? '').trim();
  if (target === '/?' || target === '-?' || target === '-') return null;
  if (effectiveShell === 'powershell') {
    target = target.replace(/^-(?:path|literalpath)\s+/i, '');
  }

  return { target: unquoteShellPath(target) };
}

/** Calls the Electron bridge; the browser fallback never runs local commands. */
export async function runNativeShellCommand(
  command: string,
  shell: NativeShellId,
  cwd?: string
): Promise<NativeShellResult> {
  const api = typeof window !== 'undefined' ? window.terminusShell : undefined;
  if (!api?.available) {
    return {
      ok: false,
      stdout: '',
      stderr: '',
      exitCode: null,
      shell,
      cwd: '',
      durationMs: 0,
      truncated: false,
      timedOut: false,
      error: 'El shell nativo solo está disponible en la aplicación de escritorio de Terminus.',
    };
  }

  return api.run({ command, shell, cwd, timeoutMs: 120000 });
}

export function formatNativeShellResult(result: NativeShellResult): string {
  const sections: string[] = [];

  if (result.error) sections.push(`[shell] ${result.error}`);
  if (result.stdout.trim()) sections.push(result.stdout.trimEnd());
  if (result.stderr.trim()) sections.push(result.stderr.trimEnd());
  if (result.timedOut) sections.push('[shell] Tiempo de ejecución agotado (120 s).');
  if (result.truncated) sections.push('[shell] Salida truncada al límite de 1 MB.');

  if (sections.length === 0) {
    sections.push(`(sin salida) · exit ${result.exitCode ?? '?'} · ${result.durationMs} ms`);
  } else if (result.exitCode !== null && result.exitCode !== 0) {
    sections.push(`[shell] exit ${result.exitCode}`);
  }

  return sections.join('\n');
}
