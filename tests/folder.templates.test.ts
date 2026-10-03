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
