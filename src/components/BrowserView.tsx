/**
 * TermBrowser OS - Browser View with Text-Only Find-in-Page (Ctrl+F) Search
 */

import React, { useState, useEffect, useRef } from 'react';
import { BrowserTab, ThemeConfig } from '../types';
import { soundEffects } from '../utils/soundEffects';
import {
  Globe,
  Lock,
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  BookOpen,
  Code,
  ExternalLink,
  ShieldCheck,
  Zap,
  BookmarkPlus,
  Share2,
  Search,
  X,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';

interface BrowserViewProps {
  theme: ThemeConfig;
  tab: BrowserTab;
  onNavigate: (url: string) => void;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onAddBookmark: (title: string, url: string) => void;
}

export const BrowserView: React.FC<BrowserViewProps> = ({
  theme,
  tab,
  onNavigate,
  onBack,
  onForward,
  onReload,
  onAddBookmark,
}) => {
  const [activeTabMode, setActiveTabMode] = useState<'rendered' | 'reader' | 'source'>('rendered');
  
  // Find in page (Ctrl+F) state
  const [isFindOpen, setIsFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const findInputRef = useRef<HTMLInputElement>(null);

  const canGoBack = tab.historyIndex > 0;
  const canGoForward = tab.historyIndex < tab.history.length - 1;

  // Handle Ctrl+F shortcut to open Find bar
  useEffect(() => {
    const handleFindKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        soundEffects.playKeyClick();
        setIsFindOpen(true);
        setTimeout(() => {
          findInputRef.current?.focus();
        }, 50);
      } else if (e.key === 'Escape' && isFindOpen) {
        setIsFindOpen(false);
      }
    };
    window.addEventListener('keydown', handleFindKey);
    return () => window.removeEventListener('keydown', handleFindKey);
  }, [isFindOpen]);

  // Compute matches for find query in reader text or content
  const targetText = activeTabMode === 'reader' ? (tab.readerText || tab.content || '') : (tab.content || '');
  const matchesCount = React.useMemo(() => {
    if (!findQuery.trim() || !targetText) return 0;
    try {
      const regex = new RegExp(findQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const matches = targetText.match(regex);
      return matches ? matches.length : 0;
    } catch {
      return 0;
    }
  }, [findQuery, targetText]);

  // Highlight text for reader mode search results
  const renderHighlightedText = (text: string, query: string) => {
    if (!query.trim()) return text;
    try {
      const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
      return parts.map((part, i) => {
        if (part.toLowerCase() === query.toLowerCase()) {
          return (
            <mark
              key={i}
              style={{
                backgroundColor: theme.accent,
                color: theme.bg,
                padding: '1px 3px',
                borderRadius: '2px',
                fontWeight: 'bold',
              }}
            >
              {part}
            </mark>
          );
        }
        return <span key={i}>{part}</span>;
      });
    } catch {
      return text;
    }
  };

  return (
    <div
      className="flex-1 flex flex-col h-full border-l overflow-hidden font-mono text-xs select-text relative"
      style={{
        backgroundColor: theme.bg,
        borderColor: theme.border,
        color: theme.text,
      }}
    >
      {/* Minimalist Terminal Web Status Bar */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b select-none shrink-0"
        style={{
          backgroundColor: theme.cardBg,
          borderColor: theme.border,
        }}
      >
        {/* Navigation Affordances */}
        <div className="flex items-center gap-1.5">
          <button
            disabled={!canGoBack}
            onClick={() => {
              soundEffects.playKeyClick();
              onBack();
            }}
            className={`p-1 border rounded-xs ${
              canGoBack ? 'hover:opacity-80 cursor-pointer' : 'opacity-30 cursor-not-allowed'
            }`}
            style={{ borderColor: theme.border }}
            title="Atrás (Comando: back)"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>

          <button
            disabled={!canGoForward}
            onClick={() => {
              soundEffects.playKeyClick();
              onForward();
            }}
            className={`p-1 border rounded-xs ${
              canGoForward ? 'hover:opacity-80 cursor-pointer' : 'opacity-30 cursor-not-allowed'
            }`}
            style={{ borderColor: theme.border }}
            title="Adelante (Comando: forward)"
          >
            <ArrowRight className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => {
              soundEffects.playKeyClick();
              onReload();
            }}
            className="p-1 border rounded-xs hover:opacity-80 cursor-pointer"
            style={{ borderColor: theme.border }}
            title="Recargar página (Comando: reload)"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${tab.isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Minimalist Command-Driven Target Indicator */}
        <div
          className="flex-1 mx-3 px-2.5 py-1 border rounded-xs flex items-center justify-between overflow-hidden"
          style={{
            backgroundColor: theme.bg,
            borderColor: theme.border,
          }}
        >
          <div className="flex items-center gap-2 truncate">
            <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-bold shrink-0">
              <Lock className="w-3 h-3" />
              <span>AES-256</span>
            </span>
            <span className="opacity-40">|</span>
            <span className="font-semibold truncate text-[11px]" style={{ color: theme.accent }}>
              {tab.url || 'about:blank (esperando comando `goto <url>`)'}
            </span>
          </div>

          <div className="flex items-center gap-2 text-[10px] opacity-75 shrink-0 pl-2">
            {tab.statusCode && (
              <span className={`font-bold ${tab.statusCode === 200 ? 'text-emerald-400' : 'text-amber-400'}`}>
                HTTP {tab.statusCode}
              </span>
            )}
            {tab.latencyMs !== undefined && <span>{tab.latencyMs}ms</span>}
            {tab.sizeBytes !== undefined && <span>{(tab.sizeBytes / 1024).toFixed(1)}KB</span>}
          </div>
        </div>

        {/* View Mode & Bookmark Affordances */}
        <div className="flex items-center gap-1">
          {/* Find in Page (Ctrl+F) Toggle Button */}
          <button
            onClick={() => {
              soundEffects.playKeyClick();
              setIsFindOpen(!isFindOpen);
              if (!isFindOpen) {
                setTimeout(() => findInputRef.current?.focus(), 50);
              }
            }}
            className={`px-2 py-1 border rounded-xs text-[11px] font-bold cursor-pointer transition-colors flex items-center gap-1 ${
              isFindOpen ? 'bg-white/15' : 'opacity-70 hover:opacity-100'
            }`}
            style={{ borderColor: theme.border, color: isFindOpen ? theme.accent : undefined }}
            title="Buscar en página [Ctrl+F]"
          >
            <Search className="w-3 h-3" />
            <span className="hidden sm:inline">Buscar</span>
          </button>

          <button
            onClick={() => {
              soundEffects.playKeyClick();
              setActiveTabMode('rendered');
            }}
            className={`px-2 py-1 border rounded-xs text-[11px] font-bold cursor-pointer transition-colors ${
              activeTabMode === 'rendered' ? 'bg-white/15' : 'opacity-60 hover:opacity-100'
            }`}
            style={{ borderColor: theme.border, color: activeTabMode === 'rendered' ? theme.accent : undefined }}
            title="Vista de renderizado web"
          >
            WEB
          </button>

          <button
            onClick={() => {
              soundEffects.playKeyClick();
              setActiveTabMode('reader');
            }}
            className={`px-2 py-1 border rounded-xs text-[11px] font-bold cursor-pointer transition-colors ${
              activeTabMode === 'reader' ? 'bg-white/15' : 'opacity-60 hover:opacity-100'
            }`}
            style={{ borderColor: theme.border, color: activeTabMode === 'reader' ? theme.accent : undefined }}
            title="Modo lectura minimalista sin distracciones"
          >
            LECTOR
          </button>

          <button
            onClick={() => {
              soundEffects.playKeyClick();
              setActiveTabMode('source');
            }}
            className={`px-2 py-1 border rounded-xs text-[11px] font-bold cursor-pointer transition-colors ${
              activeTabMode === 'source' ? 'bg-white/15' : 'opacity-60 hover:opacity-100'
            }`}
            style={{ borderColor: theme.border, color: activeTabMode === 'source' ? theme.accent : undefined }}
            title="Inspeccionar código fuente DOM"
          >
            DOM
          </button>

          {tab.url && tab.url !== 'about:blank' && (
            <button
              onClick={() => {
                soundEffects.playExecute();
                onAddBookmark(tab.title || tab.url, tab.url);
              }}
              className="p-1 border rounded-xs hover:opacity-80 cursor-pointer"
              style={{ borderColor: theme.border }}
              title="Añadir a marcadores (Comando: bookmark add)"
            >
              <BookmarkPlus className="w-3.5 h-3.5 text-amber-400" />
            </button>
          )}
        </div>
      </div>

      {/* Find in Page (Ctrl+F) Search Bar Dropdown */}
      {isFindOpen && (
        <div
          className="px-3 py-1.5 border-b flex items-center gap-2 select-none shrink-0 font-mono text-[11px]"
          style={{
            backgroundColor: theme.cardBg,
            borderColor: theme.accent,
          }}
        >
          <Search className="w-3.5 h-3.5 shrink-0 opacity-70" style={{ color: theme.accent }} />
          <input
            ref={findInputRef}
            type="text"
            value={findQuery}
            onChange={(e) => setFindQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setIsFindOpen(false);
              }
            }}
            placeholder="Buscar en página actual (Ctrl+F)..."
            className="flex-1 bg-transparent border-0 outline-hidden font-mono text-xs focus:ring-0"
            style={{ color: theme.text }}
            autoFocus
          />

          <span className="text-[10px] opacity-75 shrink-0">
            {findQuery.trim() ? `${matchesCount} coincidencias` : 'Escriba para buscar'}
          </span>

          <button
            onClick={() => {
              soundEffects.playKeyClick();
              setIsFindOpen(false);
              setFindQuery('');
            }}
            className="p-1 border rounded-xs hover:bg-white/10 cursor-pointer"
            style={{ borderColor: theme.border }}
            title="Cerrar búsqueda [ESC]"
          >
            <X className="w-3 h-3 text-red-400" />
          </button>
        </div>
      )}

      {/* Main Viewport Content */}
      <div className="flex-1 relative overflow-auto bg-black/40">
        {tab.isLoading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center space-y-3 z-10">
            <div className="text-sm font-bold animate-pulse" style={{ color: theme.accent }}>
              [ CARGANDO RECURSO CIFRADO VIA PROXY CLI ]
            </div>
            <div className="text-xs opacity-75 font-mono">
              Resolviendo sockets, negociando apretón de manos AES-256...
            </div>
          </div>
        ) : !tab.url || tab.url === 'about:blank' ? (
          /* Retro Terminal Navigation Portal (Empty Tab) */
          <div className="p-8 max-w-2xl mx-auto space-y-6">
            <div className="border p-5 rounded-xs space-y-3" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
              <div className="flex items-center gap-2 font-bold text-sm" style={{ color: theme.accent }}>
                <Globe className="w-4 h-4" />
                <span>TERMBROWSER OS - PORTAL DE NAVEGACIÓN WEB</span>
              </div>
              <p className="text-xs opacity-85 leading-relaxed">
                Este navegador opera exclusivamente mediante comandos. No existe barra de direcciones con ratón: controle las pestañas y el tráfico web directamente desde la consola inferior.
              </p>
            </div>

            <div className="border p-4 rounded-xs space-y-3" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
              <div className="font-bold text-xs">DESTINOS DE ACCESO RÁPIDO (HAGA CLIC O ESCRIBA):</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <button
                  onClick={() => onNavigate('https://news.ycombinator.com')}
                  className="p-2.5 border text-left rounded-xs hover:bg-white/5 cursor-pointer transition-colors"
                  style={{ borderColor: theme.border }}
                >
                  <div className="font-bold" style={{ color: theme.accent }}>Hacker News</div>
                  <div className="text-[10px] opacity-60">goto https://news.ycombinator.com</div>
                </button>

                <button
                  onClick={() => onNavigate('https://en.wikipedia.org/wiki/Terminal_emulator')}
                  className="p-2.5 border text-left rounded-xs hover:bg-white/5 cursor-pointer transition-colors"
                  style={{ borderColor: theme.border }}
                >
                  <div className="font-bold" style={{ color: theme.accent }}>Wikipedia: Emulador</div>
                  <div className="text-[10px] opacity-60">goto https://en.wikipedia.org/...</div>
                </button>

                <button
                  onClick={() => onNavigate('https://httpbin.org/get')}
                  className="p-2.5 border text-left rounded-xs hover:bg-white/5 cursor-pointer transition-colors"
                  style={{ borderColor: theme.border }}
                >
                  <div className="font-bold" style={{ color: theme.accent }}>HTTPBin API Tester</div>
                  <div className="text-[10px] opacity-60">curl https://httpbin.org/get</div>
                </button>

                <button
                  onClick={() => onNavigate('https://jsonplaceholder.typicode.com/posts/1')}
                  className="p-2.5 border text-left rounded-xs hover:bg-white/5 cursor-pointer transition-colors"
                  style={{ borderColor: theme.border }}
                >
                  <div className="font-bold" style={{ color: theme.accent }}>REST JSON Endpoint</div>
                  <div className="text-[10px] opacity-60">fetch https://jsonplaceholder...</div>
                </button>
              </div>
            </div>

            <div className="p-3 border rounded-xs text-[11px] opacity-75 space-y-1" style={{ borderColor: theme.border }}>
              <div className="font-bold text-xs opacity-100 text-amber-400">COMANDOS BÁSICOS DE NAVEGACIÓN:</div>
              <div>• <code className="font-bold">goto &lt;url&gt;</code> : Carga cualquier URL en la pestaña activa</div>
              <div>• <code className="font-bold">search &lt;consulta&gt;</code> : Busca en la web</div>
              <div>• <code className="font-bold">reader</code> : Activa el modo lectura para eliminar publicidad</div>
              <div>• <code className="font-bold">tab new</code> / <code className="font-bold">tab close</code> : Gestión de pestañas</div>
            </div>
          </div>
        ) : activeTabMode === 'rendered' ? (
          /* Rendered Web View (Iframe with proxy / direct fallback) */
          <div className="w-full h-full flex flex-col">
            <iframe
              title={tab.title || 'Web View'}
              src={tab.url}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              className="w-full flex-1 border-0 bg-white"
            />
          </div>
        ) : activeTabMode === 'reader' ? (
          /* Clean Distraction-Free Reader Mode with Live Find Highlighting */
          <div className="p-6 max-w-3xl mx-auto space-y-4 font-sans text-slate-200">
            <div className="border-b pb-3" style={{ borderColor: theme.border }}>
              <h1 className="text-xl font-bold text-white tracking-tight">
                {renderHighlightedText(tab.title || tab.url, findQuery)}
              </h1>
              <div className="text-xs opacity-60 font-mono mt-1">
                Fuente: {tab.url} · Extraído en Modo Lector TermBrowser
              </div>
            </div>
            <div className="prose prose-invert max-w-none text-sm leading-relaxed whitespace-pre-wrap font-sans">
              {renderHighlightedText(tab.readerText || tab.content || 'Sin contenido de texto extraíble.', findQuery)}
            </div>
          </div>
        ) : (
          /* DOM Source Inspector with Search Highlighting */
          <div className="p-4 font-mono text-[11px] overflow-auto h-full">
            <pre className="text-slate-300 leading-normal selection:bg-cyan-500/30">
              {tab.content ? (
                tab.content.split('\n').map((line, idx) => (
                  <div key={idx} className="flex">
                    <span className="w-12 text-right pr-4 select-none opacity-40">{idx + 1}</span>
                    <span className="flex-1 whitespace-pre-wrap">
                      {renderHighlightedText(line, findQuery)}
                    </span>
                  </div>
                ))
              ) : (
                <div className="opacity-50">(Código fuente vacío o no cargado aún)</div>
              )}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
