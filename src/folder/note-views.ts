/**
 * NOTE-003: views of the notes of a folder, kept as a file of the folder
 * (`People.view.yaml`): which notes (a folder, filters), which properties as
 * columns, their order, and how they are shown — a table, cards, or a board
 * of columns by the value of a property. Written in the same small YAML as
 * the front matter of the notes; filters are comparisons, never code run.
 *
 * ```yaml
 * title: People
 * from: People
 * where:
 *   - type = Person
 *   - organization contains engine
 * columns: [name, organization, role, last contact]
 * sort: [-last contact, name]
 * layout: table
 * group: status
 * groups: [todo, doing, done]
 * ```
 */
import { parseFrontMatter } from '../document/frontmatter';
import { readProperties, type PropertyValue } from '../document/note-properties';
import type { NoteTables } from '../code/note-tables';

export type ViewLayout = 'table' | 'cards' | 'board';
export const VIEW_LAYOUTS: ViewLayout[] = ['table', 'cards', 'board'];

export interface ViewSpec {
  title?: string;
  /** The folder of the notes (and of those made from the view); all of them when empty. */
  from?: string;
  /** Filters, all of them holding. */
  where: string[];
  columns: string[];
  /** Columns to sort by, `-` first for the largest first. */
  sort: string[];
  layout: ViewLayout;
  /** The property of the columns of a board. */
  group?: string;
  /** The columns of the board, in this order (others follow). */
  groups: string[];
}

/** The keys of a view file, in the order they are written. */
const KEYS = ['title', 'from', 'where', 'columns', 'sort', 'layout', 'group', 'groups'] as const;

export const DEFAULT_VIEW: ViewSpec = { where: [], columns: ['name'], sort: ['name'], layout: 'table', groups: [] };

const items = (v: PropertyValue | undefined): string[] =>
  !v ? [] : v.kind === 'list' ? v.items : v.kind === 'text' ? (v.text ? [v.text] : []) : v.kind === 'raw' ? [v.text] : v.kind === 'bool' ? [String(v.value)] : [String(v.value)];

/** The view a file describes; what it does not say takes the defaults. */
export function readViewSpec(text: string): ViewSpec {
  const { meta, extra } = parseFrontMatter(`---\n${text.replace(/^---\s*\n/, '').replace(/\n---\s*$/, '')}\n---\n`);
  const props = new Map(readProperties(meta, extra).filter((p) => p.key).map((p) => [p.key.toLowerCase(), p.value]));
  const one = (key: string): string | undefined => items(props.get(key))[0]?.trim() || undefined;
  const layout = one('layout') as ViewLayout | undefined;
  const columns = items(props.get('columns')).map((c) => c.trim()).filter(Boolean);
  return {
    ...(one('title') ? { title: one('title')! } : {}),
    ...(one('from') ? { from: one('from')!.replace(/^\/+|\/+$/g, '') } : {}),
    where: items(props.get('where')).map((w) => w.trim()).filter(Boolean),
    columns: columns.length ? columns : [...DEFAULT_VIEW.columns],
    sort: items(props.get('sort')).map((s) => s.trim()).filter(Boolean),
    layout: layout && VIEW_LAYOUTS.includes(layout) ? layout : 'table',
    ...(one('group') ? { group: one('group')! } : {}),
    groups: items(props.get('groups')).map((g) => g.trim()).filter(Boolean),
  };
}

/** A scalar of the view file, quoted when plain YAML could misread it. */
const yaml = (s: string): string => (/^[\w À-￿.,/()+\-@&%~?!*'=<>]*$/.test(s) && !/^(-(\s|$)|[?!*&'])|^(true|false|null|yes|no|\d[\d.]*)$/i.test(s.trim()) && s.trim() === s ? s : JSON.stringify(s));

/** The view as the text of its file. */
export function writeViewSpec(spec: ViewSpec): string {
  const lines: string[] = [];
  for (const key of KEYS) {
    const v = spec[key];
    if (Array.isArray(v)) {
      if (!v.length) continue;
      if (key === 'where') lines.push(`${key}:`, ...v.map((x) => `  - ${yaml(x)}`));
      else lines.push(`${key}: [${v.map((x) => (x.includes(',') ? JSON.stringify(x) : yaml(x))).join(', ')}]`);
    } else if (v) lines.push(`${key}: ${yaml(v)}`);
  }
  return `${lines.join('\n')}\n`;
}

// --- the notes ---------------------------------------------------------------

export interface NoteRecord {
  path: string;
  name: string;
  folder: string;
  modified?: string;
  /** Values of the properties, by lower-case key, as written. */
  props: Map<string, (string | number)[]>;
  /** The keys as written, by lower-case key. */
  keys: Map<string, string>;
  tags: string[];
  tasks: { done: number; total: number };
}

