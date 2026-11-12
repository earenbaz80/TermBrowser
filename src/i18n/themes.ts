import type { ThemeId } from '../types';
import type { Locale } from './locales';
import type { MessageKey } from './messages';
import { translateAt } from './standalone';

/** Theme names are shown in Settings and in the `theme` command output. */
export const THEME_NAME_KEYS: Record<ThemeId, MessageKey> = {
  'monochrome-green': 'themeName.monochromeGreen',
  'amber-crt': 'themeName.amberCrt',
  'cyberpunk-obsidian': 'themeName.cyberpunk',
  'retro-futurista': 'themeName.retro',
  'ms-dos': 'themeName.msdos',
  'matrix-dark': 'themeName.matrix',
  'black-and-white': 'themeName.bw',
};

export const themeName = (locale: Locale, id: ThemeId): string =>
  translateAt(locale, THEME_NAME_KEYS[id]);
