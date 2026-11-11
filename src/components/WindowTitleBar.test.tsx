import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WindowTitleBar } from './WindowTitleBar';
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

describe('WindowTitleBar', () => {
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
    render(<WindowTitleBar theme={theme} />);

    fireEvent.click(screen.getByRole('button', { name: 'Minimizar ventana' }));
    expect(desktop.minimize).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Maximizar ventana' }));
    expect(desktop.toggleMaximize).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Restaurar ventana' })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar ventana' }));
    expect(desktop.close).toHaveBeenCalledTimes(1);
  });

  it('shows inactive controls when the desktop bridge is not available', () => {
    render(<WindowTitleBar theme={theme} />);

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
