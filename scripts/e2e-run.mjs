#!/usr/bin/env node
/** Ditto */
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
  const codePromise = (async () => {
    const results = await Promise.allSettled(suites.map((suite) => runSuite(suite)));
    for (let i = 0; i < results.length; i += 1) {
      const r = results[i];
      const code = r.status === 'fulfilled' ? r.value : 1;
      if (code !== 0 && runCode === 0) runCode = code;
      if (r.status === 'rejected') {
        console.log(`[e2e-run] ${suites[i].label}: la suite no terminó (señal/desconexión).`);
      }
    }
  })();
  await codePromise;
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
