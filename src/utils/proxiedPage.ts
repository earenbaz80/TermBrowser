/** Helpers shared by the HTML documents served from the /api/view proxy. */

/** Retro dark sheet injected by /api/view?mode=dark: site keeps its layout, loses its palette. */
const DARK_RETRO_CSS = `
  html, body { background: #080b0a !important; color: #cfe9d4 !important; }
  body { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace !important;
         margin: 0 !important; padding: 18px 22px !important; line-height: 1.55 !important; }
  * { background-color: transparent !important; color: inherit !important; border-color: #2b4a3c !important; }
  a, a * { color: #7ef0b0 !important; }
  h1, h2, h3, h4, h5, h6 { color: #eafff3 !important; }
  img, video { max-width: 100% !important; height: auto !important; opacity: .85; }
  pre, code, textarea, input, button { background: #0d1412 !important; color: #9ff0c4 !important;
         border: 1px solid #22352e !important; }
  hr { border-color: #22352e !important; }
  ::selection { background: #1f6f4a !important; color: #eafff3 !important; }
`;

const DARK_RETRO_HEAD = `<style id="termbrowser-dark-retro">${DARK_RETRO_CSS}</style>`;

const escapeHtmlText = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const escapeHtmlAttribute = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

export interface ImageProxyAuth {
  /** Random per-document view id, also used as the page's script nonce. */
  view: string;
  /** Short-lived HMAC proving the image belongs to that proxied document. */
  token: string;
}

const imageAuthQuery = (auth?: ImageProxyAuth): string =>
  auth
    ? `&view=${encodeURIComponent(auth.view)}&token=${encodeURIComponent(auth.token)}`
    : '';

/** Forwards Ctrl/Cmd+F from inside a proxied document to the browser chrome. */
export const findShortcutShim = (nonce: string): string => `<script nonce="${nonce}">
  (function(){
    document.addEventListener('keydown',function(event){
      if(!(event.ctrlKey||event.metaKey))return;
      if(String(event.key||'').toLowerCase()!=='f')return;
      event.preventDefault();
      try{parent.postMessage({source:'termbrowser-shortcut',action:'find'},'*');}catch(error){}
    },true);
  })();
</script>`;

/** Answers in-page find requests from the browser chrome with the document's own search. */
export const findMessageShim = (nonce: string): string => `<script nonce="${nonce}">
  (function(){
    window.addEventListener('message',function(event){
      var data=event.data;
      if(!data||data.source!=='termbrowser-find')return;
      var found=false;
      try{found=window.find(String(data.query||''),false,Boolean(data.backwards),true,false,false,false);}catch(error){}
      try{parent.postMessage({source:'termbrowser-find-result',found:Boolean(found)},'*');}catch(error){}
    });
  })();
</script>`;

const navigationShim = (nonce: string): string => `<script nonce="${nonce}">
        (function(){
          document.addEventListener('click',function(event){
            var link=event.target&&event.target.closest?event.target.closest('a[href]'):null;
            if(!link)return;var href=link.href;if(!/^https?:/i.test(href))return;
            event.preventDefault();try{parent.postMessage({source:'termbrowser-view',url:href},'*');}catch(error){}
          },true);
        })();
      </script>`;

/** Applies the cosmetic CSS computed by Electron's EasyList engine to this proxied frame. */
const cosmeticsShim = (nonce: string): string => `<script nonce="${nonce}">
  (function(){
    window.addEventListener('message',function(event){
      var data=event.data;
      if(!data||data.source!=='termbrowser-cosmetics'||typeof data.css!=='string')return;
      var style=document.getElementById('termbrowser-adblock-cosmetics');
      if(!style){style=document.createElement('style');style.id='termbrowser-adblock-cosmetics';document.head.appendChild(style);}
      style.textContent=data.css;
    });
  })();
</script>`;

function proxiedImageUrl(rawUrl: string, baseUrl: string, appOrigin?: string, auth?: ImageProxyAuth): string | null {
  const value = rawUrl.trim();
  if (!value || /^(?:data|blob|javascript|vbscript):/i.test(value)) return null;

  let absolute: URL;
  try {
    absolute = new URL(value, baseUrl);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(absolute.protocol)) return null;

  // The proxied document has a remote <base>. A relative /api/image would
  // therefore resolve against the remote site, not against Terminus. Use the
  // explicit app origin so the request stays on the local guarded endpoint.
  const endpoint = appOrigin ? `${appOrigin.replace(/\/$/, '')}/api/image` : '/api/image';
  return `${endpoint}?url=${encodeURIComponent(absolute.href)}&ref=${encodeURIComponent(baseUrl)}${imageAuthQuery(auth)}`;
}

