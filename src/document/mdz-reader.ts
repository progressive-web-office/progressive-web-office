/**
 * MDZ package reader (MD-004, MD-006, MD-007, MD-009) and plain ZIP of
 * Markdown import (MD-014, MD-016, MD-017), TextBundle packages (MD-011).
 */
import { strFromU8 } from 'fflate';
import { readZip, type ZipEntries } from '../core/zip';
import { readMarkdown } from './markdown-reader';
import { isSafeArchivePath, validateManifest, type MdzManifest } from './mdz-manifest';
import { cleanMeta, mediaTypeForName, type RichDocument } from './model';

/** Thrown when the user cancels the entry-document choice. */
export class MdzCancelled extends Error {
  constructor() {
    super('Opening cancelled.');
    this.name = 'MdzCancelled';
  }
}

export interface MdzReadOptions {
  /** Ask the user which Markdown file is the entry point (MD-017). */
  chooseEntry?: (candidates: string[], preselected: string) => Promise<string | null>;
}

/** Data preserved for MDZ round-trips. */
export interface MdzExtras {
  /** Original manifest (unknown fields are written back). */
  manifest?: MdzManifest;
  /** Files written back unchanged, keyed by their path in the MDZ. */
  files: Record<string, Uint8Array>;
  /** Original Markdown file name. */
  filename?: string;
}

const JUNK = /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db)(\/|$)/;
const MD = /\.(md|markdown)$/i;

const dirname = (p: string): string => (p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '');
const basename = (p: string): string => p.slice(p.lastIndexOf('/') + 1);

/** Resolve a Markdown reference against a base directory inside the archive. */
export function resolveArchivePath(base: string, ref: string): string | undefined {
  if (!ref || /^[a-z][a-z0-9+.-]*:/i.test(ref) || ref.startsWith('#') || ref.startsWith('/') || ref.includes('\\')) return undefined;
  let clean = ref.replace(/[?#].*$/, '');
  try {
    clean = decodeURI(clean);
  } catch {
    /* keep as is */
  }
  const parts = base.split('/').filter(Boolean);
  for (const seg of clean.split('/')) {
    if (seg === '..') {
      if (!parts.length) return undefined; // escapes the archive root (MD-007)
      parts.pop();
    } else if (seg !== '.' && seg !== '') {
      parts.push(seg);
    }
  }
  const path = parts.join('/');
  return isSafeArchivePath(path) ? path : undefined;
}

function preselect(candidates: string[]): string {
  const byName = (name: string) => candidates.find((c) => basename(c).toLowerCase() === name);
  const shallowest = (list: string[]) => [...list].sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))[0];
  return (
    shallowest(candidates.filter((c) => basename(c).toLowerCase() === 'index.md')) ??
    shallowest(candidates.filter((c) => basename(c).toLowerCase() === 'readme.md')) ??
    byName('index.markdown') ??
    candidates[0]!
  );
}

/** The text of a TextBundle, `[…/]text.md` (or `.markdown`) beside its `info.json`. */
export function textBundleEntry(zip: ZipEntries): string | undefined {
  for (const info of Object.keys(zip).filter((p) => /(^|\/)info\.json$/.test(p) && !JUNK.test(p))) {
    const dir = dirname(info);
    if (dir.split('/').length > 2) continue;
    const text = ['text.md', 'text.markdown'].map((n) => dir + n).find((p) => zip[p]);
    if (text && isSafeArchivePath(text)) return text;
  }
  return undefined;
}

export async function readMdz(bytes: Uint8Array, opts: MdzReadOptions = {}): Promise<RichDocument> {
  const zip = readZip(bytes);
  return zip['manifest.json'] ? readNative(zip) : readPlain(zip, opts);
}

