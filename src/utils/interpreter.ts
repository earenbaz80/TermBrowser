/**
 * Real-Time Python & Shell Script Interpreter for Terminus
 * Evaluates Python statements, Bash pipelines, and PowerShell/CMD commands.
 */

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

const PYTHON_RUNNER_URL = '/python-runner.html';
const PYTHON_TIMEOUT_MS = 10000;
const MAX_PYTHON_CODE_LENGTH = 200000;
let pythonRunSequence = 0;

function pythonError(message: string): ExecutionResult {
  return {
    stdout: '',
    stderr: `PythonTraceback (most recent call last):\n  ${message}`,
    exitCode: 1,
  };
}

/**
 * Ejecuta el intérprete dentro de un iframe sandbox con origen opaco y CSP de red cerrada.
 * La página del runner no comparte origen con la app, así que no puede leer su DOM, sus
 * tokens ni el puente de Electron. El timeout y el límite de código viven en el cliente.
 */
export function runPythonCode(code: string): Promise<ExecutionResult> {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return Promise.resolve(pythonError('El intérprete Python necesita un navegador.'));
  }
  if (code.length > MAX_PYTHON_CODE_LENGTH) {
    return Promise.resolve(pythonError('El código Python supera el límite permitido.'));
  }
  if (!document.body) {
    return Promise.resolve(pythonError('El documento aún no está listo para ejecutar Python.'));
  }

  const requestId = `python-${Date.now()}-${(pythonRunSequence += 1)}`;

  return new Promise<ExecutionResult>((resolve) => {
    let settled = false;
    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.setAttribute('referrerpolicy', 'no-referrer');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.setAttribute('title', 'Intérprete Python aislado');
    iframe.style.display = 'none';
    iframe.src = PYTHON_RUNNER_URL;

    const timer = window.setTimeout(() => {
      finish(pythonError('Tiempo de ejecución agotado (10 s).'));
    }, PYTHON_TIMEOUT_MS);

    const cleanup = () => {
      window.clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      iframe.remove();
    };

    const finish = (result: ExecutionResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframe.contentWindow) return;
      const data = event.data as
        | { type?: unknown; id?: unknown; result?: unknown; error?: unknown }
        | null;
      if (!data || data.type !== 'terminus-python-result' || data.id !== requestId) return;

      if (typeof data.error === 'string') {
        finish(pythonError(data.error));
        return;
      }

      const result = data.result as Partial<ExecutionResult> | undefined;
      if (
        !result ||
        typeof result.stdout !== 'string' ||
        typeof result.stderr !== 'string' ||
        typeof result.exitCode !== 'number'
      ) {
        finish(pythonError('El intérprete devolvió un resultado inválido.'));
        return;
      }
      finish({ stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode });
    };

    iframe.onerror = () => finish(pythonError('No se pudo cargar el intérprete aislado.'));
    iframe.onload = () => {
      const target = iframe.contentWindow;
      if (!target) {
        finish(pythonError('No se pudo abrir el intérprete aislado.'));
        return;
      }
      target.postMessage({ type: 'terminus-python-run', id: requestId, code }, '*');
    };

    window.addEventListener('message', onMessage);
    document.body.appendChild(iframe);
  });
}

// Virtual file system for terminal commands
export interface VirtualFile {
  name: string;
  type: 'file' | 'dir';
  content?: string;
  size?: number;
  permissions?: string;
  updatedAt?: string;
  /** Handle for entries mounted from a real local directory (File System Access API). */
  handle?: any;
}

export const INITIAL_FILESYSTEM: Record<string, VirtualFile[]> = {
  '/home/user': [
    { name: 'scripts', type: 'dir', updatedAt: '2026-11-07 00:00' },
    { name: 'bookmarks.json', type: 'file', size: 1024, updatedAt: '2026-11-07 00:15', content: '[\n  {"title":"Hacker News","url":"https://news.ycombinator.com"},\n  {"title":"Wikipedia","url":"https://en.wikipedia.org"}\n]' },
    { name: 'config.sys', type: 'file', size: 512, updatedAt: '2026-11-07 00:01', content: 'DEVICE=C:\\DOS\\ANSI.SYS\nBUFFERS=30\nFILES=60\nDOS=HIGH,UMB' },
    { name: 'autoexec.bat', type: 'file', size: 384, updatedAt: '2026-11-07 00:01', content: '@ECHO OFF\nPROMPT $P$G\nPATH C:\\DOS;C:\\TERMINAL\nECHO Terminus Ready.' },
    { name: 'benchmark.py', type: 'file', size: 420, updatedAt: '2026-11-07 00:10', content: '# Python Benchmark\ntotal = sum([x * 2 for x in range(100)])\nprint("Resultado de computo paralelo:", total)\nprint("Estado de nodos: OK")' },
    { name: 'readme.txt', type: 'file', size: 780, updatedAt: '2026-11-07 00:00', content: '=== TERMINUS ===\nNavegador web controlado por linea de comandos con cifrado AES-256.\nEscriba "help" o "help goto" para comenzar.\nAtajos rapidos: Ctrl+T (nueva pestaña), Ctrl+W (cerrar), Ctrl+B (toggle navegador).' },
  ],
  '/home/user/scripts': [
    { name: 'audit.sh', type: 'file', size: 310, updatedAt: '2026-11-07 00:05', content: '#!/bin/bash\necho "Auditoria de seguridad iniciada..."\nwhoami\ndate\necho "Cifrado AES-256 verificado."' },
    { name: 'scrape_news.py', type: 'file', size: 450, updatedAt: '2026-11-07 00:12', content: 'import json\nprint("Obteniendo titulares de actualidad...")\nprint("1. Quantum Computing Milestone reached")\nprint("2. WebAssembly 3.0 Standardized")' },
  ],
};
