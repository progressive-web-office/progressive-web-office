/**
 * SHEET-028: data validation — what a cell may hold (a value from a list, a
 * whole or decimal number, a date, a text of some length), the message shown
 * when the cell is selected, and what happens to a wrong value: refused
 * (stop), asked about (warning) or only told (information). Kept in XLSX
 * (`<dataValidations>`) and ODS (`table:content-validations`).
 */
import { refName } from './address';
import { parseRange } from './chart';
import type { Range } from './ops';
import type { Sheet, Value } from './model';

export type ValidationOp = 'between' | 'notBetween' | 'equal' | 'notEqual' | 'greaterThan' | 'lessThan' | 'greaterThanOrEqual' | 'lessThanOrEqual';
export const VALIDATION_OPS: ValidationOp[] = ['between', 'notBetween', 'equal', 'notEqual', 'greaterThan', 'lessThan', 'greaterThanOrEqual', 'lessThanOrEqual'];

export type ValidationRule =
  /** Values from a list written out, or from a range of the sheet (`$A$1:$A$9`). */
  | { kind: 'list'; items?: string[]; source?: string }
  /** Numbers (dates are day numbers) and lengths of texts, compared with a and b. */
  | { kind: 'whole' | 'decimal' | 'date' | 'textLength'; op: ValidationOp; a: number; b?: number };

export type ValidationKind = ValidationRule['kind'];
export const VALIDATION_KINDS: ValidationKind[] = ['list', 'whole', 'decimal', 'date', 'textLength'];

export interface Validation {
  ranges: Range[];
  rule: ValidationRule;
  /** An empty cell is valid (the default). */
  allowBlank: boolean;
  errorStyle: 'stop' | 'warning' | 'information';
  /** Shown while the cell is selected. */
  input?: { title?: string; message: string };
  /** Shown when the value is wrong; a message of this application when none. */
  error?: { title?: string; message: string };
}

const inRange = (r: Range, row: number, col: number): boolean => row >= r.r1 && row <= r.r2 && col >= r.c1 && col <= r.c2;

/** The validation of a cell, the last one when several cover it. */
export function validationAt(sheet: Sheet, row: number, col: number): Validation | undefined {
  const list = sheet.validations ?? [];
  for (let i = list.length - 1; i >= 0; i--) if (list[i]!.ranges.some((r) => inRange(r, row, col))) return list[i];
  return undefined;
}

/** The values of a list rule, read from its range when it has one. */
export function listItems(rule: ValidationRule, value: (row: number, col: number) => Value): string[] {
  if (rule.kind !== 'list') return [];
  if (rule.items) return rule.items;
  const range = rule.source ? parseRange(rule.source) : undefined;
  if (!range) return [];
  const out: string[] = [];
  for (let r = range.r1; r <= Math.min(range.r2, range.r1 + 999); r++) {
    for (let c = range.c1; c <= range.c2; c++) {
      const v = value(r, c);
      if (v !== null && v !== '' && typeof v !== 'object') out.push(String(v));
    }
  }
  return out;
}

function compare(op: ValidationOp, x: number, a: number, b = a): boolean {
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  switch (op) {
    case 'between':
      return x >= lo && x <= hi;
    case 'notBetween':
      return x < lo || x > hi;
    case 'equal':
      return x === a;
    case 'notEqual':
      return x !== a;
    case 'greaterThan':
      return x > a;
    case 'lessThan':
      return x < a;
    case 'greaterThanOrEqual':
      return x >= a;
    case 'lessThanOrEqual':
      return x <= a;
  }
}

/** Whether a value suits the validation. */
export function isValid(v: Validation, value: Value, cellValue: (row: number, col: number) => Value = () => null): boolean {
  if (value === null || value === '') return v.allowBlank;
  // An error (#DIV/0!…) is never a valid value.
  if (typeof value === 'object') return false;
  const rule = v.rule;
  switch (rule.kind) {
    case 'list': {
      const text = String(value);
      return listItems(rule, cellValue).some((item) => item === text || (typeof value === 'number' && Number(item) === value));
    }
    case 'whole':
      return typeof value === 'number' && Number.isInteger(value) && compare(rule.op, value, rule.a, rule.b);
    case 'decimal':
    case 'date':
      return typeof value === 'number' && compare(rule.op, value, rule.a, rule.b);
    case 'textLength':
      return compare(rule.op, String(value).length, rule.a, rule.b);
  }
}

// --- ranges ----------------------------------------------------------------------

