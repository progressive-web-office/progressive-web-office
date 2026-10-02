/**
 * Bibliography (DOC-027): BibTeX entries, citations numbered or by author and
 * year, and the formatted list of references.
 */
import type { Block, CiteRun, References, Run, TextRun } from './model';
import { allParagraphs, isCiteRun, isFootnoteRun } from './model';

export interface BibEntry {
  key: string;
  /** BibTeX entry type: article, book, inproceedings, misc… */
  type: string;
  /** Field values as plain text (LaTeX accents and braces removed). */
  fields: Record<string, string>;
}

export interface Person {
  family: string;
  given?: string;
}

// --- BibTeX ---------------------------------------------------------------------

const ACCENTS: Record<string, string> = { "'": '́', '`': '̀', '^': '̂', '"': '̈', '~': '̃', '=': '̄', '.': '̇', c: '̧', v: '̌', u: '̆', H: '̋', k: '̨', r: '̊' };
const SYMBOLS: Record<string, string> = { ss: 'ß', o: 'ø', O: 'Ø', ae: 'æ', AE: 'Æ', oe: 'œ', OE: 'Œ', aa: 'å', AA: 'Å', l: 'ł', L: 'Ł', i: 'ı', j: 'ȷ', '&': '&', '%': '%', $: '$', '#': '#', _: '_', textendash: '–', textemdash: '—' };

