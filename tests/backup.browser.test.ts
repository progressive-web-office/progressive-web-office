import { describe, expect, it } from 'vitest';
import { buildArchive, openArchive, type BackupStore } from '../src/backup/archive';
import { collectBackup, restoreBackup, type RecordAccess } from '../src/backup/browser';
import { backupDue, daysSinceBackup, loadBackupSettings, saveBackupSettings } from '../src/backup/settings';
import { MemoryProvider } from '../src/fs';

const text = async (p: MemoryProvider, path: string) => (await p.read(path)).text();
function memoryRecords(initial: Partial<Record<BackupStore, Record<string, unknown>[]>> = {}): RecordAccess & { all: typeof initial } {
  const all = structuredClone(initial);
  return {
    all,
    read: async (s) => all[s] ?? [],
    add: async (s, list) => {
      const have = (all[s] ??= []);
      const fresh = list.filter((r) => !have.some((h) => h.id === r.id));
      have.push(...fresh);
      return fresh.length;
    },
  };
}

describe('BACKUP-001, BACKUP-003 backing up and restoring the browser', () => {
  it('backs up every file and record, then restores them elsewhere', async () => {
    const files = new MemoryProvider('m', 'M', { 'Documents/a.md': '# A', 'Documents/deep/b.csv': '1,2', '.hidden/c.txt': 'c' });
    const records = memoryRecords({ templates: [{ id: 't1', name: 'Letter', data: new Uint8Array([1, 2]) }] });
    const collected = await collectBackup(files, records);
    expect(collected.files.map((f) => f.path).sort()).toEqual(['.hidden/c.txt', 'Documents/a.md', 'Documents/deep/b.csv']);
    const backup = await openArchive(await buildArchive({ ...collected }));
    const target = new MemoryProvider();
    const targetRecords = memoryRecords();
    const result = await restoreBackup(backup, { files: target, records: targetRecords });
    expect(result.restored.sort()).toEqual(['.hidden/c.txt', 'Documents/a.md', 'Documents/deep/b.csv']);
    expect(await text(target, 'Documents/deep/b.csv')).toBe('1,2');
    expect(result.records).toBe(1);
    expect([...(targetRecords.all.templates![0]!.data as Uint8Array)]).toEqual([1, 2]);
  });

  it('keeps the files there, restoring next to them, unless told to replace them', async () => {
    const backup = await openArchive(await buildArchive({ files: [{ path: 'a.md', data: new TextEncoder().encode('old') }, { path: 'b.md', data: new TextEncoder().encode('same') }], records: {} }));
    const target = new MemoryProvider('m', 'M', { 'a.md': 'new', 'b.md': 'same' });
    const now = new Date(2026, 9, 3);
    const result = await restoreBackup(backup, { files: target, records: memoryRecords() }, { now });
    expect(result.renamed).toEqual([['a.md', 'a (restored 2026-10-03).md']]);
    expect(result.same).toEqual(['b.md']);
    expect(await text(target, 'a.md')).toBe('new');
    expect(await text(target, 'a (restored 2026-10-03).md')).toBe('old');
    await restoreBackup(backup, { files: target, records: memoryRecords() }, { replace: true, paths: new Set(['a.md']) });
    expect(await text(target, 'a.md')).toBe('old');
  });
});

describe('BACKUP-004 reminders', () => {
  it('is due when the last backup is older than the interval', () => {
    const day = 86_400_000;
    const now = Date.UTC(2026, 9, 3);
    expect(backupDue({ target: 'download', every: 7, encrypt: true }, now)).toBe(true);
    const last = { at: now - 3 * day, target: 'download' as const, name: 'x', size: 1, files: 1 };
    expect(backupDue({ target: 'download', every: 7, encrypt: true, last }, now)).toBe(false);
    expect(backupDue({ target: 'download', every: 1, encrypt: true, last }, now)).toBe(true);
    expect(backupDue({ target: 'download', every: 0, encrypt: true }, now)).toBe(false);
    expect(daysSinceBackup({ target: 'download', every: 7, encrypt: true, last }, now)).toBe(3);
  });

  it('keeps its settings in this browser', () => {
    saveBackupSettings({ target: 'webdav:dav-1', every: 1, encrypt: false });
    expect(loadBackupSettings()).toEqual({ target: 'webdav:dav-1', every: 1, encrypt: false });
    localStorage.setItem('pwo.backup', '{"target":"nope","every":-2}');
    expect(loadBackupSettings()).toEqual({ target: 'download', every: 7, encrypt: true });
  });
});

describe('BACKUP-002 storing backups in a folder', () => {
  it('stores dated backups and removes those no longer kept', async () => {
    const { storeBackup, listBackups } = await import('../src/backup/targets');
    const { backupName } = await import('../src/backup/archive');
    const provider = new MemoryProvider('m', 'M', { 'PWO backups/notes.txt': 'mine' });
    const place = { provider, dir: 'PWO backups', label: 'M' };
    const now = new Date(2026, 9, 3, 22);
    for (let d = 20; d >= 0; d--) await storeBackup(place, backupName(new Date(2026, 9, 3 - d, 21)), new Uint8Array([d]), now);
    const names = await listBackups(place);
    expect(names[0]).toBe(backupName(new Date(2026, 9, 3, 21)));
    expect(names.length).toBe(7 + 2);
    expect((await provider.list('PWO backups')).map((e) => e.name)).toContain('notes.txt');
  });
});
