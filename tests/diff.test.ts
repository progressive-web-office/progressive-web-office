import { describe, expect, it } from 'vitest';
import { diff, diffLines, diffWords, diffSheets } from '../src/diff/diff';
import { versionView } from '../src/diff/views';
import { writeDocument } from '../src/document/io';
import { newWorkbook, setInput } from '../src/sheet/model';
import { writeWorkbook } from '../src/sheet/io';

const enc = (s: string) => new TextEncoder().encode(s);

describe('VER-001 comparing two versions', () => {
  it('finds the shortest edit between two sequences', () => {
    expect(diff(['a', 'b', 'c', 'd'], ['a', 'c', 'd', 'e'])).toEqual([
      { op: 'eq', a: ['a'], b: ['a'] },
      { op: 'del', a: ['b'], b: [] },
      { op: 'eq', a: ['c', 'd'], b: ['c', 'd'] },
      { op: 'ins', a: [], b: ['e'] },
    ]);
    expect(diff([], ['x'])).toEqual([{ op: 'ins', a: [], b: ['x'] }]);
    expect(diff(['x'], ['x'])).toEqual([{ op: 'eq', a: ['x'], b: ['x'] }]);
  });

  it('compares words inside a changed line', () => {
    expect(diffWords('The quick brown fox', 'The slow brown fox jumps')).toEqual([
      { op: 'eq', text: 'The ' },
      { op: 'del', text: 'quick' },
      { op: 'ins', text: 'slow' },
      { op: 'eq', text: ' brown fox' },
      { op: 'ins', text: ' jumps' },
    ]);
  });

  it('compares lines, pairing changed lines word by word', () => {
    const rows = diffLines('Title\n\nOld sentence here.\n\nEnd', 'Title\n\nNew sentence here.\n\nAdded line\n\nEnd');
    const count = (k: string) => rows.filter((r) => r.kind === k).length;
    expect([count('same'), count('changed'), count('added'), count('removed')]).toEqual([4, 1, 2, 0]);
    expect(rows.filter((r) => r.kind === 'added').map((r) => r.after).sort()).toEqual(['', 'Added line']);
    const changed = rows.find((r) => r.kind === 'changed')!;
    expect(changed.words).toEqual([{ op: 'del', text: 'Old' }, { op: 'ins', text: 'New' }, { op: 'eq', text: ' sentence here.' }]);
    expect(diffLines('a\nb', 'a\nb').every((r) => r.kind === 'same')).toBe(true);
  });

  it('compares the cells of two workbooks', () => {
    const a = newWorkbook();
    setInput(a.sheets[0]!, 'A1', '1');
    setInput(a.sheets[0]!, 'B2', '=A1*2');
    setInput(a.sheets[0]!, 'C3', 'gone');
    const b = newWorkbook();
    setInput(b.sheets[0]!, 'A1', '5');
    setInput(b.sheets[0]!, 'B2', '=A1*2');
    setInput(b.sheets[0]!, 'D4', 'new');
    expect(diffSheets(a, b)).toEqual([
      { sheet: 'Sheet1', ref: 'A1', before: '1', after: '5' },
      { sheet: 'Sheet1', ref: 'C3', before: 'gone', after: '' },
      { sheet: 'Sheet1', ref: 'D4', before: '', after: 'new' },
    ]);
  });

  it('reads a version as text, a document as Markdown, a workbook as cells', async () => {
    expect(await versionView('notes.md', enc('# Hi\n\nText'))).toEqual({ kind: 'text', text: '# Hi\n\nText' });
    const doc = { meta: {}, resources: new Map(), blocks: [{ type: 'paragraph' as const, style: 'h1' as const, runs: [{ text: 'Report' }] }, { type: 'paragraph' as const, style: 'normal' as const, runs: [{ text: 'Body', bold: true }] }] };
    const odt = await versionView('report.odt', writeDocument(doc, 'odt'));
    expect(odt.kind).toBe('text');
    expect(odt.kind === 'text' && odt.text).toContain('# Report');
    expect(odt.kind === 'text' && odt.text).toContain('**Body**');
    const wb = newWorkbook();
    setInput(wb.sheets[0]!, 'A1', '42');
    const view = await versionView('data.xlsx', writeWorkbook(wb, 'xlsx'));
    expect(view.kind).toBe('sheet');
    expect((await versionView('picture.png', new Uint8Array([137, 80, 78, 71]))).kind).toBe('none');
  });
});
