import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppErrorBoundary } from './AppErrorBoundary';

describe('AppErrorBoundary', () => {
  it('shows a recoverable fallback instead of a blank page', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const Boom = () => {
      throw new Error('boom');
    };

    render(
      <AppErrorBoundary>
        <Boom />
      </AppErrorBoundary>
    );

    expect(screen.getByRole('alert').textContent).toContain('ERROR DE INTERFAZ');
    expect(screen.getByRole('button', { name: 'Reiniciar interfaz' }).textContent).toBe('Reiniciar interfaz');
    consoleError.mockRestore();
  });
});
