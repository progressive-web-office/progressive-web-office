import { describe, expect, it } from 'vitest';
import { droppedFolder, isFolderDrop, listFiles, readText, type CapturedDrop } from '../src/fs';

/** Entries like those of the File and Directory Entries API. */
const file = (name: string, text: string) => ({ isFile: true, isDirectory: false, name, file: (ok: (f: File) => void) => ok(new File([text], name)) });
const dir = (name: string, children: unknown[]) => {
  const batches = [children, []];
  return { isFile: false, isDirectory: true, name, createReader: () => ({ readEntries: (ok: (e: unknown[]) => void) => ok(batches.shift() ?? []) }) };
};
const drop = (entries: unknown[], files: File[] = []): CapturedDrop => ({ files, entries: entries as CapturedDrop['entries'], handles: entries.map(() => undefined) });
const several = (n: number) => `Dropped (${n})`;

describe('FILE-027 dropping several files or a folder', () => {
  it('leaves a single file to be opened as usual', async () => {
    const d = drop([file('a.odt', 'A')], [new File(['A'], 'a.odt')]);
    expect(isFolderDrop(d)).toBe(false);
    expect(await droppedFolder(d, several)).toBeNull();
  });

  it('opens several files as one read-only folder', async () => {
    const p = (await droppedFolder(drop([file('a.pdf', 'P'), file('b.docx', 'D'), dir('notes', [file('n.md', '# N')])]), several))!;
    expect(p.label).toBe('Dropped (3)');
    expect(p.capabilities.write).toBe(false);
    expect((await listFiles(p)).sort()).toEqual(['a.pdf', 'b.docx', 'notes/n.md']);
    expect(await readText(p, 'notes/n.md')).toBe('# N');
  });

  it('opens a dropped folder as itself, sub-folders included', async () => {
    const p = (await droppedFolder(drop([dir('thesis', [file('main.md', 'M'), dir('ch', [file('1.odt', 'C')])])]), several))!;
    expect(p.label).toBe('thesis');
    expect((await listFiles(p)).sort()).toEqual(['ch/1.odt', 'main.md']);
  });

  it('falls back to the files when the browser gives no entries', async () => {
    const p = (await droppedFolder(drop([], [new File(['1'], 'x.csv'), new File(['2'], 'y.csv')]), several))!;
    expect((await listFiles(p)).sort()).toEqual(['x.csv', 'y.csv']);
  });
});
