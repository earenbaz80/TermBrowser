import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import { proxiedPage, rewriteProxiedImageSources, textOnlyPage } from './proxiedPage';

type JsdomInstance = {
  window: Window & typeof globalThis;
};

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom') as {
  JSDOM: new (
    html?: string,
    options?: { runScripts?: 'dangerously'; url?: string }
  ) => JsdomInstance;
};

function loadTextPage(): JsdomInstance {
  return new JSDOM(textOnlyPage('https://example.com/nota', 'Contenido de prueba', 'nonce-e2e'), {
    runScripts: 'dangerously',
    url: 'http://localhost/api/view?url=https%3A%2F%2Fexample.com&mode=text',
  });
}

function loadDarkPage(): JsdomInstance {
  const html = proxiedPage(
    '<!doctype html><html><head><title>Fixture</title></head><body><p>Contenido</p><p><a href="/destino">Destino</a></p></body></html>',
    'https://example.com/nota',
    'nonce-e2e',
    true
  );
  return new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'http://localhost/api/view?url=https%3A%2F%2Fexample.com&mode=dark',
  });
}

function dispatchFindShortcut(window: Window & typeof globalThis, init: KeyboardEventInit) {
  const event = new window.KeyboardEvent('keydown', { key: 'f', cancelable: true, ...init });
  window.document.dispatchEvent(event);
  return event;
}

describe('text-only proxy page', () => {
  it('answers termbrowser-find and posts the result to the browser chrome', () => {
    const dom = loadTextPage();
    const { window } = dom;
    const find = vi.fn(() => true);
    Object.defineProperty(window, 'find', { configurable: true, value: find });
    const postMessage = vi.spyOn(window, 'postMessage').mockImplementation(() => {});

    window.dispatchEvent(
      new window.MessageEvent('message', {
        data: { source: 'termbrowser-find', query: 'prueba', backwards: true },
      })
    );

    expect(find).toHaveBeenCalledWith('prueba', false, true, true, false, false, false);
    expect(postMessage).toHaveBeenCalledWith(
      { source: 'termbrowser-find-result', found: true },
      '*'
    );

    postMessage.mockClear();
    window.dispatchEvent(new window.MessageEvent('message', { data: { source: 'other' } }));
    expect(postMessage).not.toHaveBeenCalled();

    find.mockReturnValue(false);
    window.dispatchEvent(
      new window.MessageEvent('message', {
        data: { source: 'termbrowser-find', query: 'ausente' },
      })
    );

    expect(find).toHaveBeenLastCalledWith('ausente', false, false, true, false, false, false);
    expect(postMessage).toHaveBeenCalledWith(
      { source: 'termbrowser-find-result', found: false },
      '*'
    );
    dom.window.close();
  });

  it('forwards Ctrl+F from the TEXTO page to the browser chrome', () => {
    const dom = loadTextPage();
    const { window } = dom;
    const postMessage = vi.spyOn(window, 'postMessage').mockImplementation(() => {});

    const ctrlF = dispatchFindShortcut(window, { ctrlKey: true });
    expect(ctrlF.defaultPrevented).toBe(true);
    expect(postMessage).toHaveBeenCalledWith(
      { source: 'termbrowser-shortcut', action: 'find' },
      '*'
    );

    postMessage.mockClear();
    const plainF = dispatchFindShortcut(window, {});
    expect(plainF.defaultPrevented).toBe(false);
    expect(postMessage).not.toHaveBeenCalled();
    dom.window.close();
  });

  it('forwards Cmd+F from the TEXTO page to the browser chrome', () => {
    const dom = loadTextPage();
    const { window } = dom;
    const postMessage = vi.spyOn(window, 'postMessage').mockImplementation(() => {});

    const cmdF = dispatchFindShortcut(window, { metaKey: true });
    expect(cmdF.defaultPrevented).toBe(true);
    expect(postMessage).toHaveBeenCalledWith(
      { source: 'termbrowser-shortcut', action: 'find' },
      '*'
    );
    dom.window.close();
  });
});

