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

  it('no repite una búsqueda, aunque cambie el caso o los espacios', () => {
    recordRecentSearch('Electron');
    recordRecentSearch('arquitectura');
    recordRecentSearch('  electron  ');

    expect(loadRecentSearches()).toEqual(['electron', 'arquitectura']);
  });

  it(`conserva como mucho ${MAX_RECENT_SEARCHES} entradas`, () => {
    ['uno', 'dos', 'tres', 'cuatro'].forEach(recordRecentSearch);

    const searches = loadRecentSearches();
    expect(searches).toEqual(['cuatro', 'tres', 'dos']);
    expect(searches).toHaveLength(MAX_RECENT_SEARCHES);
  });

  it('ignora entradas corruptas, vacías o que no son texto', () => {
    store(['ok', '', '   ', 42, null, { query: 'no' }, 'ok']);
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

  it('normaliza espacios y recorta las consultas largas', () => {
    recordRecentSearch('  arquitectura   de   software  ');
    recordRecentSearch('x'.repeat(200));

    const [longest, first] = loadRecentSearches();
    expect(first).toBe('arquitectura de software');
    expect(longest).toHaveLength(80);
  });
});
