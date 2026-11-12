import { DEFAULT_LOCALE, isLocale, LOCALE_STORAGE_KEY, type Locale } from './locales';
import { MESSAGES, type MessageKey } from './messages';

type Vars = Record<string, string | number>;

const interpolate = (template: string, vars?: Vars): string =>
  vars
    ? template.replace(/\{(\w+)\}/g, (match, name: string) =>
        Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
      )
    : template;

/** Locale chosen in Settings, readable outside React (utilities and services). */
export const currentLocale = (): Locale => {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(stored) ? stored : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
};

export const translateAt = (locale: Locale, key: MessageKey, vars?: Vars): string =>
  interpolate(MESSAGES[locale]?.[key] ?? MESSAGES[DEFAULT_LOCALE][key] ?? key, vars);

/** Convenience for modules that cannot use the React hook. */
export const tStandalone = (key: MessageKey, vars?: Vars): string =>
  translateAt(currentLocale(), key, vars);
