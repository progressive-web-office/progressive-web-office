/** PDF-020: small helpers of the Typst source, shared by the writer and the compiler's worker. */

/** A Typst string literal. */
export const typstString = (s: string): string => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '').replace(/\t/g, '\\t')}"`;

/** Marks around each equation, so that one Typst refuses can be written as its LaTeX. */
export const equationMark = (k: number, body: string): string => `/*pwo-eq:${k}*/${body}/*pwo-eq-end*/`;

/** The source with equation `k` written as its LaTeX, when Typst refuses it. */
export function withoutEquation(source: string, k: number, latex: string): string {
  return source.replace(new RegExp(`/\\*pwo-eq:${k}\\*/[\\s\\S]*?/\\*pwo-eq-end\\*/`), `#raw(${typstString(latex)})`);
}