/** What is left of `a` once `b` is taken out (at most four ranges). */
export function subtractRange(a: Range, b: Range): Range[] {
  if (b.r1 > a.r2 || b.r2 < a.r1 || b.c1 > a.c2 || b.c2 < a.c1) return [a];
  const out: Range[] = [];
  if (b.r1 > a.r1) out.push({ ...a, r2: b.r1 - 1 });
  if (b.r2 < a.r2) out.push({ ...a, r1: b.r2 + 1 });
  const r1 = Math.max(a.r1, b.r1);
  const r2 = Math.min(a.r2, b.r2);
  if (b.c1 > a.c1) out.push({ r1, r2, c1: a.c1, c2: b.c1 - 1 });
  if (b.c2 < a.c2) out.push({ r1, r2, c1: b.c2 + 1, c2: a.c2 });
  return out;
}

/** Give the range to a new validation (or none), taking it from the others. */
export function setValidation(sheet: Sheet, range: Range, v: Omit<Validation, 'ranges'> | undefined): void {
  const kept = (sheet.validations ?? []).flatMap((old) => {
    const ranges = old.ranges.flatMap((r) => subtractRange(r, range));
    return ranges.length ? [{ ...old, ranges }] : [];
  });
  if (v) kept.push({ ...v, ranges: [range] });
  if (kept.length) sheet.validations = kept;
  else delete sheet.validations;
}

/** Rows or columns inserted (count > 0) or deleted (count < 0) at index: the ranges follow. */
export function shiftValidations(sheet: Sheet, axis: 'rows' | 'cols', index: number, count: number): void {
  if (!sheet.validations) return;
  const [k1, k2] = axis === 'rows' ? (['r1', 'r2'] as const) : (['c1', 'c2'] as const);
  const n = -count;
  // Inserted: what is at or after index moves on. Deleted: what is after the deleted span moves back.
  const first = (p: number): number => (count > 0 ? (p >= index ? p + count : p) : p < index ? p : p >= index + n ? p - n : index);
  const last = (p: number): number => (count > 0 ? (p >= index ? p + count : p) : p < index ? p : p >= index + n ? p - n : index - 1);
  const list = sheet.validations.flatMap((v) => {
    const ranges = v.ranges.flatMap((r) => {
      const out = { ...r, [k1]: first(r[k1]), [k2]: last(r[k2]) };
      return out[k2] >= out[k1] ? [out] : [];
    });
    return ranges.length ? [{ ...v, ranges }] : [];
  });
  if (list.length) sheet.validations = list;
  else delete sheet.validations;
}

// --- files -----------------------------------------------------------------------

/** The ranges as a list of references separated by spaces (`A1:A9 C2`), as XLSX writes them. */
export function sqref(ranges: Range[]): string {
  return ranges.map((r) => (r.r1 === r.r2 && r.c1 === r.c2 ? refName(r.r1, r.c1) : `${refName(r.r1, r.c1)}:${refName(r.r2, r.c2)}`)).join(' ');
}

export function parseSqref(text: string): Range[] {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((part) => {
      const r = parseRange(part);
      return r ? [r] : [];
    });
}

/** Cleaned from a file or the network: well-formed validations only. */
export function cleanValidations(data: unknown): Validation[] | undefined {
  if (!Array.isArray(data)) return undefined;
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const out: Validation[] = [];
  for (const v of data as Partial<Validation>[]) {
    const ranges = (Array.isArray(v?.ranges) ? v.ranges : []).filter((r) => r && [r.r1, r.c1, r.r2, r.c2].every((n) => Number.isInteger(n) && n >= 0));
    const rule = v?.rule as Record<string, unknown> | undefined;
    if (!ranges.length || !rule) continue;
    let clean: ValidationRule | undefined;
    if (rule.kind === 'list') {
      const items = Array.isArray(rule.items) ? rule.items.filter((i): i is string => typeof i === 'string').slice(0, 1000) : undefined;
      const source = typeof rule.source === 'string' ? rule.source : undefined;
      if (items || source) clean = { kind: 'list', ...(items ? { items } : {}), ...(source && !items ? { source } : {}) };
    } else if (VALIDATION_KINDS.includes(rule.kind as ValidationKind) && VALIDATION_OPS.includes(rule.op as ValidationOp) && num(rule.a)) {
      clean = { kind: rule.kind as 'whole', op: rule.op as ValidationOp, a: rule.a, ...(num(rule.b) ? { b: rule.b } : {}) };
    }
    if (!clean) continue;
    const msg = (m: unknown): { title?: string; message: string } | undefined => {
      const o = m as { title?: unknown; message?: unknown } | undefined;
      return o && typeof o.message === 'string' ? { message: o.message, ...(typeof o.title === 'string' && o.title ? { title: o.title } : {}) } : undefined;
    };
    const input = msg(v.input);
    const error = msg(v.error);
    out.push({
      ranges,
      rule: clean,
      allowBlank: v.allowBlank !== false,
      errorStyle: v.errorStyle === 'warning' || v.errorStyle === 'information' ? v.errorStyle : 'stop',
      ...(input ? { input } : {}),
      ...(error ? { error } : {}),
    });
  }
  return out.length ? out : undefined;
}

