/** MDZ package writer (MD-005, MD-008, MD-009, MD-015). */
import { writeZip, type ZipEntryInput } from '../core/zip';
import { writeMarkdown } from './markdown-writer';
import { assetCategory, MDZ_VERSION, type MdzAsset, type MdzManifest } from './mdz-manifest';
import type { MdzExtras } from './mdz-reader';
import { cleanMeta, extensionForType, isCodeCellRun, isImageRun, mediaTypeForName, paragraphText, type Block, type RichDocument } from './model';

function* imageRuns(blocks: Block[]): Generator<{ image: string; alt?: string }> {
  for (const b of blocks) {
    if (b.type === 'paragraph') {
      for (const r of b.runs) {
        if (isImageRun(r) && r.image) yield r;
        // CODE-006: figures produced by code cells.
        if (isCodeCellRun(r)) for (const image of r.output?.images ?? []) yield { image, alt: 'Output' };
      }
    } else if (b.type === 'table') {
      for (const row of b.rows) for (const cell of row) yield* imageRuns(cell.blocks);
    }
  }
}

const slug = (s: string): string => s.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'asset';

export function writeMdz(doc: RichDocument): Uint8Array {
  const extras = doc.extras?.mdz as MdzExtras | undefined;
  const assets: MdzAsset[] = [];
  const entries: ZipEntryInput[] = [];
  const imagePaths = new Map<string, string>();

  for (const run of imageRuns(doc.blocks)) {
    if (imagePaths.has(run.image)) continue;
    const res = doc.resources.get(run.image);
    if (!res) continue;
    const path = `assets/images/${run.image}.${extensionForType(res.mediaType)}`;
    imagePaths.set(run.image, path);
    assets.push({ id: run.image, path, type: 'image', ...(run.alt ? { alt: run.alt } : {}) });
    entries.push({ path, data: res.data, store: true });
  }

  const previous = new Map((extras?.manifest?.assets ?? []).map((a) => [a.path, a]));
  for (const [path, data] of Object.entries(extras?.files ?? {})) {
    if (imagePaths.has(path)) continue;
    const known = previous.get(path);
    assets.push(known ?? { id: slug(path.replace(/^assets\/files\//, '')), path, type: assetCategory(mediaTypeForName(path)) });
    entries.push({ path, data });
  }

  const firstHeading = doc.blocks.find((b) => b.type === 'paragraph' && /^h\d$/.test(b.style));
  const title = doc.meta.title || (firstHeading && firstHeading.type === 'paragraph' ? paragraphText(firstHeading) : '') || 'Untitled';
  const manifest: MdzManifest = {
    ...(extras?.manifest ?? {}),
    version: MDZ_VERSION,
    title,
    date: doc.meta.date ?? extras?.manifest?.date ?? new Date().toISOString().slice(0, 10),
    filename: extras?.filename ?? extras?.manifest?.filename ?? 'index.md',
    assets,
  };
  const author = doc.meta.author ?? extras?.manifest?.author;
  if (author) manifest.author = author;
  // DOC-017: document properties live in the manifest, not in index.md.
  const meta = cleanMeta(doc.meta);
  for (const key of ['subject', 'description', 'language', 'license'] as const) {
    if (meta[key]) manifest[key] = meta[key];
    else delete manifest[key];
  }
  if (meta.keywords) manifest.keywords = meta.keywords;
  else delete manifest.keywords;

  const markdown = writeMarkdown(doc, { imageUrl: (key) => `./${imagePaths.get(key) ?? ''}`, frontMatter: false });
  return writeZip([
    { path: 'index.md', data: markdown },
    { path: 'manifest.json', data: JSON.stringify(manifest, null, 2) + '\n' },
    ...entries,
  ]);
}
