/**
 * Random variants of an exercise sheet (TEACH-002). In the text:
 * `{{R=rand(1..10)}}` draws a whole number (`rand(0.5..2, 0.1)` with a step),
 * `{{C=choice(red, green, blue)}}` one of the values, `{{V=R*2}}` a computed
 * value; `{{R}}` shows a value and `{{=R*2+1}}` (or `{{=R/3|2}}` with 2
 * decimals) an expression. Each variant draws new values.
 */
import { allParagraphs, isTextRun, type RichDocument } from '../document/model';
import { evaluate, ExprError } from './expr';

const TOKEN = /\{\{\s*([^{}]+?)\s*\}\}/g;
const DEFINE = /^([A-Za-z_][A-Za-z_0-9]*)\s*=\s*(.+)$/;

export type Value = number | string;

export interface Definition {
  name: string;
  source: string;
}

/** The definitions of a document, in order. */
export function definitions(doc: RichDocument): Definition[] {
  const out: Definition[] = [];
  for (const p of allParagraphs(doc.blocks)) {
    for (const run of p.runs) {
      if (!isTextRun(run)) continue;
      for (const m of run.text.matchAll(TOKEN)) {
        const d = DEFINE.exec(m[1]!);
        if (d && !out.some((x) => x.name === d[1])) out.push({ name: d[1]!, source: d[2]!.trim() });
      }
    }
  }
  return out;
}

/** A seeded random generator (mulberry32). */
export function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const decimals = (n: number): number => (String(n).split('.')[1] ?? '').length;

/** Values of the definitions for one variant. */
export function draw(defs: Definition[], rand: () => number): Record<string, Value> {
  const values: Record<string, Value> = {};
  const numbers = (): Record<string, number> => Object.fromEntries(Object.entries(values).filter(([, v]) => typeof v === 'number')) as Record<string, number>;
  for (const d of defs) {
    const range = /^rand\(\s*(-?[\d.]+)\s*\.\.\s*(-?[\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(d.source);
    const choice = /^choice\((.*)\)$/i.exec(d.source);
    if (range) {
      const [lo, hi] = [Number(range[1]), Number(range[2])].sort((a, b) => a - b) as [number, number];
      const step = range[3] ? Number(range[3]) : 1;
      const count = Math.floor((hi - lo) / step + 1e-9) + 1;
      const v = lo + Math.floor(rand() * count) * step;
      values[d.name] = Number(v.toFixed(Math.max(decimals(step), decimals(lo))));
    } else if (choice) {
      const options = choice[1]!.split(',').map((s) => s.trim()).filter(Boolean);
      const pick = options[Math.floor(rand() * options.length)] ?? '';
      values[d.name] = /^-?\d+(\.\d+)?$/.test(pick) ? Number(pick) : pick;
    } else {
      values[d.name] = evaluate(d.source, numbers());
    }
  }
  return values;
}

/** A number as written in the document's language. */
export function formatNumber(n: number, digits: number | undefined, lang: string | undefined): string {
  const rounded = digits === undefined ? Number(n.toPrecision(10)) : Number(n.toFixed(digits));
  return new Intl.NumberFormat(lang || undefined, { maximumFractionDigits: digits ?? 10, minimumFractionDigits: digits ?? 0, useGrouping: false }).format(rounded);
}

/** The text with its tokens replaced by values; unknown tokens are kept. */
export function substituteText(text: string, values: Record<string, Value>, lang?: string): string {
  return text.replace(TOKEN, (whole, body: string) => {
    const show = (v: Value, digits?: number): string => (typeof v === 'number' ? formatNumber(v, digits, lang) : v);
    const d = DEFINE.exec(body);
    if (d) return d[1]! in values ? show(values[d[1]!]!) : whole;
    if (body.startsWith('=')) {
      const [expr, digits] = body.slice(1).split('|');
      try {
        const numbers = Object.fromEntries(Object.entries(values).filter(([, v]) => typeof v === 'number')) as Record<string, number>;
        return show(evaluate(expr!, numbers), digits !== undefined ? Number(digits) : undefined);
      } catch (err) {
        if (err instanceof ExprError) return whole;
        throw err;
      }
    }
    return body in values ? show(values[body]!) : whole;
  });
}

/** The document of one variant. */
export function substitute(doc: RichDocument, values: Record<string, Value>): RichDocument {
  const copy: RichDocument = { ...doc, blocks: structuredClone(doc.blocks) };
  for (const p of allParagraphs(copy.blocks)) for (const run of p.runs) if (isTextRun(run) && run.text.includes('{{')) run.text = substituteText(run.text, values, doc.meta.language);
  return copy;
}

/** Problems of the definitions: what cannot be drawn. */
export function checkDefinitions(defs: Definition[]): string[] {
  try {
    draw(defs, random(1));
    return [];
  } catch (err) {
    return [(err as Error).message];
  }
}
