import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { I18nProvider } from '../i18n';
import { THEMES } from '../utils/themes';
import { APP_VERSION } from '../utils/version';
import type { BrowserTab } from '../types';
import { HeaderBar } from './HeaderBar';

const theme = THEMES['cyberpunk-obsidian'];

const tab: BrowserTab = {
  id: 'tab_header',
  kind: 'web',
  title: 'Portal de inicio',
  url: 'about:blank',
  displayUrl: 'about:blank',
  isLoading: false,
  content: '',
  history: ['about:blank'],
  historyIndex: 0,
};

const renderHeader = (surface: 'web' | 'terminal' = 'web') => {
  const handlers = {
    onSelectTheme: vi.fn(),
    onSelectTab: vi.fn(),
    onNewTab: vi.fn(),
    onNewSession: vi.fn(),
    onCloseTab: vi.fn(),
    onToggleMute: vi.fn(),
    onOpenMonitor: vi.fn(),
    onOpenSecurity: vi.fn(),
    onOpenScripts: vi.fn(),
    onOpenShortcuts: vi.fn(),
    onOpenExtensions: vi.fn(),
    onOpenHelp: vi.fn(),
    onToggleCrt: vi.fn(),
    onLockNow: vi.fn(),
    onSelectSurface: vi.fn(),
  };
  render(
    <I18nProvider>
      <HeaderBar
        theme={theme}
        currentThemeId="cyberpunk-obsidian"
        tabs={[tab]}
        activeTabId={tab.id}
        isMuted={false}
        crtEnabled
        surface={surface}
        {...handlers}
      />
    </I18nProvider>
  );
  return handlers;
};

describe('HeaderBar', () => {
  it('renderiza una sola cabecera, sin barra de título duplicada', () => {
    renderHeader();

    const headers = document.querySelectorAll('header');
    expect(headers.length).toBe(1);

    // El rediseño quitó la barra que repetía «Terminus · app de escritorio».
    expect(screen.queryByText(/app de escritorio/i)).toBeNull();
    // La marca, las herramientas y las pestañas cuelgan de esa única cabecera.
    expect(within(headers[0] as HTMLElement).getByText(/Terminus/)).toBeTruthy();
  });

  it('mantiene los controles de ventana dentro de la cabecera', () => {
    renderHeader();

    const header = document.querySelector('header') as HTMLElement;
    for (const name of ['Minimizar ventana', 'Maximizar ventana', 'Cerrar ventana']) {
      const button = within(header).getByRole('button', { name });
      expect(button).toBeTruthy();
    }
  });

  it('muestra la versión de la app y las dos superficies en la misma franja', () => {
    renderHeader();

    expect(screen.getByText(new RegExp(`v?${APP_VERSION.replace(/\./g, '\\.')}`))).toBeTruthy();
    const header = document.querySelector('header') as HTMLElement;
    expect(within(header).getByRole('button', { name: /^WEB$/i })).toBeTruthy();
    expect(within(header).getByRole('button', { name: /^TERMINAL$/i })).toBeTruthy();
  });
});
