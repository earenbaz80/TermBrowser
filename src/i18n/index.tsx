import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_LOCALE, isLocale, LOCALE_STORAGE_KEY, Locale } from './locales';
import { MESSAGES, MessageKey } from './messages';
import { ConsoleKey, CONSOLE_MESSAGES } from './console';

export const LOCALE_SYNC_EVENT = 'terminus-locale-sync';

type Vars = Record<string, string | number>;

export interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, vars?: Vars) => string;
  /** Console output of commandProcessor, kept in its own catalog. */
  tc: (key: ConsoleKey, vars?: Vars) => string;
}

const interpolate = (template: string, vars?: Vars): string =>
  vars
    ? template.replace(/\{(\w+)\}/g, (match, name: string) =>
        Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
      )
    : template;

export const translate = (locale: Locale, key: MessageKey, vars?: Vars): string =>
  interpolate(MESSAGES[locale]?.[key] ?? MESSAGES[DEFAULT_LOCALE][key] ?? key, vars);

export const translateConsole = (locale: Locale, key: ConsoleKey, vars?: Vars): string =>
  interpolate(CONSOLE_MESSAGES[locale]?.[key] ?? CONSOLE_MESSAGES[DEFAULT_LOCALE][key] ?? key, vars);

const readStoredLocale = (): Locale => {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(stored) ? stored : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
};

/**
 * Components stay usable outside the provider (unit tests, isolated renders):
 * without it they fall back to Spanish instead of throwing.
 */
const fallback: I18nValue = {
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  t: (key, vars) => translate(DEFAULT_LOCALE, key, vars),
  tc: (key, vars) => translateConsole(DEFAULT_LOCALE, key, vars),
};

const I18nContext = createContext<I18nValue>(fallback);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<Locale>(readStoredLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // Storage unavailable: the choice still applies to this session.
    }
    window.dispatchEvent(new CustomEvent(LOCALE_SYNC_EVENT, { detail: next }));
  }, []);

  const t = useCallback((key: MessageKey, vars?: Vars) => translate(locale, key, vars), [locale]);
  const tc = useCallback((key: ConsoleKey, vars?: Vars) => translateConsole(locale, key, vars), [locale]);

  const value = useMemo<I18nValue>(() => ({ locale, setLocale, t, tc }), [locale, setLocale, t, tc]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = (): I18nValue => useContext(I18nContext);
