import { describe, expect, it } from 'vitest';
import { RUNTIMES, runtimeOf, textTable, umdModule } from '../src/code/runtimes';

describe('CODE-018 runtimes downloaded when needed', () => {
  it('knows the language of a source file', () => {
    expect(['a.lua', 'q.SQL', 'stats.R', 'main.c', 'x.cpp', 'y.py'].map(runtimeOf)).toEqual(['lua', 'sql', 'r', 'cpp', 'cpp', undefined]);
  });

  it('pins every file to a version and a SHA-256', () => {
    for (const rt of Object.values(RUNTIMES))
      for (const f of Object.values(rt.files)) {
        expect(f.url).toMatch(/^https:\/\/cdn\.jsdelivr\.net\/npm\/(@[\w.-]+\/)?[\w.-]+@\d/);
        expect(f.sha256).toMatch(/^[0-9a-f]{64}$/);
      }
  });

  it('turns a UMD script into a module', async () => {
    const src = umdModule("(function (g, f) { typeof exports === 'object' && typeof module !== 'undefined' ? f(exports) : f(g.x = {}); })(this, function (e) { e.answer = 42; });");
    const mod = (await import(/* @vite-ignore */ `data:text/javascript,${encodeURIComponent(src)}`)) as { default: { answer: number } };
    expect(mod.default.answer).toBe(42);
  });

  it('shows a query result as a table', () => {
    expect(textTable(['name', 'n'], [['Ada', 36], ['Grace', null]])).toBe('name  | n\n------+-----\nAda   | 36\nGrace | NULL\n(2 rows)');
  });
});
