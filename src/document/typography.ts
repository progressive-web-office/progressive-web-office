/**
 * Typography (DOC-031): curly quotes, dashes, ellipsis and French spacing,
 * as you type and as text transforms (DOC-032).
 */

export const NBSP = '\u00a0';
/** Narrow no-break space, before `; ! ?` in French. */
export const NNBSP = '\u202f';

export interface Quotes {
  open: string;
  close: string;
  openSingle: string;
  closeSingle: string;
}

/** Quotation marks by language (primary subtag). */
export function quotesFor(lang: string): Quotes {
  const l = lang.toLowerCase().split(/[-_]/)[0];
  switch (l) {
    case 'fr':
      return { open: `«${NBSP}`, close: `${NBSP}»`, openSingle: '‹', closeSingle: '›' };
    case 'de':
      return { open: '„', close: '“', openSingle: '‚', closeSingle: '‘' };
    case 'es':
    case 'it':
    case 'pt':
    case 'ru':
      return { open: '«', close: '»', openSingle: '“', closeSingle: '”' };
    case 'zh':
    case 'ja':
      return { open: '「', close: '」', openSingle: '『', closeSingle: '』' };
    default:
      return { open: '“', close: '”', openSingle: '‘', closeSingle: '’' };
  }
}

export const isFrench = (lang: string): boolean => /^fr\b/i.test(lang);

/** Whether a quote typed after `before` opens (start, space, opening bracket or dash). */
export const opensQuote = (before: string): boolean => before === '' || /[\s([{\u00a0\u202f—–«‹„“‘'"/-]$/.test(before);

/** A word that is a web address or a path: no French spacing in it. */
const ADDRESS = /(?:\w+:\/\/|www\.|\w+[./@]\w+[./@\w]*|\b(?:https?|mailto|ftp|tel|file))$/i;

/**
 * The spacing to put before `; : ! ?` in French after `before` (the text
 * typed so far in the paragraph): the space to use, how many characters
 * before it to replace (a typed space), or undefined to change nothing.
 */
export function frenchSpaceBefore(before: string, mark: string): { space: string; replace: number } | undefined {
  if (!before || /[\s\u00a0\u202f]$/.test(before) === false) {
    const prev = before.slice(-1);
    if (!prev || /[([{«‹\s]/.test(prev)) return undefined;
    if (/[!?;:]/.test(prev) && mark !== ':') return undefined; // "?!" stays together
    if (mark === ':' && /\d$/.test(before)) return undefined; // 12:30
    if (ADDRESS.test(before)) return undefined;
    return { space: mark === ':' ? NBSP : NNBSP, replace: 0 };
  }
  // A space was typed: it becomes a no-break space.
  const word = before.replace(/[\s\u00a0\u202f]+$/, '');
  if (!word || ADDRESS.test(word)) return undefined;
  const typed = before.length - word.length;
  const space = mark === ':' ? NBSP : NNBSP;
  if (before.endsWith(space) && typed === 1) return undefined;
  return { space, replace: typed };
}

// --- text transforms (DOC-032) ---------------------------------------------------

export const straightenQuotes = (s: string): string =>
  s.replace(/[«»]/g, '"').replace(/[“”„‟]/g, '"').replace(/[‘’‚‛‹›]/g, "'").replace(/"[\u00a0\u202f]/g, '"').replace(/[\u00a0\u202f]"/g, '"');

/** Straight quotes to the language's curly ones; apostrophes inside words. */
export function curlyQuotes(s: string, lang: string): string {
  const q = quotesFor(lang);
  let out = '';
  let double = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c === '"') {
      const opening: boolean = !double && opensQuote(out);
      out = opening ? out + q.open : out.replace(/[ \u00a0\u202f]+$/, '') + q.close;
      double = opening;
      if (opening && /^\s/.test(s.slice(i + 1)) && q.open.endsWith(NBSP)) i++;
    } else if (c === "'") {
      out += /[\p{L}\p{N}]$/u.test(out) ? '’' : opensQuote(out) ? q.openSingle : '’';
    } else out += c;
  }
  return out;
}

/** French spacing before `; : ! ?` and inside « ». */
export function frenchSpacing(s: string): string {
  return s
    .replace(/«[ \u00a0\u202f]*/g, `«${NBSP}`)
    .replace(/[ \u00a0\u202f]*»/g, `${NBSP}»`)
    .replace(/(\S)[ \u00a0\u202f]*([;!?])/gu, (m, prev: string, mark: string, offset: number, all: string) => {
      const before = all.slice(0, offset + 1);
      if (/[!?;:([«]/.test(prev) || ADDRESS.test(before)) return m;
      return `${prev}${NNBSP}${mark}`;
    })
    .replace(/(\S)[ \u00a0\u202f]*:(?!\/\/)/gu, (m, prev: string, offset: number, all: string) => {
      if (/[\d:([«]/.test(prev) || ADDRESS.test(all.slice(0, offset + 1))) return m;
      return `${prev}${NBSP}:`;
    });
}

/** Double spaces to one (not at the start of a line). */
export const removeDoubleSpaces = (s: string): string => s.replace(/(\S) {2,}/g, '$1 ');

/** Invisible and control characters (zero-width, soft hyphens, stray controls). */
export const zapGremlins = (s: string): string => s.replace(/[​-‍⁠﻿­]|[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');

export const dashesAndEllipsis = (s: string): string => s.replace(/\.\.\./g, '…').replace(/---/g, '—').replace(/--/g, '–');

/** First letter of each sentence in capitals, the rest in lower case. */
export function sentenceCase(s: string, lang: string): string {
  let start = true;
  let out = '';
  for (const ch of s.toLocaleLowerCase(lang)) {
    if (start && /\p{L}/u.test(ch)) {
      out += ch.toLocaleUpperCase(lang);
      start = false;
    } else out += ch;
    if (/[.!?…]/.test(ch) || ch === '\n') start = true;
  }
  return out;
}

const SMALL_WORDS: Record<string, Set<string>> = {
  en: new Set('a an and as at but by for in nor of on or the to up via vs'.split(' ')),
  fr: new Set('à au aux de des du en et la le les ou par pour sur un une d l'.split(' ')),
};

/** Each word capitalised, except the small words of the language (not the first). */
export function titleCase(s: string, lang: string): string {
  const small = SMALL_WORDS[lang.split(/[-_]/)[0]!.toLowerCase()] ?? new Set<string>();
  let first = true;
  return s.replace(/[\p{L}\p{N}][\p{L}\p{N}’'-]*/gu, (w) => {
    const lower = w.toLocaleLowerCase(lang);
    const keep = !first && small.has(lower);
    first = false;
    return keep ? lower : lower[0]!.toLocaleUpperCase(lang) + lower.slice(1);
  });
}
