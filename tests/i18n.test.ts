import { afterEach, describe, expect, it } from 'vitest';
import { catalogs, detectLocale, getLocale, setLocale, t } from '../src/i18n';
import { en } from '../src/i18n/en';

afterEach(() => setLocale('en'));

describe('UI-009 translation catalogs', () => {
  const keys = Object.keys(en).sort();
  it.each(['fr', 'zh'] as const)('%s has exactly the English keys, all non-empty', (locale) => {
    const cat = catalogs()[locale];
    expect(Object.keys(cat).sort()).toEqual(keys);
    for (const k of keys) expect(cat[k]?.trim(), k).toBeTruthy();
  });

  it.each(['fr', 'zh'] as const)('%s keeps the same placeholders', (locale) => {
    const cat = catalogs()[locale];
    const params = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const k of keys) expect(params(cat[k]!), k).toEqual(params(en[k as keyof typeof en]));
  });
});

describe('UI-008 locale selection', () => {
  it('detects the language from browser preferences', () => {
    expect(detectLocale(['fr-CA', 'en'])).toBe('fr');
    expect(detectLocale(['zh-TW'])).toBe('zh');
    expect(detectLocale(['de-DE', 'es'])).toBe('en');
  });

  it('switches language, interpolates parameters and sets <html lang>', () => {
    setLocale('fr');
    expect(getLocale()).toBe('fr');
    expect(t('error.tooLarge', { name: 'a.pdf', limit: 50 })).toBe('« a.pdf » est trop volumineux (limite : 50 Mo).');
    expect(document.documentElement.lang).toBe('fr');
    setLocale('zh');
    expect(t('start.newDocument')).toBe('新建文档');
    expect(document.documentElement.lang).toBe('zh-Hans');
  });
});
