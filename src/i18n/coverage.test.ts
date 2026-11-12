import { describe, expect, it } from 'vitest';
import { MESSAGES } from './messages';
import { CONSOLE_MESSAGES } from './console';
import { LOCALES, type Locale } from './locales';

const translatedLocales = LOCALES.map((entry) => entry.id).filter((id) => id !== 'es');

const placeholders = (text: string) =>
  (text.match(/\{\w+\}/g) ?? []).map((token) => token.slice(1, -1)).sort();

/** Spanish-only opening punctuation never appears in German, French, Italian or English. */
const SPANISH_ONLY = /[¿¡]/;

const checkCatalog = (
  name: string,
  source: Record<string, string>,
  catalog: Record<string, string>,
  locale: Locale
) => {
  for (const key of Object.keys(source)) {
    const value = catalog[key];
    expect(value, `${name}.${locale}.${key} is missing`).toBeTypeOf('string');
    expect(value.trim(), `${name}.${locale}.${key} is empty`).not.toBe('');
    expect(placeholders(value), `${name}.${locale}.${key} placeholders`).toEqual(
      placeholders(source[key])
    );
    expect(SPANISH_ONLY.test(value), `${name}.${locale}.${key} keeps Spanish punctuation`).toBe(
      false
    );
  }
};

describe('i18n coverage', () => {
  it('translates every UI key in every locale', () => {
    for (const locale of translatedLocales) {
      checkCatalog('messages', MESSAGES.es, MESSAGES[locale], locale);
      expect(Object.keys(MESSAGES[locale]).sort()).toEqual(Object.keys(MESSAGES.es).sort());
    }
  });

  it('translates every console key in every locale', () => {
    for (const locale of translatedLocales) {
      checkCatalog('console', CONSOLE_MESSAGES.es, CONSOLE_MESSAGES[locale], locale);
      expect(Object.keys(CONSOLE_MESSAGES[locale]).sort()).toEqual(
        Object.keys(CONSOLE_MESSAGES.es).sort()
      );
    }
  });
});
