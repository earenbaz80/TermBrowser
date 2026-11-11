import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ConfirmDialog } from './ConfirmDialog';
import { THEMES } from '../utils/themes';

const theme = THEMES['cyberpunk-obsidian'];
const MESSAGE = 'Se cerrarán todas las pestañas y se borrará la sesión guardada.';

const renderDialog = (overrides: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const props: React.ComponentProps<typeof ConfirmDialog> = {
    theme,
    isOpen: true,
    title: 'Nueva sesión',
    message: MESSAGE,
    confirmLabel: 'Empezar de cero',
    cancelLabel: 'Cancelar',
    onConfirm,
    onCancel,
    ...overrides,
  };
  const utils = render(<ConfirmDialog {...props} />);
  return { ...utils, onConfirm, onCancel };
};

describe('ConfirmDialog', () => {
  it('focuses the cancel button when it opens', () => {
    renderDialog();

    expect(screen.getByRole('button', { name: 'Cancelar' })).toBe(document.activeElement);
  });

  it('keeps Tab inside the dialog and wraps at both ends', () => {
    renderDialog();
    const focusedLabel = () => document.activeElement?.textContent?.trim();
    const cancel = screen.getByRole('button', { name: 'Cancelar' });
    const confirm = screen.getByRole('button', { name: 'Empezar de cero' });

    expect(focusedLabel()).toBe('Cancelar');

    confirm.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(focusedLabel()).toBe('Cancelar');
    expect(cancel.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(focusedLabel()).toBe('Empezar de cero');
  });

  it('closes when the press starts on the overlay but not inside the panel', () => {
    const { onCancel } = renderDialog();
    const overlay = screen.getByRole('dialog');

    fireEvent.pointerDown(screen.getByText(MESSAGE));
    expect(onCancel).not.toHaveBeenCalled();

    fireEvent.pointerDown(overlay);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('locks background scroll while open and restores it on close', () => {
    const { rerender } = renderDialog();
    expect(document.body.style.overflow).toBe('hidden');

    rerender(
      <ConfirmDialog
        theme={theme}
        isOpen={false}
        title="Nueva sesión"
        message={MESSAGE}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(document.body.style.overflow).toBe('');
  });

  it('confirms with Enter when no button has the focus and cancels with Escape', () => {
    const { onConfirm, onCancel } = renderDialog();
    (document.activeElement as HTMLElement | null)?.blur();

    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onConfirm).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
