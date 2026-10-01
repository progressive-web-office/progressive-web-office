/** `$…$` equations inside plain text (TEX-005, TEX-006). */
import { mathElement } from '../document/html';
import { cleanFormat, isTextRun, type Run, type TextFormat } from '../document/model';

export type MathPiece = { text: string } | { math: string; display: boolean };

/**
 * Pandoc-like rules: `$$…$$` is display math; `$…$` is inline math when the
 * content does not start or end with a space and the closing `$` is not
 * followed by a digit (so "$5 and $10" stays text). `\$` is a literal dollar.
 */
const PATTERN = /\\\$|\$\$([^$]+?)\$\$|\$(?![\s$])((?:\\.|[^$\\])*?[^\s\\])\$(?!\d)/g;

export function splitDollarMath(text: string): MathPiece[] {
  const out: MathPiece[] = [];
  let plain = '';
  let last = 0;
  for (const m of text.matchAll(PATTERN)) {
    plain += text.slice(last, m.index);
    last = m.index + m[0].length;
    if (m[0] === '\\$') {
      plain += '$';
      continue;
    }
    if (plain) out.push({ text: plain });
    plain = '';
    out.push(m[1] !== undefined ? { math: m[1].trim(), display: true } : { math: m[2]!, display: false });
  }
  plain += text.slice(last);
  if (plain) out.push({ text: plain });
  return out;
}

export function hasDollarMath(text: string): boolean {
  return text.includes('$') && splitDollarMath(text).some((p) => 'math' in p);
}

/** Replace `$…$` inside text runs with math runs. */
export function expandMathRuns(runs: Run[]): Run[] {
  return runs.flatMap((run): Run[] => {
    if (!isTextRun(run) || !run.text.includes('$')) return [run];
    const { text: _text, ...fmt } = run;
    const format: TextFormat = cleanFormat(fmt);
    return splitDollarMath(run.text).map((p) => ('math' in p ? (p.display ? { math: p.math, display: true } : { math: p.math }) : { text: p.text, ...format }));
  });
}

/**
 * When the text before the caret ends with a closed `$…$` (or `$$…$$`),
 * return where the equation starts and its LaTeX source.
 */
export function findTypedMath(before: string): { start: number; latex: string; display: boolean } | null {
  const display = /(?:^|[^\\$])\$\$([^$]+)\$\$$/.exec(before);
  if (display) {
    const start = before.length - display[1]!.length - 4;
    return display[1]!.trim() ? { start, latex: display[1]!.trim(), display: true } : null;
  }
  const inline = /(?:^|[^\\$])\$((?:\\.|[^$\\])*)\$$/.exec(before);
  if (!inline) return null;
  const latex = inline[1]!;
  if (!latex || /^\s|\s$/.test(latex) || latex.endsWith('\\')) return null;
  return { start: before.length - latex.length - 2, latex, display: false };
}

/**
 * Fill `el` with `text`, turning `$…$` into equation placeholders.
 * Returns true when equations were added (render them with `typesetMath`).
 */
export function fillWithMath(el: HTMLElement, text: string): boolean {
  if (!hasDollarMath(text)) {
    el.textContent = text;
    return false;
  }
  el.replaceChildren(
    ...splitDollarMath(text).map((p) => {
      if ('text' in p) return document.createTextNode(p.text);
      return mathElement(p.math, p.display, document);
    }),
  );
  return true;
}

/** Render equation placeholders under `root` (loads MathLive lazily). */
export async function typesetMath(root: HTMLElement): Promise<void> {
  if (!root.querySelector('span.math[data-latex]')) return;
  const { renderMath } = await import('./ui');
  await renderMath(root);
}
