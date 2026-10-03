/**
 * Folders of linked Markdown notes (FOLDER-005): names, aliases, backlinks,
 * and links kept up to date when a note is renamed.
 */
import { readText, resolve as resolvePath, type StorageProvider } from '../fs';
import { frontMatterAliases, noteName, parseWikiLinks, renameWikiLinks, resolveNote } from '../document/wiki-links';
import { noteTags, renameTag } from './tags';

export const isNote = (path: string): boolean => /\.(md|markdown)$/i.test(path);

/** Markdown links `[text](relative/path.md)` of a text (targets as written). */
const markdownLinks = (text: string): string[] => [...text.matchAll(/\]\(([^)\s]+\.(?:md|markdown))(?:#[^)]*)?\)/gi)].map((m) => decodeURI(m[1]!));

export class NoteVault {
  private readonly texts = new Map<string, string>();

  constructor(private readonly provider: StorageProvider) {}

  /** Forget cached texts (after changes made outside the vault). */
  clear(path?: string): void {
    if (path) this.texts.delete(path);
    else this.texts.clear();
  }

  async text(path: string): Promise<string> {
    let t = this.texts.get(path);
    if (t === undefined) {
      t = await readText(this.provider, path).catch(() => '');
      this.texts.set(path, t);
    }
    return t;
  }

  async aliases(notes: string[]): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    for (const n of notes) {
      const a = frontMatterAliases(await this.text(n));
      if (a.length) out.set(n, a);
    }
    return out;
  }

  /** The note a `[[target]]` written in `from` points to. */
  async resolve(target: string, notes: string[], from: string): Promise<string | undefined> {
    return resolveNote(target, notes, from) ?? resolveNote(target, notes, from, await this.aliases(notes));
  }

  /** Notes that link to `path`, by wiki link or relative Markdown link. */
  async backlinks(path: string, notes: string[]): Promise<string[]> {
    const aliases = await this.aliases(notes);
    const out: string[] = [];
    for (const n of notes) {
      if (n === path) continue;
      const text = await this.text(n);
      const wiki = parseWikiLinks(text).some((l) => l.target && resolveNote(l.target, notes, n, aliases) === path);
      if (wiki || markdownLinks(text).some((href) => !/^[a-z]+:/i.test(href) && resolvePath(n, href) === path)) out.push(n);
    }
    return out;
  }

  /** Notes of each tag, the most used first (FOLDER-017). */
  async tags(notes: string[]): Promise<Map<string, string[]>> {
    const byKey = new Map<string, { tag: string; notes: string[] }>();
    for (const n of notes) {
      for (const tag of noteTags(await this.text(n))) {
        const key = tag.toLowerCase();
        const entry = byKey.get(key) ?? { tag, notes: [] };
        entry.notes.push(n);
        byKey.set(key, entry);
      }
    }
    const sorted = [...byKey.values()].sort((a, b) => b.notes.length - a.notes.length || a.tag.localeCompare(b.tag));
    return new Map(sorted.map((e) => [e.tag, e.notes]));
  }

  /** Rename a tag in every note; returns the notes changed. */
  async renameTag(from: string, to: string, notes: string[]): Promise<string[]> {
    const changed: string[] = [];
    for (const n of notes) {
      const { text, count } = renameTag(await this.text(n), from, to);
      if (!count) continue;
      await this.provider.write(n, new Blob([text]));
      this.texts.set(n, text);
      changed.push(n);
    }
    return changed;
  }

  /** Links between the notes (wiki links and relative Markdown links), each once (FOLDER-018). */
  async links(notes: string[]): Promise<{ from: string; to: string }[]> {
    const aliases = await this.aliases(notes);
    const known = new Set(notes);
    const out: { from: string; to: string }[] = [];
    for (const n of notes) {
      const text = await this.text(n);
      const targets = new Set<string>();
      for (const l of parseWikiLinks(text)) {
        const to = l.target ? resolveNote(l.target, notes, n, aliases) : undefined;
        if (to && to !== n) targets.add(to);
      }
      for (const href of markdownLinks(text)) {
        if (/^[a-z]+:/i.test(href)) continue;
        const to = resolvePath(n, href);
        if (known.has(to) && to !== n) targets.add(to);
      }
      for (const to of targets) out.push({ from: n, to });
    }
    return out;
  }

  /**
   * After `from` was renamed to `to`: rewrite the wiki links naming it in the
   * other notes; returns the notes changed (`skip` is left alone).
   */
  async renameLinks(from: string, to: string, notes: string[], skip?: string): Promise<string[]> {
    const oldName = noteName(from);
    const newName = noteName(to);
    if (oldName === newName) return [];
    const changed: string[] = [];
    for (const n of notes) {
      if (n === skip) continue;
      const { text, count } = renameWikiLinks(await this.text(n), oldName, newName);
      if (!count) continue;
      await this.provider.write(n, new Blob([text]));
      this.texts.set(n, text);
      changed.push(n);
    }
    return changed;
  }
}

export { noteName };
