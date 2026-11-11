import React, { useEffect, useRef, useState } from 'react';
import { ThemeConfig, ThemeId, WebpagePayload } from '../types';
import { isPrivateTargetUrl } from '../utils/networkPolicy';
import { expectedFrameMessageOrigin, isTrustedFrameMessage } from '../utils/frameMessageSecurity';
import { soundEffects } from '../utils/soundEffects';

interface TerminalWebpageViewProps {
  theme: ThemeConfig;
  webpage: WebpagePayload;
  onNavigate: (url: string) => void;
  /** Only the newest page in the stream may mount a live iframe; older ones fall back */
  isLatest?: boolean;
}

const PAGE_VIEW_STORAGE_KEY = 'termbrowser.page-view';
type PageView = 'web' | 'retro' | 'texto';

interface CrtLook {
  /** Phosphor colour of the screen */
  tint: string;
  /** Strength of the colour cast over the page */
  tintOpacity: number;
  /** Darkening layer that keeps the page readable on a black tube */
  dim: string;
  /** Edge falloff of the tube */
  vignette: string;
}

/** Each theme gets its own phosphor, so the CRT effect matches the terminal palette */
const CRT_LOOKS: Record<ThemeId, CrtLook> = {
  'monochrome-green': { tint: '#33ff77', tintOpacity: 0.32, dim: 'rgba(0, 0, 0, 0.55)', vignette: 'rgba(0, 0, 0, 0.62)' },
  'amber-crt': { tint: '#ffb000', tintOpacity: 0.34, dim: 'rgba(10, 5, 0, 0.55)', vignette: 'rgba(0, 0, 0, 0.62)' },
  'cyberpunk-obsidian': { tint: '#ff2d95', tintOpacity: 0.28, dim: 'rgba(6, 0, 16, 0.56)', vignette: 'rgba(0, 0, 0, 0.64)' },
  'retro-futurista': { tint: '#67e8f9', tintOpacity: 0.28, dim: 'rgba(0, 8, 24, 0.58)', vignette: 'rgba(0, 0, 0, 0.66)' },
  'ms-dos': { tint: '#4da3ff', tintOpacity: 0.3, dim: 'rgba(0, 0, 20, 0.55)', vignette: 'rgba(0, 0, 0, 0.6)' },
  'matrix-dark': { tint: '#00ff41', tintOpacity: 0.34, dim: 'rgba(0, 8, 0, 0.55)', vignette: 'rgba(0, 0, 0, 0.64)' },
  'black-and-white': { tint: '#ffffff', tintOpacity: 0.1, dim: 'rgba(0, 0, 0, 0.66)', vignette: 'rgba(0, 0, 0, 0.7)' },
};

/**
 * The page as part of the terminal stream. Three views, chosen per page:
 * WEB paints the real page inside a CRT monitor (only when the site permits framing);
 * RETRO keeps the original structure painted with the terminal palette;
 * TEXTO is the flat extraction, the lightest option for slow links.
 */