function rewriteSrcset(value: string, baseUrl: string, appOrigin?: string, auth?: ImageProxyAuth): string | null {
  // A data: srcset can contain commas that are not candidate separators.
  if (/^\s*data:/i.test(value)) return null;

  let changed = false;
  const rewritten = value.split(',').map((part) => {
    const candidate = part.trim();
    if (!candidate) return part;
    const match = candidate.match(/^(\S+)([\s\S]*)$/);
    if (!match) return part;
    const proxied = proxiedImageUrl(match[1], baseUrl, appOrigin, auth);
    if (!proxied) return part;
    changed = true;
    return `${proxied}${match[2]}`;
  });

  return changed ? rewritten.join(', ') : null;
}

/**
 * Route images through the same guarded /api/image path as the retro view.
 * The proxied page CSP is same-origin only, so leaving a remote <img> would
 * silently drop the image while also leaving the private-network probe path
 * dependent on the browser's URL parsing. Rewriting keeps public images
 * working and makes every image request pass through fetchRemote().
 */
export function rewriteProxiedImageSources(
  html: string,
  baseUrl: string,
  appOrigin?: string,
  auth?: ImageProxyAuth
): string {
  return html.replace(/<img\b[^>]*>/gi, (tag) =>
    tag
      .replace(
        /(\s+src\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i,
        (match, prefix, doubleQuoted, singleQuoted, unquoted) => {
          const value = doubleQuoted ?? singleQuoted ?? unquoted ?? '';
          const quote = doubleQuoted !== undefined ? '"' : singleQuoted !== undefined ? "'" : '';
          const proxied = proxiedImageUrl(value, baseUrl, appOrigin, auth);
          return proxied ? `${prefix}${quote}${escapeHtmlAttribute(proxied)}${quote}` : match;
        }
      )
      .replace(
        /(\s+srcset\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i,
        (match, prefix, doubleQuoted, singleQuoted, unquoted) => {
          const value = doubleQuoted ?? singleQuoted ?? unquoted ?? '';
          const quote = doubleQuoted !== undefined ? '"' : singleQuoted !== undefined ? "'" : '';
          const proxied = rewriteSrcset(value, baseUrl, appOrigin, auth);
          return proxied ? `${prefix}${quote}${escapeHtmlAttribute(proxied)}${quote}` : match;
        }
      )
  );
}

/** Injects the proxy's base URL, palette and event shims into a sanitized site document. */
export function proxiedPage(html: string, url: string, nonce: string, dark: boolean): string {
  const injected =
    `<base href="${escapeHtmlAttribute(url)}">` +
    (dark ? DARK_RETRO_HEAD : '') +
    navigationShim(nonce) +
    cosmeticsShim(nonce) +
    findMessageShim(nonce) +
    findShortcutShim(nonce);

  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (match) => `${match}${injected}`);
  }
  return injected + html;
}

/** Standalone text reading page used by /api/view?mode=text: no site markup, no page scripts. */
export function textOnlyPage(url: string, text: string, nonce: string): string {
  // The extractor marks real images and numbered links with invisible characters; the reading
  // page has neither, so those markers would only show up as stray words and brackets.
  const cleaned = text
    .replace(/\u2061\[img:\d+\]/g, ' ')
    .replace(/\u2060\[(\d+)\]/g, ' ')
    .replace(/[ \t]{2,}/g, ' ');

  const paragraphs = cleaned
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtmlText(paragraph.trim())}</p>`)
    .join('\n');

  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Texto · ${escapeHtmlText(url)}</title>
<style>
  html, body { background:#080b0a; color:#cfe9d4; }
  body { margin:0; padding:26px 22px 60px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
         line-height: 1.65; }
  main { max-width: 880px; margin: 0 auto; }
  header { border-bottom:1px solid #22352e; padding-bottom:10px; margin-bottom:18px; }
  .tag { font-size:10px; letter-spacing:.14em; text-transform:uppercase; color:#7ef0b0; }
  .url { font-size:11px; color:#6f8f80; word-break: break-all; margin-top:4px; }
  p { margin:0 0 12px; font-size:13px; white-space: pre-wrap; }
  footer { margin-top:24px; font-size:10px; color:#4f6b5d; }
</style></head>
<body><main>
<header><div class="tag">Terminus · modo texto</div><div class="url">${escapeHtmlText(url)}</div></header>
${paragraphs || '<p>(La página no devolvió texto legible.)</p>'}
<footer>Vista de solo lectura. Cambia a REAL u OSCURO en la barra para volver a la página.</footer>
</main>${findMessageShim(nonce)}${findShortcutShim(nonce)}</body></html>`;
}
