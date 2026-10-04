/**
 * SHEET-029: conditional formatting — cells formatted by their values: a
 * comparison, a text they contain, duplicates or unique values, above or
 * below the average, the top or bottom ones, a colour scale or a data bar.
 * Kept in XLSX (`<conditionalFormatting>` and `<dxfs>`) and ODS
 * (`calcext:conditional-formats`, as LibreOffice writes them).
 */
import { parseKey } from './address';
import type { CellStyle, Sheet, Value } from './model';
import type { Range } from './ops';
import { parseSqref, sqref, VALIDATION_OPS, type ValidationOp } from './validation';

/** The formatting a rule gives (only what a conditional format may change). */
export type CondStyle = Pick<CellStyle, 'fill' | 'color' | 'bold' | 'italic' | 'underline'>;

export type CondRule =
  | { kind: 'cellIs'; op: ValidationOp; a: number | string; b?: number | string; style: CondStyle }
  | { kind: 'containsText'; text: string; style: CondStyle }
  | { kind: 'duplicate' | 'unique' | 'aboveAverage' | 'belowAverage'; style: CondStyle }
  | { kind: 'top' | 'bottom'; rank: number; percent?: boolean; style: CondStyle }
  /** Two or three colours, from the lowest value (to the median) to the highest. */
  | { kind: 'colorScale'; colors: string[] }
  | { kind: 'dataBar'; color: string };

export type CondKind = CondRule['kind'];
export const COND_KINDS: CondKind[] = ['cellIs', 'containsText', 'duplicate', 'unique', 'aboveAverage', 'belowAverage', 'top', 'bottom', 'colorScale', 'dataBar'];

export interface ConditionalFormat {
  ranges: Range[];
  rule: CondRule;
}

/** What a cell gets from the conditional formats covering it. */
export interface CondLook {
  look?: CondStyle;
  /** A data bar: its colour and how much of the cell it fills, from 0 to 1. */
  bar?: { color: string; ratio: number };
}

const inRanges = (ranges: Range[], r: number, c: number): boolean => ranges.some((x) => r >= x.r1 && r <= x.r2 && c >= x.c1 && c <= x.c2);

const HEX = /^#[0-9a-f]{6}$/i;

