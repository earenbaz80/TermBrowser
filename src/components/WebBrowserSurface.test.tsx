import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FOCUS_ADDRESS_EVENT, WebBrowserSurface } from './WebBrowserSurface';
import { THEMES } from '../utils/themes';
import type { BrowserTab, TerminusDesktopApi, TerminusSearchState } from '../types';

const theme = THEMES['cyberpunk-obsidian'];

const blankTab: BrowserTab = {
  id: 'tab_dosy_position',
  kind: 'web',
  title: 'Nueva Pestaña',
  url: 'about:blank',
  displayUrl: 'about:blank',
  isLoading: false,
  content: '',
  history: ['about:blank'],
  historyIndex: 0,
};

const pageTab: BrowserTab = {
  ...blankTab,
  id: 'tab_address_bar',
  title: 'Example',
  url: 'https://example.com',
  displayUrl: 'https://example.com',
  history: ['about:blank', 'https://example.com'],
  historyIndex: 1,
};

const searchState: TerminusSearchState = {
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
  ],
};

const searchTab: BrowserTab = {
  ...blankTab,
  id: 'tab_terminus_search',
  title: 'Terminus Search',
  url: 'terminus://search?q=arquitectura',
  displayUrl: 'terminus://search?q=arquitectura',
  history: ['about:blank', 'terminus://search?q=arquitectura'],
  historyIndex: 1,
  search: searchState,
};

const renderSurface = (
  tab: BrowserTab = blankTab,
  options: {
    globalHistory?: string[];
    onSetZoom?: (zoom: number) => void;
    onPageStatus?: (status: number) => void;
  } = {}
) => {
  const onCommand = vi.fn();
  render(
    <WebBrowserSurface
      theme={theme}
      tab={tab}
      onCommand={onCommand}
      bookmarks={[]}
      onAddBookmark={vi.fn()}
      onRemoveBookmark={vi.fn()}
      onSetViewMode={vi.fn()}
      globalHistory={options.globalHistory}
      onSetZoom={options.onSetZoom}
      onPageStatus={options.onPageStatus}
      latencyMs={18}
    />
  );
  return { onCommand };
};

