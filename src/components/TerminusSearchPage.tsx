import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  CornerDownLeft,
  Globe2,
  Loader2,
  RotateCw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { TerminusSearchState, ThemeConfig } from '../types';
import { TERMINUS_SEARCH_PROVIDER } from '../utils/terminusSearch';
import { soundEffects } from '../utils/soundEffects';

interface TerminusSearchPageProps {
  theme: ThemeConfig;
  query: string;
  state?: TerminusSearchState;
  onSearch: (query: string) => void;
  onOpenResult: (url: string) => void;
}

export const SUGGESTED_QUERIES = [
  'computación cuántica',
  'noticias de tecnología',
  'documentación de React',
];

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

const pathOf = (url: string): string => {
  try {
    const parsed = new URL(url);
    return parsed.pathname === '/' ? '' : parsed.pathname;
  } catch {
    return '';
  }
};

const safeOpenUrl = (url: string): boolean => /^https?:\/\//i.test(url);

export const TerminusSearchPage: React.FC<TerminusSearchPageProps> = ({
  theme,
  query,
  state,
  onSearch,
  onOpenResult,
}) => {
  const [draft, setDraft] = useState(query);
  const autoRunQuery = useRef('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(query);
  }, [query]);

  // Restored tabs may carry the URL but not the result payload yet.
  useEffect(() => {
    if (!query || state?.status === 'loading' || state?.query === query) return;
    if (autoRunQuery.current === query) return;
    autoRunQuery.current = query;
    onSearch(query);
  }, [query, state?.query, state?.status, onSearch]);

  useEffect(() => {
    if (query) return;
    inputRef.current?.focus();
  }, [query]);

  const isLoading = Boolean(query) && (!state || state.query !== query || state.status === 'loading');
  const results = state && state.query === query && state.status === 'ready' ? state.results : [];
  const searchError = state && state.query === query && state.status === 'error' ? state.error : '';
  const provider = state?.provider || TERMINUS_SEARCH_PROVIDER;

  const runSearch = (value: string) => {
    const clean = value.trim();
    if (!clean || isLoading) return;
    soundEffects.playKeyClick();
    setDraft(clean);
    onSearch(clean);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    runSearch(draft);
  };

  const handleOpenResult = (url: string) => {
    if (!safeOpenUrl(url)) return;
    soundEffects.playKeyClick();
    onOpenResult(url);
  };

  const searchForm = (
    <form
      onSubmit={handleSubmit}
      role="search"
      aria-label="Buscar en Terminus Search"
      className="mt-7 border p-1.5 sm:mt-8"
      style={{
        borderColor: theme.accent,
        backgroundColor: theme.cardBg,
        boxShadow: `0 0 0 1px ${theme.border}`,
      }}
    >
      <div className="flex items-center gap-2">
        <span className="shrink-0 pl-2 text-sm font-bold" style={{ color: theme.accent }} aria-hidden="true">
          &gt;
        </span>
        <input
          ref={inputRef}
          type="search"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              setDraft('');
            }
          }}
          placeholder="Busca en la web desde Terminus…"
          aria-label="Buscar en Terminus Search"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          inputMode="search"
          className="min-w-0 flex-1 appearance-none bg-transparent px-1 py-2.5 text-[13px] outline-hidden placeholder:opacity-40 sm:text-sm"
          style={{ color: theme.text, caretColor: theme.accent }}
        />
        <button
          type="submit"
          disabled={!draft.trim() || isLoading}
          aria-label="Buscar"
          className="flex shrink-0 items-center gap-1.5 border px-2.5 py-2 text-[10px] font-bold cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 sm:px-3"
          style={{ borderColor: theme.accent, backgroundColor: theme.accent, color: theme.bg }}
        >
          {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">BUSCAR</span>
        </button>
      </div>
    </form>
  );

  return (
    <div
      className="h-full overflow-y-auto font-mono"
      style={{
        backgroundColor: theme.bg,
        color: theme.text,
        backgroundImage: `radial-gradient(circle at 12% -12%, ${theme.accent}20 0, transparent 38%)`,
      }}
    >
      <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-4 py-5 sm:px-8 sm:py-8">
        <main className="flex flex-1 flex-col pt-8 sm:pt-12">
          {!query ? (
            <section className="max-w-3xl">
              <div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.28em]" style={{ color: theme.accent }}>
                <span className="h-px w-7" style={{ backgroundColor: theme.accent }} />
                Buscador propio / proveedor actual
              </div>
              <h1 className="mt-4 text-4xl font-bold leading-none tracking-tight sm:text-6xl">
                TERMINUS <span style={{ color: theme.accent }}>SEARCH</span>
              </h1>
              <p className="mt-4 max-w-2xl text-[12px] leading-6 opacity-70 sm:text-[13px]">
                Una puerta de entrada a la web con la estética de Terminus. La interfaz y la lectura son propias;
                los resultados se consultan en DuckDuckGo y Wikipedia.
              </p>

              {searchForm}

              <div className="mt-5 flex flex-wrap items-center gap-2">
                <span className="text-[9px] uppercase tracking-[0.18em] opacity-45">Prueba con</span>
                {SUGGESTED_QUERIES.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => runSearch(suggestion)}
                    className="border px-2.5 py-1 text-[10px] cursor-pointer transition-opacity hover:opacity-70"
                    style={{ borderColor: theme.border, color: theme.text }}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>

              <div
                className="mt-10 grid gap-px border sm:grid-cols-3"
                style={{ borderColor: theme.border, backgroundColor: theme.border }}
              >
                {[
                  { label: 'FUENTES', value: provider, icon: Globe2 },
                  { label: 'LECTURA', value: 'Resultados en pestaña', icon: ShieldCheck },
                  { label: 'ATAJOS', value: 'Enter · Esc · Ctrl+L', icon: CornerDownLeft },
                ].map(({ label, value, icon: Icon }) => (
                  <div key={label} className="p-3" style={{ backgroundColor: theme.cardBg }}>
                    <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.16em] opacity-45">
                      <Icon className="h-3 w-3" />
                      {label}
                    </div>
                    <div className="mt-2 text-[11px]" style={{ color: theme.text }}>
                      {value}
                    </div>
                  </div>
                ))}
              </div>

              <p className="mt-6 max-w-2xl text-[10px] leading-5 opacity-45">
                Terminus Search es la capa de búsqueda del navegador. No mantiene un índice propio todavía:
                consulta el proveedor actual y presenta los resultados con su propia interfaz.
              </p>
            </section>
          ) : (
            <section className="w-full" aria-busy={isLoading}>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.24em]" style={{ color: theme.accent }}>
                    <span className="h-px w-6" style={{ backgroundColor: theme.accent }} />
                    Terminus Search / resultados
                  </div>
                  <h1 className="mt-2 break-words text-xl font-bold leading-tight sm:text-3xl">
                    Resultados para <span style={{ color: theme.accent }}>&quot;{query}&quot;</span>
                  </h1>
                </div>
                <div className="shrink-0 text-right text-[9px] uppercase leading-5 tracking-[0.12em] opacity-55">
                  <div>{isLoading ? 'CONSULTANDO' : searchError ? 'ERROR DE CONSULTA' : `${results.length} RESULTADOS`}</div>
                  <div>{state && state.query === query && state.latencyMs > 0 ? `${state.latencyMs} MS` : provider}</div>
                </div>
              </div>

              {searchForm}

              <div className="mt-6" aria-live="polite">
                {isLoading ? (
                  <div className="space-y-3">
                    <div className="text-[10px] uppercase tracking-[0.16em] opacity-55">
                      Consultando {provider}…
                    </div>
                    {[0, 1, 2].map((row) => (
                      <div
                        key={row}
                        className="animate-pulse border-b py-4"
                        style={{ borderColor: theme.border }}
                      >
                        <div className="h-2 w-32 rounded-xs bg-current opacity-15" />
                        <div className="mt-3 h-4 w-2/3 rounded-xs bg-current opacity-20" />
                        <div className="mt-2 h-2 w-full rounded-xs bg-current opacity-10" />
                      </div>
                    ))}
                  </div>
                ) : searchError ? (
                  <div className="border p-5" style={{ borderColor: theme.border, backgroundColor: theme.cardBg }}>
                    <div className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: theme.accent }}>
                      No se pudo consultar el proveedor
                    </div>
                    <p className="mt-2 text-[12px] leading-5 opacity-70">{searchError}</p>
                    <button
                      type="button"
                      onClick={() => runSearch(query)}
                      className="mt-4 flex items-center gap-1.5 border px-3 py-1.5 text-[10px] font-bold cursor-pointer hover:opacity-80"
                      style={{ borderColor: theme.accent, color: theme.accent }}
                    >
                      <RotateCw className="h-3 w-3" />
                      REINTENTAR
                    </button>
                  </div>
                ) : results.length === 0 ? (
                  <div className="border p-5" style={{ borderColor: theme.border, backgroundColor: theme.cardBg }}>
                    <div className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: theme.accent }}>
                      Sin resultados
                    </div>
                    <p className="mt-2 text-[12px] leading-5 opacity-70">
                      El proveedor no devolvió resultados para esta consulta. Prueba con otras palabras.
                    </p>
                  </div>
                ) : (
                  <div className="border-t" style={{ borderColor: theme.border }}>
                    {results.map((result, index) => (
                      <button
                        key={`${result.url}-${index}`}
                        type="button"
                        onClick={() => handleOpenResult(result.url)}
                        className="group flex w-full items-start gap-3 border-b px-1 py-4 text-left cursor-pointer transition-opacity hover:opacity-80"
                        style={{ borderColor: theme.border }}
                      >
                        <span className="w-5 shrink-0 pt-0.5 text-[10px] tabular-nums opacity-35">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[9px] uppercase tracking-[0.08em]" style={{ color: theme.accent }}>
                            {hostOf(result.url)}
                            <span className="opacity-50">{pathOf(result.url)}</span>
                          </span>
                          <span className="mt-1 block text-[13px] font-bold leading-snug group-hover:underline sm:text-sm">
                            {result.title}
                          </span>
                          <span className="mt-1 block text-[11px] leading-relaxed opacity-60">
                            {result.snippet}
                          </span>
                        </span>
                        <ArrowUpRight
                          className="mt-0.5 h-4 w-4 shrink-0 opacity-25 transition-opacity group-hover:opacity-100"
                          style={{ color: theme.accent }}
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-2 text-[9px] uppercase tracking-[0.12em] opacity-45">
                <span>Proveedor: {provider}</span>
                <span>Enter buscar · Esc limpiar · Ctrl+L barra</span>
              </div>
            </section>
          )}
        </main>

        <footer
          className="mt-10 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-[9px] uppercase tracking-[0.14em] opacity-40"
          style={{ borderColor: theme.border }}
        >
          <span>Terminus Search · capa de búsqueda del navegador</span>
          <span>Interfaz propia / resultados del proveedor actual</span>
        </footer>
      </div>
    </div>
  );
};
