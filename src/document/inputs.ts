/**
 * FORM-003: form fields of text documents in Markdown and LaTeX. Markdown
 * uses Pandoc's bracketed spans, the answer between the brackets:
 *
 *     Name: [Jeanne]{.input name="Name"}
 *     [x]{.checkbox name="Agree"} I agree
 *     [Yes]{.choice name="Coming" options="Yes|No|Maybe"}
 */
import type { InputKind, InputRun } from './model';

const CLASS_OF: Record<InputKind, string> = { text: 'input', checkbox: 'checkbox', dropdown: 'choice' };
const KIND_OF: Record<string, InputKind> = { input: 'text', checkbox: 'checkbox', choice: 'dropdown' };

const escText = (s: string): string => s.replace(/[\\\]]/g, '\\$&');
const escAttr = (s: string): string => s.replace(/[\\"]/g, '\\$&');
const unescape = (s: string): string => s.replace(/\\(.)/g, '$1');

export function inputMarkdown(run: InputRun): string {
  const inside = run.input === 'checkbox' ? (run.checked ? 'x' : ' ') : escText(run.value ?? '');
  let attrs = `.${CLASS_OF[run.input]} name="${escAttr(run.name)}"`;
  if (run.input === 'dropdown') attrs += ` options="${escAttr((run.options ?? []).join('|'))}"`;
  if (run.required) attrs += ' required';
  return `[${inside}]{${attrs}}`;
}

const SPAN = /^\[((?:\\.|[^\]\\\n])*)\]\{\.(input|checkbox|choice)((?:\s+[a-z]+(?:="(?:\\.|[^"\\])*")?)*)\s*\}/;
const ATTR = /([a-z]+)(?:="((?:\\.|[^"\\])*)")?/g;

/** The form field at the start of `src`, and the length of its text. */
export function parseInputMarkdown(src: string): { run: InputRun; length: number } | undefined {
  const m = SPAN.exec(src);
  if (!m) return undefined;
  const attrs = new Map<string, string>();
  for (const a of m[3]!.matchAll(ATTR)) attrs.set(a[1]!, a[2] === undefined ? '' : unescape(a[2]));
  const name = attrs.get('name');
  if (!name) return undefined;
  const input = KIND_OF[m[2]!]!;
  const inside = unescape(m[1]!);
  const run: InputRun = { input, name };
  if (input === 'checkbox') run.checked = /^\s*[xX✓☒]\s*$/.test(inside);
  else if (inside) run.value = inside;
  if (input === 'dropdown') run.options = (attrs.get('options') ?? '').split('|').filter(Boolean);
  if (attrs.has('required')) run.required = true;
  return { run, length: m[0].length };
}

/** A form field in LaTeX, as printed on paper: a box, the answer, or a line to write on. */
export function inputLatex(run: InputRun, esc: (s: string) => string): string {
  if (run.input === 'checkbox') return run.checked ? '$\\boxtimes$' : '$\\square$';
  if (run.value) return esc(run.value);
  if (run.input === 'dropdown' && run.options?.length) return run.options.map(esc).join(' / ');
  return '\\underline{\\hspace{4cm}}';
}
