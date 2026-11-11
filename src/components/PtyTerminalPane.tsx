import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Terminal, ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { NativeShellId, ThemeConfig } from '../types';

interface PtyTerminalPaneProps {
  tabId: string;
  shell: NativeShellId;
  cwd?: string;
  theme: ThemeConfig;
  onUnavailable: (message: string) => void;
}

export interface PtyTerminalHandle {
  getSelection: () => string;
  getBufferText: () => string;
  selectAll: () => void;
  clear: () => void;
  paste: (text: string) => void;
  focus: () => void;
  writeNotice: (message: string) => void;
}

const PTY_FONT = "'IBM Plex Mono', 'Cascadia Mono', Consolas, monospace";

const xtermTheme = (theme: ThemeConfig): ITheme => ({
  background: theme.bg,
  foreground: theme.text,
  cursor: theme.cursorColor || theme.accent,
  cursorAccent: theme.bg,
  selectionBackground: 'rgba(255, 255, 255, 0.22)',
  selectionForeground: theme.text,
  black: theme.bg,
  red: '#f87171',
  green: '#4ade80',
  yellow: '#fbbf24',
  blue: '#60a5fa',
  magenta: '#c084fc',
  cyan: '#22d3ee',
  white: theme.text,
  brightBlack: theme.muted,
  brightRed: '#fca5a5',
  brightGreen: '#86efac',
  brightYellow: '#fde68a',
  brightBlue: '#93c5fd',
  brightMagenta: '#e9d5ff',
  brightCyan: '#a5f3fc',
  brightWhite: '#ffffff',
});

/**
 * A real interactive terminal for native shells. The PTY lives in the Electron
 * main process; this component only renders its byte stream and forwards input.
 */
