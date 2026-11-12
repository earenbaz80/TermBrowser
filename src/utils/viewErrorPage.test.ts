import { describe, expect, it } from 'vitest';
import { viewErrorPage } from './proxiedPage';

describe('viewErrorPage', () => {
  it('reports the status to the parent so the frame can be replaced', () => {
    const html = viewErrorPage(413, 'nonce-abc');

    expect(html).toContain('nonce="nonce-abc"');
    expect(html).toContain('termbrowser-view-error');
    expect(html).toContain('status: 413');
  });
});