function mix(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa.map((x, i) => Math.round(x + (pb[i]! - x) * t).toString(16).padStart(2, '0')).join('')}`;
}

function median(sorted: number[]): number {
  const m = sorted.length >> 1;
  return sorted.length % 2 ? sorted[m]! : (sorted[m - 1]! + sorted[m]!) / 2;
}

const textKey = (v: Value): string | undefined => (v === null || v === '' || typeof v === 'object' ? undefined : typeof v === 'string' ? `s:${v.toLowerCase()}` : `${typeof v}:${v}`);

function compareValue(op: ValidationOp, v: Value, a: number | string, b: number | string = a): boolean {
  if (v === null || v === '' || typeof v === 'object') return false;
  // Numbers with numbers; anything else as texts, ignoring case.
  const numeric = typeof v === 'number' && typeof a === 'number' && typeof b === 'number';
  const x = numeric ? v : String(v).toLowerCase();
  const pa = numeric ? a : String(a).toLowerCase();
  const pb = numeric ? b : String(b).toLowerCase();
  // A number compared with a text (or a text with a number) only matches "not equal".
  if (!numeric && (typeof v === 'number') !== (typeof a === 'number')) return op === 'notEqual';
  const [lo, hi] = pa <= pb ? [pa, pb] : [pb, pa];
  switch (op) {
    case 'between':
      return x >= lo && x <= hi;
    case 'notBetween':
      return x < lo || x > hi;
    case 'equal':
      return x === pa;
    case 'notEqual':
      return x !== pa;
    case 'greaterThan':
      return x > pa;
    case 'lessThan':
      return x < pa;
    case 'greaterThanOrEqual':
      return x >= pa;
    case 'lessThanOrEqual':
      return x <= pa;
  }
}

/**
 * The looks the conditional formats of a sheet give its cells, by cell key.
 * The first format of the list wins where two set the same thing.
 */
export function evaluateConditional(sheet: Sheet, value: (row: number, col: number) => Value): Map<string, CondLook> {
  const out = new Map<string, CondLook>();
  for (const f of sheet.conditional ?? []) {
    const cells: { key: string; v: Value }[] = [];
    for (const key of sheet.cells.keys()) {
      const [r, c] = parseKey(key);
      if (inRanges(f.ranges, r, c)) cells.push({ key, v: value(r, c) });
    }
    const nums = cells.flatMap((x) => (typeof x.v === 'number' ? [x.v] : []));
    const rule = f.rule;
    const put = (key: string, look: CondLook): void => {
      const old = out.get(key) ?? {};
      out.set(key, { look: look.look ? { ...look.look, ...old.look } : old.look, bar: old.bar ?? look.bar });
    };
    switch (rule.kind) {
      case 'cellIs':
        for (const x of cells) if (compareValue(rule.op, x.v, rule.a, rule.b)) put(x.key, { look: rule.style });
        break;
      case 'containsText': {
        const needle = rule.text.toLowerCase();
        for (const x of cells) if (x.v !== null && typeof x.v !== 'object' && String(x.v).toLowerCase().includes(needle)) put(x.key, { look: rule.style });
        break;
      }
      case 'duplicate':
      case 'unique': {
        const counts = new Map<string, number>();
        for (const x of cells) {
          const k = textKey(x.v);
          if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
        }
        for (const x of cells) {
          const k = textKey(x.v);
          if (k && (counts.get(k)! > 1) === (rule.kind === 'duplicate')) put(x.key, { look: rule.style });
        }
        break;
      }
      case 'aboveAverage':
      case 'belowAverage': {
        if (!nums.length) break;
        const avg = nums.reduce((s, n) => s + n, 0) / nums.length;
        for (const x of cells) if (typeof x.v === 'number' && (rule.kind === 'aboveAverage' ? x.v > avg : x.v < avg)) put(x.key, { look: rule.style });
        break;
      }
      case 'top':
      case 'bottom': {
        if (!nums.length) break;
        const sorted = [...nums].sort((a, b) => (rule.kind === 'top' ? b - a : a - b));
        const n = Math.max(1, rule.percent ? Math.floor((nums.length * rule.rank) / 100) : rule.rank);
        const limit = sorted[Math.min(n, sorted.length) - 1]!;
        for (const x of cells) if (typeof x.v === 'number' && (rule.kind === 'top' ? x.v >= limit : x.v <= limit)) put(x.key, { look: rule.style });
        break;
      }
      case 'colorScale': {
        if (!nums.length || rule.colors.length < 2) break;
        const sorted = [...nums].sort((a, b) => a - b);
        const lo = sorted[0]!;
        const hi = sorted[sorted.length - 1]!;
        const mid = median(sorted);
        const [c0, c1, c2] = rule.colors as [string, string, string?];
        for (const x of cells) {
          if (typeof x.v !== 'number') continue;
          let fill: string;
          if (hi === lo) fill = c2 ? c1 : c0;
          else if (!c2) fill = mix(c0, c1, (x.v - lo) / (hi - lo));
          else if (x.v <= mid) fill = mix(c0, c1, mid === lo ? 1 : (x.v - lo) / (mid - lo));
          else fill = mix(c1, c2, hi === mid ? 1 : (x.v - mid) / (hi - mid));
          put(x.key, { look: { fill } });
        }
        break;
      }
      case 'dataBar': {
        if (!nums.length) break;
        const lo = Math.min(0, ...nums);
        const hi = Math.max(...nums);
        for (const x of cells) {
          if (typeof x.v !== 'number') continue;
          const ratio = hi === lo ? 1 : Math.max(0, Math.min(1, (x.v - lo) / (hi - lo)));
          put(x.key, { bar: { color: rule.color, ratio } });
        }
        break;
      }
    }
  }
  return out;
}

// --- ranges ----------------------------------------------------------------------

/** Rows or columns inserted (count > 0) or deleted (count < 0) at index: the ranges follow. */
export function shiftConditional(sheet: Sheet, axis: 'rows' | 'cols', index: number, count: number): void {
  if (!sheet.conditional) return;
  const [k1, k2] = axis === 'rows' ? (['r1', 'r2'] as const) : (['c1', 'c2'] as const);
  const n = -count;
  const first = (p: number): number => (count > 0 ? (p >= index ? p + count : p) : p < index ? p : p >= index + n ? p - n : index);
  const last = (p: number): number => (count > 0 ? (p >= index ? p + count : p) : p < index ? p : p >= index + n ? p - n : index - 1);
  const list = sheet.conditional.flatMap((f) => {
    const ranges = f.ranges.flatMap((r) => {
      const out = { ...r, [k1]: first(r[k1]), [k2]: last(r[k2]) };
      return out[k2] >= out[k1] ? [out] : [];
    });
    return ranges.length ? [{ ...f, ranges }] : [];
  });
  if (list.length) sheet.conditional = list;
  else delete sheet.conditional;
}

/** The conditional formats covering any cell of the range. */
export function formatsIn(sheet: Sheet, range: Range): number[] {
  return (sheet.conditional ?? []).flatMap((f, i) => (f.ranges.some((r) => r.r1 <= range.r2 && r.r2 >= range.r1 && r.c1 <= range.c2 && r.c2 >= range.c1) ? [i] : []));
}

// --- checks ----------------------------------------------------------------------

function cleanStyle(s: unknown): CondStyle {
  const o = (s ?? {}) as Record<string, unknown>;
  const out: CondStyle = {};
  if (typeof o.fill === 'string' && HEX.test(o.fill)) out.fill = o.fill.toLowerCase();
  if (typeof o.color === 'string' && HEX.test(o.color)) out.color = o.color.toLowerCase();
  if (o.bold === true) out.bold = true;
  if (o.italic === true) out.italic = true;
  if (o.underline === true) out.underline = true;
  return out;
}

/** Cleaned from a file or the network: well-formed formats only. */
export function cleanConditional(data: unknown): ConditionalFormat[] | undefined {
  if (!Array.isArray(data)) return undefined;
  const out: ConditionalFormat[] = [];
  const val = (v: unknown): v is number | string => (typeof v === 'number' && Number.isFinite(v)) || typeof v === 'string';
  for (const f of data as Partial<ConditionalFormat>[]) {
    const ranges = (Array.isArray(f?.ranges) ? f.ranges : []).filter((r) => r && [r.r1, r.c1, r.r2, r.c2].every((n) => Number.isInteger(n) && n >= 0));
    const rule = f?.rule as Record<string, unknown> | undefined;
    if (!ranges.length || !rule) continue;
    const style = cleanStyle(rule.style);
    let clean: CondRule | undefined;
    switch (rule.kind) {
      case 'cellIs':
        if (VALIDATION_OPS.includes(rule.op as ValidationOp) && val(rule.a)) clean = { kind: 'cellIs', op: rule.op as ValidationOp, a: rule.a, ...(val(rule.b) ? { b: rule.b } : {}), style };
        break;
      case 'containsText':
        if (typeof rule.text === 'string' && rule.text) clean = { kind: 'containsText', text: rule.text, style };
        break;
      case 'duplicate':
      case 'unique':
      case 'aboveAverage':
      case 'belowAverage':
        clean = { kind: rule.kind, style };
        break;
      case 'top':
      case 'bottom':
        if (typeof rule.rank === 'number' && rule.rank >= 1) clean = { kind: rule.kind, rank: Math.round(rule.rank), ...(rule.percent === true ? { percent: true } : {}), style };
        break;
      case 'colorScale': {
        const colors = Array.isArray(rule.colors) ? rule.colors.filter((c): c is string => typeof c === 'string' && HEX.test(c)).map((c) => c.toLowerCase()) : [];
        if (colors.length === 2 || colors.length === 3) clean = { kind: 'colorScale', colors };
        break;
      }
      case 'dataBar':
        if (typeof rule.color === 'string' && HEX.test(rule.color)) clean = { kind: 'dataBar', color: rule.color.toLowerCase() };
        break;
    }
    if (clean) out.push({ ranges, rule: clean });
  }
  return out.length ? out : undefined;
}

// --- XLSX ------------------------------------------------------------------------

const xmlEsc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const argb = (hex: string): string => `FF${hex.slice(1).toUpperCase()}`;
const fromArgb = (v: string | undefined): string | undefined => (v && /^[0-9a-f]{8}$/i.test(v) ? `#${v.slice(2).toLowerCase()}` : v && /^[0-9a-f]{6}$/i.test(v) ? `#${v.toLowerCase()}` : undefined);

