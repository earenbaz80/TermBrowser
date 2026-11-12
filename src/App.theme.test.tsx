import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from './i18n';
import { THEMES } from './utils/themes';
import type { ThemeId } from './types';
import App from './App';

const THEME_KEY = 'termbrowser_theme_v1';

const mountApp = () =>
  render(
    <I18nProvider>
      <App />
    </I18nProvider>
  );

const root = () => document.querySelector('div.w-screen.h-screen') as HTMLElement | null;

const openMenu = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Menú de configuración' }));

const themeSelect = () => document.getElementById('terminus-theme-select') as HTMLSelectElement;

/** jsdom devuelve el color ya normalizado a rgb(), así que se compara contra el mismo formato. */
const asRgb = (hex: string) => {
  const probe = document.createElement('div');
  probe.style.backgroundColor = hex;
  return probe.style.backgroundColor;
};

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}', { status: 200 }))
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('tema persistido de la app', () => {
  it('arranca con el tema por defecto cuando no hay nada guardado', () => {
    mountApp();
    openMenu();

    expect(themeSelect().value).toBe('cyberpunk-obsidian');
    expect(root()?.style.backgroundColor).toBe(asRgb(THEMES['cyberpunk-obsidian'].bg));
  });

  it('guarda en localStorage el tema elegido en el menú', () => {
    mountApp();
    openMenu();

    fireEvent.change(themeSelect(), { target: { value: 'ms-dos' } });

    expect(localStorage.getItem(THEME_KEY)).toBe('ms-dos');
    expect(themeSelect().value).toBe('ms-dos');
    expect(root()?.style.backgroundColor).toBe(asRgb(THEMES['ms-dos'].bg));
  });

  it('aplica el tema guardado al volver a montar la app', () => {
    const first = mountApp();
    openMenu();
    fireEvent.change(themeSelect(), { target: { value: 'matrix-dark' } });
    expect(localStorage.getItem(THEME_KEY)).toBe('matrix-dark');
    first.unmount();

    mountApp();
    openMenu();

    expect(themeSelect().value).toBe('matrix-dark');
    expect(root()?.style.backgroundColor).toBe(asRgb(THEMES['matrix-dark'].bg));
  });

  it('ignora un tema guardado que ya no existe y vuelve al de por defecto', () => {
    localStorage.setItem(THEME_KEY, 'tema-que-no-existe' as ThemeId);

    mountApp();
    openMenu();

    expect(themeSelect().value).toBe('cyberpunk-obsidian');
    expect(root()?.style.backgroundColor).toBe(asRgb(THEMES['cyberpunk-obsidian'].bg));
  });
});
