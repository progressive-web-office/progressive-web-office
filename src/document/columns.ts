/** DOC-049: text in columns, written as Pandoc fenced divs and LaTeX's multicol. */
import { cleanColumns, DEFAULT_COLUMN_GAP, type ColumnLayout } from './model';

/** `::: {.columns count=3 gap=18 rule}` (`columns=3` and `cols=3` are read too). */
export const COLUMNS_OPEN = /^:{3,}\s*\{\s*\.columns\b([^}]*)\}\s*$/;

/** A column break alone on a line, as in LaTeX. */
export const COLUMN_BREAK = /^\\columnbreak$/;

/** The layout of a fenced div's attributes, or a single column. */
export function parseColumnsAttrs(attrs: string): ColumnLayout | undefined {
  const values = new Map<string, string>();
  for (const m of attrs.matchAll(/([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|(\S+)))?/g)) values.set(m[1]!.toLowerCase(), m[2] ?? m[3] ?? m[4] ?? '');
  const count = Number(values.get('count') ?? values.get('columns') ?? values.get('cols') ?? 2);
  const gap = values.has('gap') ? parseFloat(values.get('gap')!) : undefined;
  const rule = values.has('rule') && !/^(?:false|no|0)$/i.test(values.get('rule')!);
  return cleanColumns({ count, ...(gap !== undefined && Number.isFinite(gap) ? { gap } : {}), ...(rule ? { rule } : {}) });
}

export function columnsFence(c: ColumnLayout): string {
  return `::: {.columns count=${c.count}${c.gap !== undefined && c.gap !== DEFAULT_COLUMN_GAP ? ` gap=${c.gap}` : ''}${c.rule ? ' rule' : ''}}`;
}

/** The LaTeX lines opening and closing a multicols environment. */
export function multicols(c: ColumnLayout): { open: string; close: string } {
  const settings = [c.gap !== undefined && c.gap !== DEFAULT_COLUMN_GAP ? `\\setlength{\\columnsep}{${c.gap}pt}` : '', c.rule ? '\\setlength{\\columnseprule}{0.4pt}' : ''].filter(Boolean);
  return settings.length
    ? { open: `{${settings.join('')}\n\\begin{multicols}{${c.count}}`, close: '\\end{multicols}}' }
    : { open: `\\begin{multicols}{${c.count}}`, close: '\\end{multicols}' };
}

/** CSS columns for a column layout (DOC-049). */
export function columnsCss(count: number, gap: number | null | undefined, rule: boolean): string {
  return `column-count: ${count}; column-gap: ${gap ?? DEFAULT_COLUMN_GAP}pt;${rule ? ' column-rule: 0.5pt solid currentColor;' : ''}`;
}
