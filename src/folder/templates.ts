/**
 * Templates kept in the open folder (FOLDER-020): the documents of its
 * `Templates` folder (or `_templates`, `Modèles`), offered in the template
 * gallery, and where "Save as template" can put new ones.
 */
import { basename, walk, type StorageProvider } from '../fs';
import { OPENABLE } from './panel';

export const TEMPLATE_DIRS = /^(_?templates|mod[eè]les)$/i;

export interface FolderTemplate {
  /** File name without its extension. */
  name: string;
  path: string;
}

/** The templates folder at the root of the folder, if any. */
export async function templatesDir(provider: StorageProvider): Promise<string | undefined> {
  return (await provider.list('')).find((e) => e.kind === 'directory' && TEMPLATE_DIRS.test(e.name))?.path;
}

export async function folderTemplates(provider: StorageProvider): Promise<FolderTemplate[]> {
  const dir = await templatesDir(provider);
  if (!dir) return [];
  const out: FolderTemplate[] = [];
  for await (const e of walk(provider, dir)) if (OPENABLE.test(e.path)) out.push({ name: basename(e.path).replace(/\.[^.]+$/, ''), path: e.path });
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
