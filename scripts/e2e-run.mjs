#!/usr/bin/env node
/**
 * Ejecuta las suites del E2E instalado y comprueba su recuento de pasos.
 *
 * Sustituye el bloque de PowerShell que vivía en el workflow: lanza cada suite
 * con `npm run`, guarda su salida en `artifacts/e2e/<log>`, y después exige que
 * cada log cierre con «STEPS: n/m» igual al total de su suite. Un guion que sale
 * con 0 pero perdió un paso deja el paso en rojo.
 *
 * Uso:
 *   node scripts/e2e-run.mjs                          # todas las suites
 *   node scripts/e2e-run.mjs --only ctrl-f,ui         # subconjunto (PRs)
 *   node scripts/e2e-run.mjs --report-only            # solo recuento de logs ya escritos
 *   node scripts/e2e-run.mjs --dir artifacts/e2e      # carpeta de logs (por defecto esa)
 *
 * Escribe `result`, `exit_code` y `steps` en `$GITHUB_OUTPUT` cuando existe.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { selectSuites } from './e2e-suites.mjs';
import { summarizeLogs } from './lib/e2e-report.mjs';

const args = process.argv.slice(2);

function option(name) {
  const index = args.indexOf(`--${name}`);
  if (index < 0) return '';
  const value = args[index + 1];
  return value && !value.startsWith('--') ? value : '';
}

const only = option('only').split(',').filter(Boolean);
const reportOnly = args.includes('--report-only');
const outDir = path.resolve(option('dir') || 'artifacts/e2e');

let suites;
try {
  suites = selectSuites(only);
} catch (error) {
  console.log(`::error::${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

/** Lanza una suite y copia su salida al log y a la consola del paso. */
function runSuite(suite) {
  return new Promise((resolve) => {
    const logFile = path.join(outDir, suite.log);
    const stream = fs.createWriteStream(logFile);
    let settled = false;
    const finish = (code) => {
      if (settled) return;
      settled = true;
      stream.end(() => resolve(code));
    };
    const env = { ...process.env };
    if (suite.locale) env.TERMINUS_E2E_LOCALE = suite.locale;
    else delete env.TERMINUS_E2E_LOCALE;

    const child = spawn('npm', ['run', suite.script], {
      env,
      // En Windows `npm` es un .cmd y necesita el shell para resolverse.
      shell: process.platform === 'win32',
      windowsHide: true,
    });

    child.stdout.on('data', (chunk) => {
      process.stdout.write(chunk);
      stream.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      process.stderr.write(chunk);
      stream.write(chunk);
    });
    child.once('error', (error) => {
      const line = `No se pudo lanzar npm run ${suite.script}: ${error.message}${os.EOL}`;
      process.stderr.write(line);
      stream.write(line);
      finish(1);
    });
    child.once('close', (code, signal) => {
      const failed = code ?? 1;
      const detail = signal ? ` (señal ${signal})` : '';
      console.log(`[e2e-run] ${suite.label}: código ${failed}${detail}`);
      finish(failed);
    });
  });
}

fs.mkdirSync(outDir, { recursive: true });

let runCode = 0;
if (!reportOnly) {
  for (const suite of suites) {
    const code = await runSuite(suite);
    if (code !== 0 && runCode === 0) runCode = code;
  }
}

const summary = summarizeLogs(outDir, suites);
for (const problem of summary.problems) {
  console.log(`::error::${problem.message}`);
}

const exitCode = runCode !== 0 ? runCode : summary.code;
const result = exitCode === 0 ? 'PASS' : 'FAIL';
console.log(`[e2e-run] ${result} (código ${exitCode}) — pasos: ${summary.text}`);

if (process.env.GITHUB_OUTPUT) {
  const lines = [`result=${result}`, `exit_code=${exitCode}`, `steps=${summary.text}`];
  fs.appendFileSync(process.env.GITHUB_OUTPUT, lines.join(os.EOL) + os.EOL);
}

process.exitCode = exitCode;
