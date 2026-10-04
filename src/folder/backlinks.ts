/**
 * FOLDER-026: the backlinks of a note — where they are shown (at the bottom
 * of its page, or in the side panel), with the words around each link or
 * not, in which order — and its unlinked mentions: its name or an alias
 * written in another note without a link, made a link in one click.
 */

export interface BacklinkSettings {
  position: 'bottom' | 'side';
  context: boolean;
  sort: 'name' | 'date';
  unlinked: boolean;
  collapsed: boolean;
}

const KEY = 'pwo.notes.backlinks';
const DEFAULTS: BacklinkSettings = { position: 'bottom', context: true, sort: 'name', unlinked: true, collapsed: false };

export function loadBacklinkSettings(): BacklinkSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<BacklinkSettings>;
    return {
      position: saved.position === 'side' ? 'side' : 'bottom',
      context: saved.context ?? DEFAULTS.context,
      sort: saved.sort === 'date' ? 'date' : 'name',
      unlinked: saved.unlinked ?? DEFAULTS.unlinked,
      collapsed: saved.collapsed ?? DEFAULTS.collapsed,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveBacklinkSettings(settings: BacklinkSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* not kept */
  }
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** One of `names` written as a whole word, any case. */
function wordOf(names: string[]): RegExp {
  const alternatives = [...names].filter((n) => n.trim()).sort((a, b) => b.length - a.length).map(escape);
  return new RegExp(`(?<![\\p{L}\\p{N}_])(?:${alternatives.join('|')})(?![\\p{L}\\p{N}_])`, 'giu');
}

/** Whether a text names the note (its name or an alias) as a whole word. */
export function mentions(text: string, names: string[]): boolean {
  return names.some((n) => n.trim()) && wordOf(names).test(text);
}

/** The places of a note where a mention is not plain text: front matter, links, code. */
function masked(text: string): [number, number][] {
  const out: [number, number][] = [];
  const front = /^---[ \t]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(text);
  if (front) out.push([0, front[0].length]);
  for (const re of [/```[\s\S]*?```/g, /`[^`\n]*`/g, /!?\[\[[^\]\n]*\]\]/g, /!?\[[^\]\n]*\]\([^)\n]*\)/g, /<[^>\n]+>/g, /https?:\/\/\S+/g]) {
    for (const m of text.matchAll(re)) out.push([m.index!, m.index! + m[0].length]);
  }
  return out;
}

/**
 * The first plain mention of the note in `text` made a link: `[[Name]]`, or
 * `[[Name|as written]]` when written otherwise; `undefined` when there is none.
 */
export function linkMention(text: string, name: string, aliases: string[] = []): string | undefined {
  const skip = masked(text);
  for (const m of text.matchAll(wordOf([name, ...aliases]))) {
    const at = m.index!;
    if (skip.some(([a, b]) => at >= a && at < b)) continue;
    const link = m[0] === name ? `[[${name}]]` : `[[${name}|${m[0]}]]`;
    return text.slice(0, at) + link + text.slice(at + m[0].length);
  }
  return undefined;
}