/** A differential format (`<dxf>`) of styles.xml. */
export function dxfXml(s: CondStyle): string {
  const font = s.bold || s.italic || s.underline || s.color ? `<font>${s.bold ? '<b/>' : ''}${s.italic ? '<i/>' : ''}${s.underline ? '<u/>' : ''}${s.color ? `<color rgb="${argb(s.color)}"/>` : ''}</font>` : '';
  const fill = s.fill ? `<fill><patternFill patternType="solid"><fgColor rgb="${argb(s.fill)}"/><bgColor rgb="${argb(s.fill)}"/></patternFill></fill>` : '';
  return `<dxf>${font}${fill}</dxf>`;
}

/** A differential format read back. */
export function styleFromDxf(dxf: Element): CondStyle {
  const s: CondStyle = {};
  const font = dxf.getElementsByTagNameNS('*', 'font')[0];
  if (font) {
    const has = (tag: string): boolean => {
      const el = font.getElementsByTagNameNS('*', tag)[0];
      return !!el && el.getAttribute('val') !== '0' && el.getAttribute('val') !== 'none';
    };
    if (has('b')) s.bold = true;
    if (has('i')) s.italic = true;
    if (has('u')) s.underline = true;
    const color = fromArgb(font.getElementsByTagNameNS('*', 'color')[0]?.getAttribute('rgb') ?? undefined);
    if (color) s.color = color;
  }
  const pf = dxf.getElementsByTagNameNS('*', 'patternFill')[0];
  if (pf) {
    // Excel puts the colour of a conditional fill in bgColor.
    const fill = fromArgb(pf.getElementsByTagNameNS('*', 'bgColor')[0]?.getAttribute('rgb') ?? undefined) ?? fromArgb(pf.getElementsByTagNameNS('*', 'fgColor')[0]?.getAttribute('rgb') ?? undefined);
    if (fill) s.fill = fill;
  }
  return s;
}

