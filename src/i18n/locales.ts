export type Locale = 'es' | 'de' | 'fr' | 'it' | 'en';

export const DEFAULT_LOCALE: Locale = 'es';

export const LOCALE_STORAGE_KEY = 'terminus_locale_v1';

/** Language names are written in their own language so the picker is readable. */
export const LOCALES: { id: Locale; label: string; short: string }[] = [
  { id: 'es', label: 'Español', short: 'ES' },
  { id: 'de', label: 'Deutsch', short: 'DE' },
  { id: 'fr', label: 'Français', short: 'FR' },
  { id: 'it', label: 'Italiano', short: 'IT' },
  { id: 'en', label: 'English', short: 'EN' },
];

export const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && LOCALES.some((locale) => locale.id === value);
