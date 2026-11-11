import { createRef } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PtyTerminalPane, type PtyTerminalHandle } from './PtyTerminalPane';
import { THEMES } from '../utils/themes';
import type { ComponentProps } from 'react';
import type { PtyDataEvent, PtyExitEvent, TerminusPtyApi } from '../types';

const xtermMock = vi.hoisted(() => ({
  instances: [] as any[],
  dataHandler: null as ((data: string) => void) | null,
  resizeHandler: null as ((size: { cols: number; rows: number }) => void) | null,
}));

vi.mock('@xterm/xterm', () => {
  class Terminal {
    cols = 80;
    rows = 24;
    options: { theme?: unknown } = {};
    buffer = {
      active: {
        length: 2,
        getLine: (index: number) => ({
          translateToString: () => (index === 0 ? 'primera' : 'segunda'),
        }),
      },
    };

    constructor() {
      xtermMock.instances.push(this);
    }

    onData(handler: (data: string) => void) {
      xtermMock.dataHandler = handler;
      return { dispose: vi.fn() };
    }

    onResize(handler: (size: { cols: number; rows: number }) => void) {
      xtermMock.resizeHandler = handler;
      return { dispose: vi.fn() };
    }

    write = vi.fn();
    loadAddon = vi.fn();
    open = vi.fn();
    dispose = vi.fn();
    focus = vi.fn();
    paste = vi.fn();
    selectAll = vi.fn();
    clear = vi.fn();
    getSelection = vi.fn(() => 'texto seleccionado');
  }

  return { Terminal };
});

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit = vi.fn();
  },
}));

const theme = THEMES['cyberpunk-obsidian'];
let dataListener: ((event: PtyDataEvent) => void) | null = null;
let exitListener: ((event: PtyExitEvent) => void) | null = null;

const makeBridge = (): TerminusPtyApi => ({
  available: true,
  create: vi.fn(async () => ({ ok: true, id: 'tab-1', buffer: 'banner', seq: 2 })),
  write: vi.fn(),
  resize: vi.fn(),
  kill: vi.fn(),
  onData: vi.fn((listener) => {
    dataListener = listener;
    return vi.fn();
  }),
  onExit: vi.fn((listener) => {
    exitListener = listener;
    return vi.fn();
  }),
});

const renderPane = (
  bridge: TerminusPtyApi | null = makeBridge(),
  overrides: Partial<Omit<ComponentProps<typeof PtyTerminalPane>, 'ref'>> = {},
) => {
  if (bridge) {
    window.terminusPty = bridge;
  } else {
    delete window.terminusPty;
  }

  const onUnavailable = vi.fn();
  const ref = createRef<PtyTerminalHandle>();
  const props = {
    tabId: 'tab-1',
    shell: 'bash' as const,
    cwd: '/workspace',
    theme,
    onUnavailable,
    ...overrides,
  };

  return { ...render(<PtyTerminalPane {...props} ref={ref} />), bridge, onUnavailable, ref, props };
};

beforeEach(() => {
  xtermMock.instances.length = 0;
  xtermMock.dataHandler = null;
  xtermMock.resizeHandler = null;
  dataListener = null;
  exitListener = null;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
  delete window.terminusPty;
});

describe('PtyTerminalPane', () => {
  it('reports when the desktop PTY bridge is unavailable', async () => {
    const { onUnavailable } = renderPane(null);

    await waitFor(() =>
      expect(onUnavailable).toHaveBeenCalledWith(
        'El puente PTY no está disponible en esta instalación.',
      ),
    );

    expect(document.querySelector('.pty-terminal')).not.toBeNull();
  });

  it('starts the shell, writes its buffer and forwards terminal input/output', async () => {
    const { bridge, onUnavailable } = renderPane();
    const api = bridge as TerminusPtyApi;

    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));

    expect(api.create).toHaveBeenCalledWith({
      id: 'tab-1',
      shell: 'bash',
      cwd: '/workspace',
      cols: 80,
      rows: 24,
    });
    expect(onUnavailable).not.toHaveBeenCalled();

    const term = xtermMock.instances[0];
    expect(term.write).toHaveBeenCalledWith('banner');
    expect(term.focus).toHaveBeenCalled();

    act(() => xtermMock.dataHandler?.('ls\r'));
    expect(api.write).toHaveBeenCalledWith('tab-1', 'ls\r');

    act(() => dataListener?.({ id: 'tab-1', data: 'salida', seq: 3 }));
    expect(term.write).toHaveBeenCalledWith('salida');

    act(() => dataListener?.({ id: 'otra-pestana', data: 'ignorada', seq: 4 }));
    expect(term.write).not.toHaveBeenCalledWith('ignorada');
  });

  it('shows the exit overlay and starts a fresh session on restart', async () => {
    const { bridge } = renderPane();
    const api = bridge as TerminusPtyApi;

    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));

    act(() => exitListener?.({ id: 'tab-1', exitCode: 7, signal: 'SIGTERM' }));

    expect(screen.getByText('PTY FINALIZADO')).toBeTruthy();
    expect(screen.getByText(/Código de salida: 7/)).toBeTruthy();
    expect(screen.getByText(/señal: SIGTERM/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'REINICIAR SHELL' }));

    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('PTY FINALIZADO')).toBeNull();
  });

  it('exposes copy, buffer, paste and notice helpers through its ref', async () => {
    const { ref } = renderPane();

    await waitFor(() => expect(xtermMock.instances.length).toBe(1));
    const term = xtermMock.instances[0];

    expect(ref.current?.getSelection()).toBe('texto seleccionado');
    expect(ref.current?.getBufferText()).toBe('primera\nsegunda');

    act(() => {
      ref.current?.paste('texto pegado');
      ref.current?.writeNotice('linea\nnueva\x1b');
      ref.current?.selectAll();
      ref.current?.clear();
      ref.current?.focus();
    });

    expect(term.paste).toHaveBeenCalledWith('texto pegado');
    expect(term.write).toHaveBeenCalledWith(expect.stringContaining('[ARCHIVO] linea nueva'));
    expect(term.selectAll).toHaveBeenCalled();
    expect(term.clear).toHaveBeenCalled();
    expect(term.focus).toHaveBeenCalled();
  });
});
