/** LaTeX projects packed as ZIP archives (TEX-002, TEX-003). */
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { isSafeArchivePath } from './mdz-manifest';
import { mediaTypeForName, type RichDocument, type WriteOptions } from './model';
import { readLatex } from './latex-reader';
import { writeLatex } from './latex-writer';

const JUNK = /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db)(\/|$)/;
const IMAGE_EXTENSIONS = ['', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'];

export function writeLatexZip(doc: RichDocument, opts: WriteOptions = {}): Uint8Array {
  const { tex, images } = writeLatex(doc, opts);
  const files: Record<string, Uint8Array> = { 'main.tex': strToU8(tex) };
  for (const [path, data] of images) files[path] = data;
  return zipSync(files);
}

/** Pick the main file: one with \documentclass, preferring main.tex and shallow paths. */
function mainFile(paths: string[], zip: Record<string, Uint8Array>): string | undefined {
  const tex = paths.filter((p) => /\.tex$/i.test(p)).sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b));
  const withClass = tex.filter((p) => /\\documentclass/.test(strFromU8(zip[p]!)));
  const pool = withClass.length ? withClass : tex;
  return pool.find((p) => /(^|\/)main\.tex$/i.test(p)) ?? pool[0];
}

export function readLatexZip(bytes: Uint8Array): RichDocument {
  const zip = unzipSync(bytes);
  const paths = Object.keys(zip).filter((p) => !JUNK.test(p) && !p.endsWith('/'));
  const main = mainFile(paths, zip);
  if (!main) throw new Error('No .tex file found in the archive.');
  const dir = main.includes('/') ? main.slice(0, main.lastIndexOf('/') + 1) : '';
  const lookup = new Map(paths.map((p) => [p.toLowerCase(), p]));
  // Inline \input / \include files (one level deep is enough for most projects).
  const source = strFromU8(zip[main]!).replace(/\\(?:input|include)\{([^}]+)\}/g, (all, ref: string) => {
    for (const ext of ['', '.tex']) {
      const p = lookup.get((dir + ref.trim() + ext).toLowerCase());
      if (p && isSafeArchivePath(p)) return strFromU8(zip[p]!);
    }
    return all;
  });
  return readLatex(source, {
    resolveFile: (ref) => {
      const p = lookup.get((dir + ref.replace(/^\.\//, '')).toLowerCase());
      return p && isSafeArchivePath(p) ? strFromU8(zip[p]!) : undefined;
    },
    resolveImage: (ref) => {
      for (const ext of IMAGE_EXTENSIONS) {
        const p = lookup.get((dir + ref.replace(/^\.\//, '') + ext).toLowerCase());
        if (p && isSafeArchivePath(p)) {
          const mediaType = mediaTypeForName(p);
          if (mediaType.startsWith('image/')) return { data: zip[p]!, mediaType, name: p.slice(p.lastIndexOf('/') + 1) };
        }
      }
      return undefined;
    },
  });
}