const xlsxValue = (v: number | string): string => (typeof v === 'number' ? String(v) : `"${v.replace(/"/g, '""')}"`);
const fromXlsxValue = (f: string | undefined): number | string | undefined => {
  if (f === undefined) return undefined;
  const t = f.trim();
  if (/^".*"$/s.test(t)) return t.slice(1, -1).replace(/""/g, '"');
  const n = Number(t);
  return t !== '' && Number.isFinite(n) ? n : undefined;
};

/** The `<conditionalFormatting>` elements of a sheet; `dxf` gives the index of a differential format. */
export function conditionalXlsx(sheet: Sheet, dxf: (s: CondStyle) => number): string {
  let priority = 1;
  return (sheet.conditional ?? [])
    .map((f) => {
      const rule = f.rule;
      const ref = sqref(f.ranges);
      const first = f.ranges[0]!;
      const topLeft = `${sqref([{ r1: first.r1, c1: first.c1, r2: first.r1, c2: first.c1 }])}`;
      const p = `priority="${priority++}"`;
      let xml: string;
      switch (rule.kind) {
        case 'cellIs': {
          const two = rule.op === 'between' || rule.op === 'notBetween';
          xml = `<cfRule type="cellIs" dxfId="${dxf(rule.style)}" ${p} operator="${rule.op}"><formula>${xmlEsc(xlsxValue(rule.a))}</formula>${two ? `<formula>${xmlEsc(xlsxValue(rule.b ?? rule.a))}</formula>` : ''}</cfRule>`;
          break;
        }
        case 'containsText':
          xml = `<cfRule type="containsText" dxfId="${dxf(rule.style)}" ${p} operator="containsText" text="${xmlEsc(rule.text)}"><formula>${xmlEsc(`NOT(ISERROR(SEARCH(${xlsxValue(rule.text)},${topLeft})))`)}</formula></cfRule>`;
          break;
        case 'duplicate':
          xml = `<cfRule type="duplicateValues" dxfId="${dxf(rule.style)}" ${p}/>`;
          break;
        case 'unique':
          xml = `<cfRule type="uniqueValues" dxfId="${dxf(rule.style)}" ${p}/>`;
          break;
        case 'aboveAverage':
        case 'belowAverage':
          xml = `<cfRule type="aboveAverage" dxfId="${dxf(rule.style)}" ${p}${rule.kind === 'belowAverage' ? ' aboveAverage="0"' : ''}/>`;
          break;
        case 'top':
        case 'bottom':
          xml = `<cfRule type="top10" dxfId="${dxf(rule.style)}" ${p} rank="${rule.rank}"${rule.percent ? ' percent="1"' : ''}${rule.kind === 'bottom' ? ' bottom="1"' : ''}/>`;
          break;
        case 'colorScale': {
          const cfvo = rule.colors.length === 3 ? '<cfvo type="min"/><cfvo type="percentile" val="50"/><cfvo type="max"/>' : '<cfvo type="min"/><cfvo type="max"/>';
          xml = `<cfRule type="colorScale" ${p}><colorScale>${cfvo}${rule.colors.map((c) => `<color rgb="${argb(c)}"/>`).join('')}</colorScale></cfRule>`;
          break;
        }
        case 'dataBar':
          xml = `<cfRule type="dataBar" ${p}><dataBar><cfvo type="min"/><cfvo type="max"/><color rgb="${argb(rule.color)}"/></dataBar></cfRule>`;
          break;
      }
      return `<conditionalFormatting sqref="${ref}">${xml}</conditionalFormatting>`;
    })
    .join('');
}

