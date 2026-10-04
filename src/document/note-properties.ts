/**
 * NOTE-001: the properties of a note — its front matter — as typed values
 * to show and change: text, lists (tags, aliases), yes/no, numbers, dates,
 * links to other notes. The document properties (title, author, date…) come
 * from `doc.meta`; the other keys from the lines kept verbatim, each written
 * back unchanged unless it was changed, in its place.
 */
import { cleanMeta, type DocumentMeta } from './model';
import { inlineList, scalar, unquote } from './frontmatter';

export type PropertyValue =
  | { kind: 'text'; text: string }
  | { kind: 'list'; items: string[]; inline?: boolean }
  | { kind: 'bool'; value: boolean }
  | { kind: 'number'; value: number }
  | { kind: 'date'; value: string }
  /** YAML the editor does not interpret (nested maps, blocks…), kept as it is. */
  | { kind: 'raw'; text: string };

export interface Property {
  key: string;
  value: PropertyValue;
  /** A document property (DOC-017), kept in `doc.meta`. */
  meta?: keyof DocumentMeta;
  /** The lines as read, written back unchanged while the property is not changed. */
  lines?: string[];
}

/** The keys of `doc.meta`, in the order they are written, with the key they are written as. */
const META_KEYS: [keyof DocumentMeta, string][] = [
  ['title', 'title'],
  ['author', 'author'],
  ['date', 'date'],
  ['subject', 'subject'],
  ['description', 'description'],
  ['keywords', 'keywords'],
  ['language', 'lang'],
  ['license', 'license'],
  ['identifier', 'identifier'],
  ['source', 'source'],
];

const DATE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?$/;

/** A scalar of the front matter, typed. */
export function typed(raw: string): PropertyValue {
  const v = raw.trim();
  if (/^(true|false)$/i.test(v)) return { kind: 'bool', value: v.toLowerCase() === 'true' };
  if (/^-?\d+(\.\d+)?$/.test(v)) return { kind: 'number', value: Number(v) };
  const text = unquote(v);
  if (text === null) return { kind: 'raw', text: v };
  if (DATE.test(text) && !/^["']/.test(v)) return { kind: 'date', value: text };
  return { kind: 'text', text };
}

/** The top-level entries of the verbatim lines: each key with its continuation lines. */
function entries(extra: string): { key: string; lines: string[] }[] {
  const out: { key: string; lines: string[] }[] = [];
  for (const line of extra.split('\n')) {
    const key = /^([A-Za-z_][\w-]*):(?:\s|$)/.exec(line)?.[1];
    if (key) out.push({ key, lines: [line] });
    // A comment of its own (not indented) stays in its place, between the keys.
    else if (line.startsWith('#') || !out.length) out.push({ key: '', lines: [line] });
    else out[out.length - 1]!.lines.push(line);
  }
  return out;
}

function valueOf(lines: string[]): PropertyValue {
  const first = lines[0]!;
  const after = first.slice(first.indexOf(':') + 1).trim();
  const rest = lines.slice(1).filter((l) => l.trim());
  if (after) {
    if (rest.length) return { kind: 'raw', text: [after, ...rest].join('\n') };
    if (after.startsWith('[')) {
      const list = inlineList(after);
      return list ? { kind: 'list', items: list, inline: true } : { kind: 'raw', text: after };
    }
    return typed(after);
  }
  if (!rest.length) return { kind: 'text', text: '' };
  if (rest.every((l) => /^\s+-\s+/.test(l))) {
    const items = rest.map((l) => unquote(l.replace(/^\s+-\s+/, '')));
    if (items.every((i): i is string => i !== null)) return { kind: 'list', items };
  }
  return { kind: 'raw', text: rest.join('\n') };
}

/** The properties of a note: the document properties, then the other keys, in order. */
export function readProperties(meta: DocumentMeta, extra = ''): Property[] {
  const out: Property[] = [];
  const m = cleanMeta(meta);
  for (const [key, written] of META_KEYS) {
    const v = m[key];
    if (v === undefined) continue;
    out.push({ key: written, meta: key, value: Array.isArray(v) ? { kind: 'list', items: v, inline: true } : key === 'date' && DATE.test(v) ? { kind: 'date', value: v } : { kind: 'text', text: v } });
  }
  for (const e of entries(extra)) {
    if (!e.key) out.push({ key: '', value: { kind: 'raw', text: e.lines.join('\n') }, lines: e.lines });
    else out.push({ key: e.key, value: valueOf(e.lines), lines: e.lines });
  }
  return out;
}

/** A value as YAML lines for `key`. */
function writeValue(key: string, value: PropertyValue): string[] {
  switch (value.kind) {
    case 'text':
      return [value.text ? `${key}: ${scalar(value.text)}` : `${key}:`];
    case 'list':
      if (!value.items.length) return [`${key}: []`];
      return value.inline ? [`${key}: [${value.items.map((i) => (i.includes(',') ? JSON.stringify(i) : scalar(i))).join(', ')}]`] : [`${key}:`, ...value.items.map((i) => `  - ${scalar(i)}`)];
    case 'bool':
      return [`${key}: ${value.value}`];
    case 'number':
      return [`${key}: ${value.value}`];
    case 'date':
      return [`${key}: ${value.value}`];
    case 'raw':
      return value.text.includes('\n') || !value.text ? [`${key}:`, ...value.text.split('\n').map((l) => (/^\s/.test(l) ? l : `  ${l}`))] : [`${key}: ${value.text}`];
  }
}

/** Back to `doc.meta` and the verbatim lines; a property unchanged keeps its lines. */
export function writeProperties(props: Property[]): { meta: DocumentMeta; extra: string } {
  const meta: DocumentMeta = {};
  const lines: string[] = [];
  for (const p of props) {
    if (p.meta) {
      const v = p.value;
      if (p.meta === 'keywords') {
        if (v.kind === 'list') meta.keywords = v.items;
      } else {
        const text = v.kind === 'text' ? v.text : v.kind === 'date' ? v.value : v.kind === 'raw' ? v.text : String(v.kind === 'list' ? v.items.join(', ') : v.value);
        if (text) meta[p.meta] = text as never;
      }
      continue;
    }
    lines.push(...(p.lines ?? writeValue(p.key, p.value)));
  }
  return { meta: cleanMeta(meta), extra: lines.join('\n') };
}

/** A property changed: its lines are written again from its value. */
export const changed = (p: Property, value: PropertyValue): Property => {
  const { lines: _lines, ...rest } = p;
  return { ...rest, value };
};

/** A new property; the document properties keep their place in `doc.meta`. */
export function newProperty(key: string, kind: PropertyValue['kind']): Property {
  const metaKey = META_KEYS.find(([, k]) => k === key.toLowerCase())?.[0];
  const value: PropertyValue = kind === 'list' ? { kind, items: [] } : kind === 'bool' ? { kind, value: false } : kind === 'number' ? { kind, value: 0 } : kind === 'date' ? { kind, value: new Date().toISOString().slice(0, 10) } : kind === 'raw' ? { kind, text: '' } : { kind: 'text', text: '' };
  return { key, value, ...(metaKey ? { meta: metaKey } : {}) };
}

/** Keys whose values are tags, and lists of note names. */
export const TAG_KEYS = /^(tags|keywords|tag)$/i;
export const LINK = /^\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]$/;