export const TerminalWebpageView: React.FC<TerminalWebpageViewProps> = ({ theme, webpage, onNavigate, isLatest = true }) => {
  const [enlargedImage, setEnlargedImage] = useState<{ src: string; alt?: string; direct?: boolean } | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);

  // Every live iframe keeps a whole site running in memory, so only the newest page may have one.
  // Sites that forbid framing are shown through our own /api/view proxy instead of falling to text.
  const canFrame = isLatest;
  // The proxy is the only path that may reach a private destination.
  const directFrame = Boolean(webpage.frameable && !isPrivateTargetUrl(webpage.url));
  const webSrc = directFrame ? webpage.url : `/api/view?url=${encodeURIComponent(webpage.url)}`;
  const hasStructured = Boolean(webpage.structuredHtml && webpage.structuredHtml.trim());
  const available: PageView[] = [...(canFrame ? (['web'] as PageView[]) : []), ...(hasStructured ? (['retro'] as PageView[]) : []), 'texto'];

  const [view, setView] = useState<PageView>(() => {
    try {
      const stored = localStorage.getItem(PAGE_VIEW_STORAGE_KEY) as PageView | null;
      if (stored && available.includes(stored)) return stored;
    } catch {
      // Storage unavailable: use the default for this page
    }
    // The real page wins when the site allows framing; the other views stay one click away
    return canFrame ? 'web' : hasStructured ? 'retro' : 'texto';
  });

  // The CRT effect is optional and remembered across pages and sessions
  const [crtOn, setCrtOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('termbrowser.crt') !== 'off';
    } catch {
      return true;
    }
  });

  const toggleCrt = () => {
    soundEffects.playKeyClick();
    const next = !crtOn;
    setCrtOn(next);
    try {
      localStorage.setItem('termbrowser.crt', next ? 'on' : 'off');
    } catch {
      // Ignore: the effect still switches for this session
    }
  };

  const current: PageView = available.includes(view) ? view : available[0];

  const links = webpage.links || [];
  const images = webpage.images || [];
  const bodyText = webpage.text && webpage.text.trim() ? webpage.text : '';

  const cycleView = () => {
    soundEffects.playKeyClick();
    const next = available[(available.indexOf(current) + 1) % available.length];
    setView(next);
    try {
      localStorage.setItem(PAGE_VIEW_STORAGE_KEY, next);
    } catch {
      // Ignore: the view still switches for this session
    }
  };

  const expectedFrameOrigin = expectedFrameMessageOrigin(webpage.url, !directFrame);

  // Link clicks arrive from the iframe as messages. Require both the exact
  // contentWindow and the origin implied by the current view (opaque for the
  // sandboxed proxy, the site origin for REAL).
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Navigation messages are emitted only by the proxy shim. A REAL frame
      // navigates itself and must not be able to drive the terminal browser.
      if (expectedFrameOrigin !== 'null') return;
      if (!isTrustedFrameMessage(event, frameRef.current, expectedFrameOrigin)) return;
      const data = event.data;
      if (!data || data.source !== 'termbrowser-view' || typeof data.url !== 'string') return;
      if (!/^https?:\/\//i.test(data.url)) return;
      onNavigate(data.url);
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onNavigate, expectedFrameOrigin]);

  const crtLook: CrtLook = CRT_LOOKS[theme.id] || {
    tint: theme.accent,
    tintOpacity: 0.34,
    dim: 'rgba(0, 0, 0, 0.56)',
    vignette: 'rgba(0, 0, 0, 0.6)',
  };

  const applyProxiedCosmetics = async () => {
    if (directFrame) return;
    const frame = frameRef.current;
    const api = window.terminusDesktop;
    if (!frame?.contentWindow || !api?.getAdblockCosmetics) return;
    try {
      const css = await api.getAdblockCosmetics(webpage.url);
      if (css.trim()) {
        frame.contentWindow.postMessage({ source: 'termbrowser-cosmetics', css }, '*');
      }
    } catch {
      // The blocker is optional; the page still renders without cosmetics.
    }
  };

  const proxiedImage = (src: string) =>
    `/api/image?url=${encodeURIComponent(src)}${webpage.url ? `&ref=${encodeURIComponent(webpage.url)}` : ''}`;
  const imageSrc = (image: { src: string; direct?: boolean }) => (image.direct ? image.src : proxiedImage(image.src));

  /** Splits the extracted body on the invisible link/image markers, like the TEXTO view does */
  const renderStreamText = (text: string) => {
    const parts = text.split(/\u2060\[(\d+)\]|\u2061\[img:(\d+)\]/g);

    return parts.map((part, index) => {
      if (part === undefined) return null;

      const isLink = index % 3 === 1;
      const isImage = index % 3 === 2;

      if (isLink) {
        const link = links[Number(part) - 1];
        if (!link) return <span key={`lmiss-${index}`}>[{part}]</span>;
        return (
          <button
            key={`lm-${index}`}
            type="button"
            onClick={() => {
              soundEffects.playKeyClick();
              onNavigate(link.href);
            }}
            className="inline cursor-pointer font-bold underline touch-manipulation"
            style={{ color: theme.accent }}
            title={`Abrir [${part}]: ${link.href}`}
          >
            [{part}]
          </button>
        );
      }

      if (isImage) {
        const image = images[Number(part) - 1];
        if (!image) return null;
        return (
          <button
            key={`im-${index}`}
            type="button"
            onClick={() => {
              soundEffects.playKeyClick();
              setEnlargedImage(image);
            }}
            className="my-0.5 mr-1 inline-block cursor-zoom-in align-middle touch-manipulation"
            title={`Ampliar imagen${image.alt ? `: ${image.alt}` : ''}`}
          >
            <img
              src={proxiedImage(image.src)}
              alt={image.alt || ''}
              loading="lazy"
              decoding="async"
              className="block max-w-full rounded-xs border bg-black/30"
              style={{ borderColor: theme.border, maxHeight: 64 }}
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </button>
        );
      }

      return <React.Fragment key={`t-${index}`}>{part}</React.Fragment>;
    });
  };

  /** Retro view: the server-sanitized original structure, with terminal palette applied by CSS */
  const handleRetroClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;

    const image = target.closest('img[data-retro-img]') as HTMLImageElement | null;
    if (image) {
      event.preventDefault();
      soundEffects.playKeyClick();
      setEnlargedImage({ src: image.getAttribute('src') || '', alt: image.getAttribute('alt') || undefined, direct: true });
      return;
    }

    const anchor = target.closest('a[data-retro-link]') as HTMLAnchorElement | null;
    if (!anchor) return;
    event.preventDefault();
    const href = anchor.getAttribute('data-retro-link');
    if (!href) return;
    soundEffects.playKeyClick();
    onNavigate(href);
  };

  return (
    <div className="space-y-1 font-mono text-[11px] leading-relaxed">
      {/* One plain status line instead of a header bar */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] opacity-70">
        <span className="min-w-0 truncate opacity-80">
          ── [{webpage.statusCode || 200}] {webpage.url} · {webpage.latencyMs || 0}ms · {images.length} imágenes ·{' '}
          {links.length} enlaces{directFrame ? '' : ' · vía proxy'} ──
        </span>
        <button
          type="button"
          onClick={cycleView}
          className="shrink-0 cursor-pointer border px-1.5 py-0.5 hover:opacity-100 touch-manipulation"
          style={{ borderColor: theme.border, color: theme.accent }}
          title={
            canFrame
              ? 'Vistas: WEB (página original) → RETRO (estructura) → TEXTO (plano)'
              : 'El sitio prohíbe mostrarse en marco: vistas RETRO (estructura) y TEXTO (plano). Use "abrir original" para verlo completo.'
          }
        >
          VISTA {current.toUpperCase()}
        </button>
        <a
          href={webpage.url}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 underline opacity-80 hover:opacity-100 touch-manipulation"
          style={{ color: theme.text }}
          title="Abrir la página original en una pestaña del navegador"
        >
          abrir original ↗
        </a>
        {canFrame && (
          <button
            type="button"
            onClick={toggleCrt}
            className="shrink-0 cursor-pointer border px-1.5 py-0.5 hover:opacity-100 touch-manipulation"
            style={{ borderColor: theme.border, color: crtOn ? theme.accent : theme.text }}
            title="Activar o desactivar el efecto CRT (tinte de fósforo, viñeta y líneas de barrido) sobre la página original"
          >
            CRT {crtOn ? 'ON' : 'OFF'}
          </button>
        )}
      </div>

      <div className="font-bold" style={{ color: theme.accent }}>
        {webpage.title || webpage.url}
      </div>

      {current === 'web' ? (
        <div
          className="tb-web-pane"
          style={
            {
              borderColor: theme.border,
              ...(crtOn
                ? {
                    '--tb-crt-tint': crtLook.tint,
                    '--tb-crt-tint-opacity': String(crtLook.tintOpacity),
                    '--tb-crt-dim': crtLook.dim,
                    '--tb-crt-vignette': crtLook.vignette,
                  }
                : {}),
            } as React.CSSProperties
          }
        >
          <iframe
            ref={frameRef}
            src={webSrc}
            onLoad={applyProxiedCosmetics}
            title={`Página original: ${webpage.title || webpage.url}`}
            className="tb-web-frame"
            referrerPolicy="no-referrer"
            loading="lazy"
            sandbox={
              directFrame
                ? 'allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads'
                : 'allow-scripts'
            }
          />
          {crtOn && (
            <>
              <div className="tb-crt-dim" aria-hidden="true" />
              <div className="tb-crt-tint-layer" aria-hidden="true" />
              <div className="tb-crt-overlay" aria-hidden="true" />
            </>
          )}
        </div>
      ) : current === 'retro' && hasStructured ? (
        <div
          className="tb-retro"
          style={
            {
              '--tb-text': theme.text,
              '--tb-accent': theme.accent,
              '--tb-border': theme.border,
            } as React.CSSProperties
          }
          onClick={handleRetroClick}
          dangerouslySetInnerHTML={{ __html: webpage.structuredHtml as string }}
        />
      ) : bodyText ? (
        <pre
          className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed"
          style={{ color: theme.text }}
        >
          {renderStreamText(bodyText)}
        </pre>
      ) : webpage.paragraphs && webpage.paragraphs.length > 0 ? (
        <div className="space-y-1.5">
          {webpage.paragraphs.slice(0, 8).map((paragraph, index) => (
            <p key={index} className="whitespace-pre-wrap" style={{ color: theme.text }}>
              {paragraph}
            </p>
          ))}
        </div>
      ) : (
        <div className="opacity-80">{webpage.summary || 'Página cargada sin texto extraíble.'}</div>
      )}

      {links.length > 0 && (
        <div className="space-y-0.5 pt-1">
          <div className="text-[10px] uppercase tracking-wider opacity-50">
            ── enlaces ({links.length}) · clic, tap o escriba el número ──
          </div>
          {links.map((link, index) => (
            <button
              key={`${link.href}-${index}`}
              type="button"
              onClick={() => {
                soundEffects.playKeyClick();
                onNavigate(link.href);
              }}
              className="flex w-full items-baseline gap-1.5 truncate py-0.5 text-left hover:underline touch-manipulation"
              style={{ color: theme.text }}
              title={link.href}
            >
              <span className="shrink-0 font-bold" style={{ color: theme.accent }}>
                [{index + 1}]
              </span>
              <span className="truncate opacity-80">{link.text || link.href}</span>
            </button>
          ))}
        </div>
      )}

      {/* Same enlargement overlay as the text view; retro images already carry the proxy URL */}
      {enlargedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          onClick={() => setEnlargedImage(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Imagen ampliada"
        >
          <div className="max-h-full w-full max-w-4xl space-y-2" onClick={(e) => e.stopPropagation()}>
            <img
              src={imageSrc(enlargedImage)}
              alt={enlargedImage.alt || ''}
              className="mx-auto block max-h-[72vh] max-w-full rounded-xs border bg-black"
              style={{ borderColor: theme.border }}
            />
            <div className="flex items-center justify-between gap-3 text-[10px]" style={{ color: theme.text }}>
              <span className="truncate opacity-70">{enlargedImage.alt || enlargedImage.src}</span>
              <span className="flex shrink-0 items-center gap-2">
                <a
                  href={enlargedImage.src}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                  style={{ color: theme.accent }}
                >
                  Abrir original ↗
                </a>
                <button
                  type="button"
                  onClick={() => setEnlargedImage(null)}
                  className="cursor-pointer border px-2 py-0.5"
                  style={{ borderColor: theme.border }}
                >
                  Cerrar [ESC]
                </button>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
