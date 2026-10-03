/**
 * Springs and spaces (DOC-042), as in LaTeX: `\vfill` shares the free height
 * of a page, `\hfill` the free width of a line, `\vspace{2cm}` is a fixed
 * space. Formats without springs (OpenDocument, Word) keep the space as last
 * shown, marked so that the spring is read back.
 */
import type { FillRun, Run, Space } from './model';

/** Points (1/72 inch, as in OpenDocument and Word) in a unit of length. */
const UNITS: Record<string, number> = { pt: 1, bp: 1, cm: 72 / 2.54, mm: 72 / 25.4, in: 72, pc: 12, em: 10, ex: 4.3, px: 0.75 };

/** A LaTeX or CSS length in points (`2cm`, `12pt`, `1.5em`); undefined if it is not one. */
export function lengthPt(text: string): number | undefined {
  const m = /^\s*(-?\d*\.?\d+)\s*([a-z]{2})\s*$/.exec(text);
  const unit = m && UNITS[m[2]!];
  return unit ? Math.round(Number(m![1]) * unit * 100) / 100 : undefined;
}

const SKIPS: Record<string, number> = { smallskip: 3, medskip: 6, bigskip: 12 };

/** The space of a LaTeX command (`\vfill`, `\vspace{…}`, `\bigskip`…), given its name and argument. */
export function spaceOf(name: string, arg?: string): Space | undefined {
  if (name === 'vfill') return { type: 'space', stretch: 1 };
  if (name in SKIPS) return { type: 'space', size: SKIPS[name]! };
  if (name !== 'vspace' || arg === undefined) return undefined;
  const stretch = stretchOf(arg);
  if (stretch) return { type: 'space', stretch };
  const size = lengthPt(arg);
  return size !== undefined ? { type: 'space', size } : undefined;
}

/** The weight of `\fill` or `\stretch{2}`; undefined for a length. */
export function stretchOf(arg: string): number | undefined {
  const a = arg.trim();
  if (a === '\\fill') return 1;
  const m = /^\\stretch\s*\{\s*(\d*\.?\d+)\s*\}$/.exec(a);
  return m ? Number(m[1]) || 1 : undefined;
}

/** A space as a paragraph of Markdown, or a line of LaTeX. */
export function spaceText(space: Space): string {
  if (space.stretch) return space.stretch === 1 ? '\\vfill' : `\\vspace{\\stretch{${space.stretch}}}`;
  return `\\vspace{${Math.round((space.size ?? 0) * 100) / 100}pt}`;
}

/** A Markdown paragraph that is only a space command. */
export function parseSpaceLine(text: string): Space | undefined {
  const m = /^\s*\\(vfill|smallskip|medskip|bigskip|vspace)\*?(?:\s*\{((?:[^{}]|\{[^{}]*\})*)\})?\s*$/.exec(text);
  return m ? spaceOf(m[1]!, m[2]) : undefined;
}

/** A horizontal spring in LaTeX (and Markdown). */
export function fillText(run: FillRun): string {
  return run.hfill === 1 ? '\\hfill' : `\\hspace{\\stretch{${run.hfill}}}`;
}

/** `\hfill`, `\hspace{\fill}` or `\hspace{\stretch{2}}` at the start of `text`: its weight and length. */
export function parseFill(text: string): { hfill: number; length: number } | undefined {
  const m = /^\\(?:hfill(?![A-Za-z])|hspace\*?\s*\{((?:[^{}]|\{[^{}]*\})*)\})(?:\{\})?/.exec(text);
  if (!m) return undefined;
  const hfill = m[1] === undefined ? 1 : stretchOf(m[1]);
  return hfill ? { hfill, length: m[0].length } : undefined;
}

export interface TabStop {
  type: 'left' | 'center' | 'right';
  /** From the start of the line, in points. */
  pos: number;
}

/**
 * Tab stops standing for the springs of a paragraph, on a line `width` wide:
 * the last spring pushes what follows to the end of the line (a right tab);
 * the others are where the text after them was last shown, or else share the
 * line evenly (two springs: the middle text centred).
 */
export function fillTabs(runs: Run[], width: number): TabStop[] {
  const fills = runs.filter((r): r is FillRun => 'hfill' in r);
  return fills.map((f, i): TabStop => {
    if (i === fills.length - 1) return { type: 'right', pos: round(width) };
    if (f.at !== undefined && f.at > 0 && f.at < width) return { type: 'left', pos: round(f.at) };
    return { type: fills.length === 2 ? 'center' : 'left', pos: round((width * (i + 1)) / fills.length) };
  });
}

const round = (n: number): number => Math.round(n * 10) / 10;

/** Names of the styles marking springs in OpenDocument and Word. */
export const SPRING_STYLE = 'PWO Spring';
export const SPACE_STYLE = 'PWO Space';
export const FILL_STYLE = 'PWO Fill';

/** `PWO Spring 2` → 2 (the spring's weight is in its style's name). */
export function springStyleName(stretch: number): string {
  return stretch === 1 ? SPRING_STYLE : `${SPRING_STYLE} ${stretch}`;
}

export function stretchOfStyle(name: string): number | undefined {
  const m = /^PWO(?: |_20_)Spring(?:(?: |_20_)(\d*\.?\d+))?$/i.exec(name);
  return m ? Number(m[1] ?? 1) : undefined;
}

export function fillOfStyle(name: string): number | undefined {
  const m = /^PWO(?: |_20_)Fill(?:(?: |_20_)(\d*\.?\d+))?$/i.exec(name);
  return m ? Number(m[1] ?? 1) : undefined;
}

export const isSpaceStyle = (name: string): boolean => /^PWO(?: |_20_)Space$/i.test(name);

/** The internal name of a style in OpenDocument (spaces as `_20_`). */
export const odfName = (name: string): string => name.replace(/ /g, '_20_');
