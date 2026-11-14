import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FiltersEngine } from '@ghostery/adblocker';
import { ENGINE_MINIMUMS, isEngineUnusable, readEngineState } from './adblock-engine-state.mjs';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'terminus-engine-state-'));
const written = [];

afterEach(() => {
  while (written.length) {
    fs.rmSync(written.pop(), { force: true });
  }
});

let counter = 0;
function writeEngine(bytes) {
  const file = path.join(directory, `engine-${(counter += 1)}.bin`);
  fs.writeFileSync(file, bytes);
  written.push(file);
  return file;
}

/** Motor serializado con `count` filtros de red y `count` cosméticos. */
function serializeEngine({ network = 0, cosmetic = 0 }) {
  const lines = [];
  for (let index = 0; index < network; index += 1) lines.push(`||ads-${index}.example^`);
  for (let index = 0; index < cosmetic; index += 1) lines.push(`example.com##.ad-slot-${index}`);
  return FiltersEngine.parse(lines.join('\n')).serialize();
}

describe('estado del motor de adblock', () => {
  it('sin caché no hay motor', () => {
    const state = readEngineState(path.join(directory, 'no-existe.bin'));

    expect(state).toEqual({ exists: false, bytes: 0, filters: null, healthy: false, reason: 'sin caché del motor' });
    expect(isEngineUnusable(state)).toBe(true);
  });

  it('un fichero vacío se reporta como caché ilegible', () => {
    const state = readEngineState(writeEngine(Buffer.alloc(0)));

    expect(state.exists).toBe(true);
    expect(state.bytes).toBe(0);
    expect(state.healthy).toBe(false);
    expect(state.reason).toMatch(/caché ilegible/);
  });

  it('una caché truncada no deserializa y se clasifica como lista incompleta', () => {
    const full = serializeEngine({ network: 1200, cosmetic: 1200 });
    const state = readEngineState(writeEngine(full.subarray(0, Math.floor(full.byteLength * 0.6))));

    expect(state.bytes).toBeGreaterThan(0);
    expect(state.healthy).toBe(false);
    expect(state.reason).toMatch(/caché ilegible/);
    expect(isEngineUnusable(state)).toBe(true);
  });

  it('una caché válida pero sin filtros es «listas vacías», no una regresión', () => {
    const state = readEngineState(writeEngine(serializeEngine({ network: 0, cosmetic: 0 })));

    expect(state.filters).toEqual({ network: 0, cosmetic: 0 });
    expect(state.healthy).toBe(false);
    expect(state.reason).toMatch(/listas vacías o incompletas/);
  });

  it('un motor a medias tampoco cuenta como sano', () => {
    const state = readEngineState(
      writeEngine(serializeEngine({ network: ENGINE_MINIMUMS.network - 1, cosmetic: ENGINE_MINIMUMS.cosmetic }))
    );

    expect(state.healthy).toBe(false);
    expect(state.reason).toContain(`${ENGINE_MINIMUMS.network - 1} filtros de red`);
  });

  it('un motor con listas completas es sano y cuenta los filtros', () => {
    const state = readEngineState(writeEngine(serializeEngine({ network: 1500, cosmetic: 1300 })));

    expect(state.filters).toEqual({ network: 1500, cosmetic: 1300 });
    expect(state.healthy).toBe(true);
    expect(state.reason).toBeNull();
    expect(isEngineUnusable(state)).toBe(false);
  });

  it('basura con la cabecera correcta se detecta como ilegible', () => {
    const state = readEngineState(writeEngine(Buffer.from('no soy un motor serializado')));

    expect(state.exists).toBe(true);
    expect(state.healthy).toBe(false);
    expect(state.reason).toMatch(/caché ilegible/);
  });
});
