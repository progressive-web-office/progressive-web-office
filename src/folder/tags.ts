/**
 * Tags of Markdown notes (FOLDER-017): the `tags` and `keywords` of the YAML
 * front matter, and `#tags` in the text (letters, digits, `_`, `-` and `/`
 * for nested tags; not in code, links, headings or colours like `#fff`).
 */

const FRONT = /^---\r?\n([\s\S]*?)\r?\n---[^\n]*\n?/;
const TAG_CHARS = '[\\p{L}\\p{N}_/-]';
const INLINE = new RegExp(`(^|[\\s(\\[,;])#(\\p{L}${TAG_CHARS}*|[\\p{N}_]${TAG_CHARS}*\\p{L}${TAG_CHARS}*)`, 'gu');
const isColour = (t: string): boolean => /^[0-9a-f]+$/i.test(t) && [3, 4, 6, 8].includes(t.length);
const unquote = (s: string): string => s.trim().replace(/^["']|["']$/g, '');

/** Values of a front matter list key (`key: [a, b]`, `key: a, b`, or `- a` lines). */
function listValues(fm: string, key: string): string[] {
  const inline = new RegExp(`^${key}:[ \\t]*\\[(.*)\\][ \\t]*$`, 'm').exec(fm);
  if (inline) return inline[1]!.split(',').map(unquote).filter(Boolean);
  const block = new RegExp(`^${key}:[ \\t]*\\n((?:[ \\t]*-[ \\t]*.*(?:\\n|$))+)`, 'm').exec(fm);
  if (block) return block[1]!.split('\n').map((l) => unquote(l.replace(/^\s*-\s*/, ''))).filter(Boolean);
  const scalar = new RegExp(`^${key}:[ \\t]*(\\S.*)$`, 'm').exec(fm);
  return scalar ? scalar[1]!.split(',').map(unquote).filter(Boolean) : [];
}

/** The text without front matter, code, links and addresses (where `#` is not a tag). */
function prose(text: string): string {
  return text
    .replace(FRONT, '')
    .replace(/^(```|~~~)[\s\S]*?^\1[^\n]*$/gm, '')
    .replace(/`[^`\n]*`/g, '')
    .replace(/\]\([^)]*\)/g, ']')
    .replace(/<?https?:\/\/[^\s>]+>?/g, '');
}

/** Tags of a note, front matter first, each once (letter case of its first use). */
export function noteTags(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (t: string): void => {
    const tag = t.replace(/^#/, '').trim();
    if (!tag || seen.has(tag.toLowerCase())) return;
    seen.add(tag.toLowerCase());
    out.push(tag);
  };
  const fm = FRONT.exec(text)?.[1];
  if (fm) for (const key of ['tags', 'tag', 'keywords']) listValues(fm, key).forEach(add);
  for (const m of prose(text).matchAll(INLINE)) if (!isColour(m[2]!)) add(m[2]!);
  return out;
}

/** The `#tags` of a line of text, with their place (to show them in the editor, FOLDER-023). */
export function inlineTags(text: string): { tag: string; index: number; length: number }[] {
  const out: { tag: string; index: number; length: number }[] = [];
  for (const m of text.matchAll(INLINE)) {
    if (isColour(m[2]!)) continue;
    out.push({ tag: m[2]!, index: m.index! + m[1]!.length, length: m[2]!.length + 1 });
  }
  return out;
}

/** Colours offered for tags (FOLDER-023), readable on light and dark pages. */
export const TAG_COLOURS = { red: '#d1453b', orange: '#d9822b', yellow: '#b8930b', green: '#2e9e5b', teal: '#1c9aa0', blue: '#2f6fd6', purple: '#8a4fd6', grey: '#7a8494' } as const;
export type TagColour = keyof typeof TAG_COLOURS;

const COLOURS_KEY = 'pwo.folder.tagColours';

/** The colours of the tags of a folder (by tag in lower case), kept in this browser. */
export function loadTagColours(folder: string): Record<string, TagColour> {
  try {
    const all = JSON.parse(localStorage.getItem(COLOURS_KEY) ?? '{}') as Record<string, Record<string, TagColour>>;
    return Object.fromEntries(Object.entries(all[folder] ?? {}).filter(([, c]) => c in TAG_COLOURS));
  } catch {
    return {};
  }
}

/** Give a tag a colour, or none. */
export function setTagColour(folder: string, tag: string, colour: TagColour | undefined): void {
  try {
    const all = JSON.parse(localStorage.getItem(COLOURS_KEY) ?? '{}') as Record<string, Record<string, TagColour>>;
    const mine = { ...(all[folder] ?? {}) };
    if (colour) mine[tag.toLowerCase()] = colour;
    else delete mine[tag.toLowerCase()];
    all[folder] = mine;
    localStorage.setItem(COLOURS_KEY, JSON.stringify(all));
  } catch {
    /* not kept */
  }
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/** Rename the tag `from` to `to` in a note (front matter lists and `#tags`), ignoring case. */
export function renameTag(text: string, from: string, to: string): { text: string; count: number } {
  let count = 0;
  const same = (v: string): boolean => unquote(v).toLowerCase() === from.toLowerCase();
  let out = text;
  const fm = FRONT.exec(text);
  if (fm) {
    let block = fm[1]!;
    for (const key of ['tags', 'tag', 'keywords']) {
      block = block
        .replace(new RegExp(`^(${key}:[ \\t]*\\[)(.*)(\\][ \\t]*)$`, 'm'), (_all, a: string, list: string, b: string) => {
          const items = list.split(',').map((v) => (same(v) ? (count++, ` ${to}`) : v));
          return `${a}${items.join(',').replace(/^ /, '')}${b}`;
        })
        .replace(new RegExp(`^(${key}:[ \\t]*\\n)((?:[ \\t]*-[ \\t]*.*(?:\\n|$))+)`, 'm'), (_all, a: string, lines: string) =>
          a + lines.replace(/^([ \t]*-[ \t]*)(.*)$/gm, (l, dash: string, v: string) => (same(v) ? (count++, `${dash}${to}`) : l)),
        )
        .replace(new RegExp(`^(${key}:[ \\t]*)([^\\[\\n].*)$`, 'm'), (_all, a: string, list: string) => a + list.split(',').map((v) => (same(v) ? (count++, v.replace(v.trim(), to)) : v)).join(','));
    }
    out = text.replace(fm[1]!, block);
  }
  const start = fm ? fm[0].length : 0;
  const body = out.slice(start).replace(new RegExp(`(^|[\\s(\\[,;])#${escape(from)}(?!${TAG_CHARS})`, 'giu'), (_all, before: string) => {
    count++;
    return `${before}#${to}`;
  });
  return { text: out.slice(0, start) + body, count };
}
