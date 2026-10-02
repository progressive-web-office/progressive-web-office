import { describe, expect, it } from 'vitest';
import { FileListProvider, listFiles } from '../src/fs';
import { FolderIndex } from '../src/folder/search';
import { readDocument, writeDocument } from '../src/document/io';
import { emptyDocument, type Block } from '../src/document/model';
import { detectFormat } from '../src/core/format';

const file = (path: string, data: string | Uint8Array): File => {
  const f = new File([data as BlobPart], path.split('/').pop()!);
  Object.defineProperty(f, 'webkitRelativePath', { value: `thesis/${path}` });
  return f;
};

describe('FOLDER-002 search across a folder', () => {
  it('finds text in Markdown, LaTeX and Word files, ignoring case and accents', async () => {
    const doc = emptyDocument();
    doc.blocks = [{ type: 'paragraph', style: 'normal', runs: [{ text: 'La Régulation PID en boucle fermée' }] } as Block];
    const docx = writeDocument(doc, 'docx');
    const folder = new FileListProvider([file('notes.md', 'Intro\n\nUn régulateur PID simple.'), file('main.tex', '\\section{Regulation}'), file('report.docx', docx), file('image.png', 'regulation')]);
    const index = new FolderIndex(folder, async (name, bytes) => readDocument(detectFormat(name, bytes) as 'docx', bytes));
    const hits = await index.search('REGUL', await listFiles(folder));
    expect(hits.map((h) => h.path)).toEqual(['main.tex', 'notes.md', 'report.docx']);
    expect(hits.find((h) => h.path === 'report.docx')?.snippets).toEqual(['La Régulation PID en boucle fermée']);
    expect(await index.search('  ', await listFiles(folder))).toEqual([]);
  });
});
