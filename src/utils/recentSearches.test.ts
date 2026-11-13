import { describe, expect, it } from 'vitest';
import {
  loadRecentSearches,
  MAX_RECENT_SEARCHES,
  RECENT_SEARCHES_STORAGE_KEY,
  recordRecentSearch,
} from './recentSearches';

const store = (value: unknown) =>
  localStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(value));

describe('búsquedas recientes del inicio', () => {
  it('arranca vacío y guarda la más reciente delante', () => {
    expect(loadRecentSearches()).toEqual([]);

    recordRecentSearch('electron');
    recordRecentSearch('arquitectura');

    expect(loadRecentSearches()).toEqual(['arquitectura', 'electron']);
  });

  it('no repite una búsqueda, aunque cambie el caso o los espacios de los extremos', () => {
    recordRecentSearch('Electron');
    recordRecentSearch('arquitectura');
    recordRecentSearch('  electron  ');

    expect(loadRecentSearches()).toEqual(['electron', 'arquitectura']);
  });

  it(`conserva como mucho ${MAX_RECENT_SEARCHES} entradas`, () => {
    ['uno', 'dos', 'tres', 'cuatro'].forEach(recordRecentSearch);

    expect(loadRecentSearches()).toEqual(['cuatro', 'tres', 'dos']);
  });

  it('ignora un almacén corrupto o con entradas que no son texto', () => {
    store(['ok', '', '   ', 42, null, { query: 'no' }]);
    expect(loadRecentSearches()).toEqual(['ok']);

    localStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, 'no-json');
    expect(loadRecentSearches()).toEqual([]);

    store({ query: 'electron' });
    expect(loadRecentSearches()).toEqual([]);
  });

  it('no guarda un envío vacío ni toca lo que ya había', () => {
    recordRecentSearch('electron');
    expect(recordRecentSearch('   ')).toEqual(['electron']);
    expect(loadRecentSearches()).toEqual(['electron']);
  });

  it('recorta las consultas que no caben en una chip', () => {
    recordRecentSearch('x'.repeat(200));

    expect(loadRecentSearches()).toEqual(['x'.repeat(80)]);
  });
});
