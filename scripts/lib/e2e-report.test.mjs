import { describe, expect, it } from 'vitest';
import { E2E_SUITES, selectSuites, suiteSteps } from '../e2e-suites.mjs';
import { summarizeSuites } from './e2e-report.mjs';

const suites = [
  { label: 'ctrl-f', log: 'e2e-installed.log', steps: 3 },
  { label: 'ui', log: 'e2e-installed-ui.log', steps: 6 },
];

const readFrom = (logs) => (suite) => logs[suite.log] ?? '';

describe('summarizeSuites', () => {
  it('da el resumen por suite cuando los recuentos coinciden', () => {
    const summary = summarizeSuites(
      suites,
      readFrom({
        'e2e-installed.log': '[e2e] PASS 3/3\r\n[e2e] STEPS: 3/3\r\n',
        'e2e-installed-ui.log': '[e2e] STEPS: 6/6\r\n',
      }),
    );

    expect(summary).toEqual({
      code: 0,
      result: 'PASS',
      text: 'ctrl-f 3/3 · ui 6/6',
      problems: [],
    });
  });

  it('falla cuando un guion ejecutó menos pasos de los esperados', () => {
    const summary = summarizeSuites(
      suites,
      readFrom({
        'e2e-installed.log': 'STEPS: 2/3\r\n',
        'e2e-installed-ui.log': 'STEPS: 6/6\r\n',
      }),
    );

    expect(summary.code).toBe(1);
    expect(summary.result).toBe('FAIL');
    expect(summary.problems).toEqual([
      {
        log: 'e2e-installed.log',
        message: 'e2e-installed.log declara 2/3 pasos; se esperaban 3/3.',
      },
    ]);
    expect(summary.text).toBe('ctrl-f 2/3 · ui 6/6');
  });

  it('falla cuando el guion sale sin línea de recuento', () => {
    const summary = summarizeSuites(
      suites,
      readFrom({ 'e2e-installed-ui.log': 'STEPS: 6/6\r\n' }),
    );

    expect(summary.code).toBe(1);
    expect(summary.problems[0].message).toBe(
      'e2e-installed.log no informó de los pasos ejecutados.',
    );
    expect(summary.text).toBe('ctrl-f sin recuento · ui 6/6');
  });

  it('se queda con la última línea de recuento del log', () => {
    const summary = summarizeSuites(
      suites,
      readFrom({
        'e2e-installed.log': 'STEPS: 1/3\r\nSTEPS: 3/3\r\n',
        'e2e-installed-ui.log': 'STEPS: 6/6\r\n',
      }),
    );

    expect(summary.code).toBe(0);
    expect(summary.text).toBe('ctrl-f 3/3 · ui 6/6');
  });

  it('acepta un total mayor que el esperado como fallo', () => {
    const summary = summarizeSuites(
      suites,
      readFrom({
        'e2e-installed.log': 'STEPS: 4/4\r\n',
        'e2e-installed-ui.log': 'STEPS: 6/6\r\n',
      }),
    );

    expect(summary.code).toBe(1);
    expect(summary.problems[0].message).toBe(
      'e2e-installed.log declara 4/4 pasos; se esperaban 3/3.',
    );
  });
});

describe('selectSuites', () => {
  it('devuelve todas las suites sin etiquetas', () => {
    expect(selectSuites()).toHaveLength(E2E_SUITES.length);
    expect(selectSuites([])).toEqual(E2E_SUITES);
  });

  it('filtra por etiqueta respetando el orden de la lista', () => {
    expect(selectSuites(['ui']).map((suite) => suite.label)).toEqual(['ui']);
    expect(selectSuites([' ui ', 'ctrl-f']).map((suite) => suite.label)).toEqual([
      'ctrl-f',
      'ui',
    ]);
  });

  it('falla con una etiqueta desconocida', () => {
    expect(() => selectSuites(['ctrlf'])).toThrow(/Suite desconocida: ctrlf/);
  });

  it('expone el total de pasos de cada suite', () => {
    for (const suite of E2E_SUITES) {
      expect(suiteSteps(suite.label)).toBe(suite.steps);
    }
    expect(() => suiteSteps('otra')).toThrow(/Suite desconocida/);
  });

});
