import { describe, expect, it } from 'vitest';
import { backupName, buildArchive, isBackupName, keepBackups, openArchive, restoredName } from '../src/backup/archive';

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);
const FILES = [
  { path: 'Documents/letter.md', data: enc('# Dear'), lastModified: 1_700_000_000_000 },
  { path: 'Documents/sub/sheet.csv', data: enc('a,b\n1,2'), lastModified: 1_700_000_100_000 },
];
const RECORDS = { recent: [{ id: 'notes.md:md', name: 'notes.md', format: 'md', size: 3, lastOpened: 1, type: 'text/markdown', data: enc('hey') }], templates: [] };

describe('BACKUP-001 backup archives', () => {
  it('holds the files and the records of the browser, with a manifest', async () => {
    const bytes = await buildArchive({ files: FILES, records: RECORDS, createdAt: new Date('2026-10-03T21:05:00Z') });
    const back = await openArchive(bytes);
    expect(back.manifest.app).toBe('pwo');
    expect(back.manifest.createdAt).toBe('2026-10-03T21:05:00.000Z');
    expect(back.manifest.encrypted).toBe(false);
    expect(back.files.map((f) => [f.path, dec(f.data), f.lastModified])).toEqual([
      ['Documents/letter.md', '# Dear', 1_700_000_000_000],
      ['Documents/sub/sheet.csv', 'a,b\n1,2', 1_700_000_100_000],
    ]);
    expect(back.records.recent?.[0]).toMatchObject({ id: 'notes.md:md', name: 'notes.md' });
    expect(dec(back.records.recent![0]!.data as Uint8Array)).toBe('hey');
  });

  it('encrypts with a password, and refuses a wrong one', async () => {
    const bytes = await buildArchive({ files: FILES, records: {}, password: 'correct horse', iterations: 1000 });
    expect(dec(bytes.slice(0, 8))).toBe('PWOBAK1\n');
    expect(dec(bytes)).not.toContain('# Dear');
    await expect(openArchive(bytes)).rejects.toThrow(/password/i);
    await expect(openArchive(bytes, 'wrong', 1000)).rejects.toThrow(/password/i);
    const back = await openArchive(bytes, 'correct horse', 1000);
    expect(back.manifest.encrypted).toBe(true);
    expect(dec(back.files[0]!.data)).toBe('# Dear');
  });

  it('rejects files that are not backups', async () => {
    await expect(openArchive(enc('hello'))).rejects.toThrow(/not a backup/i);
  });
});

describe('BACKUP-002 dated backups, kept for days and weeks', () => {
  it('names backups by their date', () => {
    const name = backupName(new Date(2026, 9, 3, 21, 5));
    expect(name).toBe('pwo-backup-2026-10-03-2105.pwobackup');
    expect(isBackupName(name)).toBe(true);
    expect(isBackupName('notes.md')).toBe(false);
  });

  it('keeps the last 7 days and one a week for 8 weeks', () => {
    const now = new Date(2026, 9, 3, 22, 0);
    const names: string[] = [];
    for (let d = 0; d < 90; d++) names.push(backupName(new Date(2026, 9, 3 - d, 21, 0)));
    names.push(backupName(new Date(2026, 9, 3, 9, 0))); // twice the same day
    const kept = keepBackups(names, now);
    // Every day of the last week, newest of each day.
    for (let d = 0; d < 7; d++) expect(kept).toContain(backupName(new Date(2026, 9, 3 - d, 21, 0)));
    expect(kept).not.toContain(backupName(new Date(2026, 9, 3, 9, 0)));
    // One a week beyond, for 8 weeks; nothing older.
    expect(kept.length).toBeLessThanOrEqual(7 + 8);
    expect(kept.length).toBeGreaterThanOrEqual(7 + 6);
    expect(kept).not.toContain(backupName(new Date(2026, 9, 3 - 89, 21, 0)));
    // Other files are left alone (never in the list to delete).
    expect(keepBackups(['notes.md', ...names], now)).toContain('notes.md');
  });

  it('restores next to an existing file without replacing it', () => {
    expect(restoredName('Documents/letter.md', new Date(2026, 9, 3))).toBe('Documents/letter (restored 2026-10-03).md');
    expect(restoredName('README', new Date(2026, 9, 3))).toBe('README (restored 2026-10-03)');
  });
});