const xmlEsc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The `<dataValidations>` element of an XLSX sheet. */
export function validationsXlsx(sheet: Sheet): string {
  const list = sheet.validations ?? [];
  if (!list.length) return '';
  const items = list.map((v) => {
    const rule = v.rule;
    const attrs = [`sqref="${sqref(v.ranges)}"`, `type="${rule.kind}"`];
    if (v.allowBlank) attrs.push('allowBlank="1"');
    if (v.errorStyle !== 'stop') attrs.push(`errorStyle="${v.errorStyle}"`);
    if (rule.kind !== 'list' && rule.op !== 'between') attrs.push(`operator="${rule.op}"`);
    attrs.push('showInputMessage="1"', 'showErrorMessage="1"');
    if (v.input?.title) attrs.push(`promptTitle="${xmlEsc(v.input.title)}"`);
    if (v.input) attrs.push(`prompt="${xmlEsc(v.input.message)}"`);
    if (v.error?.title) attrs.push(`errorTitle="${xmlEsc(v.error.title)}"`);
    if (v.error) attrs.push(`error="${xmlEsc(v.error.message)}"`);
    let formulas: string;
    if (rule.kind === 'list') formulas = `<formula1>${xmlEsc(rule.items ? `"${rule.items.join(',')}"` : rule.source!)}</formula1>`;
    else {
      const two = rule.op === 'between' || rule.op === 'notBetween';
      formulas = `<formula1>${rule.a}</formula1>${two ? `<formula2>${rule.b ?? rule.a}</formula2>` : ''}`;
    }
    return `<dataValidation ${attrs.join(' ')}>${formulas}</dataValidation>`;
  });
  return `<dataValidations count="${items.length}">${items.join('')}</dataValidations>`;
}

/** A validation from an XLSX `<dataValidation>`: its attributes and formulas. */
export function validationFromXlsx(attr: (name: string) => string | undefined, formula1: string | undefined, formula2: string | undefined): Validation | undefined {
  const ranges = parseSqref(attr('sqref') ?? '');
  const type = attr('type');
  if (!ranges.length || !formula1) return undefined;
  let rule: ValidationRule | undefined;
  if (type === 'list') {
    const f = formula1.trim();
    if (f.startsWith('"')) rule = { kind: 'list', items: f.replace(/^"|"$/g, '').split(',').map((s) => s.trim()) };
    else if (parseRange(f.replace(/^.*!/, ''))) rule = { kind: 'list', source: f.replace(/^.*!/, '') };
  } else if (type === 'whole' || type === 'decimal' || type === 'date' || type === 'textLength') {
    const a = Number(formula1);
    const b = formula2 !== undefined ? Number(formula2) : undefined;
    const op = (attr('operator') ?? 'between') as ValidationOp;
    if (Number.isFinite(a) && VALIDATION_OPS.includes(op)) rule = { kind: type, op, a, ...(b !== undefined && Number.isFinite(b) ? { b } : {}) };
  }
  if (!rule) return undefined;
  const style = attr('errorStyle');
  const prompt = attr('prompt');
  const error = attr('error');
  return {
    ranges,
    rule,
    allowBlank: /^(1|true)$/.test(attr('allowBlank') ?? ''),
    errorStyle: style === 'warning' || style === 'information' ? style : 'stop',
    ...(prompt ? { input: { message: prompt, ...(attr('promptTitle') ? { title: attr('promptTitle') } : {}) } } : {}),
    ...(error ? { error: { message: error, ...(attr('errorTitle') ? { title: attr('errorTitle') } : {}) } } : {}),
  };
}

// OpenDocument conditions: of:cell-content-is-whole-number() and cell-content-is-between(1;10).
const ODF_COMPARE: Partial<Record<ValidationOp, string>> = { equal: '=', notEqual: '!=', greaterThan: '>', lessThan: '<', greaterThanOrEqual: '>=', lessThanOrEqual: '<=' };

