/** Shared width of the terminal command frames, in monospace columns. */
const ASCII_BOX_WIDTH = 85;

/** Build a centered three-line frame so every command banner has the same edges. */
export function formatAsciiBox(title: string, width = ASCII_BOX_WIDTH): string {
  const innerWidth = Math.max(3, width - 2, title.length + 2);
  const padding = Math.max(0, innerWidth - title.length);
  const left = Math.floor(padding / 2);
  const right = padding - left;

  return [
    `╔${'═'.repeat(innerWidth)}╗`,
    `║${' '.repeat(left)}${title}${' '.repeat(right)}║`,
    `╚${'═'.repeat(innerWidth)}╝`,
  ].join('\n');
}
