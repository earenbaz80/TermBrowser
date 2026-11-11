import crypto from 'crypto';
import express from 'express';
import http from 'http';
import dns from 'dns/promises';
import os from 'os';
import fs from 'fs/promises';
import path from 'path';
import {
  API_SESSION_COOKIE,
  API_TOKEN_HEADER,
  assertRemoteTarget,
  fetchRemote,
  hasApiSessionCookie,
  isMetadataHost,
  isSameOriginRequest,
  resolveListenHost,
  safeDownloadFilename,
  sanitizeProxiedHtml,
} from './src/utils/serverSecurity';
import { proxiedPage, rewriteProxiedImageSources, textOnlyPage } from './src/utils/proxiedPage';
import { buildProxiedCsp } from './src/utils/proxiedCsp';
import { decodeHtmlEntities } from './src/utils/htmlEntities';
import { htmlToRetroMarkup } from './src/utils/retroHtml';
import { pythonRunnerPage, PYTHON_RUNNER_CSP } from './src/utils/pythonRunnerPage';

/**
 * Converts any HTML document into readable plain text, without relying on <p>/<h*> markup.
 * Block-level elements become line breaks, so table-based or div-soup layouts (e.g. Hacker News)
 * still produce readable output instead of an empty page.
 */
const MAX_NUMBERED_LINKS = 15;
const MAX_IMAGES = 12;