/** The `table:condition` of a rule. */
export function odfCondition(rule: ValidationRule): string {
  if (rule.kind === 'list') {
    if (rule.items) return `of:cell-content-is-in-list(${rule.items.map((i) => `"${i.replace(/"/g, '""')}"`).join(';')})`;
    const parts = rule.source!.replace(/\$/g, '').split(':').map((p) => `.${p.replace(/^([A-Z]+)(\d+)$/i, '$$$1$$$2')}`);
    return `of:cell-content-is-in-list([${parts.join(':')}])`;
  }
  const test = { whole: 'cell-content-is-whole-number()', decimal: 'cell-content-is-decimal-number()', date: 'cell-content-is-date()', textLength: '' }[rule.kind];
  const b = rule.b ?? rule.a;
  let cmp: string;
  if (rule.kind === 'textLength') {
    cmp = rule.op === 'between' ? `cell-content-text-length-is-between(${rule.a};${b})` : rule.op === 'notBetween' ? `cell-content-text-length-is-not-between(${rule.a};${b})` : `cell-content-text-length()${ODF_COMPARE[rule.op]}${rule.a}`;
    return `of:${cmp}`;
  }
  cmp = rule.op === 'between' ? `cell-content-is-between(${rule.a};${b})` : rule.op === 'notBetween' ? `cell-content-is-not-between(${rule.a};${b})` : `cell-content()${ODF_COMPARE[rule.op]}${rule.a}`;
  return `of:${test} and ${cmp}`;
}

/** A rule from a `table:condition`, or undefined for the ones not known here. */
export function ruleFromOdf(condition: string): ValidationRule | undefined {
  const c = condition.replace(/^[a-z]+:/i, '').trim();
  const list = /^cell-content-is-in-list\((.*)\)$/s.exec(c);
  if (list) {
    const body = list[1]!.trim();
    if (body.startsWith('[')) {
      // [.$A$1:.$A$9] or [$Sheet2.$A$1:.$A$9]: the cells after the last dot of each end.
      const ends = body.slice(1, -1).split(':').map((p) => /\$?([A-Z]{1,3})\$?(\d+)$/i.exec(p.slice(p.lastIndexOf('.') + 1)));
      if (ends.every((m) => m)) return { kind: 'list', source: ends.map((m) => `$${m![1]!.toUpperCase()}$${m![2]}`).join(':') };
      return undefined;
    }
    const items = [...body.matchAll(/"((?:[^"]|"")*)"/g)].map((m) => m[1]!.replace(/""/g, '"'));
    return items.length ? { kind: 'list', items } : undefined;
  }
  const num = '(-?[\\d.]+(?:[eE][+-]?\\d+)?)';
  const fromCompare = (kind: 'whole' | 'decimal' | 'date' | 'textLength', rest: string): ValidationRule | undefined => {
    const between = new RegExp(`^cell-content(?:-text-length)?-is-(not-)?between\\(\\s*${num}\\s*[;,]\\s*${num}\\s*\\)$`).exec(rest);
    if (between) return { kind, op: between[1] ? 'notBetween' : 'between', a: Number(between[2]), b: Number(between[3]) };
    const cmp = new RegExp(`^cell-content(?:-text-length)?\\(\\)\\s*(<=|>=|!=|<>|=|<|>)\\s*${num}$`).exec(rest);
    if (!cmp) return undefined;
    const sign = cmp[1] === '<>' ? '!=' : cmp[1];
    const op = (Object.entries(ODF_COMPARE).find(([, s]) => s === sign)?.[0] ?? 'equal') as ValidationOp;
    return { kind, op, a: Number(cmp[2]) };
  };
  if (/^cell-content-text-length/.test(c)) return fromCompare('textLength', c);
  const typed = /^cell-content-is-(whole-number|decimal-number|date)\(\)\s+and\s+(.*)$/s.exec(c);
  if (typed) return fromCompare(({ 'whole-number': 'whole', 'decimal-number': 'decimal', date: 'date' } as const)[typed[1] as 'date'], typed[2]!.trim());
  return undefined;
}

/** The ranges covering a set of cells: runs down each column, joined across columns with the same run. */
export function rangesOfCells(cells: [number, number][]): Range[] {
  const byCol = new Map<number, number[]>();
  for (const [r, c] of cells) byCol.set(c, [...(byCol.get(c) ?? []), r]);
  const runs: Range[] = [];
  for (const [c, rows] of [...byCol.entries()].sort((a, b) => a[0] - b[0])) {
    rows.sort((a, b) => a - b);
    let start = rows[0]!;
    for (let i = 1; i <= rows.length; i++) {
      if (i < rows.length && rows[i] === rows[i - 1]! + 1) continue;
      runs.push({ r1: start, r2: rows[i - 1]!, c1: c, c2: c });
      if (i < rows.length) start = rows[i]!;
    }
  }
  // Join a run with the run of the column before when they cover the same rows.
  const out: Range[] = [];
  for (const run of runs) {
    const prev = out.find((r) => r.r1 === run.r1 && r.r2 === run.r2 && r.c2 === run.c1 - 1);
    if (prev) prev.c2 = run.c2;
    else out.push({ ...run });
  }
  return out;
}
