import { describe, expect, it } from 'vitest';
import { FilesFolder } from '../src/storage/folder';
import { FolderIndex } from '../src/folder/search';
import { readDocument, writeDocument } from '../src/document/io';
import { emptyDocument, type Block } from '../src/document/model';
import { detectFormat } from '../src/core/format';

const file = (path: string, data: string | Uint8Array): File => {
  const f = new File([data as BlobPart], path.split('/').pop()!);
  Object.defineProperty(f, 'webkitRelativePath', { value: `thesis/${path}` });
  return f;
};

describe('FOLDER-001 folders', () => {
  it('lists the files of a folder picked in any browser, without hidden folders', async () => {
    const folder = new FilesFolder([file('b.md', '# B'), file('chapters/a.md', 'x'), file('.git/config', ''), file('node_modules/x/y.js', '')]);
    expect(folder.name).toBe('thesis');
    expect(folder.writable).toBe(false);
    expect(await folder.list()).toEqual(['b.md', 'chapters/a.md']);
    expect(new TextDecoder().decode(await folder.read('chapters/a.md'))).toBe('x');
    await expect(folder.write()).rejects.toThrow(/read-only/);
  });
});

describe('FOLDER-002 search across a folder', () => {
  it('finds text in Markdown, LaTeX and Word files, ignoring case and accents', async () => {
    const doc = emptyDocument();
    doc.blocks = [{ type: 'paragraph', style: 'normal', runs: [{ text: 'La Régulation PID en boucle fermée' }] } as Block];
    const docx = writeDocument(doc, 'docx');
    const folder = new FilesFolder([file('notes.md', 'Intro\n\nUn régulateur PID simple.'), file('main.tex', '\\section{Regulation}'), file('report.docx', docx), file('image.png', 'regulation')]);
    const index = new FolderIndex(folder, async (name, bytes) => readDocument(detectFormat(name, bytes) as 'docx', bytes));
    const hits = await index.search('REGUL', await folder.list());
    expect(hits.map((h) => h.path)).toEqual(['main.tex', 'notes.md', 'report.docx']);
    expect(hits.find((h) => h.path === 'report.docx')?.snippets).toEqual(['La Régulation PID en boucle fermée']);
    expect(await index.search('  ', await folder.list())).toEqual([]);
  });
});
