/**
 * BACKUP-001, BACKUP-003: what the browser keeps, gathered for a backup, and
 * put back from one — files that exist are kept, the restored copy next to
 * them, unless the user chooses to replace them; records already there are
 * left untouched.
 */
import { FsError, stat, walk, type StorageProvider } from '../fs';
import { BACKUP_STORES, restoredName, type Backup, type BackupFile, type BackupRecords, type BackupStore } from './archive';

export interface RecordAccess {
  read(store: BackupStore): Promise<Record<string, unknown>[]>;
  /** Adds the records not there yet; how many were added. */
  add(store: BackupStore, records: Record<string, unknown>[]): Promise<number>;
}

/** The browser's private storage and database. */
export async function browserSources(): Promise<{ files: StorageProvider | null; records: RecordAccess }> {
  const { privateStorage } = await import('../fs');
  const { exportRecords, importRecords } = await import('../storage/recent');
  return { files: await privateStorage('', 'Browser storage').catch(() => null), records: { read: exportRecords, add: importRecords } };
}

export async function collectBackup(files: StorageProvider | null, records: RecordAccess): Promise<{ files: BackupFile[]; records: BackupRecords }> {
  const out: BackupFile[] = [];
  if (files) {
    for await (const e of walk(files, '', { skip: () => false, maxDepth: 64, maxEntries: 100_000 })) {
      const data = new Uint8Array(await (await files.read(e.path)).arrayBuffer());
      out.push({ path: e.path, data, ...(e.lastModified !== undefined ? { lastModified: e.lastModified } : {}) });
    }
  }
  const recs: BackupRecords = {};
  for (const store of BACKUP_STORES) {
    const list = await records.read(store);
    if (list.length) recs[store] = list;
  }
  return { files: out, records: recs };
}

export interface RestoreResult {
  /** Files written where they were. */
  restored: string[];
  /** Files written next to an existing one, under another name. */
  renamed: [from: string, to: string][];
  /** Files left out because identical to the existing one. */
  same: string[];
  records: number;
}

const equal = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((v, i) => v === b[i]);

export async function restoreBackup(
  backup: Backup,
  target: { files: StorageProvider | null; records: RecordAccess },
  opts: { paths?: Set<string>; replace?: boolean; records?: boolean; now?: Date } = {},
): Promise<RestoreResult> {
  const result: RestoreResult = { restored: [], renamed: [], same: [], records: 0 };
  if (target.files) {
    for (const f of backup.files) {
      if (opts.paths && !opts.paths.has(f.path)) continue;
      const existing = await stat(target.files, f.path).catch((err: unknown) => {
        if (err instanceof FsError) return undefined;
        throw err;
      });
      if (existing && !opts.replace) {
        const current = new Uint8Array(await (await target.files.read(f.path)).arrayBuffer());
        if (equal(current, f.data)) {
          result.same.push(f.path);
          continue;
        }
        const to = restoredName(f.path, opts.now);
        await target.files.write(to, new Blob([f.data as BlobPart]));
        result.renamed.push([f.path, to]);
        continue;
      }
      await target.files.write(f.path, new Blob([f.data as BlobPart]));
      result.restored.push(f.path);
    }
  }
  if (opts.records !== false) {
    for (const store of BACKUP_STORES) {
      const list = backup.records[store];
      if (list?.length) result.records += await target.records.add(store, list);
    }
  }
  return result;
}
