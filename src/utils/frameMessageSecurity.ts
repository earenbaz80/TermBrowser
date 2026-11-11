/**
 * Validate messages that a page iframe sends to the browser chrome.
 *
 * Proxied documents are sandboxed without allow-same-origin, so their origin
 * is the opaque `"null"` origin. Direct REAL iframes post from the site origin.
 * In both cases the window identity is checked as well: an unrelated window
 * cannot spoof a navigation message even if it guesses the origin.
 */

export function expectedFrameMessageOrigin(
  frameUrl: string | undefined,
  usingProxy: boolean
): string {
  if (usingProxy) return 'null';
  try {
    return new URL(frameUrl ?? '').origin;
  } catch {
    return '';
  }
}

export function isTrustedFrameMessage(
  event: MessageEvent,
  frame: HTMLIFrameElement | null,
  expectedOrigin: string
): boolean {
  if (!frame || !expectedOrigin) return false;
  return event.source === frame.contentWindow && event.origin === expectedOrigin;
}
