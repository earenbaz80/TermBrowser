import { describe, expect, it } from 'vitest';
import { sanitizeProxiedHtml } from './serverSecurity';

/**
 * Corpus hostil para el sanitizador de `/api/view`.
 *
 * Cada caso es una construcción que ha roto sanitizadores reales: contenido
 * crudo de `<noscript>`/`<template>`, HTML foráneo de SVG/MathML, entidades
 * codificadas dos veces, esquemas escondidos en `srcset`, `<base>` dentro de
 * comentarios condicionales y `meta` con `http-equiv`. En todos se exige lo
 * mismo: no queda `<script>`, ni manejadores `on*`, ni `javascript:` en un
 * atributo de URL. Los casos con `keeps` comprueban además que el contenido
 * legítimo no se pierde, para que el test no pase por vaciarlo todo.
 */
const PAYLOADS: { name: string; html: string; keeps?: string }[] = [
  {
    name: 'template con handler dentro',
    html: '<template><img src="x" onerror="alert(1)"></template>',
  },
  {
    name: 'noscript con cierre falso (mXSS)',
    html: '<noscript><p title="</noscript><img src=x onerror=alert(1)>">texto</p></noscript>',
  },
  {
    name: 'svg con style y script',
    html: '<svg><style><img src=x onerror=alert(1)></style><script>alert(2)</script></svg>',
  },
  {
    name: 'svg con xlink y animate',
    html: '<svg><a xlink:href="javascript:alert(1)"><animate attributeName="href" values="javascript:alert(2)"></animate></a></svg>',
  },
  {
    name: 'math con href javascript',
    html: '<math><mi href="javascript:alert(1)">m</mi></math>',
  },
  {
    name: 'entidades dobles',
    html: '<a href="&amp;#106;avascript:alert(1)">a</a><a href="jav&#x09;ascript:alert(1)">b</a><a href="&#14;javascript:alert(1)">c</a>',
  },
  {
    name: 'data en srcset',
    html: '<img srcset="data:text/html,<script>alert(1)</script> 1x"><source srcset="javascript:alert(2) 2x"><picture><source srcset="data:image/svg+xml,<svg onload=alert(3)> 3x"></picture>',
  },
  {
    name: 'base en comentarios',
    html: '<!--<base href="https://evil.example/">--><!--[if IE]><base href="https://evil.example/"><![endif]-->',
  },
  {
    name: 'meta http-equiv',
    html: '<meta http-equiv="refresh" content="0;url=javascript:alert(1)"><meta http-equiv="Content-Security-Policy" content="default-src *">',
  },
  {
    name: 'form con action y formaction',
    html: '<form action="data:text/html,<script>alert(1)</script>"><input formaction="javascript:alert(1)"><button formaction="javascript:alert(2)">go</button></form>',
  },
  {
    name: 'iframe con srcdoc y object/embed',
    html: '<iframe srcdoc="<script>alert(1)</script>"></iframe><object data="javascript:alert(2)"></object><embed src="javascript:alert(3)">',
  },
  {
    name: 'protocol-relative y esquemas raros',
    html: '<a href="//evil.example/x">x</a><img src="//evil.example/y"><a href="vbscript:alert(1)">v</a><a href="file:///C:/Windows/win.ini">f</a>',
  },
  {
    name: 'manejadores sin comillas y en mayúsculas',
    html: '<img src=x ONERROR=alert(1)><body ONLOAD=alert(2)><div ONMOUSEOVER=alert(3)>d</div>',
  },
  {
    name: 'contenido legítimo',
    html: '<p>contenido <b>seguro</b></p><a href="https://example.com/x">enlace</a><img src="https://example.com/y.png" srcset="https://example.com/y.png 1x, https://example.com/z.png 2x">',
    keeps: '<p>contenido <b>seguro</b></p>',
  },
];

const FORBIDDEN_TAGS = ['script', 'iframe', 'object', 'embed', 'base', 'svg', 'math', 'template', 'noscript'];
const URL_ATTRIBUTES = new Set(['href', 'src', 'action', 'formaction', 'poster', 'cite', 'srcset', 'background', 'data']);
const DANGEROUS_SCHEME = /(?:^|[\s,])(?:javascript|vbscript|file):/i;

/** Lista lo que el documento resultante conserva y no debería, ya parseado. */
function dangerousParts(sanitized: string): string[] {
  const document = new DOMParser().parseFromString(sanitized, 'text/html');
  const problems: string[] = [];

  for (const tag of FORBIDDEN_TAGS) {
    if (document.querySelector(tag)) problems.push(`etiqueta <${tag}>`);
  }
  if (/<\s*script/i.test(sanitized)) problems.push('texto con <script');

  for (const element of Array.from(document.querySelectorAll('*'))) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const where = `<${element.tagName.toLowerCase()} ${name}>`;
      if (name.startsWith('on')) problems.push(`manejador ${where}`);
      if (name === 'srcdoc' || name === 'http-equiv' || name === 'formaction') {
        problems.push(`atributo ${where}`);
      }
      if (name.startsWith('xlink') || name === 'xlink:href') problems.push(`atributo ${where}`);
      if (URL_ATTRIBUTES.has(name) && DANGEROUS_SCHEME.test(attribute.value)) {
        problems.push(`esquema peligroso en ${where}: ${attribute.value.slice(0, 60)}`);
      }
    }
  }

  return problems;
}

describe('sanitizeProxiedHtml: corpus hostil', () => {
  it.each(PAYLOADS)('neutraliza «$name»', ({ html, keeps }) => {
    const sanitized = sanitizeProxiedHtml(html);

    expect(dangerousParts(sanitized)).toEqual([]);
    if (keeps) expect(sanitized).toContain(keeps);
  });

  // Si el detector se rompiera, todos los casos pasarían sin comprobar nada.
  it('el detector reconoce los peligros en el HTML original', () => {
    for (const index of [2, 3, 10, 12]) {
      expect(dangerousParts(PAYLOADS[index].html).length, PAYLOADS[index].name).toBeGreaterThan(0);
    }
  });

  it('no deja pasar los atributos de URL legítimos', () => {
    const sanitized = sanitizeProxiedHtml(PAYLOADS[PAYLOADS.length - 1].html);
    const document = new DOMParser().parseFromString(sanitized, 'text/html');

    expect(document.querySelector('a')?.getAttribute('href')).toBe('https://example.com/x');
    expect(document.querySelector('img')?.getAttribute('srcset')).toContain(
      'https://example.com/y.png 1x, https://example.com/z.png 2x'
    );
  });

  /**
   * Límites conocidos, fijados a propósito: si alguien endurece el sanitizador,
   * estos casos fallarán y habrá que actualizarlos. Ninguno ejecuta código:
   * Chromium no ejecuta `url(javascript:)` en CSS y un `data:` dentro de `srcset`
   * no se decodifica como documento. Además la CSP del proxy y el `sandbox` del
   * iframe son la defensa principal, no este pase.
   */
  it('mantiene los dos límites conocidos: CSS inline y data: en srcset', () => {
    const styled = sanitizeProxiedHtml('<div style="background-image:url(javascript:alert(1))">x</div>');
    expect(styled).toContain('url(javascript:');

    const srcset = sanitizeProxiedHtml('<img srcset="data:text/html,<script>alert(1)</script> 1x">');
    expect(srcset).toContain('data:text/html');

    expect(dangerousParts(styled)).toEqual([]);
    expect(dangerousParts(srcset)).toEqual([]);
  });
});
