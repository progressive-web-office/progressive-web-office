import { afterEach, describe, expect, it, vi } from 'vitest';

const stored: string[] = [];
vi.mock('../src/backup/targets', async (orig) => ({
  ...(await orig<typeof import('../src/backup/targets')>()),
  targetPlace: vi.fn(async (_target: string, ask: boolean) => (ask ? null : { provider: {}, dir: '', label: 'Backups' })),
  storeBackup: vi.fn(async (_place: unknown, name: string) => {
    stored.push(name);
    return [];
  }),
}));
vi.mock('../src/backup/browser', () => ({
  browserSources: async () => ({ files: null, records: {} }),
  collectBackup: async () => ({ files: [{ path: 'a.odt', data: new Uint8Array([1, 2]) }], records: {} }),
}));

import { autoBackup } from '../src/backup/ui';
import { loadBackupSettings, saveBackupSettings } from '../src/backup/settings';

afterEach(() => localStorage.removeItem('pwo.backup'));

describe('BACKUP-006 backups made by themselves', () => {
  it('only when asked for, to a folder or a cloud, when due, without asking', async () => {
    saveBackupSettings({ target: 'download', every: 1, encrypt: false, auto: true });
    expect(await autoBackup()).toBe('off');
    saveBackupSettings({ target: 'folder', every: 1, encrypt: false });
    expect(await autoBackup()).toBe('off');
    saveBackupSettings({ target: 'folder', every: 1, encrypt: true, auto: true });
    expect(await autoBackup()).toBe('password');
    saveBackupSettings({ target: 'folder', every: 1 / 24, encrypt: false, auto: true });
    const done = await autoBackup();
    expect(typeof done).toBe('object');
    expect(stored).toHaveLength(1);
    expect(loadBackupSettings().last?.files).toBe(1);
    // An hour later only.
    expect(await autoBackup(Date.now() + 10 * 60_000)).toBe('not-due');
    expect(typeof (await autoBackup(Date.now() + 61 * 60_000))).toBe('object');
    expect(loadBackupSettings().auto).toBe(true);
  });
});
