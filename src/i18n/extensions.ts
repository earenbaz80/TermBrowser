import type { ExtensionManifest } from '../types';
import type { Locale } from './locales';
import type { MessageKey } from './messages';
import { translateAt } from './standalone';

interface ExtensionText {
  description: MessageKey;
  command: MessageKey;
  usage: MessageKey;
}

/** Built-in manifests keep stable ids, so their copy lives in the message catalog. */
const EXTENSION_TEXT: Record<string, ExtensionText> = {
  'json-pretty': {
    description: 'ext.jsonPretty.description',
    command: 'ext.jsonPretty.command',
    usage: 'ext.jsonPretty.usage',
  },
  'web-scraper': {
    description: 'ext.webScraper.description',
    command: 'ext.webScraper.command',
    usage: 'ext.webScraper.usage',
  },
  'dns-lookup': {
    description: 'ext.dnsLookup.description',
    command: 'ext.dnsLookup.command',
    usage: 'ext.dnsLookup.usage',
  },
  base64: {
    description: 'ext.base64.description',
    command: 'ext.base64.command',
    usage: 'ext.base64.usage',
  },
  'regex-tester': {
    description: 'ext.regexTester.description',
    command: 'ext.regexTester.command',
    usage: 'ext.regexTester.usage',
  },
  'cyber-hash': {
    description: 'ext.cyberHash.description',
    command: 'ext.cyberHash.command',
    usage: 'ext.cyberHash.usage',
  },
  speedtest: {
    description: 'ext.speedtest.description',
    command: 'ext.speedtest.command',
    usage: 'ext.speedtest.usage',
  },
};

/**
 * Returns the list with built-in copy translated; custom manifests pass through
 * untouched. Each built-in declares a single command, so one key covers it.
 */
export const localizeExtensions = (
  locale: Locale,
  extensions: ExtensionManifest[]
): ExtensionManifest[] =>
  extensions.map((extension) => {
    const text = EXTENSION_TEXT[extension.id];
    if (!text) return extension;
    return {
      ...extension,
      description: translateAt(locale, text.description),
      commands:
        extension.commands.length === 1
          ? [
              {
                ...extension.commands[0],
                description: translateAt(locale, text.command),
                usage: translateAt(locale, text.usage),
              },
            ]
          : extension.commands,
    };
  });
