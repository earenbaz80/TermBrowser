import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { TerminalWebpageView } from './TerminalWebpageView';
import { THEMES } from '../utils/themes';
import type { WebpagePayload } from '../types';

const theme = THEMES['cyberpunk-obsidian'];
const webpage: WebpagePayload = {
  url: 'https://example.com',
  title: 'Example',
  images: [],
  links: [],
  headings: [],
  paragraphs: [],
};

function renderFrame(frameable: boolean, isLatest = true) {
  const onNavigate = vi.fn();
  render(
    <TerminalWebpageView
      theme={theme}
      webpage={{ ...webpage, frameable }}
      onNavigate={onNavigate}
      isLatest={isLatest}
    />
  );
  const frame = document.querySelector('iframe');
  if (!frame) throw new Error('No se encontró el iframe de la página.');
  return { onNavigate, frame };
}

function sendMessage(
  frame: HTMLIFrameElement,
  source: MessageEventSource | null,
  origin: string,
  url = 'https://example.com/next'
) {
  fireEvent(
    window,
    new MessageEvent('message', {
      data: { source: 'termbrowser-view', url },
      source,
      origin,
    })
  );
}

describe('TerminalWebpageView navigation messages', () => {
  it('accepts the sandboxed proxy only from its contentWindow and null origin', () => {
    const { onNavigate, frame } = renderFrame(false);

    sendMessage(frame, window, 'null');
    sendMessage(frame, frame.contentWindow, 'https://example.com');
    expect(onNavigate).not.toHaveBeenCalled();

    sendMessage(frame, frame.contentWindow, 'null');
    expect(onNavigate).toHaveBeenCalledWith('https://example.com/next');
  });

  it('ignores REAL messages even when their source and origin match', () => {
    const { onNavigate, frame } = renderFrame(true);

    sendMessage(frame, window, 'https://example.com');
    sendMessage(frame, frame.contentWindow, 'null');
    sendMessage(frame, frame.contentWindow, 'https://wrong-origin.example');
    sendMessage(frame, frame.contentWindow, 'https://example.com');
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
