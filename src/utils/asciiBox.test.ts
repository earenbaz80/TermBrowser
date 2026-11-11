import { describe, expect, it } from 'vitest';
import { formatAsciiBox } from './asciiBox';

describe('formatAsciiBox', () => {
  it('centers a title inside a three-line frame with uniform edges', () => {
    const title = 'MS-DOS SYSTEM RESOURCE MONITOR v6.22 / HIGH-PRECISION HUD';
    const lines = formatAsciiBox(title).split('\n');

    expect(lines).toHaveLength(3);
    expect(lines.every((line) => line.length === 85)).toBe(true);
    expect(lines[0].startsWith('╔') && lines[0].endsWith('╗')).toBe(true);
    expect(lines[1].startsWith('║') && lines[1].endsWith('║')).toBe(true);
    expect(lines[1]).toContain(title);
    expect(lines[2].startsWith('╚') && lines[2].endsWith('╝')).toBe(true);
  });
});