describe('WebBrowserSurface', () => {
  it('floats DOSY frameless above the browser chrome as a sibling of the address form', () => {
    renderSurface();

    const addressInput = screen.getByRole('textbox', { name: 'Barra de direcciones y búsqueda' }) as HTMLInputElement;
    const addressForm = addressInput.closest('form');
    const eyes = screen.getByTitle(/^DOSY: Asistente personal/);
    const floatingContainer = eyes.closest('div.absolute.bottom-full.right-10.z-30.mb-1');

    expect(addressForm).not.toBeNull();
    expect(floatingContainer).not.toBeNull();

    const chrome = addressForm!.parentElement;
    expect(floatingContainer!.parentElement).toBe(chrome);
    expect(chrome!.classList.contains('relative')).toBe(true);
    expect(floatingContainer!.children.length).toBe(1);
    expect(floatingContainer!.firstElementChild!.contains(eyes)).toBe(true);
    expect(floatingContainer!.contains(addressForm!)).toBe(false);
    expect(floatingContainer!.querySelector('.border')).toBeNull();
    expect(floatingContainer!.classList.contains('absolute')).toBe(true);
    expect(floatingContainer!.classList.contains('bottom-full')).toBe(true);
    expect(floatingContainer!.classList.contains('right-10')).toBe(true);
    expect(floatingContainer!.classList.contains('z-30')).toBe(true);
    expect(floatingContainer!.classList.contains('mb-1')).toBe(true);
  });

  it('keeps the address caret blinking even when the field is not focused', () => {
    renderSurface();

    const addressInput = screen.getByRole('textbox', { name: 'Barra de direcciones y búsqueda' }) as HTMLInputElement;
    const caret = () => addressInput.parentElement!.querySelector<HTMLElement>('.tb-caret-blink');

    expect(document.activeElement).not.toBe(addressInput);
    expect(caret()).not.toBeNull();
    expect(caret()!.getAttribute('aria-hidden')).toBe('true');
    expect(caret()!.style.left).toBe('0ch');

    fireEvent.blur(addressInput);
    expect(caret()).not.toBeNull();
  });

  it('behaves like a normal address bar for touch, keyboard and pointer input', () => {
    const { onCommand } = renderSurface(pageTab);
    const addressInput = screen.getByRole('textbox', { name: 'Barra de direcciones y búsqueda' }) as HTMLInputElement;

    expect(addressInput.getAttribute('inputmode')).toBe('url');
    expect(addressInput.getAttribute('enterkeyhint')).toBe('go');
    expect(addressInput.getAttribute('autocapitalize')).toBe('none');
    expect(addressInput.getAttribute('autocorrect')).toBe('off');

    fireEvent.change(addressInput, { target: { value: 'example.org' } });
    fireEvent.submit(addressInput.closest('form')!);
    expect(onCommand).toHaveBeenCalledWith('example.org');

    fireEvent.click(screen.getByRole('button', { name: 'RUN' }));
    expect(onCommand).toHaveBeenLastCalledWith('example.org');

    fireEvent(window, new Event(FOCUS_ADDRESS_EVENT));
    expect(document.activeElement).toBe(addressInput);
    expect(addressInput.selectionStart).toBe(0);
    expect(addressInput.selectionEnd).toBe('example.org'.length);
  });

  it('renders Terminus Search internally and opens results through onCommand', () => {
    const { onCommand } = renderSurface(searchTab);

    expect(screen.getByRole('searchbox', { name: 'Buscar en Terminus Search' })).toBeTruthy();
    expect(screen.getByText('Arquitectura de software')).toBeTruthy();
    expect(document.querySelector('iframe')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Arquitectura de software/ }));
    expect(onCommand).toHaveBeenCalledWith('goto https://es.wikipedia.org/wiki/Arquitectura_de_software');
  });

  it('restores the active page URL and releases focus on Escape', () => {
    renderSurface(pageTab);
    const addressInput = screen.getByRole('textbox', { name: 'Barra de direcciones y búsqueda' }) as HTMLInputElement;

    addressInput.focus();
    fireEvent.change(addressInput, { target: { value: 'borrador' } });
    fireEvent.keyDown(addressInput, { key: 'Escape' });

    expect(addressInput.value).toBe(pageTab.url);
    expect(document.activeElement).not.toBe(addressInput);
  });

  it('offers history suggestions and runs the selected destination', () => {
    const { onCommand } = renderSurface(pageTab);
    const addressInput = screen.getByRole('textbox', { name: 'Barra de direcciones y búsqueda' }) as HTMLInputElement;

    fireEvent.focus(addressInput);
    fireEvent.change(addressInput, { target: { value: 'exa' } });

    expect(screen.getByRole('listbox', { name: 'Sugerencias de dirección' })).toBeTruthy();
    fireEvent.click(screen.getByRole('option', { name: /example\.com/ }));

    expect(onCommand).toHaveBeenCalledWith('goto https://example.com');
  });

  it('suggests pages from the global history across tabs', () => {
    const { onCommand } = renderSurface(pageTab, {
      globalHistory: ['https://global.example/nota'],
    });
    const addressInput = screen.getByRole('textbox', { name: 'Barra de direcciones y búsqueda' }) as HTMLInputElement;

    fireEvent.focus(addressInput);
    fireEvent.change(addressInput, { target: { value: 'global' } });
    fireEvent.click(screen.getByRole('option', { name: /global\.example/ }));

    expect(onCommand).toHaveBeenCalledWith('goto https://global.example/nota');
  });

  it('changes zoom through the compact controls and exposes the current value', () => {
    const onSetZoom = vi.fn();
    renderSurface(pageTab, { onSetZoom });

    expect(screen.getByTitle('Restablecer zoom al 100% (Ctrl+0)').textContent).toBe('100%');
    fireEvent.click(screen.getByRole('button', { name: 'Aumentar zoom' }));
    expect(onSetZoom).toHaveBeenCalledWith(1.1);
  });

  it('opens the in-page find bar with Ctrl+F and opens the global history panel', () => {
    renderSurface(pageTab, { globalHistory: ['https://example.com'] });

    fireEvent.keyDown(window, { key: 'f', ctrlKey: true });
    expect(screen.getByRole('dialog', { name: 'Buscar en la página' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Texto a buscar en la página' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Abrir historial global' }));
    expect(screen.getByRole('dialog', { name: 'Historial global de navegación' })).toBeTruthy();
  });

  it('opens the in-page find bar from the navigation controls', () => {
    renderSurface(pageTab);

    fireEvent.click(screen.getByRole('button', { name: 'Buscar en la página' }));

    expect(screen.getByRole('dialog', { name: 'Buscar en la página' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Texto a buscar en la página' })).toBeTruthy();
  });

  it('opens the in-page find bar when Ctrl+F is captured inside a proxied page', () => {
    renderSurface(pageTab);
    const frame = document.querySelector('iframe');
    if (!frame) throw new Error('No se encontró el iframe de la página.');

    fireEvent(
      window,
      new MessageEvent('message', {
        data: { source: 'termbrowser-shortcut', action: 'find' },
        source: frame.contentWindow,
        origin: 'null',
      })
    );

    expect(screen.getByRole('dialog', { name: 'Buscar en la página' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Texto a buscar en la página' })).toBeTruthy();
  });

  it('rejects navigation messages from another window or origin', () => {
    const { onCommand } = renderSurface(pageTab);
    const frame = document.querySelector('iframe');
    if (!frame) throw new Error('No se encontró el iframe de la página.');

    const forged = (source: MessageEventSource | null, origin: string, url: string) =>
      fireEvent(
        window,
        new MessageEvent('message', {
          data: { source: 'termbrowser-view', url },
          source,
          origin,
        })
      );

    forged(window, 'null', 'https://wrong-source.example/');
    forged(frame.contentWindow, 'https://wrong-origin.example', 'https://wrong-origin.example/');
    expect(onCommand).not.toHaveBeenCalled();

    forged(frame.contentWindow, 'null', 'https://example.com/next');
    expect(onCommand).toHaveBeenCalledWith('goto https://example.com/next');
  });

  it('keeps a frameable tab on the proxy origin while OSCURO is selected', () => {
    const { onCommand } = renderSurface({ ...pageTab, frameable: true });
    const frame = document.querySelector('iframe');
    if (!frame) throw new Error('No se encontró el iframe de la página.');

    fireEvent(
      window,
      new MessageEvent('message', {
        data: { source: 'termbrowser-view', url: 'https://example.com/next' },
        source: frame.contentWindow,
        origin: 'https://example.com',
      })
    );
    expect(onCommand).not.toHaveBeenCalled();

    fireEvent(
      window,
      new MessageEvent('message', {
        data: { source: 'termbrowser-view', url: 'https://example.com/next' },
        source: frame.contentWindow,
        origin: 'null',
      })
    );
    expect(onCommand).toHaveBeenCalledWith('goto https://example.com/next');
  });

  it('ignores navigation and shortcut messages from a direct REAL frame', () => {
    const { onCommand } = renderSurface({ ...pageTab, frameable: true });
    fireEvent.click(screen.getByRole('button', { name: 'REAL' }));
    const frame = document.querySelector('iframe');
    if (!frame) throw new Error('No se encontró el iframe de la página.');

    fireEvent(
      window,
      new MessageEvent('message', {
        data: { source: 'termbrowser-view', url: 'https://example.com/next' },
        source: frame.contentWindow,
        origin: 'https://example.com',
      })
    );
    fireEvent(
      window,
      new MessageEvent('message', {
        data: { source: 'termbrowser-shortcut', action: 'find' },
        source: frame.contentWindow,
        origin: 'https://example.com',
      })
    );

    expect(onCommand).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Buscar en la página' })).toBeNull();
  });

  it('opens the in-page find bar when the desktop shell forwards Ctrl+F', async () => {
    let findShortcut: (() => void) | undefined;
    const desktop: TerminusDesktopApi = {
      platform: 'win32',
      minimize: vi.fn(),
      toggleMaximize: vi.fn(async () => false),
      close: vi.fn(),
      isMaximized: vi.fn(async () => false),
      onMaximizedChange: vi.fn(() => () => {}),
      onFrameContextMenu: vi.fn(() => () => {}),
      onFindShortcut: vi.fn((listener) => {
        findShortcut = listener;
        return () => {};
      }),
    };

    window.terminusDesktop = desktop;
    try {
      renderSurface(pageTab);
      await waitFor(() => expect(findShortcut).toBeTypeOf('function'));
      findShortcut!();

      await waitFor(() => expect(screen.getByRole('dialog', { name: 'Buscar en la página' })).toBeTruthy());
      expect(screen.getByRole('textbox', { name: 'Texto a buscar en la página' })).toBeTruthy();
    } finally {
      delete window.terminusDesktop;
    }
  });

  it('replaces the page with the no-signal scene while the browser is offline', () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
    try {
      const { onCommand } = renderSurface(pageTab);

      expect(screen.getByRole('alert', { name: 'SIN CONEXIÓN' })).toBeTruthy();
      expect(document.querySelector('iframe')).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: 'REINTENTAR' }));
      expect(onCommand).toHaveBeenCalledWith('reload');
    } finally {
      delete (window.navigator as unknown as { onLine?: boolean }).onLine;
    }
  });

  it('deja que el visor del proxy pida la escena cuando falla dentro del marco', () => {
    const onPageStatus = vi.fn();
    renderSurface(pageTab, { onPageStatus });

    const iframe = document.querySelector('iframe') as HTMLIFrameElement | null;
    expect(iframe).not.toBeNull();

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { source: 'termbrowser-view-error', status: 413 },
        origin: 'null',
        source: iframe!.contentWindow,
      })
    );

    expect(onPageStatus).toHaveBeenCalledWith(413);
  });

  it('shows the not-found variant for an error status', () => {
    const { onCommand } = renderSurface({ ...pageTab, statusCode: 404 });

    expect(screen.getByRole('alert', { name: 'PÁGINA NO ENCONTRADA' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'REINTENTAR' }));
    expect(onCommand).toHaveBeenCalledWith('reload');
  });
});
