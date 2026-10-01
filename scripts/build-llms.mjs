// Generate llms.txt (index) and llms-full.txt (full text) from the Markdown
// documentation, following https://llmstxt.org/. Output goes next to the
// built site (docs/.vitepress/dist) so it is published with the docs.
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../docs/', import.meta.url));
const outDir = process.argv[2] ?? join(root, '.vitepress', 'dist');
const siteUrl = (process.env.DOCS_URL ?? '').replace(/\/$/, '');

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'public' || entry.name === 'node_modules') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(path)));
    else if (entry.name.endsWith('.md')) out.push(path);
  }
  return out;
}

function parse(text) {
  const fm = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  const meta = {};
  if (fm) {
    for (const line of fm[1].split('\n')) {
      const m = /^(\w+):\s*(.*)$/.exec(line);
      if (m && m[2]) meta[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
  const body = fm ? text.slice(fm[0].length) : text;
  const title = /^#\s+(.+)$/m.exec(body)?.[1] ?? meta.title ?? 'Untitled';
  return { meta, body: body.trim(), title };
}

const files = (await walk(root)).sort((a, b) => {
  const ra = relative(root, a);
  const rb = relative(root, b);
  if (ra === 'index.md') return -1;
  if (rb === 'index.md') return 1;
  return ra.localeCompare(rb);
});

const pages = [];
for (const file of files) {
  const rel = relative(root, file).replace(/\\/g, '/');
  const { meta, body, title } = parse(await readFile(file, 'utf8'));
  const url = `${siteUrl}/${rel.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '')}`;
  pages.push({ rel, url, title, description: meta.description ?? '', body });
}

const home = pages.find((p) => p.rel === 'index.md');
const index = [
  '# Progressive Web Office',
  '',
  `> ${home?.description ?? 'A simple office suite that runs entirely in the browser.'}`,
  '',
  'Progressive Web Office is an installable Progressive Web App written in TypeScript that opens, edits and saves',
  'word-processing documents (.docx, .odt, .md, .mdz), spreadsheets (.xlsx, .ods, .csv),',
  'presentations (.pptx, .odp) and displays PDF files. All processing happens client-side.',
  '',
  '## Docs',
  '',
  ...pages
    .filter((p) => p.rel !== 'index.md')
    .map((p) => `- [${p.title}](${p.url}): ${p.description}`.replace(/: $/, '')),
  '',
  '## Optional',
  '',
  `- [Full documentation](${siteUrl}/llms-full.txt): all pages concatenated`,
  '',
].join('\n');

const full = pages
  .filter((p) => p.rel !== 'index.md')
  .map((p) => `<!-- source: docs/${p.rel} -->\n\n${p.body}\n`)
  .join('\n---\n\n');

await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, 'llms.txt'), index);
await writeFile(join(outDir, 'llms-full.txt'), `# Progressive Web Office — full documentation\n\n${full}`);
console.log(`llms.txt and llms-full.txt written to ${relative(process.cwd(), outDir) || '.'} (${pages.length} pages)`);
