/**
 * Snippets (DOC-037): pieces of text inserted from a list or by typing `;;`
 * and their name. A snippet is Markdown with fields:
 *
 * - `${date}`, `${time}`, `${datetime}`, `${weekday}` — now, in the document's language;
 * - `${title}` — the title of the document, `${clipboard}` — the text copied;
 * - `${1:default}`, `${2}` … — places to type, visited in order with Tab,
 *   `${0}` — where the cursor ends.
 */

export interface Snippet {
  name: string;
  body: string;
  /** Where it comes from: the application, the user (this browser) or the open folder. */
  origin: 'builtin' | 'mine' | 'folder';
}

/** Marks of a place to type in expanded text: START, its number, SEP, its default text, END. */
export const STOP_START = '';
export const STOP_SEP = '';
export const STOP_END = '';

export interface ExpandContext {
  now: Date;
  lang?: string;
  title?: string;
  clipboard?: string;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** The snippet's text with its values filled in and its places to type marked. */
export function expandSnippet(body: string, ctx: ExpandContext): string {
  const { now, lang } = ctx;
  const values: Record<string, () => string> = {
    date: () => now.toLocaleDateString(lang, { year: 'numeric', month: 'long', day: 'numeric' }),
    isodate: () => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: () => now.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' }),
    datetime: () => `${values.date!()} ${values.time!()}`,
    weekday: () => now.toLocaleDateString(lang, { weekday: 'long' }),
    title: () => ctx.title ?? '',
    clipboard: () => ctx.clipboard ?? '',
  };
  return body.replace(/\$\{(\d+)(?::([^}]*))?\}|\$\{(\w+)\}/g, (whole, n: string | undefined, def: string | undefined, name: string | undefined) => {
    if (n !== undefined) return `${STOP_START}${n}${STOP_SEP}${def ?? ''}${STOP_END}`;
    const v = values[name!];
    return v ? v() : whole;
  });
}

/** The places to type of a text, in visiting order (1, 2, … then 0), each with its range once the marks are removed. */
export function placesToType(text: string): { text: string; stops: { n: number; from: number; to: number }[] } {
  let out = '';
  const stops: { n: number; from: number; to: number }[] = [];
  const re = new RegExp(`${STOP_START}(\\d+)${STOP_SEP}([^${STOP_END}]*)${STOP_END}`, 'g');
  let last = 0;
  for (const m of text.matchAll(re)) {
    out += text.slice(last, m.index);
    stops.push({ n: Number(m[1]), from: out.length, to: out.length + m[2]!.length });
    out += m[2]!;
    last = m.index! + m[0].length;
  }
  out += text.slice(last);
  const order = (n: number): number => (n === 0 ? Infinity : n);
  return { text: out, stops: stops.sort((a, b) => order(a.n) - order(b.n) || a.from - b.from) };
}

const KEY = 'pwo.snippets';

/** The user's snippets, kept in this browser. */
export function loadSnippets(): Snippet[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]') as { name?: unknown; body?: unknown }[];
    return list.filter((s) => typeof s.name === 'string' && typeof s.body === 'string').map((s) => ({ name: s.name as string, body: s.body as string, origin: 'mine' as const }));
  } catch {
    return [];
  }
}

export function saveSnippets(list: Pick<Snippet, 'name' | 'body'>[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.map(({ name, body }) => ({ name, body }))));
  } catch {
    /* not kept */
  }
}

/** Snippets by name: the folder's first, then the user's, then the built-in ones; a name is used once. */
export function mergeSnippets(...lists: Snippet[][]): Snippet[] {
  const seen = new Set<string>();
  const out: Snippet[] = [];
  for (const list of lists) for (const s of list) if (!seen.has(s.name.toLowerCase())) (seen.add(s.name.toLowerCase()), out.push(s));
  return out;
}

/** The built-in snippets, named and written in the interface's language. */
export function builtinSnippets(tr: (key: string) => string): Snippet[] {
  const s = (name: string, body: string): Snippet => ({ name: tr(`snippet.b.${name}`), body, origin: 'builtin' });
  const title = tr('snippet.t.title');
  return [
    s('date', '${date}'),
    s('today', '## ${weekday} ${date}\n\n${0}'),
    s('meeting', `## ${tr('snippet.t.meeting')} — \${date}\n\n**${tr('snippet.t.present')}:** \${1}\n\n### ${tr('snippet.t.agenda')}\n\n- \${2}\n\n### ${tr('snippet.t.decisions')}\n\n- \${0}`),
    s('note', `> [!NOTE] \${1:${title}}\n> \${0}`),
    s('warning', `> [!WARNING] \${1:${title}}\n> \${0}`),
    s('table', '| ${1:A} | ${2:B} |\n| --- | --- |\n| ${3} | ${0} |'),
    s('signature', `${tr('snippet.t.regards')}\n\n\${1:${tr('snippet.t.name')}}`),
  ];
}
