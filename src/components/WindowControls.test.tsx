import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WindowControls } from './WindowControls';
import { TerminusDesktopApi, ThemeConfig } from '../types';

const theme: ThemeConfig = {
  id: 'cyberpunk-obsidian',
  name: 'Cyberpunk Obsidian',
  bg: '#070a12',
  cardBg: '#0e1424',
  border: '#1e293b',
  text: '#e2e8f0',
  accent: '#06b6d4',
  muted: '#64748b',
  glow: 'rgba(6, 182, 212, 0.25)',
  cursorColor: '#06b6d4',
  promptSymbol: 'cyber:root❯',
};

afterEach(() => {
  cleanup();
  delete window.terminusDesktop;
});

describe('WindowControls', () => {
  it('drives minimize, maximize and close through the desktop bridge', async () => {
    let maximized = false;
    const listeners = new Set<(value: boolean) => void>();

    const desktop: TerminusDesktopApi = {
      platform: 'win32',
      minimize: vi.fn(),
      toggleMaximize: vi.fn(async () => {
        maximized = !maximized;
        listeners.forEach((listener) => listener(maximized));
        return maximized;
      }),
      close: vi.fn(),
      isMaximized: vi.fn(async () => maximized),
      onMaximizedChange: vi.fn((listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }),
      onFrameContextMenu: vi.fn(() => () => {}),
      onFindShortcut: vi.fn(() => () => {}),
    };

    window.terminusDesktop = desktop;
    render(<WindowControls theme={theme} />);

    fireEvent.click(screen.getByRole('button', { name: 'Minimizar ventana' }));
    expect(desktop.minimize).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Maximizar ventana' }));
    expect(desktop.toggleMaximize).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Restaurar ventana' })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar ventana' }));
    expect(desktop.close).toHaveBeenCalledTimes(1);
  });

  it('shows inactive controls when the desktop bridge is not available', () => {
    render(<WindowControls theme={theme} />);

    const minimize = screen.getByRole('button', { name: 'Minimizar ventana' });
    const maximize = screen.getByRole('button', { name: 'Maximizar ventana' });
    const close = screen.getByRole('button', { name: 'Cerrar ventana' });

    expect(minimize.getAttribute('aria-disabled')).toBe('true');
    expect(maximize.getAttribute('aria-disabled')).toBe('true');
    expect(close.getAttribute('aria-disabled')).toBe('true');

    fireEvent.click(minimize);
    fireEvent.click(maximize);
    fireEvent.click(close);

    expect(minimize.getAttribute('aria-disabled')).toBe('true');
    expect(maximize.getAttribute('aria-disabled')).toBe('true');
    expect(close.getAttribute('aria-disabled')).toBe('true');
  });
});

describe('WindowControls con el puente de escritorio', () => {
  it('refleja el maximizado que empuja el puente, sin pulsar ningún botón', async () => {
    let push: ((value: boolean) => void) | null = null;
    const desktop: TerminusDesktopApi = {
      platform: 'win32',
      minimize: vi.fn(),
      toggleMaximize: vi.fn(async () => true),
      close: vi.fn(),
      isMaximized: vi.fn(async () => false),
      onMaximizedChange: vi.fn((listener) => {
        push = listener;
        return () => {
          push = null;
        };
      }),
      onFrameContextMenu: vi.fn(() => () => {}),
      onFindShortcut: vi.fn(() => () => {}),
    };

    window.terminusDesktop = desktop;
    render(<WindowControls theme={theme} />);

    await waitFor(() => expect(desktop.onMaximizedChange).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Maximizar ventana' })).toBeTruthy();

    act(() => push?.(true));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Restaurar ventana' })).toBeTruthy());

    act(() => push?.(false));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Maximizar ventana' })).toBeTruthy());
  });
});
