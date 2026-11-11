import { formatAsciiBox } from './asciiBox';

/** Narrow layout that stays under the width of a typical phone terminal pane. */
export const COMPACT_ASCII_MANUAL_WIDTH = 42;

function splitLongToken(token: string, width: number): string[] {
  if (token.length <= width) return [token];

  const chunks: string[] = [];
  for (let index = 0; index < token.length; index += width) {
    chunks.push(token.slice(index, index + width));
  }
  return chunks;
}

function wrapAsciiText(text: string, width: number, indent = 0): string[] {
  const prefix = ' '.repeat(indent);
  const available = Math.max(1, width - indent);
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  const pushLine = () => {
    if (current) {
      lines.push(`${prefix}${current}`);
      current = '';
    }
  };

  for (const word of words) {
    for (const piece of splitLongToken(word, available)) {
      if (!current) {
        current = piece;
      } else if (current.length + 1 + piece.length <= available) {
        current += ` ${piece}`;
      } else {
        pushLine();
        current = piece;
      }
    }
  }

  pushLine();
  return lines.length > 0 ? lines : [''];
}

function formatBodyLine(rawLine: string, width: number): string[] {
  const line = rawLine.trimEnd();
  if (!line.trim()) return [''];

  const bullet = /^\s*•\s+(.+?)\s*:\s*(.+)$/.exec(line);
  if (bullet) {
    return [
      ...wrapAsciiText(`• ${bullet[1].trim()}`, width, 2),
      ...wrapAsciiText(bullet[2].trim(), width, 4),
    ];
  }

  const command = /^\s{2,}(.+?)\s*:\s*(.+)$/.exec(line);
  if (command) {
    return [
      ...wrapAsciiText(command[1].trim(), width, 2),
      ...wrapAsciiText(command[2].trim(), width, 4),
    ];
  }

  return wrapAsciiText(line.trim(), width);
}

/**
 * Build a narrow manual from the wide ASCII output.
 * Command descriptions are moved under their command so labels never collide
 * with the right edge, and the title box is reduced to the same 42 columns.
 */
export function formatCompactAsciiManual(
  wideManual: string,
  width = COMPACT_ASCII_MANUAL_WIDTH
): string {
  const lines = wideManual.replace(/\r\n/g, '\n').trim().split('\n');
  const hasHeader = lines.length >= 3 && lines[0].startsWith('╔') && lines[2].startsWith('╚');
  const title = hasHeader
    ? lines[1].replace(/^║/, '').replace(/║$/, '').trim() || 'TERMINUS - MANUAL DE COMANDOS'
    : 'TERMINUS - MANUAL DE COMANDOS';
  const body = hasHeader ? lines.slice(3) : lines;

  const compactLines: string[] = [formatAsciiBox(title, width)];
  for (const line of body) {
    compactLines.push(...formatBodyLine(line, width));
  }

  return compactLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
