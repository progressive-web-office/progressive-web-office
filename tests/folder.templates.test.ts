import { describe, expect, it } from 'vitest';
import { MemoryProvider } from '../src/fs';
import { folderTemplates, templatesDir } from '../src/folder/templates';

describe('FOLDER-020 templates kept in the folder', () => {
  it('finds the documents of the Templates folder, sub-folders included', async () => {
    const p = new MemoryProvider('m', 'M', { 'Templates/Letter.odt': 'x', 'Templates/course/Sheet.md': '# S', 'Templates/notes.bin': '?', 'doc.md': '# D' });
    expect(await templatesDir(p)).toBe('Templates');
    expect(await folderTemplates(p)).toEqual([
      { name: 'Letter', path: 'Templates/Letter.odt' },
      { name: 'Sheet', path: 'Templates/course/Sheet.md' },
    ]);
  });

  it('knows other usual names, and folders without templates', async () => {
    expect(await templatesDir(new MemoryProvider('m', 'M', { '_templates/a.md': '' }))).toBe('_templates');
    expect(await templatesDir(new MemoryProvider('m', 'M', { 'Modèles/a.md': '' }))).toBe('Modèles');
    expect(await folderTemplates(new MemoryProvider('m', 'M', { 'a.md': '' }))).toEqual([]);
  });
});

describe('DOC-037 snippets kept in the folder', () => {
  it('reads the text files of the Snippets folder, named after them', async () => {
    const { folderSnippets } = await import('../src/folder/templates');
    const p = new MemoryProvider('m', 'M', { 'Snippets/sig.md': 'Regards\n', 'Snippets/x/abstract.txt': '**Abstract.** ${0}', 'Snippets/pic.png': '?' });
    expect(await folderSnippets(p)).toEqual([
      { name: 'abstract', body: '**Abstract.** ${0}', origin: 'folder' },
      { name: 'sig', body: 'Regards', origin: 'folder' },
    ]);
    expect(await folderSnippets(new MemoryProvider('m', 'M', {}))).toEqual([]);
  });
});