/** The conditional formats of an XLSX sheet; `dxf(i)` is the i-th differential format. */
export function conditionalFromXlsx(sheetDoc: Document, dxf: (i: number) => CondStyle): ConditionalFormat[] {
  const out: { priority: number; f: ConditionalFormat }[] = [];
  for (const cf of Array.from(sheetDoc.getElementsByTagNameNS('*', 'conditionalFormatting'))) {
    const ranges = parseSqref(cf.getAttribute('sqref') ?? '');
    if (!ranges.length) continue;
    for (const r of Array.from(cf.getElementsByTagNameNS('*', 'cfRule'))) {
      const a = (n: string): string | undefined => r.getAttribute(n) ?? undefined;
      const style = (): CondStyle => dxf(Number(a('dxfId') ?? -1));
      const formulas = Array.from(r.getElementsByTagNameNS('*', 'formula')).map((f) => f.textContent ?? '');
      let rule: CondRule | undefined;
      switch (a('type')) {
        case 'cellIs': {
          const op = (a('operator') ?? 'equal') as ValidationOp;
          const va = fromXlsxValue(formulas[0]);
          const vb = fromXlsxValue(formulas[1]);
          if (VALIDATION_OPS.includes(op) && va !== undefined) rule = { kind: 'cellIs', op, a: va, ...(vb !== undefined && (op === 'between' || op === 'notBetween') ? { b: vb } : {}), style: style() };
          break;
        }
        case 'containsText':
          if (a('text')) rule = { kind: 'containsText', text: a('text')!, style: style() };
          break;
        case 'duplicateValues':
          rule = { kind: 'duplicate', style: style() };
          break;
        case 'uniqueValues':
          rule = { kind: 'unique', style: style() };
          break;
        case 'aboveAverage':
          rule = { kind: a('aboveAverage') === '0' || a('aboveAverage') === 'false' ? 'belowAverage' : 'aboveAverage', style: style() };
          break;
        case 'top10':
          rule = { kind: a('bottom') === '1' || a('bottom') === 'true' ? 'bottom' : 'top', rank: Math.max(1, Number(a('rank') ?? 10) || 10), ...(a('percent') === '1' || a('percent') === 'true' ? { percent: true } : {}), style: style() };
          break;
        case 'colorScale': {
          const colors = Array.from(r.getElementsByTagNameNS('*', 'color')).flatMap((c) => fromArgb(c.getAttribute('rgb') ?? undefined) ?? []);
          if (colors.length === 2 || colors.length === 3) rule = { kind: 'colorScale', colors };
          break;
        }
        case 'dataBar': {
          const color = fromArgb(r.getElementsByTagNameNS('*', 'color')[0]?.getAttribute('rgb') ?? undefined);
          if (color) rule = { kind: 'dataBar', color };
          break;
        }
      }
      if (rule) out.push({ priority: Number(a('priority') ?? 0), f: { ranges, rule } });
    }
  }
  return out.sort((x, y) => x.priority - y.priority).map((x) => x.f);
}

// --- ODS (LibreOffice's calcext) ---------------------------------------------------

