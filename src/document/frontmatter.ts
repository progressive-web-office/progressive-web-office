/**
 * YAML front matter of Markdown files (DOC-043). A deliberately small subset:
 * `key: value` scalars (plain or quoted), inline `[a, b]` lists and block
 * `- item` lists. Keys that are not document properties, or values in other
 * YAML forms, are kept verbatim and written back unchanged.
 */
import { cleanMeta, type DocumentMeta } from './model';

export interface FrontMatter {
  meta: DocumentMeta;
  /** Lines not understood as document properties, written back as they were. */
  extra: string;
  /** The Markdown after the front matter. */
  body: string;
}

/** Front matter key → property (pandoc and Jekyll/Hugo spellings). */
const KEYS: Record<string, keyof DocumentMeta> = {
  title: 'title',
  author: 'author',
  date: 'date',
  subject: 'subject',
  description: 'description',
  abstract: 'description',
  keywords: 'keywords',
  lang: 'language',
  language: 'language',
  license: 'license',
  licence: 'license',
  identifier: 'identifier',
  source: 'source',
};

export function unquote(value: string): string | null {
  const v = value.trim();
  if (v.startsWith('"')) {
    if (!v.endsWith('"') || v.length < 2) return null;
    try {
      return JSON.parse(v) as string;
    } catch {
      return null;
    }
  }
  if (v.startsWith("'")) return v.endsWith("'") && v.length >= 2 ? v.slice(1, -1).replace(/''/g, "'") : null;
  // Plain scalar: reject YAML syntax we do not interpret.
  if (/^[|>&*!%@`{[]/.test(v) || / #/.test(v)) return null;
  return v;
}

export function inlineList(value: string): string[] | null {
  const v = value.trim();
  if (!v.startsWith('[') || !v.endsWith(']')) return null;
  const items: string[] = [];
  let current = '';
  let quote: string | null = null;
  for (const ch of v.slice(1, -1)) {
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
    } else if (ch === ',') {
      items.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) items.push(current);
  const out = items.map(unquote);
  return out.every((i): i is string => i !== null) ? out.filter(Boolean) : null;
}

export function parseFrontMatter(text: string): FrontMatter {
  const src = text.replace(/^﻿/, '');
  const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(src);
  // YAML starts with a key (or a comment); otherwise this is a Markdown rule.
  const firstLine = m?.[1]!.split(/\r?\n/).find((l) => l.trim()) ?? '';
  if (!m || !/^([A-Za-z_][\w-]*:(\s|$)|#)/.test(firstLine)) return { meta: {}, extra: '', body: text };
  const lines = m[1]!.split(/\r?\n/);
  const meta: DocumentMeta = {};
  const extra: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // Group the key with its indented continuation lines.
    const group = [line];
    while (i + 1 < lines.length && /^(\s+|$)/.test(lines[i + 1]!) && lines[i + 1] !== '') group.push(lines[++i]!);
    const kv = /^([A-Za-z_][\w-]*):(?:\s+(.*))?$/.exec(line);
    const key = kv ? KEYS[kv[1]!.toLowerCase()] : undefined;
    let ok = false;
    if (kv && key) {
      const value = (kv[2] ?? '').trim();
      if (key === 'keywords') {
        const list = value ? inlineList(value) ?? (unquote(value)?.split(',').map((s) => s.trim()) ?? null) : group.slice(1).every((l) => /^\s+-\s+/.test(l)) ? group.slice(1).map((l) => unquote(l.replace(/^\s+-\s+/, ''))) : null;
        if (list && list.every((x): x is string => x !== null) && (value || group.length > 1)) {
          meta.keywords = list;
          ok = true;
        }
      } else if (value && group.length === 1) {
        const scalar = unquote(value);
        if (scalar !== null) {
          meta[key] = scalar;
          ok = true;
        }
      }
    }
    if (!ok && group.some((l) => l.trim())) extra.push(...group);
  }
  return { meta: cleanMeta(meta), extra: extra.join('\n'), body: src.slice(m[0].length) };
}

/**
 * Quote a scalar when plain YAML could misread it: an address, an e-mail or
 * a time stays plain (`https://…`, `ada@example.org`), but not ': ' (a key),
 * ' #' (a comment), a boolean, null or a number.
 */
export function scalar(value: string): string {
  return /^[\wÀ-￿][\wÀ-￿ .,;/()+\-@:'&%=~?!*]*$/.test(value) && !/:(\s|$)|\s#/.test(value) && !/^(true|false|null|yes|no|~)$/i.test(value) && !/^[\d.+-]+$/.test(value.replace(/-/g, '')) ? value : JSON.stringify(value);
}

/** Front matter for `meta` and the verbatim `extra` lines; empty when there is nothing to write. */
export function writeFrontMatter(meta: DocumentMeta, extra = ''): string {
  const m = cleanMeta(meta);
  const lines: string[] = [];
  const put = (key: string, value: string | undefined): void => {
    if (value) lines.push(`${key}: ${scalar(value)}`);
  };
  put('title', m.title);
  put('author', m.author);
  if (m.date) lines.push(`date: ${/^\d{4}-\d{2}-\d{2}$/.test(m.date) ? m.date : JSON.stringify(m.date)}`);
  put('subject', m.subject);
  put('description', m.description);
  if (m.keywords) lines.push(`keywords: [${m.keywords.map(scalar).map((k) => (k.includes(',') && !k.startsWith('"') ? JSON.stringify(k) : k)).join(', ')}]`);
  put('lang', m.language);
  put('license', m.license);
  put('identifier', m.identifier);
  put('source', m.source);
  if (extra.trim()) lines.push(extra.replace(/\s+$/, ''));
  return lines.length ? `---\n${lines.join('\n')}\n---\n\n` : '';
}
