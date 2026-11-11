import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { FileManagerHUD } from './FileManagerHUD';
import { THEMES } from '../utils/themes';
import type { VirtualFile } from '../utils/interpreter';
import type { ComponentProps } from 'react';

vi.mock('../utils/soundEffects', () => ({
  soundEffects: {
    playKeyClick: vi.fn(),
    playExecute: vi.fn(),
  },
}));

const theme = THEMES['cyberpunk-obsidian'];
const fileSystem: Record<string, VirtualFile[]> = {
  '/home/user': [
    { name: 'docs', type: 'dir', updatedAt: '07-11-2026' },
    { name: 'script.py', type: 'file', content: 'print("hola")', size: 13, updatedAt: '07-11-2026' },
    { name: 'notes.txt', type: 'file', content: 'notas', size: 5, updatedAt: '07-11-2026' },
  ],
};

const renderHud = (overrides: Partial<ComponentProps<typeof FileManagerHUD>> = {}) => {
  const props: ComponentProps<typeof FileManagerHUD> = {
    theme,
    isOpen: true,
    onClose: vi.fn(),
    currentPath: '/home/user',
    onNavigatePath: vi.fn(),
    fileSystem,
    onCreateFile: vi.fn(),
    onCreateDir: vi.fn(),
    onDeleteFile: vi.fn(),
    onSaveFileContent: vi.fn(),
    onExecuteInTerminal: vi.fn(),
    ...overrides,
  };

  return { ...render(<FileManagerHUD {...props} />), props };
};

describe('FileManagerHUD', () => {
  it('does not render its content while closed', () => {
    renderHud({ isOpen: false });

    expect(screen.queryByText(/TERMINUS FILE COMMANDER/)).toBeNull();
  });

  it('shows the path and opens directories with a double click', () => {
    const { props } = renderHud();

    expect(screen.getByText('RUTA: /home/user')).toBeTruthy();
    expect(screen.getByText('docs/')).toBeTruthy();
    expect(screen.getByText('script.py')).toBeTruthy();

    fireEvent.doubleClick(screen.getByText('docs/'));

    expect(props.onNavigatePath).toHaveBeenCalledWith('/home/user/docs');
  });

  it('previews, edits and saves a file with the F4 shortcut and the Save button', () => {
    const { props } = renderHud();

    fireEvent.click(screen.getByText('script.py'));
    fireEvent.keyDown(window, { key: 'F4' });

    const editor = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(editor.value).toBe('print("hola")');

    fireEvent.change(editor, { target: { value: 'print("adios")' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));

    expect(props.onSaveFileContent).toHaveBeenCalledWith('/home/user', 'script.py', 'print("adios")');
    expect(screen.getByText('print("adios")')).toBeTruthy();
  });

  it('creates directories and files from the prompt forms', () => {
    const { props } = renderHud();

    fireEvent.click(screen.getByRole('button', { name: /Directorio/ }));
    const directoryInput = screen.getByPlaceholderText('nombre_de_carpeta');
    fireEvent.change(directoryInput, { target: { value: 'proyectos' } });
    fireEvent.submit(directoryInput.closest('form')!);

    expect(props.onCreateDir).toHaveBeenCalledWith('/home/user', 'proyectos');

    fireEvent.click(screen.getByRole('button', { name: /Fichero/ }));
    const fileInput = screen.getByPlaceholderText('archivo.py o texto.txt');
    fireEvent.change(fileInput, { target: { value: 'nuevo.py' } });
    fireEvent.submit(fileInput.closest('form')!);

    expect(props.onCreateFile).toHaveBeenCalledWith(
      '/home/user',
      'nuevo.py',
      '# Nuevo archivo en Terminus\n',
    );
  });

  it('executes a script and deletes it after confirmation', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { props } = renderHud();

    fireEvent.click(screen.getByText('script.py'));
    fireEvent.keyDown(window, { key: 'F3' });
    fireEvent.click(screen.getByRole('button', { name: /Ejecutar Script/ }));

    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onExecuteInTerminal).toHaveBeenCalledWith('python -c "print(\\"hola\\")"');

    fireEvent.click(screen.getByTitle('Eliminar (F8)'));

    expect(confirmSpy).toHaveBeenCalledWith('¿Eliminar "script.py" del sistema de archivos?');
    expect(props.onDeleteFile).toHaveBeenCalledWith('/home/user', 'script.py');
  });
});
