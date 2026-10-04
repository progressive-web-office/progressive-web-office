/**
 * DEVSYNC-011: the documents of this browser seen with the paired devices —
 * for each one, whether every device has the same, whether it is only here
 * (or changed here, not sent yet), or on another device and not here yet —
 * as of the last time each device was met.
 */
import type { RemoteSnapshot } from './state';

export type DocStatus =
  /** The same on every device met. */
  | { kind: 'synced' }
  /** Here; not on these devices, or different there. */
  | { kind: 'local'; missing: string[]; different: string[] }
  /** Not here: on these devices (not fetched yet). */
  | { kind: 'remote'; on: string[] };

export interface DocRow {
  path: string;
  status: DocStatus;
}

/**
 * The status of each document, from the files here (content hash by path),
 * what each device held when last met, and the deletions noticed here.
 */
export function documentStatuses(local: Record<string, string>, remotes: Record<string, RemoteSnapshot>, deletedHere: Record<string, number> = {}): DocRow[] {
  const devices = Object.values(remotes);
  const rows: DocRow[] = [];
  for (const [path, hash] of Object.entries(local)) {
    const missing = devices.filter((d) => d.files[path] === undefined && d.deleted?.[path] === undefined).map((d) => d.name);
    const different = devices.filter((d) => d.files[path] !== undefined && d.files[path] !== hash).map((d) => d.name);
    rows.push({ path, status: missing.length || different.length ? { kind: 'local', missing, different } : { kind: 'synced' } });
  }
  const remoteOnly = new Map<string, string[]>();
  for (const d of devices) {
    for (const path of Object.keys(d.files)) {
      if (local[path] !== undefined || deletedHere[path] !== undefined) continue;
      remoteOnly.set(path, [...(remoteOnly.get(path) ?? []), d.name]);
    }
  }
  for (const [path, on] of remoteOnly) rows.push({ path, status: { kind: 'remote', on } });
  return rows.sort((a, b) => a.path.localeCompare(b.path));
}
