import { describe, expect, it } from 'vitest';
import { E2E_SUITES, selectSuites, suiteSteps } from '../e2e-suites.mjs';

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
});
