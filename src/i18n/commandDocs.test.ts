import { describe, expect, it } from 'vitest';
import { COMMAND_DOCS } from '../data/commandDocs';
import { COMMAND_DOC_TEXT, localizeCommandDocs } from './commandDocs';
import type { Locale } from './locales';

const TRANSLATED: Exclude<Locale, 'es'>[] = ['de', 'fr', 'it', 'en'];

describe('command doc translations', () => {
  it('covers every command and example in every locale', () => {
    for (const locale of TRANSLATED) {
      const table = COMMAND_DOC_TEXT[locale];
      for (const doc of COMMAND_DOCS) {
        const text = table[doc.command];
        expect(text, `${locale}: ${doc.command}`).toBeDefined();
        expect(text.summary.length, `${locale}: ${doc.command} summary`).toBeGreaterThan(10);
        expect(text.description.length, `${locale}: ${doc.command} description`).toBeGreaterThan(10);
        expect(text.examples.length, `${locale}: ${doc.command} examples`).toBe(doc.examples.length);
        for (const example of text.examples) expect(example.length).toBeGreaterThan(3);
      }
    }
  });

  it('keeps the Spanish catalogue untouched and merges the rest', () => {
    const spanish = localizeCommandDocs('es', COMMAND_DOCS);
    expect(spanish).toBe(COMMAND_DOCS);

    const english = localizeCommandDocs('en', COMMAND_DOCS);
    const goto = english.find((doc) => doc.command === 'ir a / goto');
    expect(goto?.summary).toBe(COMMAND_DOC_TEXT.en['ir a / goto'].summary);
    expect(goto?.examples[0].code).toBe('ir a https://news.ycombinator.com');
    expect(goto?.examples[1].description).toBe(
      COMMAND_DOC_TEXT.en['ir a / goto'].examples[1]
    );
  });
});
