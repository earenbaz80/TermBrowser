import { describe, expect, it } from 'vitest';
import { formatAsciiBox } from './asciiBox';
import { COMPACT_ASCII_MANUAL_WIDTH, formatCompactAsciiManual } from './asciiManual';

describe('formatCompactAsciiManual', () => {
  it('reflows command descriptions inside a narrow box without overflowing', () => {
    const wide = [
      formatAsciiBox('TERMINUS - MANUAL DE COMANDOS'),
      '[NAVEGACIÓN WEB POR LÍNEA DE COMANDOS]',
      '  goto <url>              : Navega a una URL en la pestaña activa (ej. goto https://news.ycombinator.com)',
      '  bookmark add <tit> <url>: Guarda un marcador cifrado en la bóveda',
      '    • help navegacion   : Comandos de navegación web, pestañas y lector',
    ].join('\n');

    const compact = formatCompactAsciiManual(wide);
    const lines = compact.split('\n');

    expect(lines.every((line) => line.length <= COMPACT_ASCII_MANUAL_WIDTH)).toBe(true);
    expect(lines[0]).toHaveLength(COMPACT_ASCII_MANUAL_WIDTH);
    expect(compact).toContain('  goto <url>');
    expect(compact).toContain('    Navega a una URL en la pestaña activa');
    expect(compact).toContain('  bookmark add <tit> <url>');
    expect(compact).toContain('  • help navegacion');
    expect(compact).toContain('    Comandos de navegación web');
  });
});
