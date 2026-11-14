import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { E2E_SUITES, selectSuites, suiteSteps } from '../e2e-suites.mjs';

const WORKFLOW = path.resolve('.github/workflows/ci.yml');

describe('suites del E2E instalado', () => {
  it('no repite etiquetas ni ficheros de log', () => {
    const labels = E2E_SUITES.map((suite) => suite.label);
    const logs = E2E_SUITES.map((suite) => suite.log);

    expect(new Set(labels).size).toBe(labels.length);
    expect(new Set(logs).size).toBe(logs.length);
  });

  it('sin etiquetas devuelve todas y con etiquetas solo las pedidas', () => {
    expect(selectSuites([]).map((suite) => suite.label)).toEqual(E2E_SUITES.map((suite) => suite.label));
    expect(selectSuites(['ui-de']).map((suite) => suite.label)).toEqual(['ui-de']);
    expect(selectSuites(['ctrl-f', 'ui']).map((suite) => suite.label)).toEqual(['ctrl-f', 'ui']);
  });

  it('rechaza una suite desconocida', () => {
    expect(() => selectSuites(['ui-fr'])).toThrow(/Suite desconocida: ui-fr/);
    expect(() => suiteSteps('ui-fr')).toThrow(/Suite desconocida/);
  });

  it('el gate del CI coincide con las suites marcadas para PR', () => {
    // La lista del workflow es la que decide qué corre en un PR; si alguien añade
    // una suite con `pr: true` y no la añade aquí, no se ejecutaría nunca.
    const workflow = fs.readFileSync(WORKFLOW, 'utf8');
    // El gate declara `$only` vacío al principio y lo rellena al decidir.
    const declared = [...workflow.matchAll(/\$only = '([^']*)'/g)]
      .map((match) => match[1])
      .filter(Boolean);
    expect(declared).toHaveLength(1);

    const fromSuites = E2E_SUITES.filter((suite) => suite.pr).map((suite) => suite.label);
    const fromWorkflow = declared[0].split(',').filter(Boolean);

    expect(fromWorkflow).toEqual(fromSuites);
  });
});
