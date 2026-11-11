import { escapeHtmlAttribute } from './proxiedPage';
import { decodeHtmlEntities } from './htmlEntities';

const RETRO_ALLOWED_TAGS = new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
  'strong', 'em', 'b', 'i', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
  'br', 'hr', 'figure', 'figcaption', 'dl', 'dt', 'dd', 'sup', 'sub', 'a', 'img',
]);

const MAX_RETRO_IMAGES = 20;
const MAX_RETRO_MARKUP = 160000;

/**
 * Structural (retro) view of a page: keeps the original headings, paragraphs, lists, quotes,
 * tables, code and real images, but drops every original attribute, script, style and unknown
 * tag. Links become data-retro-link anchors and images point at the local /api/image proxy, so
 * the client can paint the page with the terminal palette without running any page code.
 *
 * This is deliberately a server-side allowlist, not a general HTML sanitizer. The only
 * attributes that survive are the two attributes generated below; tests cover the common XSS
 * payloads and the caller still renders the result inside the terminal chrome.
 */
export function htmlToRetroMarkup(html: string, baseUrl: string): string {
  let out = html;

  out = out.replace(/<!--[\s\S]*?-->/g, ' ');
  // Doctype and processing instructions are not HTML tags: without this they would render as text
  out = out.replace(/<![^>]*>|<\?[\s\S]*?\?>/g, ' ');
  out = out.replace(/<(script|style|noscript|svg|iframe|template|canvas|object|select|textarea|head)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  out = out.replace(/<(script|style|svg|iframe|template|canvas|object|select|textarea|head)\b[^>]*\/?>/gi, ' ');

  const seenImages = new Set<string>();
  let imageCount = 0;
  out = out.replace(/<img\b([^>]*)>/gi, (_match: string, attrs: string) => {
    const srcMatch = attrs.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const rawSrc = srcMatch ? srcMatch[1] ?? srcMatch[2] ?? srcMatch[3] ?? '' : '';
    if (!rawSrc || /^data:/i.test(rawSrc)) return '';

    let absoluteSrc: string;
    try {
      absoluteSrc = new URL(rawSrc, baseUrl).href;
    } catch {
      return '';
    }
    if (!/^https?:/i.test(absoluteSrc)) return '';
    if (seenImages.has(absoluteSrc) || imageCount >= MAX_RETRO_IMAGES) return '';

    const widthMatch = attrs.match(/\bwidth\s*=\s*["']?(\d+)/i);
    const heightMatch = attrs.match(/\bheight\s*=\s*["']?(\d+)/i);
    if ((widthMatch && Number(widthMatch[1]) < 48) || (heightMatch && Number(heightMatch[1]) < 48)) return '';

    const altMatch = attrs.match(/\balt\s*=\s*"([^"]*)"/i) || attrs.match(/\balt\s*=\s*'([^']*)'/i);
    const alt = altMatch ? decodeHtmlEntities(altMatch[1]).replace(/\s+/g, ' ').trim().slice(0, 120) : '';

    seenImages.add(absoluteSrc);
    imageCount += 1;
    const proxied = `/api/image?url=${encodeURIComponent(absoluteSrc)}&ref=${encodeURIComponent(baseUrl)}`;
    return `<img data-retro-img="1" src="${escapeHtmlAttribute(proxied)}" alt="${escapeHtmlAttribute(alt)}">`;
  });

  out = out.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (_match: string, attrs: string, inner: string) => {
    const hrefMatch = attrs.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const rawHref = hrefMatch ? hrefMatch[1] ?? hrefMatch[2] ?? hrefMatch[3] ?? '' : '';
    if (!rawHref || rawHref.startsWith('#') || /^(javascript|mailto|tel|data):/i.test(rawHref)) return inner;

    let absoluteHref: string;
    try {
      absoluteHref = new URL(rawHref, baseUrl).href;
    } catch {
      return inner;
    }
    if (!/^https?:/i.test(absoluteHref)) return inner;
    return `<a data-retro-link="${escapeHtmlAttribute(absoluteHref)}">${inner}</a>`;
  });

  // Keep only whitelisted tags, stripped of every original attribute. Anchors and images are
  // rebuilt from the generated attributes only; a malformed tag can never smuggle on* handlers.
  out = out.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (match: string, tag: string) => {
    const name = tag.toLowerCase();
    if (!RETRO_ALLOWED_TAGS.has(name)) return ' ';
    if (match.startsWith('</')) return name === 'img' ? '' : `</${name}>`;

    if (name === 'a') {
      const link = match.match(/\bdata-retro-link="([^"]*)"/i);
      return link ? `<a data-retro-link="${link[1]}">` : '<a>';
    }

    if (name === 'img') {
      const image = match.match(/\bdata-retro-img="1"\s+src="([^"]*)"\s+alt="([^"]*)"/i);
      return image
        ? `<img data-retro-img="1" src="${image[1]}" alt="${image[2]}">`
        : '';
    }

    return `<${name}>`;
  });

  out = out.replace(/[ \t]+/g, ' ').replace(/(\r?\n){3,}/g, '\n\n').trim();

  return out.slice(0, MAX_RETRO_MARKUP);
}