function readNative(zip: ZipEntries): RichDocument {
  let raw: unknown;
  try {
    raw = JSON.parse(strFromU8(zip['manifest.json']!));
  } catch (err) {
    throw new Error(`Invalid MDZ package: manifest.json is not valid JSON (${(err as Error).message}).`);
  }
  const result = validateManifest(raw);
  if (!result.ok) throw new Error(`Invalid MDZ package: ${result.errors.join('; ')}.`);
  const manifest = result.manifest;
  const index = zip['index.md'];
  if (!index) throw new Error('Invalid MDZ package: index.md is missing.');

  const used = new Set<string>(['manifest.json', 'index.md']);
  const doc = readMarkdown(strFromU8(index), {
    resolveImage: (src) => {
      const path = resolveArchivePath('', src);
      const data = path ? zip[path] : undefined;
      if (!path || !data) return undefined;
      const mediaType = mediaTypeForName(path);
      if (!mediaType.startsWith('image/')) return undefined;
      used.add(path);
      return { data, mediaType, name: basename(path) };
    },
  });
  const files: Record<string, Uint8Array> = {};
  for (const [path, data] of Object.entries(zip)) {
    if (!used.has(path) && !path.endsWith('/') && !JUNK.test(path) && isSafeArchivePath(path)) files[path] = data;
  }
  // DOC-017: the manifest wins; a front matter in index.md fills the gaps.
  const keywords = typeof manifest.keywords === 'string' ? manifest.keywords.split(',') : (manifest.keywords ?? undefined);
  const fromManifest = cleanMeta({
    title: manifest.title,
    author: manifest.author ?? undefined,
    date: manifest.date ?? undefined,
    subject: manifest.subject ?? undefined,
    description: manifest.description ?? undefined,
    keywords,
    language: manifest.language ?? undefined,
    license: manifest.license ?? undefined,
    source: manifest.source ?? undefined,
  });
  const fromFrontMatter = cleanMeta(doc.meta);
  if (fromFrontMatter.title && fromManifest.title === undefined) fromManifest.title = fromFrontMatter.title;
  doc.meta = { ...fromFrontMatter, ...fromManifest };
  const extras: MdzExtras = { manifest, files };
  if (manifest.filename) extras.filename = manifest.filename;
  doc.extras = { ...doc.extras, mdz: extras };
  return doc;
}

async function readPlain(zip: ZipEntries, opts: MdzReadOptions): Promise<RichDocument> {
  const candidates = Object.keys(zip)
    .filter((p) => MD.test(p) && !JUNK.test(p) && isSafeArchivePath(p))
    .sort((a, b) => a.localeCompare(b));
  if (!candidates.length) throw new Error('This ZIP archive does not contain any Markdown (.md) file.');
  let entry = candidates[0]!;
  // MD-011: a TextBundle (`.textpack`): its text is `text.md` next to `info.json`.
  const bundled = textBundleEntry(zip);
  if (bundled) entry = bundled;
  else if (candidates.length > 1) {
    const pre = preselect(candidates);
    const chosen = opts.chooseEntry ? await opts.chooseEntry(candidates, pre) : pre;
    if (!chosen) throw new MdzCancelled();
    if (!candidates.includes(chosen)) throw new Error(`“${chosen}” is not a Markdown file of this archive.`);
    entry = chosen;
  }
  const base = dirname(entry);
  const used = new Set<string>([entry]);
  const doc = readMarkdown(strFromU8(zip[entry]!), {
    resolveImage: (src) => {
      const path = resolveArchivePath(base, src);
      const data = path ? zip[path] : undefined;
      if (!path || !data) return undefined;
      const mediaType = mediaTypeForName(path);
      if (!mediaType.startsWith('image/')) return undefined;
      used.add(path);
      return { data, mediaType, name: basename(path) };
    },
    // Links to other files of the archive keep working once moved to assets/files/.
    rewriteLink: (href) => {
      const path = resolveArchivePath(base, href);
      return path && zip[path] ? `./assets/files/${path}` : href;
    },
  });
  const files: Record<string, Uint8Array> = {};
  for (const [path, data] of Object.entries(zip)) {
    if (used.has(path) || path.endsWith('/') || JUNK.test(path) || !isSafeArchivePath(path)) continue;
    files[`assets/files/${path}`] = data;
  }
  doc.meta.title ??= basename(entry).replace(MD, '');
  doc.extras = { ...doc.extras, mdz: { files, filename: basename(entry) } satisfies MdzExtras };
  return doc;
}
