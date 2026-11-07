/**
 * Real-Time Python & Shell Script Interpreter for TermBrowser OS
 * Evaluates Python statements, Bash pipelines, and PowerShell/CMD commands.
 */

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

// Python in-browser lightweight execution sandbox
export function runPythonCode(code: string): ExecutionResult {
  let stdoutBuffer: string[] = [];
  let stderrBuffer: string[] = [];

  try {
    // Custom print function
    const customPrint = (...args: any[]) => {
      stdoutBuffer.push(
        args
          .map((arg) => (typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)))
          .join(' ')
      );
    };

    // Prepare Python standard environment mocks
    const math = Math;
    const len = (x: any) => (x ? (x.length !== undefined ? x.length : Object.keys(x).length) : 0);
    const range = (start: number, stop?: number, step = 1): number[] => {
      if (stop === undefined) {
        stop = start;
        start = 0;
      }
      const arr: number[] = [];
      for (let i = start; step > 0 ? i < stop : i > stop; i += step) {
        arr.push(i);
      }
      return arr;
    };
    const sum = (arr: number[]) => arr.reduce((acc, v) => acc + v, 0);
    const min = (...args: any[]) => (Array.isArray(args[0]) ? Math.min(...args[0]) : Math.min(...args));
    const max = (...args: any[]) => (Array.isArray(args[0]) ? Math.max(...args[0]) : Math.max(...args));
    const json = {
      dumps: (obj: any, indent = 2) => JSON.stringify(obj, null, indent),
      loads: (str: string) => JSON.parse(str),
    };

    // Normalize simple Python syntax to JS for execution:
    // 1. replace 'True' / 'False' / 'None'
    // 2. replace '**' with exponentiation
    // 3. handle 'print(...)'
    let jsCode = code
      .replace(/\bTrue\b/g, 'true')
      .replace(/\bFalse\b/g, 'false')
      .replace(/\bNone\b/g, 'null')
      .replace(/\bimport\s+math\b/g, '// import math')
      .replace(/\bimport\s+json\b/g, '// import json')
      .replace(/\bimport\s+sys\b/g, '// import sys')
      .replace(/\bimport\s+os\b/g, '// import os');

    // Handle Python for loop syntax: `for i in range(n):`
    jsCode = jsCode.replace(/for\s+([a-zA-Z0-9_]+)\s+in\s+range\(([^)]+)\):/g, (_, varName, rangeArgs) => {
      return `for (const ${varName} of range(${rangeArgs})) {`;
    });

    // Handle Python for item in list: `for item in items:`
    jsCode = jsCode.replace(/for\s+([a-zA-Z0-9_]+)\s+in\s+([a-zA-Z0-9_]+):/g, (_, varName, listName) => {
      return `for (const ${varName} of ${listName}) {`;
    });

    // Handle `def func(args):`
    jsCode = jsCode.replace(/def\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\):/g, 'function $1($2) {');

    // Handle `if cond:` / `elif cond:` / `else:`
    jsCode = jsCode.replace(/elif\s+([^:]+):/g, '} else if ($1) {');
    jsCode = jsCode.replace(/if\s+([^:]+):/g, 'if ($1) {');
    jsCode = jsCode.replace(/else:/g, '} else {');

    // Wrap in function with sandboxed scope
    const runner = new Function(
      'print',
      'math',
      'len',
      'range',
      'sum',
      'min',
      'max',
      'json',
      `
      try {
        ${jsCode}
      } catch (err) {
        throw err;
      }
      `
    );

    const result = runner(customPrint, math, len, range, sum, min, max, json);
    if (result !== undefined && stdoutBuffer.length === 0) {
      stdoutBuffer.push(String(result));
    }

    return {
      stdout: stdoutBuffer.join('\n') || (result !== undefined ? String(result) : '(ejecutado sin salida)'),
      stderr: '',
      exitCode: 0,
    };
  } catch (err: any) {
    return {
      stdout: stdoutBuffer.join('\n'),
      stderr: `PythonTraceback (most recent call last):\n  ${err.name}: ${err.message}`,
      exitCode: 1,
    };
  }
}

// Virtual file system for terminal commands
export interface VirtualFile {
  name: string;
  type: 'file' | 'dir';
  content?: string;
  size?: number;
  permissions?: string;
  updatedAt?: string;
}

export const INITIAL_FILESYSTEM: Record<string, VirtualFile[]> = {
  '/home/user': [
    { name: 'scripts', type: 'dir', updatedAt: '2026-11-07 00:00' },
    { name: 'bookmarks.json', type: 'file', size: 1024, updatedAt: '2026-11-07 00:15', content: '[\n  {"title":"Hacker News","url":"https://news.ycombinator.com"},\n  {"title":"Wikipedia","url":"https://en.wikipedia.org"}\n]' },
    { name: 'config.sys', type: 'file', size: 512, updatedAt: '2026-11-07 00:01', content: 'DEVICE=C:\\DOS\\ANSI.SYS\nBUFFERS=30\nFILES=60\nDOS=HIGH,UMB' },
    { name: 'autoexec.bat', type: 'file', size: 384, updatedAt: '2026-11-07 00:01', content: '@ECHO OFF\nPROMPT $P$G\nPATH C:\\DOS;C:\\TERMINAL\nECHO TermBrowser OS Ready.' },
    { name: 'benchmark.py', type: 'file', size: 420, updatedAt: '2026-11-07 00:10', content: '# Python Benchmark\ntotal = sum([x * 2 for x in range(100)])\nprint("Resultado de computo paralelo:", total)\nprint("Estado de nodos: OK")' },
    { name: 'readme.txt', type: 'file', size: 780, updatedAt: '2026-11-07 00:00', content: '=== TERMBROWSER OS ===\nNavegador web controlado por linea de comandos con cifrado AES-256.\nEscriba "help" o "help goto" para comenzar.\nAtajos rapidos: Ctrl+T (nueva pestaña), Ctrl+W (cerrar), Ctrl+B (toggle navegador).' },
  ],
  '/home/user/scripts': [
    { name: 'audit.sh', type: 'file', size: 310, updatedAt: '2026-11-07 00:05', content: '#!/bin/bash\necho "Auditoria de seguridad iniciada..."\nwhoami\ndate\necho "Cifrado AES-256 verificado."' },
    { name: 'scrape_news.py', type: 'file', size: 450, updatedAt: '2026-11-07 00:12', content: 'import json\nprint("Obteniendo titulares de actualidad...")\nprint("1. Quantum Computing Milestone reached")\nprint("2. WebAssembly 3.0 Standardized")' },
  ],
};
