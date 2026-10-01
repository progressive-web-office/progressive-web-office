/** Internationalisation (UI-007..UI-010): English, French, Simplified Chinese. */
import { en, type MessageKey } from './en';
import { fr } from './fr';
import { zh } from './zh';

export type Locale = 'en' | 'fr' | 'zh';
export type { MessageKey };

export const LOCALES: { code: Locale; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'zh', label: '简体中文' },
];

const CATALOGS: Record<Locale, Record<MessageKey, string>> = { en, fr, zh };
const STORAGE_KEY = 'pwo.locale';
const HTML_LANG: Record<Locale, string> = { en: 'en', fr: 'fr', zh: 'zh-Hans' };

let current: Locale = 'en';
const listeners = new Set<(l: Locale) => void>();

/** Pick the best supported locale from a list of BCP 47 tags. */
export function detectLocale(preferred: readonly string[]): Locale {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split('-')[0];
    if (base === 'en' || base === 'fr' || base === 'zh') return base;
  }
  return 'en';
}

export function initLocale(): Locale {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
  const locale = stored === 'en' || stored === 'fr' || stored === 'zh' ? stored : detectLocale(typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language]);
  applyLocale(locale);
  return locale;
}

function applyLocale(locale: Locale): void {
  current = locale;
  if (typeof document !== 'undefined') document.documentElement.lang = HTML_LANG[locale];
}

export function setLocale(locale: Locale): void {
  applyLocale(locale);
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* storage unavailable */
  }
  for (const l of listeners) l(locale);
}

export function getLocale(): Locale {
  return current;
}

export function onLocaleChange(fn: (l: Locale) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Translate a key, replacing `{param}` placeholders. */
export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  const template = CATALOGS[current][key] ?? en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m));
}

export function catalogs(): Record<Locale, Record<string, string>> {
  return CATALOGS;
}