describe('proxied image rewriting', () => {
  it('routes relative, absolute and srcset images through /api/image', () => {
    const html = [
      '<img id="relative" src="/foto.jpg" alt="Foto">',
      '<img id="absolute" src="https://cdn.example.com/foto.jpg">',
      '<img id="srcset" srcset="/uno.jpg 1x, https://cdn.example.com/dos.jpg 2x">',
      '<img id="inline" src="data:image/png;base64,AAAA">',
    ].join('');

    const result = rewriteProxiedImageSources(html, 'https://example.com/nota', 'http://127.0.0.1:3000');

    expect(result).toContain('src="http://127.0.0.1:3000/api/image?url=https%3A%2F%2Fexample.com%2Ffoto.jpg&amp;ref=https%3A%2F%2Fexample.com%2Fnota"');
    expect(result).toContain('src="http://127.0.0.1:3000/api/image?url=https%3A%2F%2Fcdn.example.com%2Ffoto.jpg&amp;ref=https%3A%2F%2Fexample.com%2Fnota"');
    expect(result).toContain('srcset="http://127.0.0.1:3000/api/image?url=https%3A%2F%2Fexample.com%2Funo.jpg&amp;ref=https%3A%2F%2Fexample.com%2Fnota 1x, http://127.0.0.1:3000/api/image?url=https%3A%2F%2Fcdn.example.com%2Fdos.jpg&amp;ref=https%3A%2F%2Fexample.com%2Fnota 2x"');
    expect(result).toContain('src="data:image/png;base64,AAAA"');
  });

  it('does not let a private image URL reach the browser directly', () => {
    const result = rewriteProxiedImageSources(
      '<img src="http://127.0.0.1:9000/private.png">',
      'https://example.com/nota',
      'http://127.0.0.1:3000'
    );

    expect(result).toContain('src="http://127.0.0.1:3000/api/image?url=http%3A%2F%2F127.0.0.1%3A9000%2Fprivate.png');
    expect(result).not.toContain('src="http://127.0.0.1:9000');
  });
});

describe('dark proxy page', () => {
  it.each([
    { name: 'Ctrl', init: { ctrlKey: true } },
    { name: 'Cmd', init: { metaKey: true } },
  ])('forwards $name+F from the OSCURA view to the browser chrome', ({ init }) => {
    const dom = loadDarkPage();
    const { window } = dom;
    expect(window.document.getElementById('termbrowser-dark-retro')).not.toBeNull();

    const postMessage = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
    const event = dispatchFindShortcut(window, init);

    expect(event.defaultPrevented).toBe(true);
    expect(postMessage).toHaveBeenCalledWith(
      { source: 'termbrowser-shortcut', action: 'find' },
      '*'
    );
    dom.window.close();
  });

  it('forwards link navigation from the OSCURA view to the browser chrome', () => {
    const dom = loadDarkPage();
    const { window } = dom;
    const postMessage = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
    const link = window.document.querySelector<HTMLAnchorElement>('a[href="/destino"]');
    if (!link) throw new Error('No se encontró el enlace de prueba');

    const click = new window.MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(click);

    expect(click.defaultPrevented).toBe(true);
    expect(postMessage).toHaveBeenCalledWith(
      { source: 'termbrowser-view', url: 'https://example.com/destino' },
      '*'
    );
    dom.window.close();
  });

  it('applies cosmetic CSS received from the browser chrome', () => {
    const dom = loadDarkPage();
    const { window } = dom;

    window.dispatchEvent(
      new window.MessageEvent('message', {
        data: { source: 'termbrowser-cosmetics', css: '.adsbygoogle{display:none!important}' },
      })
    );

    const style = window.document.getElementById('termbrowser-adblock-cosmetics');
    expect(style?.textContent).toBe('.adsbygoogle{display:none!important}');
    dom.window.close();
  });

  it.each([
    { name: 'mailto', href: 'mailto:hola@example.com' },
    { name: 'tel', href: 'tel:+34900000000' },
  ])('leaves $name links to the document instead of forwarding them', ({ name, href }) => {
    const dom = loadDarkPage();
    const { window } = dom;
    const postMessage = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
    const link = window.document.createElement('a');
    link.href = href;
    link.textContent = name;
    window.document.body.appendChild(link);

    let preventedByShim = false;
    link.addEventListener('click', (event) => {
      preventedByShim = event.defaultPrevented;
      event.preventDefault(); // jsdom no implementa la navegación externa
    });

    const click = new window.MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(click);

    expect(preventedByShim).toBe(false);
    expect(postMessage).not.toHaveBeenCalled();
    dom.window.close();
  });
});
