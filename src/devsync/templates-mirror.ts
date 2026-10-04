/**
 * DEVSYNC-012: the templates of the user (kept in the browser's database,
 * FILE-019) found on the paired devices too — mirrored as files in the
 * folder `Templates` of the synchronised documents, both ways: a template
 * saved here is written there before each synchronisation, a template come
 * from another device is taken in after it, and a template deleted on one
 * device is deleted on the others.
 */
import { detectFormat, fileExtension } from '../core/format';
import type { DocumentFormat } from '../core/format';
import type { StorageProvider } from '../fs';
import { sha256 } from './engine';

export const TEMPLATES_DIR = 'Templates';

export interface TemplateStore {
  list(): Promise<{ id: string; name: string; format: DocumentFormat }[]>;
  load(id: string): Promise<Uint8Array | undefined>;
  save(name: string, format: DocumentFormat, bytes: Uint8Array): Promise<string>;
  remove(id: string): Promise<void>;
}

/** What was mirrored at the last reconciliation: content hash by path. */
export type Mirrored = Record<string, string>;

const safeName = (name: string): string => name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').trim() || 'template';
export const templatePath = (name: string, format: DocumentFormat): string => `${TEMPLATES_DIR}/${safeName(name)}.${fileExtension(format)}`;

async function readFile(files: StorageProvider, path: string): Promise<Uint8Array | undefined> {
  try {
    return new Uint8Array(await (await files.read(path)).arrayBuffer());
  } catch {
    return undefined;
  }
}

async function folderFiles(files: StorageProvider): Promise<string[]> {
  try {
    return (await files.list(TEMPLATES_DIR)).filter((e) => e.kind === 'file' && !e.name.startsWith('.')).map((e) => e.path);
  } catch {
    return [];
  }
}

/** The format a template file was written in, from its extension. */
const FORMATS: DocumentFormat[] = ['odt', 'docx', 'md', 'mdz', 'tex', 'ods', 'xlsx', 'csv', 'odp', 'pptx'];
const formatOfPath = (path: string): DocumentFormat | undefined => FORMATS.find((f) => path.toLowerCase().endsWith(`.${fileExtension(f)}`));

/** Before a synchronisation: the templates of this browser written as files; those deleted on either side removed. */
export async function exportTemplates(files: StorageProvider, store: TemplateStore, mirrored: Mirrored): Promise<Mirrored> {
  const next = { ...mirrored };
  const templates = await store.list();
  const paths = new Set<string>();
  for (const tpl of templates) {
    const path = templatePath(tpl.name, tpl.format);
    paths.add(path);
    const onDisk = await readFile(files, path);
    if (!onDisk && next[path] !== undefined) {
      // Mirrored before, gone now: deleted on another device.
      await store.remove(tpl.id);
      delete next[path];
      continue;
    }
    const bytes = await store.load(tpl.id);
    if (!bytes) continue;
    const mine = await sha256(bytes);
    const there = onDisk ? await sha256(onDisk) : undefined;
    // Not there yet, or changed here since the last time: written (changed on both: the synchronisation keeps both).
    if (there === undefined || (there !== mine && mine !== next[path])) {
      await files.write(path, new Blob([bytes as BlobPart]));
      next[path] = mine;
    } else if (there === mine) next[path] = mine;
    // Otherwise changed on another device only: taken in after the synchronisation.
  }
  // Deleted here since the last time: the file goes too (and to the other devices' trash).
  for (const path of Object.keys(next)) {
    if (paths.has(path)) continue;
    await files.remove(path).catch(() => undefined);
    delete next[path];
  }
  return next;
}

/** After a synchronisation: the template files new or changed (on another device) taken in; those gone, deleted. */
export async function importTemplates(files: StorageProvider, store: TemplateStore, mirrored: Mirrored): Promise<Mirrored> {
  const next = { ...mirrored };
  const templates = await store.list();
  const byPath = new Map(templates.map((tpl) => [templatePath(tpl.name, tpl.format), tpl]));
  const present = new Set<string>();
  for (const path of await folderFiles(files)) {
    present.add(path);
    const bytes = await readFile(files, path);
    if (!bytes) continue;
    const hash = await sha256(bytes);
    if (next[path] === hash && byPath.has(path)) continue;
    const name = path.slice(TEMPLATES_DIR.length + 1).replace(/\.[^.]+$/, '');
    const format = byPath.get(path)?.format ?? formatOfPath(path) ?? detectFormat(path, bytes);
    if (!format) continue;
    await store.save(name, format, bytes);
    next[path] = hash;
  }
  for (const [path, tpl] of byPath) {
    if (present.has(path) || next[path] === undefined) continue;
    await store.remove(tpl.id);
    delete next[path];
  }
  return next;
}