export const PtyTerminalPane = forwardRef<PtyTerminalHandle, PtyTerminalPaneProps>(function PtyTerminalPane(
  { tabId, shell, cwd, theme, onUnavailable },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const cwdRef = useRef(cwd ?? '');
  const onUnavailableRef = useRef(onUnavailable);
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const [restartKey, setRestartKey] = useState(0);
  const [exited, setExited] = useState<{ code: number | null; signal?: number | string } | null>(null);
  const [error, setError] = useState('');

  useImperativeHandle(
    ref,
    () => ({
      getSelection: () => termRef.current?.getSelection() ?? '',
      getBufferText: () => {
        const term = termRef.current;
        if (!term) return '';
        const buffer = term.buffer.active;
        const lines: string[] = [];
        for (let i = 0; i < buffer.length; i += 1) {
          lines.push(buffer.getLine(i)?.translateToString(true) ?? '');
        }
        return lines.join('\n').replace(/\s+$/, '');
      },
      selectAll: () => termRef.current?.selectAll(),
      clear: () => termRef.current?.clear(),
      paste: (text: string) => {
        const term = termRef.current;
        if (!term || !text) return;
        term.paste(text);
        term.focus();
      },
      focus: () => termRef.current?.focus(),
      writeNotice: (message: string) => {
        const term = termRef.current;
        if (!term) return;
        const clean = String(message).replace(/[\r\n]+/g, ' ').replace(/\x1b/g, '');
        term.write(`\r\n\x1b[36m[ARCHIVO] ${clean}\x1b[0m\r\n`);
      },
    }),
    [],
  );

  useEffect(() => {
    cwdRef.current = cwd ?? '';
  }, [cwd]);

  useEffect(() => {
    onUnavailableRef.current = onUnavailable;
  }, [onUnavailable]);

  // Theme changes should repaint the existing screen, not restart the shell.
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.theme = xtermTheme(theme);
  }, [theme]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const bridge = window.terminusPty;
    if (!bridge?.available) {
      onUnavailableRef.current('El puente PTY no está disponible en esta instalación.');
      return;
    }
    // Non-optional alias so the async startup and event callbacks keep the narrowed type.
    const api = bridge;

    setExited(null);
    setError('');

    const term = new Terminal({
      allowProposedApi: false,
      cursorBlink: true,
      cursorStyle: 'block',
      fontFamily: PTY_FONT,
      fontSize: 12,
      lineHeight: 1.15,
      scrollback: 5000,
      theme: xtermTheme(themeRef.current),
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);
    termRef.current = term;

    let disposed = false;
    let ready = false;
    let resultSeq = 0;
    const liveQueue: { data: string; seq: number }[] = [];
    const inputQueue: string[] = [];

    const fit = () => {
      if (disposed) return;
      try {
        fitAddon.fit();
      } catch {
        // The pane can be measured before the parent has its final size.
      }
    };

    const inputDisposable = term.onData((data) => {
      if (!ready) {
        inputQueue.push(data);
        return;
      }
      api.write(tabId, data);
    });

    const resizeDisposable = term.onResize(({ cols, rows }) => {
      if (ready && !disposed) api.resize(tabId, cols, rows);
    });

    const offData = api.onData((event) => {
      if (disposed || event.id !== tabId) return;
      if (!ready) {
        liveQueue.push({ data: event.data, seq: event.seq });
        return;
      }
      if (event.seq > resultSeq) term.write(event.data);
    });

    const offExit = api.onExit((event) => {
      if (disposed || event.id !== tabId) return;
      setExited({ code: event.exitCode, signal: event.signal });
      term.write(
        `\r\n\x1b[33m[PTY] El proceso terminó${event.exitCode !== null ? ` con código ${event.exitCode}` : ''}.\x1b[0m\r\n`
      );
    });

    async function start() {
      try {
        const result = await api.create({
          id: tabId,
          shell,
          cwd: cwdRef.current || undefined,
          cols: term.cols || 80,
          rows: term.rows || 24,
        });
        if (disposed) return;

        if (!result.ok) {
          const message = result.error || 'No se pudo iniciar la sesión PTY.';
          setError(message);
          term.write(`\r\n\x1b[31m[PTY] ${message}\x1b[0m\r\n`);
          onUnavailableRef.current(message);
          return;
        }

        if (result.buffer) term.write(result.buffer);
        resultSeq = result.seq ?? 0;
        ready = true;

        // Data received while create() was resolving may not be in the buffer yet.
        for (const event of liveQueue) {
          if (event.seq > resultSeq) term.write(event.data);
        }
        liveQueue.length = 0;

        for (const data of inputQueue) api.write(tabId, data);
        inputQueue.length = 0;

        fit();
        term.focus();
      } catch (cause) {
        if (disposed) return;
        const message = cause instanceof Error ? cause.message : String(cause);
        setError(message);
        term.write(`\r\n\x1b[31m[PTY] ${message}\x1b[0m\r\n`);
        onUnavailableRef.current(message);
      }
    }

    const observer = new ResizeObserver(() => {
      requestAnimationFrame(fit);
    });
    observer.observe(container);
    const frame = requestAnimationFrame(() => {
      fit();
      void start();
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      inputDisposable.dispose();
      resizeDisposable.dispose();
      offData();
      offExit();
      term.dispose();
      termRef.current = null;
    };
  }, [tabId, shell, restartKey]);

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden" style={{ backgroundColor: theme.bg }}>
      <div ref={containerRef} className="pty-terminal h-full w-full" />

      {exited && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/65 p-4 font-mono text-xs">
          <div
            className="w-full max-w-md border p-4 shadow-2xl"
            style={{ backgroundColor: theme.cardBg, borderColor: theme.border, color: theme.text }}
          >
            <div className="font-bold" style={{ color: theme.accent }}>
              PTY FINALIZADO
            </div>
            <div className="mt-1 opacity-75">
              {exited.code !== null ? `Código de salida: ${exited.code}` : 'El proceso cerró la sesión.'}
              {exited.signal ? ` · señal: ${exited.signal}` : ''}
            </div>
            {error && <div className="mt-2 text-red-400">{error}</div>}
            <button
              type="button"
              onClick={() => setRestartKey((value) => value + 1)}
              className="mt-3 border px-2 py-1 font-bold cursor-pointer hover:opacity-80"
              style={{ borderColor: theme.accent, color: theme.accent }}
            >
              REINICIAR SHELL
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
