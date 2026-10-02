/**
 * Master documents (DOC-028): a document whose `include` blocks are
 * sub-documents, assembled into one document for export, numbering and
 * cross-references running on across chapters.
 */
import type { BibEntry } from './bibliography';
import type { Block, RichDocument } from './model';

/** Reads a document by its path (relative to the folder or to the including document). */
export type DocumentLoader = (path: string) => Promise<RichDocument | undefined>;

export interface AssembleResult {
  doc: RichDocument;
  /** Sub-documents that could not be read, or that include themselves. */
  missing: string[];
}

/** Path of `src` written in the document at `from` (both relative to the folder). */
export function resolvePath(from: string, src: string): string {
  if (/^[a-z]+:/i.test(src) || src.startsWith('/')) return src.replace(/^\/+/, '');
  const parts = from.split('/').slice(0, -1);
  for (const seg of src.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg && seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

/** The paths of the sub-documents of a document. */
export const includesOf = (doc: RichDocument): string[] => doc.blocks.flatMap((b) => (b.type === 'include' ? [b.src] : []));

const MAX_DEPTH = 8;

/**
 * Replace the sub-documents by their content, recursively: images, sources and
 * properties are merged (the master's win), a document included in itself is
 * reported missing.
 */
export async function assemble(master: RichDocument, path: string, load: DocumentLoader): Promise<AssembleResult> {
  const missing: string[] = [];
  const resources = new Map(master.resources);
  const entries = new Map<string, BibEntry>((master.references?.entries ?? []).map((e) => [e.key, e]));
  const expand = async (blocks: Block[], at: string, stack: string[]): Promise<Block[]> => {
    const out: Block[] = [];
    for (const b of blocks) {
      if (b.type !== 'include') {
        out.push(b);
        continue;
      }
      const target = resolvePath(at, b.src);
      if (stack.includes(target) || stack.length > MAX_DEPTH) {
        missing.push(target);
        continue;
      }
      let sub: RichDocument | undefined;
      try {
        sub = await load(target);
      } catch {
        sub = undefined;
      }
      if (!sub) {
        missing.push(target);
        continue;
      }
      for (const [k, v] of sub.resources) if (!resources.has(k)) resources.set(k, v);
      for (const e of sub.references?.entries ?? []) if (!entries.has(e.key)) entries.set(e.key, e);
      out.push(...(await expand(sub.blocks, target, [...stack, target])));
    }
    return out;
  };
  const blocks = await expand(master.blocks, path, [path]);
  const doc: RichDocument = { ...master, blocks, resources };
  if (entries.size) doc.references = { ...master.references, entries: [...entries.values()] };
  return { doc, missing };
}
