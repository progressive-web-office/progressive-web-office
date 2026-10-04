import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryProvider } from '../src/fs';
import { addAccount } from '../src/git/accounts';
import { addSource, loadSources, openSource, removeSource, templatesIn, type TemplateSource } from '../src/templates/sources';

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

  describe('a private repository', () => {
    // GitHub answers 404 for a private repository read without a token that reaches it.
    const asked: string[] = [];
    beforeEach(() => {
      asked.length = 0;
      vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
        const auth = (init.headers as Record<string, string>).authorization;
        return auth === 'Bearer secret'
          ? new Response(JSON.stringify({ full_name: 'me/private', default_branch: 'main', private: true }), { status: 200 })
          : new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
      });
    });
    afterEach(() => vi.unstubAllGlobals());
    const source: TemplateSource = { id: 'git:x', kind: 'git', label: 'me/private', url: 'https://github.com/me/private/tree/main/letters' };

    it('asks a token for it, and reads it with that token', async () => {
      const { dir } = await openSource(source, async (base, repo) => {
        asked.push(`${base.apiUrl} ${repo}`);
        return { ...base, id: 'session', token: 'secret', label: 'github.com' };
      });
      expect(asked).toEqual(['https://api.github.com me/private']);
      expect(dir).toBe('letters');
    });

    it('fails as before when no token is given', async () => {
      await expect(openSource(source, async () => null)).rejects.toThrow(/404/);
      await expect(openSource(source)).rejects.toThrow(/404/);
    });

    it('needs no question once an account of the site reaches it', async () => {
      addAccount({ provider: 'github', apiUrl: 'https://api.github.com', token: 'secret', label: 'github.com' });
      await openSource(source, async () => {
        throw new Error('not asked');
      });
    });
  });
});
