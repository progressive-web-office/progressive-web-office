/**
 * DEVSYNC-003: what one device does to merge with another — fetch the files
 * new or changed there, move to its trash the files deleted there (unless
 * changed here since), and, when a file changed on both, keep the newest
 * under its name and the other as a conflict copy, named the same way on
 * both devices so that they end up alike. The other device plans the same
 * from its side.
 */

export interface FileState {
  /** SHA-256 of the content, hexadecimal. */
  hash: string;
  /** Last change, in milliseconds. */
  mtime: number;
}

export interface SyncManifest {
  /** A random identifier of the device. */
  device: string;
  /** The name the user gave the device. */
  name: string;
  files: Record<string, FileState>;
  /** Deleted files and when (tombstones, kept for a while). */
  deleted: Record<string, number>;
}

/** The content of each file at the last synchronisation, by path. */
export type SyncBase = Record<string, string>;

export type SyncAction =
  | { kind: 'fetch'; path: string; to?: string }
  | { kind: 'trash'; path: string }
  | { kind: 'rename'; path: string; to: string };

/** The folder of each device keeping deleted files for a while. */
export const TRASH = '.pwo-trash';

/** Files left out: the trash, and hidden files. */
export const syncable = (path: string): boolean => !path.split('/').some((seg) => seg.startsWith('.'));

const pad = (n: number): string => String(n).padStart(2, '0');

/** `report (conflict Laptop 2026-10-03 21.05).md`: the version of a device, kept next to the newest. */
export function conflictName(path: string, device: string, mtime: number): string {
  const d = new Date(mtime);
  const tag = ` (conflict ${device.replace(/[\\/:*?"<>|()]/g, '-').trim() || 'device'} ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())})`;
  const slash = path.lastIndexOf('/');
  const dot = path.lastIndexOf('.');
  return dot > slash + 1 ? `${path.slice(0, dot)}${tag}${path.slice(dot)}` : `${path}${tag}`;
}

/** Whether the remote version wins over the local one (newer; ties broken by device). */
const remoteWins = (local: SyncManifest, remote: SyncManifest, path: string): boolean => {
  const l = local.files[path]!;
  const r = remote.files[path]!;
  return r.mtime !== l.mtime ? r.mtime > l.mtime : remote.device > local.device;
};

export function planSync(local: SyncManifest, remote: SyncManifest, base: SyncBase): SyncAction[] {
  const out: SyncAction[] = [];
  const paths = [...new Set([...Object.keys(local.files), ...Object.keys(remote.files)])].filter(syncable).sort();
  for (const path of paths) {
    const l = local.files[path];
    const r = remote.files[path];
    const b = base[path];
    if (l && r) {
      if (l.hash === r.hash) continue;
      if (b === l.hash) out.push({ kind: 'fetch', path });
      else if (b === r.hash) continue;
      else if (remoteWins(local, remote, path)) {
        // Changed on both: the newest keeps the name, the other becomes a copy.
        out.push({ kind: 'rename', path, to: conflictName(path, local.name, l.mtime) }, { kind: 'fetch', path });
      } else {
        out.push({ kind: 'fetch', path, to: conflictName(path, remote.name, r.mtime) });
      }
    } else if (l) {
      const gone = remote.deleted[path];
      // Deleted there and unchanged here since the last synchronisation.
      if (gone !== undefined && b === l.hash) out.push({ kind: 'trash', path });
    } else if (r) {
      const gone = local.deleted[path];
      if (gone !== undefined && b === r.hash) continue;
      out.push({ kind: 'fetch', path });
    }
  }
  // A conflict copy the other device already made from this device's version
  // is this device's own file renamed: no need to fetch it.
  const renamedTo = new Map(out.flatMap((a) => (a.kind === 'rename' ? [[a.to, local.files[a.path]!.hash] as const] : [])));
  return out.filter((a) => !(a.kind === 'fetch' && !a.to && renamedTo.has(a.path) && remote.files[a.path]?.hash === renamedTo.get(a.path)));
}
