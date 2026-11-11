import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TerminalView } from './TerminalView';
import { THEMES } from '../utils/themes';
import type { ComponentProps } from 'react';
import type { TerminalLogEntry } from '../types';
import type { VirtualFile } from '../utils/interpreter';

vi.mock('../utils/soundEffects', () => ({
  soundEffects: new Proxy({}, { get: () => vi.fn() }),
}));

const theme = THEMES['cyberpunk-obsidian'];
const logs: TerminalLogEntry[] = [
  {
    id: 'command-1',
    timestamp: '07-11-2026 10:00:00',
    command: 'help',
    output: '',
    type: 'command',
  },
  {
    id: 'output-1',
    timestamp: '07-11-2026 10:00:01',
    output: 'Visita https://example.com/docs para más información.',
    type: 'stdout',
  },
  {
    id: 'system-1',
    timestamp: '07-11-2026 10:00:02',
    output: 'Sistema listo',
    type: 'system',
  },
];

const files: Record<string, VirtualFile[]> = {
  '/home/user': [
    { name: 'script.py', type: 'file', content: 'print(1)', size: 8 },
    { name: 'notas.txt', type: 'file', content: 'hola', size: 4 },
  ],
};

const renderTerminal = (
  overrides: Partial<ComponentProps<typeof TerminalView>> = {},
) => {
  const onExecuteCommand = vi.fn();
  const onClearLogs = vi.fn();
  const onExportLogs = vi.fn();
  const props: ComponentProps<typeof TerminalView> = {
    theme,
    logs,
    onExecuteCommand,
    onClearLogs,
    onExportLogs,
    currentPath: '/home/user',
    fileSystem: files,
    tabSummary: '2/3',
    latencyMs: 23,
    ...overrides,
  };

  return {
    ...render(<TerminalView {...props} />),
    props,
    onExecuteCommand,
    onClearLogs,
    onExportLogs,
  };
};

beforeEach(() => {
  Object.defineProperty(window.Element.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(window.HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: vi.fn(() => null),
  });
});

describe('TerminalView', () => {
  it('renders logs, navigable URLs and command echoes', () => {
    const { onExecuteCommand } = renderTerminal();

    expect(screen.getByText('CONSOLA & NAVEGADOR WEB')).toBeTruthy();
    expect(screen.getByText('https://example.com/docs')).toBeTruthy();
    expect(screen.getByText('Sistema listo')).toBeTruthy();

    fireEvent.click(screen.getByText('https://example.com/docs'));
    expect(onExecuteCommand).toHaveBeenCalledWith('goto https://example.com/docs');

    fireEvent.click(screen.getByText('help'));
    expect((screen.getByPlaceholderText(/Escriba cualquier búsqueda o comando/) as HTMLInputElement).value).toBe(
      'help',
    );
  });

  it('submits a command, clears the prompt and recalls the persisted history', () => {
    const { onExecuteCommand } = renderTerminal();
    const input = screen.getByPlaceholderText(/Escriba cualquier búsqueda o comando/) as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'whoami' } });
    fireEvent.submit(input.closest('form')!);

    expect(onExecuteCommand).toHaveBeenCalledWith('whoami');
    expect(input.value).toBe('');

    fireEvent.keyDown(input, { key: 'ArrowUp' });

    expect(input.value).toBe('whoami');
    expect(screen.getByTitle(/Navegando el historial persistente/)).toBeTruthy();
  });

  it('autocompletes a script from the current virtual directory with Tab', () => {
    renderTerminal();
    const input = screen.getByPlaceholderText(/Escriba cualquier búsqueda o comando/) as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'script.' } });
    expect(screen.getByRole('button', { name: /script\.py/ })).toBeTruthy();

    fireEvent.keyDown(input, { key: 'Tab' });

    expect(input.value).toBe('python script.py');
  });

  it('routes submissions to the native shell executor in native shell mode', () => {
    const onSelectShellMode = vi.fn();
    const onExecuteShellCommand = vi.fn();
    const { onExecuteCommand } = renderTerminal({
      shellMode: 'bash',
      nativeShellAvailable: true,
      onSelectShellMode,
      onExecuteShellCommand,
    });

    const selector = screen.getByLabelText('Seleccionar intérprete de la terminal');
    fireEvent.change(selector, { target: { value: 'powershell' } });
    expect(onSelectShellMode).toHaveBeenCalledWith('powershell');

    const input = screen.getByPlaceholderText(/Comando para BASH/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'pwd' } });
    fireEvent.submit(input.closest('form')!);

    expect(onExecuteShellCommand).toHaveBeenCalledWith('pwd');
    expect(onExecuteCommand).not.toHaveBeenCalled();
  });

  it('exports logs from the quick actions menu and clears them from the header', () => {
    const { onExportLogs, onClearLogs } = renderTerminal();

    fireEvent.click(screen.getByRole('button', { name: /ACCIONES/ }));
    fireEvent.click(screen.getByRole('button', { name: /Exportar Logs \(TXT\)/ }));

    expect(onExportLogs).toHaveBeenCalledWith('txt');

    fireEvent.click(screen.getByTitle('Limpiar terminal (Comando: clear)'));
    expect(onClearLogs).toHaveBeenCalledTimes(1);
  });
});
