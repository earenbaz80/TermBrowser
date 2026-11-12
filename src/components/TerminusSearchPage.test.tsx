import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TerminusSearchPage } from './TerminusSearchPage';
import { THEMES } from '../utils/themes';
import type { TerminusSearchState } from '../types';

const theme = THEMES['cyberpunk-obsidian'];

const renderPage = (query: string, state?: TerminusSearchState) => {
  const onSearch = vi.fn();
  const onOpenResult = vi.fn();
  render(
    <TerminusSearchPage
      theme={theme}
      query={query}
      state={state}
      onSearch={onSearch}
      onOpenResult={onOpenResult}
    />
  );
  return { onSearch, onOpenResult };
};

describe('TerminusSearchPage', () => {
  it('submits a query from the branded home page', () => {
    const { onSearch } = renderPage('');
    const input = screen.getByRole('searchbox', { name: 'Buscar en Terminus Search' });

    expect(screen.getAllByText(/TERMINUS/).length).toBeGreaterThan(0);
    expect(screen.getByText('Buscador propio / proveedor actual')).toBeTruthy();
    expect(screen.getAllByText('DuckDuckGo + Wikipedia').length).toBeGreaterThan(0);

    fireEvent.change(input, { target: { value: '  computación cuántica  ' } });
    fireEvent.submit(input.closest('form')!);

    expect(onSearch).toHaveBeenCalledWith('computación cuántica');
  });

  it('opens a result through the app command layer', () => {
    const state: TerminusSearchState = {
      query: 'arquitectura',
      status: 'ready',
      latencyMs: 42,
      provider: 'DuckDuckGo + Wikipedia',
      results: [
        {
          title: 'Arquitectura de software',
          url: 'https://es.wikipedia.org/wiki/Arquitectura_de_software',
          snippet: 'Patrones y decisiones estructurales de un sistema.',
        },
        {
          title: 'Arquitectura',
          url: 'https://es.wikipedia.org/wiki/Arquitectura',
          snippet: 'Arte y técnica de proyectar edificios.',
        },
      ],
    };
    const { onOpenResult } = renderPage('arquitectura', state);

    expect(screen.getByText(/2 RESULTADOS/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Arquitectura de software/ }));

    expect(onOpenResult).toHaveBeenCalledWith('https://es.wikipedia.org/wiki/Arquitectura_de_software');
  });

  it('shows the provider error and retries the same query', () => {
    const state: TerminusSearchState = {
      query: 'sin conexión',
      status: 'error',
      latencyMs: 15,
      provider: 'DuckDuckGo + Wikipedia',
      results: [],
      error: 'El proveedor no está disponible.',
    };
    const { onSearch } = renderPage('sin conexión', state);

    expect(screen.getByText('El proveedor no está disponible.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /REINTENTAR/ }));

    expect(onSearch).toHaveBeenCalledWith('sin conexión');
  });
});
