/**
 * Editor content as "parts" for real-time collaboration (COLLAB-002): small
 * JSON strings that are diffed into a shared Yjs document, so that two people
 * editing different cells or paragraphs never overwrite each other.
 *
 * - `keys`: independent parts addressed by a stable key (a spreadsheet cell, a
 *   sheet's settings, an image, the document properties);
 * - `list`: ordered parts (the paragraphs of a document).
 */
import { cleanValidations } from '../sheet/validation';
import { cleanConditional } from '../sheet/conditional';
import type { Block, RichDocument } from '../document/model';
import type { Sheet, Workbook } from '../sheet/model';

export interface CollabParts {
  keys: Record<string, string>;
  list: string[];
}

/** Where a participant is, as shown to the others. */
export interface PeerCursor {
  name: string;
  color: string;
  cursor: unknown;
}

/** What an editor provides to be edited by several people at once. */
export interface CollabAdapter {
  /** Current content. */
  read(): CollabParts;
  /** Replace the content with the shared one (a remote change). */
  write(parts: CollabParts): void;
  /** Where this user is working (selected cell, paragraph…). */
  cursor?(): unknown;
  /** Show where the others are. */
  showPeers?(peers: PeerCursor[]): void;
}

const bytesToB64 = (bytes: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const b64ToBytes = (b64: string): Uint8Array => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** JSON that also carries bytes and maps, with sorted object keys (stable output for diffing). */
export function stringify(value: unknown): string {
  const prepare = (v: unknown): unknown => {
    if (v instanceof Uint8Array) return { $b64: bytesToB64(v) };
    if (v instanceof Map) return { $map: [...v.entries()].map(([k, x]) => [k, prepare(x)]) };
    if (Array.isArray(v)) return v.map(prepare);
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(v).sort()) {
        const x = (v as Record<string, unknown>)[key];
        if (x !== undefined) out[key] = prepare(x);
      }
      return out;
    }
    return v;
  };
  return JSON.stringify(prepare(value));
}

export function parse<T = unknown>(text: string): T {
  return JSON.parse(text, (_key, v: unknown) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const o = v as Record<string, unknown>;
      if (typeof o.$b64 === 'string' && Object.keys(o).length === 1) return b64ToBytes(o.$b64);
      if (Array.isArray(o.$map) && Object.keys(o).length === 1) return new Map(o.$map as [unknown, unknown][]);
    }
    return v;
  }) as T;
}

// --- spreadsheets --------------------------------------------------------------

/** One part per sheet (`s:<index>`: name, widths, charts) and per cell (`c:<sheet>:<row>,<col>`). */
export function workbookParts(wb: Workbook): CollabParts {
  const keys: Record<string, string> = {};
  wb.sheets.forEach((sheet, i) => {
    const { cells, ...settings } = sheet;
    keys[`s:${i}`] = stringify(settings);
    for (const [key, cell] of cells) keys[`c:${i}:${key}`] = stringify(cell);
  });
  return { keys, list: [] };
}

export function partsWorkbook(parts: CollabParts): Workbook {
  const sheets: Sheet[] = [];
  for (const [key, text] of Object.entries(parts.keys)) {
    const m = /^s:(\d+)$/.exec(key);
    if (!m) continue;
    const settings = parse<Omit<Sheet, 'cells'>>(text);
    // SHEET-028: only well-formed validations from the other side.
    const validations = cleanValidations(settings.validations);
    if (validations) settings.validations = validations;
    else delete settings.validations;
    const conditional = cleanConditional(settings.conditional);
    if (conditional) settings.conditional = conditional;
    else delete settings.conditional;
    sheets[Number(m[1])] = { ...settings, cells: new Map() };
  }
  for (const [key, text] of Object.entries(parts.keys)) {
    const m = /^c:(\d+):(.+)$/.exec(key);
    if (m) sheets[Number(m[1])]?.cells.set(m[2]!, parse(text));
  }
  const dense = sheets.filter(Boolean);
  return { sheets: dense.length ? dense : [{ name: 'Sheet1', cells: new Map() }] };
}

// --- text documents ------------------------------------------------------------

/** Properties (`meta`), one part per image (`r:<key>`), one list item per block. */
export function documentParts(doc: RichDocument, blocks: Block[]): CollabParts {
  const keys: Record<string, string> = { meta: stringify(doc.meta) };
  if (doc.page) keys.page = stringify(doc.page);
  if (doc.references) keys.references = stringify(doc.references);
  for (const [key, res] of doc.resources) keys[`r:${key}`] = stringify(res);
  return { keys, list: blocks.map((b) => stringify(b)) };
}

/** Bring `doc` to the shared properties and images; returns the shared blocks. */
export function applyDocumentParts(doc: RichDocument, parts: CollabParts): Block[] {
  if (parts.keys.meta) doc.meta = parse(parts.keys.meta);
  if (parts.keys.page) doc.page = parse(parts.keys.page);
  else delete doc.page;
  if (parts.keys.references) doc.references = parse(parts.keys.references);
  else delete doc.references;
  for (const [key, text] of Object.entries(parts.keys)) {
    if (key.startsWith('r:') && !doc.resources.has(key.slice(2))) doc.resources.set(key.slice(2), parse(text));
  }
  const blocks = parts.list.map((text) => parse<Block>(text));
  return blocks.length ? blocks : [{ type: 'paragraph', style: 'normal', runs: [] }];
}