const odfValue = (v: number | string): string => (typeof v === 'number' ? String(v) : `"${v.replace(/"/g, '""')}"`);
const ODF_OPS: Partial<Record<ValidationOp, string>> = { equal: '=', notEqual: '!=', greaterThan: '>', lessThan: '<', greaterThanOrEqual: '>=', lessThanOrEqual: '<=' };

/** The `calcext:value` of a rule with a style (not for scales and bars). */
export function odfCondValue(rule: CondRule): string | undefined {
  switch (rule.kind) {
    case 'cellIs':
      if (rule.op === 'between' || rule.op === 'notBetween') return `${rule.op === 'between' ? 'between' : 'not-between'}(${odfValue(rule.a)},${odfValue(rule.b ?? rule.a)})`;
      return `${ODF_OPS[rule.op]}${odfValue(rule.a)}`;
    case 'containsText':
      return `contains-text(${odfValue(rule.text)})`;
    case 'duplicate':
      return 'duplicate';
    case 'unique':
      return 'unique';
    case 'aboveAverage':
      return 'above-average';
    case 'belowAverage':
      return 'below-average';
    case 'top':
    case 'bottom':
      return `${rule.kind}-${rule.percent ? 'percent' : 'elements'}(${rule.rank})`;
    default:
      return undefined;
  }
}

const parseOdfValue = (s: string): number | string | undefined => {
  const t = s.trim();
  if (/^".*"$/s.test(t)) return t.slice(1, -1).replace(/""/g, '"');
  const n = Number(t);
  return t !== '' && Number.isFinite(n) ? n : undefined;
};

/** A rule from a `calcext:value`, with the style it applies. */
export function condFromOdf(value: string, style: CondStyle): CondRule | undefined {
  const v = value.trim();
  const simple: Record<string, CondKind> = { duplicate: 'duplicate', unique: 'unique', 'above-average': 'aboveAverage', 'below-average': 'belowAverage' };
  if (simple[v]) return { kind: simple[v] as 'duplicate', style };
  const between = /^(not-)?between\((.*)\)$/s.exec(v);
  if (between) {
    // Split on the comma outside quotes.
    const parts = between[2]!.match(/("(?:[^"]|"")*"|[^,]+)/g) ?? [];
    const a = parseOdfValue(parts[0] ?? '');
    const b = parseOdfValue(parts[1] ?? '');
    return a !== undefined && b !== undefined ? { kind: 'cellIs', op: between[1] ? 'notBetween' : 'between', a, b, style } : undefined;
  }
  const text = /^contains-text\((.*)\)$/s.exec(v);
  if (text) {
    const t = parseOdfValue(text[1]!);
    return typeof t === 'string' && t ? { kind: 'containsText', text: t, style } : undefined;
  }
  const top = /^(top|bottom)-(elements|percent)\((\d+)\)$/.exec(v);
  if (top) return { kind: top[1] as 'top', rank: Number(top[3]), ...(top[2] === 'percent' ? { percent: true } : {}), style };
  const cmp = /^(<=|>=|!=|=|<|>)(.*)$/s.exec(v);
  if (cmp) {
    const op = (Object.entries(ODF_OPS).find(([, s]) => s === cmp[1])?.[0] ?? 'equal') as ValidationOp;
    const a = parseOdfValue(cmp[2]!);
    return a !== undefined ? { kind: 'cellIs', op, a, style } : undefined;
  }
  return undefined;
}

/** The cells of a range in OpenDocument notation: Sheet1.A1:Sheet1.B9. */
export function odfRangeAddress(sheetName: string, ranges: Range[], quote: (s: string) => string): string {
  return ranges
    .map((r) => {
      const a = `${quote(sheetName)}.${sqref([{ r1: r.r1, c1: r.c1, r2: r.r1, c2: r.c1 }])}`;
      return r.r1 === r.r2 && r.c1 === r.c2 ? a : `${a}:${quote(sheetName)}.${sqref([{ r1: r.r2, c1: r.c2, r2: r.r2, c2: r.c2 }])}`;
    })
    .join(' ');
}

/** The ranges of a `calcext:target-range-address`. */
export function rangesFromOdfAddress(text: string): Range[] {
  const cells = text
    .split(/\s+/)
    .filter(Boolean)
    .map((part) =>
      part
        .split(':')
        .map((p) => p.slice(p.lastIndexOf('.') + 1).replace(/\$/g, ''))
        .join(':'),
    );
  return parseSqref(cells.join(' '));
}