/** BibTeX field text as plain Unicode: accents, `--`, braces and `~`. */
export function bibText(value: string): string {
  return value
    .replace(/\\([`'^"~=.])\s*\{?\\?([A-Za-z])\}?/g, (_, acc: string, ch: string) => (ch + ACCENTS[acc]!).normalize('NFC'))
    .replace(/\\([cvuHkr])\s*\{\\?([A-Za-z])\}/g, (_, acc: string, ch: string) => (ch + ACCENTS[acc]!).normalize('NFC'))
    .replace(/\\([cvuHkr]) ([A-Za-z])/g, (_, acc: string, ch: string) => (ch + ACCENTS[acc]!).normalize('NFC'))
    .replace(/\\(ss|o|O|ae|AE|oe|OE|aa|AA|l|L|i|j|textendash|textemdash)\b\s?|\\([&%$#_])/g, (_, a?: string, b?: string) => SYMBOLS[(a ?? b)!]!)
    .replace(/\\(?:emph|textit|textbf|textsc|textrm|texttt|mbox|url)\s*\{/g, '{')
    .replace(/---/g, '—')
    .replace(/--/g, '–')
    .replace(/~/g, ' ')
    .replace(/[{}]/g, '')
    .replace(/[ \t\r\n]+/g, ' ')
    .trim();
}

/** Entries of a BibTeX file; `@string` abbreviations are expanded, `@comment` and `@preamble` skipped. */
export function parseBibtex(src: string): BibEntry[] {
  const entries: BibEntry[] = [];
  const strings: Record<string, string> = { jan: 'January', feb: 'February', mar: 'March', apr: 'April', may: 'May', jun: 'June', jul: 'July', aug: 'August', sep: 'September', oct: 'October', nov: 'November', dec: 'December' };
  let i = 0;
  const skipSpace = (): void => {
    while (i < src.length && /\s/.test(src[i]!)) i++;
  };
  /** A braced or quoted value, or a bare word / number; `#` concatenates. */
  const value = (): string => {
    let out = '';
    for (;;) {
      skipSpace();
      const c = src[i];
      if (c === '{') {
        let depth = 0;
        const start = i + 1;
        for (; i < src.length; i++) {
          if (src[i] === '\\') i++;
          else if (src[i] === '{') depth++;
          else if (src[i] === '}' && --depth === 0) break;
        }
        out += src.slice(start, i++);
      } else if (c === '"') {
        let depth = 0;
        const start = ++i;
        for (; i < src.length; i++) {
          if (src[i] === '\\') i++;
          else if (src[i] === '{') depth++;
          else if (src[i] === '}') depth--;
          else if (src[i] === '"' && depth === 0) break;
        }
        out += src.slice(start, i++);
      } else {
        const m = /^[^\s,#}]+/.exec(src.slice(i));
        if (!m) break;
        i += m[0].length;
        out += strings[m[0].toLowerCase()] ?? m[0];
      }
      skipSpace();
      if (src[i] !== '#') break;
      i++;
    }
    return out;
  };
  while ((i = src.indexOf('@', i)) >= 0) {
    i++;
    const type = /^[A-Za-z]+/.exec(src.slice(i))?.[0]?.toLowerCase();
    if (!type) continue;
    i += type.length;
    skipSpace();
    const open = src[i];
    if (open !== '{' && open !== '(') continue;
    const close = open === '{' ? '}' : ')';
    i++;
    if (type === 'comment' || type === 'preamble') {
      let depth = 1;
      for (; i < src.length && depth; i++) {
        if (src[i] === open) depth++;
        else if (src[i] === close) depth--;
      }
      continue;
    }
    if (type === 'string') {
      skipSpace();
      const name = /^[^\s=]+/.exec(src.slice(i))?.[0] ?? '';
      i += name.length;
      skipSpace();
      if (src[i] === '=') i++;
      strings[name.toLowerCase()] = value();
      skipSpace();
      if (src[i] === close) i++;
      continue;
    }
    skipSpace();
    const key = /^[^\s,]+/.exec(src.slice(i))?.[0] ?? '';
    i += key.length;
    const fields: Record<string, string> = {};
    for (;;) {
      skipSpace();
      if (src[i] === ',') i++;
      skipSpace();
      if (i >= src.length || src[i] === close) {
        i++;
        break;
      }
      const name = /^[^\s=,}]+/.exec(src.slice(i))?.[0];
      if (!name) {
        i++;
        continue;
      }
      i += name.length;
      skipSpace();
      if (src[i] !== '=') continue;
      i++;
      const v = bibText(value());
      if (v) fields[name.toLowerCase()] = v;
    }
    if (key) entries.push({ key, type, fields });
  }
  return entries;
}

const bibEscape = (v: string): string => v.replace(/[{}]/g, '').replace(/[&%$#_]/g, (c) => `\\${c}`);

/** Entries as BibTeX (UTF-8, braced values). */
export function writeBibtex(entries: BibEntry[]): string {
  return entries
    .map((e) => {
      const fields = Object.entries(e.fields).map(([k, v]) => `  ${k} = {${k === 'url' || k === 'doi' ? v.replace(/[{}]/g, '') : bibEscape(v)}}`);
      return `@${e.type}{${e.key},\n${fields.join(',\n')}\n}`;
    })
    .join('\n\n')
    .concat(entries.length ? '\n' : '');
}

// --- people, years ---------------------------------------------------------------

/** BibTeX names ("Knuth, Donald E. and Leslie Lamport"). */
export function parseNames(value: string | undefined): Person[] {
  if (!value) return [];
  return value
    .split(/\s+and\s+/)
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => {
      if (name.includes(',')) {
        const [family = '', given = ''] = name.split(',').map((s) => s.trim());
        return given ? { family, given } : { family };
      }
      if (name.toLowerCase() === 'others') return { family: 'others' };
      const parts = name.split(/\s+/);
      // "Ludwig van Beethoven": the family name starts at the first lower-case particle.
      const particle = parts.findIndex((p, i) => i > 0 && i < parts.length - 1 && /^[a-z]/.test(p));
      const at = particle > 0 ? particle : parts.length - 1;
      const given = parts.slice(0, at).join(' ');
      return given ? { family: parts.slice(at).join(' '), given } : { family: parts.slice(at).join(' ') };
    });
}

export const writeNames = (people: Person[]): string => people.map((p) => (p.given ? `${p.family}, ${p.given}` : p.family)).join(' and ');

const initials = (given: string): string =>
  given
    .split(/(\s+|-)/)
    .map((part) => (/^\s+$/.test(part) ? ' ' : part === '-' ? '-' : part ? `${part[0]}.` : ''))
    .join('')
    .replace(/\s+/g, ' ');

export const year = (e: BibEntry): string => e.fields.year ?? /\d{4}/.exec(e.fields.date ?? '')?.[0] ?? 'n.d.';

function authorsOf(e: BibEntry): Person[] {
  const people = parseNames(e.fields.author);
  return people.length ? people : parseNames(e.fields.editor);
}

/** "Knuth", "Knuth & Lamport", "Knuth et al." */
export function shortAuthors(e: BibEntry): string {
  const people = authorsOf(e).filter((p) => p.family !== 'others');
  if (!people.length) return e.fields.title ?? e.key;
  if (people.length === 1 && authorsOf(e).length === 1) return people[0]!.family;
  if (people.length === 2 && authorsOf(e).length === 2) return `${people[0]!.family} & ${people[1]!.family}`;
  return `${people[0]!.family} et al.`;
}

// --- citations ---------------------------------------------------------------------

export type CitationStyle = 'numeric' | 'author-year';

export interface Citations {
  /** `[1]` citations (otherwise author and year). */
  numeric: boolean;
  /** Number of each cited entry, in order of first citation (numeric style). */
  numbers: Map<string, number>;
  /** Entries in the order of the list of references. */
  cited: BibEntry[];
  /** The text of a citation: `[1, 3]` or `(Knuth, 1984; Lamport, 1994)`. */
  text(cite: CiteRun): string;
}

/** Citations of the document, in reading order (footnotes included). */
export function citeRuns(blocks: Block[]): CiteRun[] {
  const out: CiteRun[] = [];
  const visit = (runs: Run[]): void => {
    for (const r of runs) {
      if (isCiteRun(r)) out.push(r);
      else if (isFootnoteRun(r)) visit(r.footnote);
    }
  };
  for (const p of allParagraphs(blocks)) visit(p.runs);
  return out;
}

export function citations(blocks: Block[], refs: References | undefined): Citations {
  return citationsOf(citeRuns(blocks), refs);
}

/** Citation numbers and texts from the citations in reading order. */
export function citationsOf(all: CiteRun[], refs: References | undefined): Citations {
  const entries = new Map((refs?.entries ?? []).map((e) => [e.key, e]));
  const style = refs?.style ?? 'numeric';
  const numbers = new Map<string, number>();
  for (const c of all) for (const key of c.cite) if (entries.has(key) && !numbers.has(key)) numbers.set(key, numbers.size + 1);
  let cited = [...numbers.keys()].map((k) => entries.get(k)!);
  if (style === 'author-year') cited = cited.sort((a, b) => shortAuthors(a).localeCompare(shortAuthors(b)) || year(a).localeCompare(year(b)));
  const text = (cite: CiteRun): string => {
    const locator = cite.locator ? `, ${cite.locator}` : '';
    if (style === 'numeric') return `[${cite.cite.map((k) => numbers.get(k) ?? '?').join(', ')}${locator}]`;
    return `(${cite.cite.map((k) => (entries.has(k) ? `${shortAuthors(entries.get(k)!)}, ${year(entries.get(k)!)}` : `${k}?`)).join('; ')}${locator})`;
  };
  return { numeric: style === 'numeric', numbers, cited, text };
}

// --- the list of references -----------------------------------------------------------

/** A reference in the list, roughly APA: authors (year). Title. Container, volume(number), pages. Publisher. DOI. */
export function formatEntry(e: BibEntry): TextRun[] {
  const f = e.fields;
  const people = authorsOf(e);
  const names = people.map((p) => (p.family === 'others' ? 'et al.' : p.given ? `${p.family}, ${initials(p.given)}` : p.family));
  const authors = names.length > 1 ? `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}` : (names[0] ?? '');
  const runs: TextRun[] = [];
  const add = (text: string, italic = false): void => {
    if (text) runs.push(italic ? { text, italic } : { text });
  };
  const edited = !f.author && f.editor ? ' (Ed.)' : '';
  add(authors ? `${authors}${edited} (${year(e)}). ` : `(${year(e)}). `);
  const container = f.journal ?? f.booktitle ?? f.journaltitle;
  const standalone = !container;
  add(`${f.title ?? e.key}${f.title && /[.?!]$/.test(f.title) ? '' : '.'}`, standalone && e.type !== 'misc');
  if (container) {
    add(' ');
    if (f.booktitle && !f.journal) add('In ');
    add(container, true);
    const vol = f.volume ? `, ${f.volume}${f.number ? `(${f.number})` : ''}` : '';
    add(`${vol}${f.pages ? `, ${f.pages}` : ''}.`);
  }
  const publisher = f.publisher ?? f.institution ?? f.school ?? f.organization;
  if (publisher) add(` ${publisher}.`);
  if (f.note) add(` ${f.note}${/[.?!]$/.test(f.note) ? '' : '.'}`);
  const link = f.doi ? `https://doi.org/${f.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, '')}` : f.url;
  if (link) {
    add(' ');
    runs.push({ text: link, link });
  }
  return runs;
}

/** A short line to choose an entry: "Knuth (1984) — The TeXbook". */
export const entrySummary = (e: BibEntry): string => `${shortAuthors(e)} (${year(e)}) — ${e.fields.title ?? e.key}`;

// --- CSL (pandoc's `references:`) ---------------------------------------------------------

const CSL_TYPES: Record<string, string> = { article: 'article-journal', book: 'book', inbook: 'chapter', incollection: 'chapter', inproceedings: 'paper-conference', conference: 'paper-conference', phdthesis: 'thesis', mastersthesis: 'thesis', techreport: 'report', manual: 'book', misc: 'document', online: 'webpage', unpublished: 'manuscript' };
const BIB_TYPES: Record<string, string> = Object.fromEntries([...Object.entries(CSL_TYPES).reverse()].map(([b, c]) => [c, b]));
const CSL_FIELDS: [string, string][] = [['title', 'title'], ['journal', 'container-title'], ['booktitle', 'container-title'], ['volume', 'volume'], ['number', 'issue'], ['pages', 'page'], ['publisher', 'publisher'], ['address', 'publisher-place'], ['doi', 'DOI'], ['url', 'URL'], ['isbn', 'ISBN'], ['note', 'note'], ['abstract', 'abstract']];

/** An entry as CSL JSON, as pandoc reads it in `references:`. */
export function toCsl(e: BibEntry): Record<string, unknown> {
  const out: Record<string, unknown> = { id: e.key, type: CSL_TYPES[e.type] ?? 'document' };
  const author = parseNames(e.fields.author);
  if (author.length) out.author = author;
  const editor = parseNames(e.fields.editor);
  if (editor.length) out.editor = editor;
  const y = Number(year(e));
  if (Number.isFinite(y)) out.issued = { 'date-parts': [[y]] };
  for (const [bib, csl] of CSL_FIELDS) if (e.fields[bib] && out[csl] === undefined) out[csl] = e.fields[bib];
  if (e.type !== (BIB_TYPES[out.type as string] ?? 'misc')) out['pwo-bibtype'] = e.type;
  return out;
}

export function fromCsl(c: Record<string, unknown>): BibEntry | undefined {
  if (typeof c.id !== 'string' && typeof c.id !== 'number') return undefined;
  const type = typeof c['pwo-bibtype'] === 'string' ? c['pwo-bibtype'] : (BIB_TYPES[String(c.type)] ?? 'misc');
  const fields: Record<string, string> = {};
  const names = (v: unknown): string => (Array.isArray(v) ? writeNames(v.map((p: Person & { literal?: string }) => (p.literal ? { family: p.literal } : p))) : '');
  if (names(c.author)) fields.author = names(c.author);
  if (names(c.editor)) fields.editor = names(c.editor);
  const issued = (c.issued as { 'date-parts'?: number[][] } | undefined)?.['date-parts']?.[0]?.[0];
  if (issued) fields.year = String(issued);
  for (const [bib, csl] of CSL_FIELDS) {
    const v = c[csl];
    if (typeof v === 'string' || typeof v === 'number') {
      if (csl === 'container-title') fields[type === 'article' ? 'journal' : 'booktitle'] ??= String(v);
      else fields[bib] ??= String(v);
    }
  }
  return { key: String(c.id), type, fields };
}
