import { describe, expect, it } from 'vitest';
import { htmlToRetroMarkup } from './retroHtml';

const BASE = 'https://example.com/noticia';

describe('htmlToRetroMarkup', () => {
  it('drops scripts, event handlers and dangerous URLs', () => {
    const html = [
      '<h1 onclick="alert(1)">Titular</h1>',
      '<script>alert(1)</script>',
      '<p onmouseover="alert(1)">Texto <b style="color:red">fuerte</b></p>',
      '<a href="javascript:alert(1)" onclick="alert(1)">malo</a>',
      '<a href="https://example.com/seguro" onclick="alert(1)">seguro</a>',
      '<iframe src="https://evil.example"></iframe>',
      '<svg onload="alert(1)"><circle /></svg>',
    ].join('');

    const result = htmlToRetroMarkup(html, BASE);

    expect(result).toContain('<h1>Titular</h1>');
    expect(result).toContain('<p>Texto <b>fuerte</b></p>');
    expect(result).toContain('malo');
    expect(result).toContain('data-retro-link="https://example.com/seguro"');
    expect(result).not.toMatch(/script|onclick|onmouseover|onload|style=|iframe|svg|javascript:/i);
  });

  it('rebuilds images only through the local proxy and without original attributes', () => {
    const html = [
      '<img src="/foto.jpg" alt="Foto &quot;principal&quot;" onerror="alert(1)" width="640" height="480">',
      '<img src="/foto.jpg" alt="duplicada">',
      '<img src="data:image/png;base64,AAAA" alt="inline">',
      '<img src="javascript:alert(1)">',
    ].join('');

    const result = htmlToRetroMarkup(html, BASE);

    expect(result.match(/data-retro-img="1"/g)).toHaveLength(1);
    expect(result).toContain('src="/api/image?url=https%3A%2F%2Fexample.com%2Ffoto.jpg&amp;ref=https%3A%2F%2Fexample.com%2Fnoticia"');
    expect(result).toContain('alt="Foto &quot;principal&quot;"');
    expect(result).not.toMatch(/onerror|data:image|javascript:/i);
  });

  it('keeps only allowlisted tags and closes them correctly', () => {
    const html = '<div><p>uno</p><ul><li>dos</li></ul><table><tr><td>tres</td></tr></table><custom>fuera</custom></div>';
    const result = htmlToRetroMarkup(html, BASE);

    expect(result).toContain('<p>uno</p>');
    expect(result).toContain('<ul><li>dos</li></ul>');
    expect(result).toContain('<table><tr><td>tres</td></tr></table>');
    expect(result).not.toMatch(/<div|<custom|<\/div>/);
  });

  it('does not let a crafted attribute break out of the generated anchor', () => {
    const html = '<a href="https://example.com/x&quot; onmouseover=&quot;alert(1)">x</a>';
    const result = htmlToRetroMarkup(html, BASE);

    expect(result).not.toMatch(/\sonmouseover\s*=/i);
    expect(result).toContain('data-retro-link=');
  });
});
