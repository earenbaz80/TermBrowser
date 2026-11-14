/**
 * Recuento de pasos del E2E instalado.
 *
 * Cada guion cierra con «STEPS: ejecutados/esperados»; este módulo comprueba que
 * cada suite lo declara y que el número coincide con el que espera la lista de
 * suites. Vive fuera del workflow para poder probarlo con vitest: un log corto,
 * una línea ausente o un guion que sale con 0 sin haber corrido todo tienen que
 * ponerse en rojo igual.
 */

import fs from 'node:fs';
import path from 'node:path';
import { E2E_SUITES } from '../e2e-suites.mjs';

/** Última línea «STEPS: n/m» del log; la primera puede venir de una ejecución previa. */
export const STEPS_PATTERN = /STEPS: (\d+)\/(\d+)/g;

/** Resume las suites leyendo su log con `readLog(suite)`. */
export function summarizeSuites(suites, readLog) {
  const problems = [];
  const reports = [];

  for (const suite of suites) {
    const text = readLog(suite) ?? '';
    STEPS_PATTERN.lastIndex = 0;
    const matches = [...String(text).matchAll(STEPS_PATTERN)];
    const match = matches.length ? matches[matches.length - 1] : null;

    if (!match) {
      problems.push({
        log: suite.log,
        message: `${suite.log} no informó de los pasos ejecutados.`,
      });
      reports.push(`${suite.label} sin recuento`);
      continue;
    }

    const counts = `${match[1]}/${match[2]}`;
    if (counts !== `${suite.steps}/${suite.steps}`) {
      problems.push({
        log: suite.log,
        message: `${suite.log} declara ${counts} pasos; se esperaban ${suite.steps}/${suite.steps}.`,
      });
    }
    reports.push(`${suite.label} ${counts}`);
  }

  const code = problems.length ? 1 : 0;
  return {
    code,
    result: code === 0 ? 'PASS' : 'FAIL',
    text: reports.join(' · '),
    problems,
  };
}

/** Recuento sobre los logs que hay en `directory`. */
export function summarizeLogs(directory, suites = E2E_SUITES) {
  return summarizeSuites(suites, (suite) => {
    const file = path.join(directory, suite.log);
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  });
}
