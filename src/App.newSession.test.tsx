import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';

const tabTitles = () => Array.from(document.querySelectorAll<HTMLElement>('[title^="Pestaña "]')).map((tab) => tab.title);

const openNewSessionDialog = async () => {
  fireEvent.click(screen.getByTitle(/^Nueva sesión:/));
  return screen.findByRole('dialog');
};

describe('new session reset', () => {
  it('starts from a single blank web tab after confirming, and persists it', async () => {
    render(<App />);
    const trash = screen.getByTitle(/^Nueva sesión:/);

    // Give the reset something to clean up: one more tab plus terminal logs in localStorage
    fireEvent.click(screen.getByTitle(/^Nueva pestaña/));
    await waitFor(() => expect(tabTitles()).toHaveLength(2));

    fireEvent.click(trash);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Empezar de cero' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(tabTitles()).toHaveLength(1);
    expect(tabTitles()[0]).toContain('Nueva Pestaña');
    expect(tabTitles()[0]).toContain('about:blank');

    await waitFor(
      () => {
        const stored = JSON.parse(localStorage.getItem('termbrowser.tabs') ?? '{}');
        expect(stored.tabs).toHaveLength(1);
        expect(stored.tabs[0].kind).toBe('web');
        expect(stored.tabs[0].url).toBe('about:blank');
        expect(Object.keys(stored.logs ?? {})).toHaveLength(0);
      },
      { timeout: 2000 }
    );
  });

  it('keeps the current tabs when the dialog is cancelled', async () => {
    render(<App />);
    const trash = screen.getByTitle(/^Nueva sesión:/);

    fireEvent.click(screen.getByTitle(/^Nueva pestaña/));
    await waitFor(() => expect(tabTitles()).toHaveLength(2));

    fireEvent.click(trash);
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(tabTitles()).toHaveLength(2);
  });
});