function htmlToReadableText(
  html: string,
  baseUrl: string
): {
  text: string;
  links: { text: string; href: string }[];
  images: { src: string; alt?: string }[];
} {
  const links: { text: string; href: string }[] = [];
  const seenHrefs = new Set<string>();
  const images: { src: string; alt?: string }[] = [];
  const seenImageSrcs = new Set<string>();

  let out = html;

  // Drop non-content elements entirely
  out = out.replace(/<!--[\s\S]*?-->/g, ' ');
  out = out.replace(/<(script|style|noscript|svg|iframe|template|canvas|object|select|textarea|head)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');

  // Real images: each content image becomes an invisible-marked placeholder, so the client can
  // render the actual picture inline, exactly where it appeared in the document (max MAX_IMAGES).
  out = out.replace(/<img\b([^>]*)>/gi, (_match: string, attrs: string) => {
    const srcMatch = attrs.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const rawSrc = srcMatch ? srcMatch[1] ?? srcMatch[2] ?? srcMatch[3] ?? '' : '';
    if (!rawSrc || /^data:/i.test(rawSrc)) return ' ';

    let absoluteSrc: string;
    try {
      absoluteSrc = new URL(rawSrc, baseUrl).href;
    } catch {
      return ' ';
    }

    if (/spacer|pixel|tracker|1x1\./i.test(absoluteSrc) || seenImageSrcs.has(absoluteSrc)) return ' ';
    if (images.length >= MAX_IMAGES) return ' ';

    // Skip icons and decorative spacers that declare a thumbnail size
    const widthMatch = attrs.match(/\bwidth\s*=\s*["']?(\d+)/i);
    const heightMatch = attrs.match(/\bheight\s*=\s*["']?(\d+)/i);
    const declaredWidth = widthMatch ? Number(widthMatch[1]) : 0;
    const declaredHeight = heightMatch ? Number(heightMatch[1]) : 0;
    if ((declaredWidth && declaredWidth < 48) || (declaredHeight && declaredHeight < 48)) return ' ';

    const altMatch = attrs.match(/\balt\s*=\s*"([^"]*)"/i) || attrs.match(/\balt\s*=\s*'([^']*)'/i);
    seenImageSrcs.add(absoluteSrc);
    images.push({
      src: absoluteSrc,
      alt: altMatch
        ? decodeHtmlEntities(altMatch[1]).replace(/\s+/g, ' ').trim().slice(0, 120)
        : undefined,
    });
    // U+2061 (invisible) marks a real image placeholder, not plain text
    return ` \u2061[img:${images.length}] `;
  });

  // Lynx-style inline link markers: each link becomes "text [n]", numbered in document
  // order and deduplicated, so the numbers match the links list sent to the client.
  out = out.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (_match: string, attrs: string, inner: string) => {
    // Image placeholders nested inside the anchor stay in the output, but never in its label
    const innerWithImages = inner.replace(/<[^>]+>/g, ' ').replace(/[ \t]{2,}/g, ' ').trim();
    const linkText = innerWithImages.replace(/\u2061\[img:\d+\]/g, '').replace(/\s+/g, ' ').trim();
    if (!linkText) return innerWithImages ? ` ${innerWithImages} ` : ' ';

    const hrefMatch = attrs.match(/href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const rawHref = hrefMatch ? hrefMatch[1] ?? hrefMatch[2] ?? hrefMatch[3] ?? '' : '';
    if (!rawHref || rawHref.startsWith('#') || /^javascript:/i.test(rawHref)) {
      return ` ${linkText} `;
    }

    let absoluteHref: string;
    try {
      absoluteHref = new URL(rawHref, baseUrl).href;
    } catch {
      return ` ${linkText} `;
    }

    if (seenHrefs.has(absoluteHref) || links.length >= MAX_NUMBERED_LINKS) {
      return ` ${linkText} `;
    }

    seenHrefs.add(absoluteHref);
    links.push({ text: linkText.slice(0, 50), href: absoluteHref });
    // The invisible U+2060 marks this bracket as a real link marker, so the client can make it
    // clickable without confusing it with citation brackets that the page itself contains.
    return ` ${linkText} \u2060[${links.length}] `;
  });

  // Line-level structure
  out = out.replace(/<br\b[^>]*\/?>/gi, '\n');
  out = out.replace(/<hr\b[^>]*\/?>/gi, '\n');
  out = out.replace(/<li\b[^>]*>/gi, '\n* ');
  out = out.replace(/<\/?(p|div|section|article|header|footer|nav|aside|main|ul|ol|li|table|thead|tbody|tfoot|tr|td|th|blockquote|pre|h[1-6]|figure|figcaption|dl|dt|dd|form|fieldset|details|summary|caption)\b[^>]*>/gi, '\n');

  // Remaining inline tags
  out = out.replace(/<[^>]+>/g, ' ');
  out = decodeHtmlEntities(out);

  const lines: string[] = [];
  for (const rawLine of out.split('\n')) {
    const line = rawLine
      .replace(/[\t\u00a0\u1680\u2000-\u200b\u2028\u2029\u202f\u205f\u3000]/g, ' ')
      .replace(/ {2,}/g, ' ')
      .trim();
    if (!line) {
      // Collapse runs of blank lines into a single separator
      if (lines.length > 0 && lines[lines.length - 1] !== '') lines.push('');
      continue;
    }
    lines.push(line);
  }

  return { text: lines.join('\n').trim(), links, images };
}

const MAX_REMOTE_TEXT_BYTES = 4 * 1024 * 1024;
const MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024;
const REMOTE_FETCH_TIMEOUT_MS = 20000;
const SEARCH_FETCH_TIMEOUT_MS = 10000;

const APP_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  // Vite's React refresh preamble is inline in development. Production bundles use
  // an external module script, so scripts are strict there.
  ...(process.env.NODE_ENV === 'production'
    ? ["script-src 'self'", "script-src-attr 'none'"]
    : ["script-src 'self' 'unsafe-inline'"]),
  // React themes use style attributes; keep styles inline but never allow inline scripts.
  "style-src 'self' 'unsafe-inline' https:",
  "img-src 'self' data: blob: https: http:",
  "font-src 'self' data: https:",
  "connect-src 'self' ws: wss:",
  "frame-src 'self' https: http:",
  "form-action 'self'",
].join('; ');

function isForbiddenMetadataHost(url: URL): boolean {
  return isMetadataHost(url.hostname);
}

/** Read an upstream body with a hard byte cap instead of buffering an unbounded response. */
async function readTextWithLimit(
  response: { body: ReadableStream<Uint8Array> | null; text(): Promise<string> },
  maxBytes = MAX_REMOTE_TEXT_BYTES
): Promise<{ text: string; truncated: boolean }> {
  if (!response.body) {
    const text = await response.text();
    return { text: text.slice(0, maxBytes), truncated: text.length > maxBytes };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let received = 0;
  let truncated = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;

      if (received > maxBytes) {
        const allowed = Math.max(0, value.byteLength - (received - maxBytes));
        text += decoder.decode(value.subarray(0, allowed), { stream: true });
        truncated = true;
        await reader.cancel().catch(() => undefined);
        break;
      }

      text += decoder.decode(value, { stream: true });
    }
  } finally {
    text += decoder.decode();
  }

  return { text, truncated };
}

async function startServer() {
  const app = express();
  const parsedPort = Number.parseInt(process.env.PORT ?? '', 10);
  const PORT = Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : 3000;
  // Local API routes expose filesystem and shell-adjacent data, so bind to loopback by default.
  // Set TERMINUS_ALLOW_LAN=1 together with HOST=0.0.0.0 only when LAN access is intentional.
  const requestedHost = process.env.HOST;
  const HOST = resolveListenHost(requestedHost);
  if (requestedHost && requestedHost.trim() !== HOST) {
    console.warn(`[Terminus Server] HOST=${requestedHost} ignorado; usando ${HOST}. Define TERMINUS_ALLOW_LAN=1 para exponer la LAN.`);
  }

  app.disable('x-powered-by');

  const API_TOKEN = crypto.randomBytes(32).toString('hex');
  const SESSION_ID = crypto.randomBytes(32).toString('hex');

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', APP_CSP);
    if (!hasApiSessionCookie(req.headers.cookie)) {
      res.cookie(API_SESSION_COOKIE, SESSION_ID, {
        httpOnly: true,
        sameSite: 'strict',
        secure: false,
        maxAge: 12 * 60 * 60 * 1000,
        path: '/',
      });
    }
    next();
  });

  app.use(express.json({ limit: '10mb' }));

  // Intérprete Python aislado: origen opaco, sin red y sin acceso al DOM de la app.
  app.get('/python-runner.html', (_req, res) => {
    res.setHeader('Content-Security-Policy', PYTHON_RUNNER_CSP);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.type('html').send(pythonRunnerPage);
  });

  // The page fetches this token and sends it on filesystem/vault requests. CORS is
  // intentionally not enabled, so another origin cannot read the response.
  app.get('/api/session', (req, res) => {
    if (!isSameOriginRequest(req.get('origin'), req.get('host'), req.get('sec-fetch-site'))) {
      return res.status(403).json({ error: 'Origen no autorizado.' });
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ token: API_TOKEN });
  });

  // Local APIs are same-origin only. The token is required for filesystem and
  // vault operations; resource routes can use the HttpOnly session cookie alone.
  app.use('/api', (req, res, next) => {
    if (!hasApiSessionCookie(req.headers.cookie)) {
      return res.status(401).json({ error: 'Sesión local no inicializada. Recarga la aplicación.' });
    }
    if (!isSameOriginRequest(req.get('origin'), req.get('host'), req.get('sec-fetch-site'))) {
      return res.status(403).json({ error: 'Origen no autorizado.' });
    }
    if (/^\/(?:local-fs|vault)(?:\/|$)/.test(req.path) && req.get(API_TOKEN_HEADER) !== API_TOKEN) {
      return res.status(403).json({ error: 'Token de sesión local ausente o inválido.' });
    }
    next();
  });

  // In-memory encrypted cloud vault storage (per session / mock cloud)
  let cloudVault: { data: string; mfaEnabled: boolean; updatedAt: string; hash: string } | null = null;

  // Real proxy endpoint for terminal curl / fetch / reader commands
  app.get('/api/proxy', async (req, res) => {
    const targetUrl = req.query.url as string;
    if (!targetUrl) {
      return res.status(400).json({ error: 'Missing url parameter' });
    }

    try {
      const parsed = new URL(targetUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return res.status(400).json({ error: 'Invalid protocol. Only http and https supported.' });
      }
      if (isForbiddenMetadataHost(parsed)) {
        return res.status(403).json({ error: 'Cloud metadata endpoints are blocked.' });
      }

      const startTime = Date.now();
      const response = await fetchRemote(targetUrl, {
        headers: {
          'User-Agent': 'Terminus/0.2.1 (CLI Web Navigator; local browser)',
          'Accept': 'text/html,application/xhtml+xml,application/xml,text/plain,application/json;q=0.9,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(REMOTE_FETCH_TIMEOUT_MS),
      });

      const declaredSize = Number(response.headers.get('content-length') || 0);
      if (Number.isFinite(declaredSize) && declaredSize > MAX_REMOTE_TEXT_BYTES) {
        return res.status(413).json({ error: 'Response exceeds the 4 MB proxy limit.' });
      }

      const latencyMs = Date.now() - startTime;
      const contentType = response.headers.get('content-type') || 'text/plain';
      const { text, truncated } = await readTextWithLimit(response);

      // Readable text for text-only browsing: works for HTML and plain/JSON bodies alike
      const isHtmlContent = /html|xml/i.test(contentType);
      const readable = isHtmlContent
        ? htmlToReadableText(text, response.url)
        : {
            text: text.trim(),
            links: [] as { text: string; href: string }[],
            images: [] as { src: string; alt?: string }[],
          };
      const readableText = readable.text;

      // Return structured response with headers, status, timing, body and extracted real images
      const headersObj: Record<string, string> = {};
      response.headers.forEach((val, key) => {
        headersObj[key] = val;
      });

      // Extract title, real images, headings, paragraphs and links
      let extractedTitle = parsed.hostname;
      const titleMatch = text.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch && titleMatch[1]) {
        extractedTitle = titleMatch[1].trim();
      }

      // Images come from the extraction pass, so their order matches the inline placeholders
      // ([img:n]) the client renders inside the readable text.
      const extractedImages: { src: string; alt?: string }[] = [...readable.images];

      // Check og:image meta tag
      const ogMatch = text.match(/<meta[^>]*?property=["']og:image["'][^>]*?content=["']([^"']+)["']/i) ||
                      text.match(/<meta[^>]*?content=["']([^"']+)["'][^>]*?property=["']og:image["']/i);
      if (ogMatch && ogMatch[1]) {
        try {
          const ogUrl = new URL(ogMatch[1], response.url).href;
          // Appended, never unshifted: the placeholders are numbered by position in readable.images
          if (!extractedImages.some((img) => img.src === ogUrl)) {
            extractedImages.push({ src: ogUrl, alt: 'Imagen destacada (OpenGraph)' });
          }
        } catch {}
      }

      // Extract headings
      const extractedHeadings: string[] = [];
      const hRegex = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi;
      let hMatch;
      while ((hMatch = hRegex.exec(text)) !== null && extractedHeadings.length < 8) {
        const cleanH = hMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        if (cleanH) extractedHeadings.push(cleanH);
      }

      // Extract paragraphs
      const extractedParagraphs: string[] = [];
      const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
      let pMatch;
      while ((pMatch = pRegex.exec(text)) !== null && extractedParagraphs.length < 12) {
        const cleanP = pMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        if (cleanP.length > 25) extractedParagraphs.push(cleanP);
      }

      // Fallback for pages without <p> markup (table/div layouts): derive blocks from readable text
      if (extractedParagraphs.length === 0 && readableText) {
        readableText
          .split(/\n+/)
          .map((line) => line.trim())
          .filter((line) => line.length > 30)
          .slice(0, 12)
          .forEach((line) => extractedParagraphs.push(line));
      }

      // Prominent links come from the same pass that numbered them inline, so the
      // [n] markers in the text always match this list.
      const extractedLinks = readable.links;

      return res.json({
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        url: response.url,
        contentType,
        headers: headersObj,
        latencyMs,
        sizeBytes: Buffer.byteLength(text, 'utf8'),
        truncated,
        body: text,
        text: readableText.slice(0, 20000),
        structuredHtml: isHtmlContent ? htmlToRetroMarkup(text, response.url) : '',
        // Framing compatibility: sites that deny embedding cannot be shown as the real page
        frameable: isHtmlContent && !/deny|sameorigin/i.test(response.headers.get('x-frame-options') || '') && !/frame-ancestors\s+(?!\*)/i.test(response.headers.get('content-security-policy') || ''),
        extracted: {
          title: extractedTitle,
          images: extractedImages.slice(0, 12),
          headings: extractedHeadings,
          paragraphs: extractedParagraphs,
          links: extractedLinks,
        },
      });
    } catch (err: any) {
      return res.status(502).json({
        error: 'Proxy Fetch Failed',
        message: err.message || 'Unknown network error',
      });
    }
  });

  // Real Web Search API for normal browser search behavior
  // Real images for the browser view: fetched server-side (with the page as referer) so sites with
  // hotlink protection or referer checks still render their pictures inside the text view.
  app.get('/api/image', async (req, res) => {
    const rawUrl = String(req.query.url || '');
    const referer = typeof req.query.ref === 'string' ? req.query.ref : undefined;
    if (!rawUrl) return res.status(400).send('Missing url parameter');

    let target: URL;
    try {
      target = new URL(rawUrl);
    } catch {
      return res.status(400).send('Invalid url');
    }
    if (!['http:', 'https:'].includes(target.protocol)) {
      return res.status(400).send('Invalid protocol. Only http and https supported.');
    }
    if (isForbiddenMetadataHost(target)) {
      return res.status(403).send('Cloud metadata endpoints are blocked.');
    }

    try {
      const upstream = await fetchRemote(target, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Terminus/0.2.1)',
          'Accept': 'image/avif,image/webp,image/*,*/*;q=0.8',
          ...(referer ? { Referer: referer } : {}),
        },
        signal: AbortSignal.timeout(15000),
      });

      const contentType = upstream.headers.get('content-type') || '';
      if (!upstream.ok || !contentType.startsWith('image/')) {
        return res.status(415).send('Not an image');
      }

      const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
      const declaredSize = Number(upstream.headers.get('content-length') || 0);
      if (declaredSize > MAX_IMAGE_BYTES) return res.status(413).send('Image too large');

      const bytes = Buffer.from(await upstream.arrayBuffer());
      if (bytes.byteLength > MAX_IMAGE_BYTES) return res.status(413).send('Image too large');

      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.end(bytes);
    } catch {
      return res.status(502).send('Image fetch failed');
    }
  });

  // Download the source of the current page. It is fetched through the same guarded
  // network path as the reader, so private/metadata targets obey the same policy.
  app.get('/api/download', async (req, res) => {
    const rawUrl = String(req.query.url || '');
    const requestedName = String(req.query.name || '');

    let target: URL;
    try {
      target = new URL(rawUrl);
    } catch {
      return res.status(400).send('Invalid url');
    }
    if (!['http:', 'https:'].includes(target.protocol)) {
      return res.status(400).send('Invalid protocol. Only http and https supported.');
    }

    try {
      const upstream = await fetchRemote(target, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Terminus/0.2.1)',
          Accept: 'text/html,application/xhtml+xml,application/octet-stream,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(REMOTE_FETCH_TIMEOUT_MS),
      });

      if (!upstream.ok) {
        return res.status(upstream.status).send(`No se pudo descargar el destino (HTTP ${upstream.status}).`);
      }

      const declaredSize = Number(upstream.headers.get('content-length') || 0);
      if (declaredSize > MAX_DOWNLOAD_BYTES) {
        return res.status(413).send('La descarga supera el límite de 50 MB.');
      }

      const bytes = Buffer.from(await upstream.arrayBuffer());
      if (bytes.byteLength > MAX_DOWNLOAD_BYTES) {
        return res.status(413).send('La descarga supera el límite de 50 MB.');
      }

      const fallback = path.basename(target.pathname) || target.hostname;
      const filename = safeDownloadFilename(requestedName || fallback, 'terminus-pagina');
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Length', String(bytes.byteLength));
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'no-store');
      return res.end(bytes);
    } catch (err: any) {
      return res.status(502).send(`No se pudo descargar: ${err?.message || 'error de red'}`);
    }
  });

  // Original-page view: serves a page through this origin so sites that forbid framing can
  // still be shown as designed. Page scripts are removed and only a tiny navigation shim is
  // injected, so the framed document cannot run site code or reach our local APIs.
  // mode=real keeps the site's own look, mode=dark adds the retro dark sheet, mode=text only
  // returns the readable text of the page (no site markup at all).
  app.get('/api/view', async (req, res) => {
    const targetUrl = String(req.query.url || '');
    if (!/^https?:\/\//i.test(targetUrl)) {
      return res.status(400).send('Invalid url parameter');
    }

    try {
      const parsed = new URL(targetUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return res.status(400).send('Invalid protocol. Only http and https supported.');
      }
      if (isForbiddenMetadataHost(parsed)) {
        return res.status(403).send('Cloud metadata endpoints are blocked.');
      }

      const response = await fetchRemote(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Terminus/0.2.1',
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(REMOTE_FETCH_TIMEOUT_MS),
      });

      const contentType = response.headers.get('content-type') || '';
      if (!/html|xml/i.test(contentType)) {
        return res.redirect(targetUrl);
      }

      const declaredSize = Number(response.headers.get('content-length') || 0);
      if (Number.isFinite(declaredSize) && declaredSize > MAX_REMOTE_TEXT_BYTES) {
        return res.status(413).send('La página supera el límite de 4 MB.');
      }

      const mode = String(req.query.mode || 'real').toLowerCase();
      const requestOrigin = (() => {
        try {
          return new URL(`${req.protocol}://${req.get('host')}`).origin;
        } catch {
          return undefined;
        }
      })();
      const { text: htmlSource, truncated } = await readTextWithLimit(response);
      let html = htmlSource;
      const nonce = crypto.randomBytes(16).toString('base64');

      if (mode === 'text') {
        const readable = htmlToReadableText(html, response.url);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
        res.setHeader('Content-Security-Policy', buildProxiedCsp(nonce, undefined, requestOrigin));
        res.setHeader('Cache-Control', 'no-store');
        return res.send(textOnlyPage(response.url, readable.text, nonce));
      }

      // The document is now served from our origin, so the site's framing rules do not apply.
      // Remove scripts, inline handlers, iframes and document-level escape hatches before
      // injecting our nonce-bound navigation/find shim.
      html = sanitizeProxiedHtml(html);
      html = html.replace(/<meta[^>]+http-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/gi, '');
      html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
      html = html.replace(/<script\b[^>]*\/?>/gi, '');
      html = html.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '');
      html = html.replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '');
      html = html.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '');

      // The proxied CSP no longer allows arbitrary image origins. Public images
      // still load through the guarded /api/image endpoint, whose fetchRemote()
      // applies the same private-network policy and DNS pinning as the page.
      html = rewriteProxiedImageSources(html, response.url, requestOrigin);
      html = proxiedPage(html, response.url, nonce, mode === 'dark');

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      res.setHeader('Content-Security-Policy', buildProxiedCsp(nonce, response.url, requestOrigin));
      res.setHeader('Cache-Control', 'no-store');
      if (truncated) res.setHeader('X-Terminus-Truncated', '1');
      return res.send(html);
    } catch (err: any) {
      return res.status(502).send(`No se pudo cargar la página original: ${err?.message || 'error de red'}`);
    }
  });

  app.get('/api/search', async (req, res) => {
    const query = (req.query.q as string || '').trim();
    if (!query) {
      return res.status(400).json({ error: 'Missing query parameter q' });
    }

    try {
      const results: { title: string; url: string; snippet: string; image?: string }[] = [];
      const images: { src: string; alt?: string }[] = [];

      // 1. Query DuckDuckGo Instant Answer API
      try {
        const ddgRes = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Terminus/0.2.1' },
          signal: AbortSignal.timeout(SEARCH_FETCH_TIMEOUT_MS),
        });
        if (ddgRes.ok) {
          const ddgData = await ddgRes.json();
          if (ddgData.Abstract && ddgData.AbstractURL) {
            results.push({
              title: ddgData.Heading || query,
              url: ddgData.AbstractURL,
              snippet: ddgData.Abstract,
              image: ddgData.Image ? (ddgData.Image.startsWith('http') ? ddgData.Image : `https://duckduckgo.com${ddgData.Image}`) : undefined,
            });
            if (ddgData.Image) {
              const fullImg = ddgData.Image.startsWith('http') ? ddgData.Image : `https://duckduckgo.com${ddgData.Image}`;
              images.push({ src: fullImg, alt: ddgData.Heading });
            }
          }

          // Related topics
          if (Array.isArray(ddgData.RelatedTopics)) {
            ddgData.RelatedTopics.slice(0, 6).forEach((topic: any) => {
              if (topic.Text && topic.FirstURL) {
                const titlePart = topic.Text.split(' - ')[0] || topic.Text.slice(0, 40);
                const imgUrl = topic.Icon?.URL ? (topic.Icon.URL.startsWith('http') ? topic.Icon.URL : `https://duckduckgo.com${topic.Icon.URL}`) : undefined;
                results.push({
                  title: titlePart,
                  url: topic.FirstURL,
                  snippet: topic.Text,
                  image: imgUrl,
                });
                if (imgUrl) images.push({ src: imgUrl, alt: titlePart });
              }
            });
          }
        }
      } catch {}

      // 2. Query Wikipedia API for rich multilingual encyclopedic search
      try {
        const wikiRes = await fetch(`https://es.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=8&namespace=0&format=json`, {
          signal: AbortSignal.timeout(SEARCH_FETCH_TIMEOUT_MS),
        });
        if (wikiRes.ok) {
          const wikiData = await wikiRes.json();
          const titles: string[] = wikiData[1] || [];
          const snippets: string[] = wikiData[2] || [];
          const urls: string[] = wikiData[3] || [];

          for (let i = 0; i < titles.length; i++) {
            if (!results.some((r) => r.url === urls[i])) {
              results.push({
                title: titles[i],
                url: urls[i],
                snippet: snippets[i] || `Artículo de Wikipedia sobre ${titles[i]}`,
              });
            }
          }
        }
      } catch {}

      // 3. Fallback / supplementary DuckDuckGo HTML scraping if sparse
      if (results.length < 3) {
        try {
          const htmlRes = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Terminus/0.2.1' },
            signal: AbortSignal.timeout(SEARCH_FETCH_TIMEOUT_MS),
          });
          if (htmlRes.ok) {
            const { text: html } = await readTextWithLimit(htmlRes);
            const linkRegex = /<a\b[^>]*?class=["']result__url["'][^>]*?href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

            let m;
            while ((m = linkRegex.exec(html)) !== null && results.length < 10) {
              try {
                let actualUrl = m[1];
                if (actualUrl.includes('uddg=')) {
                  const uMatch = actualUrl.match(/uddg=([^&]+)/);
                  if (uMatch) actualUrl = decodeURIComponent(uMatch[1]);
                }
                const cleanText = m[2].replace(/<[^>]+>/g, '').trim();
                if (!results.some((r) => r.url === actualUrl) && actualUrl.startsWith('http')) {
                  results.push({
                    title: cleanText || actualUrl,
                    url: actualUrl,
                    snippet: `Resultado de la búsqueda web para: ${query}`,
                  });
                }
              } catch {}
            }
          }
        } catch {}
      }

      // If still empty, provide clean search engines destinations
      if (results.length === 0) {
        results.push(
          {
            title: `Buscar "${query}" en DuckDuckGo`,
            url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
            snippet: `Explorar resultados globales para "${query}" en DuckDuckGo.`,
          },
          {
            title: `Buscar "${query}" en Wikipedia`,
            url: `https://es.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(query)}`,
            snippet: `Consultar enciclopedia libre para "${query}".`,
          },
          {
            title: `Buscar "${query}" en Google`,
            url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
            snippet: `Búsqueda estándar en Google para "${query}".`,
          }
        );
      }

      return res.json({
        query,
        count: results.length,
        provider: 'DuckDuckGo + Wikipedia',
        results,
        images: images.slice(0, 8),
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'Search failed', message: err.message });
    }
  });

  // Real DNS lookup endpoint
  app.get('/api/dns', async (req, res) => {
    const host = req.query.host as string;
    if (!host) {
      return res.status(400).json({ error: 'Missing host parameter' });
    }

    try {
      const cleanHost = host.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
      try {
        await assertRemoteTarget(new URL(`http://${cleanHost}`));
      } catch (error: any) {
        return res.status(403).json({
          error: 'DNS target blocked by network policy',
          message: error.message,
        });
      }
      const startTime = Date.now();
      const lookupResult = await dns.lookup(cleanHost, { all: true });
      const latencyMs = Date.now() - startTime;

      let mxRecords: any[] = [];
      try {
        mxRecords = await dns.resolveMx(cleanHost);
      } catch {
        // Optional MX
      }

      return res.json({
        host: cleanHost,
        records: lookupResult,
        mx: mxRecords,
        latencyMs,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      return res.status(500).json({
        error: 'DNS Lookup Failed',
        message: err.message,
      });
    }
  });

  // Real System Stats for MS-DOS HUD
  app.get('/api/system-stats', (_req, res) => {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const cpus = os.cpus();
    const loadAvg = os.loadavg();

    res.json({
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      uptimeSeconds: os.uptime(),
      memory: {
        total: totalMem,
        free: freeMem,
        used: usedMem,
        usagePercentage: Math.round((usedMem / totalMem) * 100),
      },
      cpu: {
        model: cpus[0]?.model || 'Generic x86_64 Virtual Core',
        count: cpus.length,
        loadAvg,
      },
      timestamp: Date.now(),
    });
  });

  // Encrypted Cloud Vault Sync (AES-256 encrypted payload backup & restore)
  app.post('/api/vault/backup', (req, res) => {
    const { encryptedPayload, hash, mfaVerified } = req.body;
    if (!encryptedPayload || !hash) {
      return res.status(400).json({ error: 'Missing encryptedPayload or hash' });
    }

    cloudVault = {
      data: encryptedPayload,
      mfaEnabled: !!mfaVerified,
      updatedAt: new Date().toISOString(),
      hash,
    };

    res.json({
      success: true,
      message: 'Cloud vault backup synchronized successfully under AES-256 seal.',
      updatedAt: cloudVault.updatedAt,
      hash,
    });
  });

  app.get('/api/vault/restore', (_req, res) => {
    if (!cloudVault) {
      return res.status(404).json({ error: 'No cloud vault backup found.' });
    }
    res.json(cloudVault);
  });

  // Local File System Access API (real workspace & local disk exploration)
  const WORKSPACE_ROOT = process.env.TERMINUS_WORKSPACE_ROOT
    ? path.resolve(process.env.TERMINUS_WORKSPACE_ROOT)
    : process.cwd();
  const DIST_DIR = process.env.TERMINUS_DIST_DIR
    ? path.resolve(process.env.TERMINUS_DIST_DIR)
    : path.resolve(process.cwd(), 'dist');

  const resolveSafePath = (userPath: string = '') => {
    const clean = userPath.replace(/^[/\\]+/, '');
    const resolved = path.resolve(WORKSPACE_ROOT, clean);
    const relative = path.relative(WORKSPACE_ROOT, resolved);
    // A plain startsWith() would accept a sibling like "workspace-evil" for root "workspace".
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      return WORKSPACE_ROOT;
    }
    return resolved;
  };

  app.get('/api/local-fs/list', async (req, res) => {
    try {
      const relDir = (req.query.dir as string) || '';
      const targetDir = resolveSafePath(relDir);
      const entries = await fs.readdir(targetDir, { withFileTypes: true });

      const items = await Promise.all(
        entries
          .filter((entry) => !['node_modules', '.git'].includes(entry.name))
          .map(async (entry) => {
            const fullItemPath = path.join(targetDir, entry.name);
            let size = 0;
            let mtime = new Date().toISOString();
            try {
              const stat = await fs.stat(fullItemPath);
              size = stat.size;
              mtime = stat.mtime.toISOString();
            } catch {}

            return {
              name: entry.name,
              isDirectory: entry.isDirectory(),
              size,
              updatedAt: mtime,
              path: path.relative(WORKSPACE_ROOT, fullItemPath),
              ext: path.extname(entry.name).toLowerCase(),
            };
          })
      );

      // Sort directories first, then alphabetical
      items.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });

      const currentRel = path.relative(WORKSPACE_ROOT, targetDir) || '.';
      const parentRel = currentRel === '.' ? null : path.dirname(currentRel);

      return res.json({
        root: WORKSPACE_ROOT,
        currentDir: currentRel,
        parentDir: parentRel,
        items,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to read directory', message: err.message });
    }
  });

  app.get('/api/local-fs/read', async (req, res) => {
    try {
      const relFile = req.query.file as string;
      if (!relFile) return res.status(400).json({ error: 'Missing file parameter' });
      const targetFile = resolveSafePath(relFile);
      const stat = await fs.stat(targetFile);
      if (stat.isDirectory()) {
        return res.status(400).json({ error: 'Path is a directory, not a file' });
      }

      const content = await fs.readFile(targetFile, 'utf-8');
      return res.json({
        path: path.relative(WORKSPACE_ROOT, targetFile),
        size: stat.size,
        updatedAt: stat.mtime.toISOString(),
        content,
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to read file', message: err.message });
    }
  });

  app.post('/api/local-fs/write', async (req, res) => {
    try {
      const { file, content } = req.body;
      if (!file) return res.status(400).json({ error: 'Missing file path' });
      const targetFile = resolveSafePath(file);
      await fs.mkdir(path.dirname(targetFile), { recursive: true });
      await fs.writeFile(targetFile, content ?? '', 'utf-8');
      return res.json({
        success: true,
        path: path.relative(WORKSPACE_ROOT, targetFile),
        message: 'File written successfully to local filesystem.',
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to write file', message: err.message });
    }
  });

  app.post('/api/local-fs/mkdir', async (req, res) => {
    try {
      const { dir } = req.body;
      if (!dir) return res.status(400).json({ error: 'Missing directory path' });
      const targetDir = resolveSafePath(dir);
      await fs.mkdir(targetDir, { recursive: true });
      return res.json({
        success: true,
        path: path.relative(WORKSPACE_ROOT, targetDir),
        message: 'Directory created successfully.',
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to create directory', message: err.message });
    }
  });

  const server = http.createServer(app);

  // Mount Vite middlewares for development
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        // Share the app's own HTTP server so the HMR WebSocket is served from the same
        // origin and port as the page. Without this, Vite opens a second port (24678),
        // which collides with other processes and makes the client handshake fail (400).
        // When DISABLE_HMR is set, the vite.config.ts setting (hmr: false) is left untouched.
        ...(hmrDisabled ? {} : { ws: { server } }),
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // In production serve dist from an absolute path so the packaged app works
    // regardless of its current working directory.
    app.use(express.static(DIST_DIR));
  }

  server.listen(PORT, HOST, () => {
    console.log(`[Terminus Server] Running on http://${HOST}:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[Terminus Server] Fatal error:', err);
  process.exit(1);
});
