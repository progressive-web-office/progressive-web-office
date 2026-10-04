import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryProvider } from '../src/fs';
import { addSource, loadSources, removeSource, templatesIn } from '../src/templates/sources';

describe('FILE-030 templates in one’s own repository or cloud folder', () => {
  beforeEach(() => localStorage.clear());

  it('keeps the sources, once each, and forgets them', () => {
    const a = addSource({ kind: 'git', label: 'me/templates', url: 'https://github.com/me/templates/tree/main/letters' });
    addSource({ kind: 'dav', label: 'me@cloud/Modèles', accountId: 'd1', folder: 'Modèles' });
    addSource({ kind: 'git', label: 'me/templates', url: 'https://github.com/me/templates/tree/main/letters' });
    expect(loadSources().map((s) => s.label)).toEqual(['me@cloud/Modèles', 'me/templates']);
    removeSource(a.id);
    expect(loadSources().map((s) => s.kind)).toEqual(['dav']);
  });

  it('lists the documents of the folder, not hidden files or other files', async () => {
    const p = new MemoryProvider();
    for (const path of ['letters/Invoice.ott', 'letters/Report.docx', 'letters/sub/Minutes.md', 'letters/notes.bin', 'letters/.git/config', 'other/Slides.odp']) await p.write(path, new Blob(['x']));
    expect(await templatesIn(p, 'letters')).toEqual([
      { name: 'Invoice', path: 'letters/Invoice.ott' },
      { name: 'Minutes', path: 'letters/sub/Minutes.md' },
      { name: 'Report', path: 'letters/Report.docx' },
    ]);
  });
});
