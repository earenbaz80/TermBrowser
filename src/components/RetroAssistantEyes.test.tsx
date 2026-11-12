import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ASSISTANT_TIP_KEYS, RetroAssistantEyes, WEB_ASSISTANT_TIP_KEYS } from './RetroAssistantEyes';
import { MESSAGES } from '../i18n/messages';

// Components rendered without the provider fall back to Spanish.
const ASSISTANT_TIPS = ASSISTANT_TIP_KEYS.map((key) => MESSAGES.es[key]);
const WEB_ASSISTANT_TIPS = WEB_ASSISTANT_TIP_KEYS.map((key) => MESSAGES.es[key]);

const openBubble = () => {
  fireEvent.click(screen.getByTitle(/^DOSY: Asistente personal/));
};

const renderWebAssistant = (overrides: Partial<React.ComponentProps<typeof RetroAssistantEyes>> = {}) => {
  const onExecuteCommand = vi.fn();
  const onOpenCommandMenu = vi.fn();
  const onToggleBookmark = vi.fn();
  const onSelectViewMode = vi.fn();
  const props: React.ComponentProps<typeof RetroAssistantEyes> = {
    variant: 'web',
    hasPage: true,
    bookmarkActive: false,
    viewMode: 'dark',
    onExecuteCommand,
    onOpenCommandMenu,
    onToggleBookmark,
    onSelectViewMode,
    ...overrides,
  };
  const utils = render(<RetroAssistantEyes {...props} />);
  return { ...utils, props, onExecuteCommand, onOpenCommandMenu, onToggleBookmark, onSelectViewMode };
};

describe('RetroAssistantEyes web mode', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('shows a web-specific tip and keeps terminal tips out of the web bubble', () => {
    renderWebAssistant();

    expect(screen.queryByText(WEB_ASSISTANT_TIPS[0])).toBeNull();
    openBubble();

    expect(screen.getByText(WEB_ASSISTANT_TIPS[0])).toBeTruthy();
    expect(screen.queryByText(ASSISTANT_TIPS[0])).toBeNull();
  });

  it('cycles through every web tip and wraps back to the first one', () => {
    renderWebAssistant();
    openBubble();
    const next = screen.getByRole('button', { name: /Siguiente/ });

    for (let index = 1; index < WEB_ASSISTANT_TIPS.length; index += 1) {
      fireEvent.click(next);
      expect(screen.getByText(WEB_ASSISTANT_TIPS[index])).toBeTruthy();
    }

    fireEvent.click(next);
    expect(screen.getByText(WEB_ASSISTANT_TIPS[0])).toBeTruthy();
  });

  it('runs the CMD, bookmark and view-mode actions and closes the bubble', () => {
    const { onExecuteCommand, onOpenCommandMenu, onToggleBookmark, onSelectViewMode } = renderWebAssistant();

    openBubble();
    expect(screen.getByRole('button', { name: /OSCURO/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /REAL/ }).getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: /^\[CMD\]$/ }));
    expect(onOpenCommandMenu).toHaveBeenCalledTimes(1);
    expect(onExecuteCommand).not.toHaveBeenCalled();
    expect(screen.queryByText(WEB_ASSISTANT_TIPS[0])).toBeNull();

    openBubble();
    fireEvent.click(screen.getByRole('button', { name: /marcar/ }));
    expect(onToggleBookmark).toHaveBeenCalledTimes(1);
    expect(onExecuteCommand).not.toHaveBeenCalled();

    openBubble();
    fireEvent.click(screen.getByRole('button', { name: /TEXTO/ }));
    expect(onSelectViewMode).toHaveBeenCalledWith('text');
    expect(onExecuteCommand).not.toHaveBeenCalled();
  });

  it('keeps the web eyes white when the expression changes', () => {
    renderWebAssistant();
    openBubble();

    const eyes = screen.getByTitle(/^DOSY: Asistente personal/).querySelectorAll<HTMLElement>('div[style*="background-color"]');
    expect(eyes.length).toBe(2);
    eyes.forEach((eye) => {
      expect(eye.style.backgroundColor).toBe('rgb(255, 255, 255)');
    });
  });

  it('shows the remove-bookmark label when the page is already saved', () => {
    renderWebAssistant({ bookmarkActive: true });
    openBubble();

    expect(screen.getByRole('button', { name: /quitar/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /marcar/ })).toBeNull();
  });

  it('disables bookmark and view actions until there is a page', () => {
    renderWebAssistant({ hasPage: false, viewMode: undefined });

    openBubble();

    expect((screen.getByRole('button', { name: /marcar/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /REAL/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /OSCURO/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /TEXTO/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('disables CMD when no command-menu handler is provided', () => {
    renderWebAssistant({ onOpenCommandMenu: undefined });
    openBubble();

    expect((screen.getByRole('button', { name: /^\[CMD\]$/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('resets to the first web tip when switching variants', () => {
    const { rerender, props } = renderWebAssistant();
    openBubble();
    fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }));
    expect(screen.getByText(WEB_ASSISTANT_TIPS[1])).toBeTruthy();

    rerender(<RetroAssistantEyes {...props} variant="terminal" />);
    expect(screen.queryByText(WEB_ASSISTANT_TIPS[1])).toBeNull();

    openBubble();
    expect(screen.getByText(ASSISTANT_TIPS[0])).toBeTruthy();
    expect(screen.queryByText(WEB_ASSISTANT_TIPS[0])).toBeNull();
  });
});
