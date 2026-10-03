/**
 * BACKUP-002: where backups go — a download, a folder chosen once (kept
 * across visits), or a WebDAV / Nextcloud account — and how many are kept
 * there (the newest of each of the last 7 days, then of each week for 8 weeks).
 */
import { join, type StorageProvider } from '../fs';
import { BACKUP_EXTENSION, backupDate, isBackupName, keepBackups } from './archive';
import type { BackupTarget } from './settings';

/** The folder of a WebDAV account that holds the backups. */
export const DAV_FOLDER = 'PWO backups';

export interface TargetPlace {
  provider: StorageProvider;
  dir: string;
  label: string;
}

/** Where a target stores its backups; `ask` lets the browser ask for a folder or its permission (a user gesture). */
export async function targetPlace(target: BackupTarget, ask: boolean): Promise<TargetPlace | null> {
  if (target === 'folder') {
    const { backupFolder, setBackupFolder } = await import('../storage/recent');
    const { DirectoryHandleProvider, pickDirectory } = await import('../fs');
    let handle = await backupFolder();
    if (!handle) {
      if (!ask) return null;
      const picked = await pickDirectory();
      if (!picked) return null;
      handle = picked.root;
      await setBackupFolder(handle);
    }
    const provider = new DirectoryHandleProvider(handle, `backup:${handle.name}`, handle.name);
    if (!(await provider.permitted(ask))) return null;
    return { provider, dir: '', label: handle.name };
  }
  if (target.startsWith('webdav:')) {
    const { loadDavAccounts, davClient, davLabel } = await import('../webdav/ui');
    const account = loadDavAccounts().find((a) => a.id === target.slice('webdav:'.length));
    if (!account) return null;
    const { WebDavProvider } = await import('../webdav/provider');
    return { provider: new WebDavProvider(davClient(account), `webdav:${account.id}`, davLabel(account)), dir: DAV_FOLDER, label: `${davLabel(account)}/${DAV_FOLDER}` };
  }
  return null;
}

export function downloadBackup(name: string, bytes: Uint8Array): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** The backups of a place, newest first. */
export async function listBackups(place: TargetPlace): Promise<string[]> {
  let entries;
  try {
    entries = await place.provider.list(place.dir);
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.kind === 'file' && isBackupName(e.name))
    .map((e) => e.name)
    .sort((a, b) => backupDate(b)!.getTime() - backupDate(a)!.getTime());
}

/** Store a backup, then remove the ones no longer kept; the names removed. */
export async function storeBackup(place: TargetPlace, name: string, bytes: Uint8Array, now = new Date()): Promise<string[]> {
  if (place.dir) await place.provider.mkdir(place.dir).catch(() => undefined);
  await place.provider.write(join(place.dir, name), new Blob([bytes as BlobPart]));
  const names = await listBackups(place);
  const kept = new Set(keepBackups(names, now));
  const removed = names.filter((n) => !kept.has(n));
  for (const n of removed) await place.provider.remove(join(place.dir, n)).catch(() => undefined);
  return removed;
}

export async function readBackup(place: TargetPlace, name: string): Promise<Uint8Array> {
  return new Uint8Array(await (await place.provider.read(join(place.dir, name))).arrayBuffer());
}

export const isBackupFile = (name: string): boolean => name.endsWith(BACKUP_EXTENSION);