/** The notes of the tables of the folder, as records. */
export function noteRecords(tables: NoteTables): NoteRecord[] {
  const byPath = new Map<string, NoteRecord>();
  for (const [path, name, folder, , modified] of tables.notes) byPath.set(path, { path, name, folder, ...(modified ? { modified } : {}), props: new Map(), keys: new Map(), tags: [], tasks: { done: 0, total: 0 } });
  for (const [path, key, , value] of tables.props) {
    const r = byPath.get(path);
    if (!r || value === null) continue;
    const k = key.toLowerCase();
    r.props.set(k, [...(r.props.get(k) ?? []), value]);
    if (!r.keys.has(k)) r.keys.set(k, key);
  }
  for (const [path, tag] of tables.tags) byPath.get(path)?.tags.push(tag);
  for (const [path, , , done] of tables.tasks) {
    const r = byPath.get(path);
    if (!r) continue;
    r.tasks.total++;
    r.tasks.done += done;
  }
  return [...byPath.values()];
}

/** Columns computed from the note rather than read from its properties. */
export const FILE_COLUMNS = ['name', 'path', 'folder', 'modified', 'tags', 'tasks'] as const;
const isFileColumn = (c: string): boolean => (FILE_COLUMNS as readonly string[]).includes(c.toLowerCase());

/** The values of a column of a note. */
export function valuesOf(r: NoteRecord, column: string): (string | number)[] {
  switch (column.toLowerCase()) {
    case 'name':
      return [r.name];
    case 'path':
      return [r.path];
    case 'folder':
      return [r.folder];
    case 'modified':
      return r.modified ? [r.modified] : [];
    case 'tags': {
      const own = r.props.get('tags') ?? [];
      return [...new Set([...own.map(String), ...r.tags])];
    }
    case 'tasks':
      return r.tasks.total ? [`${r.tasks.done}/${r.tasks.total}`] : [];
    default:
      return r.props.get(column.toLowerCase()) ?? [];
  }
}

/** Whether a column can be changed in place (a property, not a computed column). */
export const editable = (column: string): boolean => !isFileColumn(column) || column.toLowerCase() === 'tags';

/** `[[Ada Lovelace|Ada]]` → `ada lovelace`; other values lower-case. */
const norm = (v: string | number): string => String(v).replace(/^\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]$/, '$1').trim().toLowerCase();
const num = (v: string | number): number | undefined => (typeof v === 'number' ? v : /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : undefined);

function compare(a: string | number, b: string | number): number {
  const x = num(a);
  const y = num(b);
  if (x !== undefined && y !== undefined) return x - y;
  return norm(a).localeCompare(norm(b), undefined, { numeric: true });
}

export interface Filter {
  key: string;
  op: '=' | '!=' | '<' | '<=' | '>' | '>=' | 'contains' | '!contains' | 'has' | '!has';
  value: string;
}

const OPS = ['!contains', 'contains', '!=', '<=', '>=', '=', '<', '>'] as const;

/**
 * A filter as written: `status = done`, `due <= today`, `title contains
 * engine`, `has due`, `!has due`, `#project` (a tag), `!#archive`. Values may
 * be quoted; `today` is the day of today. Undefined when it cannot be read.
 */
export function parseFilter(text: string): Filter | undefined {
  const s = text.trim();
  const tag = /^(!?)#([^\s#]+)$/.exec(s);
  if (tag) return { key: 'tags', op: tag[1] ? '!=' : '=', value: tag[2]! };
  const has = /^(!?)has\s+(.+)$/i.exec(s);
  if (has) return { key: has[2]!.trim(), op: has[1] ? '!has' : 'has', value: '' };
  for (const op of OPS) {
    const at = op === 'contains' || op === '!contains' ? s.search(new RegExp(`\\s${op.replace('!', '!')}\\s`, 'i')) : s.indexOf(op);
    if (at <= 0) continue;
    const key = s.slice(0, at).trim();
    let value = s.slice(at + (op === 'contains' || op === '!contains' ? op.length + 2 : op.length)).trim();
    if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    if (!key || /[<>=!]$/.test(key)) continue;
    return { key, op, value };
  }
  return undefined;
}

/** Whether a note passes a filter. */
export function passes(r: NoteRecord, f: Filter, today: string): boolean {
  const values = valuesOf(r, f.key);
  if (f.op === 'has') return values.length > 0;
  if (f.op === '!has') return values.length === 0;
  const want = f.value.toLowerCase() === 'today' ? today : f.value;
  const any = (test: (v: string | number) => boolean): boolean => values.some(test);
  switch (f.op) {
    case '=':
      return any((v) => norm(v) === norm(want));
    case '!=':
      return !any((v) => norm(v) === norm(want));
    case 'contains':
      return any((v) => norm(v).includes(norm(want)));
    case '!contains':
      return !any((v) => norm(v).includes(norm(want)));
    case '<':
      return any((v) => compare(v, want) < 0);
    case '<=':
      return any((v) => compare(v, want) <= 0);
    case '>':
      return any((v) => compare(v, want) > 0);
    case '>=':
      return any((v) => compare(v, want) >= 0);
  }
  return false;
}

export interface ViewResult {
  rows: NoteRecord[];
  /** Filters that could not be read. */
  invalid: string[];
  /** The columns of a board, each with its notes (`''`: no value). */
  groups: { value: string; rows: NoteRecord[] }[];
}

/** The notes of a view, filtered, sorted, and grouped for a board. */
export function applyView(spec: ViewSpec, records: NoteRecord[], today: string, viewPath?: string): ViewResult {
  const filters = spec.where.map((w) => [w, parseFilter(w)] as const);
  const invalid = filters.filter(([, f]) => !f).map(([w]) => w);
  const from = spec.from ? `${spec.from}/` : '';
  const rows = records.filter((r) => r.path !== viewPath && (!from || r.path.startsWith(from)) && filters.every(([, f]) => !f || passes(r, f, today)));
  const keys = (spec.sort.length ? spec.sort : ['name']).map((s) => (s.startsWith('-') ? { key: s.slice(1).trim(), dir: -1 } : { key: s, dir: 1 }));
  rows.sort((a, b) => {
    for (const { key, dir } of keys) {
      const x = valuesOf(a, key)[0];
      const y = valuesOf(b, key)[0];
      // Notes without the value go last, whatever the order.
      if (x === undefined || y === undefined) {
        if (x !== y) return x === undefined ? 1 : -1;
        continue;
      }
      const c = compare(x, y);
      if (c) return c * dir;
    }
    return a.path.localeCompare(b.path);
  });
  const groups: ViewResult['groups'] = [];
  if (spec.group) {
    const at = new Map<string, NoteRecord[]>();
    for (const g of spec.groups) at.set(norm(g), []);
    const label = new Map(spec.groups.map((g) => [norm(g), g]));
    for (const r of rows) {
      const v = valuesOf(r, spec.group)[0];
      const key = v === undefined ? '' : norm(v);
      if (!label.has(key)) label.set(key, v === undefined ? '' : String(v));
      at.set(key, [...(at.get(key) ?? []), r]);
    }
    // The columns named first, in their order; then the others; no value last.
    const order = [...at.keys()].sort((a, b) => {
      const ia = spec.groups.findIndex((g) => norm(g) === a);
      const ib = spec.groups.findIndex((g) => norm(g) === b);
      if (ia >= 0 || ib >= 0) return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib);
      if (!a || !b) return a ? -1 : 1;
      return a.localeCompare(b, undefined, { numeric: true });
    });
    for (const key of order) groups.push({ value: label.get(key) ?? key, rows: at.get(key)! });
  }
  return { rows, invalid, groups };
}

/** The properties used by the notes, the most used first: what the columns and the board may show. */
export function knownColumns(records: NoteRecord[]): string[] {
  const count = new Map<string, { key: string; n: number }>();
  for (const r of records) for (const [k, key] of r.keys) count.set(k, { key: count.get(k)?.key ?? key, n: (count.get(k)?.n ?? 0) + 1 });
  const props = [...count.values()].sort((a, b) => b.n - a.n || a.key.localeCompare(b.key)).map((c) => c.key).filter((k) => !isFileColumn(k));
  return [...FILE_COLUMNS, ...props];
}

/**
 * What a note made from the view holds: the values its `=` filters ask for
 * (`status = todo`, `#project`), and the column of the board it is made in.
 */
export function newNoteValues(spec: ViewSpec, group?: string): [string, string | string[]][] {
  const out: [string, string | string[]][] = [];
  const tags: string[] = [];
  for (const w of spec.where) {
    const f = parseFilter(w);
    if (!f || f.op !== '=' || isFileColumn(f.key) && f.key.toLowerCase() !== 'tags') continue;
    if (f.key.toLowerCase() === 'tags') tags.push(f.value);
    else out.push([f.key, f.value]);
  }
  if (tags.length) out.push(['tags', tags]);
  if (spec.group && group) {
    const i = out.findIndex(([k]) => k.toLowerCase() === spec.group!.toLowerCase());
    if (i >= 0) out[i] = [spec.group, group];
    else out.push([spec.group, group]);
  }
  return out;
}
