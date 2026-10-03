/**
 * DEVSYNC-003, DEVSYNC-004: the documents of this device as a manifest
 * (content hashes, deletions noticed since the last scan), and a merge plan
 * carried out on them — deleted files and replaced versions going to a trash
 * kept for 30 days, never removed outright.
 */
import { join, normalize, stat, walk, type StorageProvider } from '../fs';
import { syncable, TRASH, type SyncAction, type SyncManifest } from './plan';
import { TOMBSTONE_DAYS, type DeviceSyncState } from './state';

const DAY = 86_400_000;
const pad = (n: number): string => String(n).padStart(2, '0');

export async function sha256(data: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data as BufferSource));
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** A path received from another device, if it is safe to write here. */
export function safePath(path: unknown): string | undefined {
  if (typeof path !== 'string' || path.length > 1024 || path.startsWith('/') || path.includes('\\') || path.includes('\0')) return undefined;
  let p: string;
  try {
    p = normalize(path);
  } catch {
    return undefined;
  }
  if (!p || p.split('/').some((seg) => seg === '..' || seg === '.' || seg === '') || !syncable(p)) return undefined;
  return p;
}

/** Scan the documents: the manifest to send, and the state with the deletions noticed. */
export async function scan(provider: StorageProvider, state: DeviceSyncState, now = Date.now()): Promise<{ manifest: SyncManifest; state: DeviceSyncState; hashes: Map<string, string> }> {
  const files: SyncManifest['files'] = {};
  const hashes = new Map<string, string>();
  for await (const e of walk(provider, '', { skip: (x) => x.name.startsWith('.'), maxDepth: 32, maxEntries: 50_000 })) {
    if (!syncable(e.path)) continue;
    const hash = await sha256(new Uint8Array(await (await provider.read(e.path)).arrayBuffer()));
    hashes.set(e.path, hash);
    files[e.path] = { hash, mtime: e.lastModified ?? now };
  }
  const deleted = { ...state.deleted };
  // Files there at the last scan and gone now were deleted here.
  for (const path of Object.keys(state.known)) if (!files[path] && deleted[path] === undefined) deleted[path] = now;
  for (const path of Object.keys(files)) delete deleted[path];
  for (const [path, at] of Object.entries(deleted)) if (now - at > TOMBSTONE_DAYS * DAY) delete deleted[path];
  const next = { ...state, deleted, known: Object.fromEntries(hashes) };
  return { manifest: { device: state.device, name: state.name, files, deleted }, state: next, hashes };
}

/** Where a file goes in the trash: `.pwo-trash/2026-10-03/notes/a.md`. */
export function trashPath(path: string, now = Date.now()): string {
  const d = new Date(now);
  return join(TRASH, `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, path);
}

async function freePath(provider: StorageProvider, path: string): Promise<string> {
  if (!(await stat(provider, path).catch(() => undefined))) return path;
  const dot = path.lastIndexOf('.');
  const slash = path.lastIndexOf('/');
  for (let i = 2; ; i++) {
    const candidate = dot > slash + 1 ? `${path.slice(0, dot)} (${i})${path.slice(dot)}` : `${path} (${i})`;
    if (!(await stat(provider, candidate).catch(() => undefined))) return candidate;
  }
}

async function toTrash(provider: StorageProvider, path: string, now: number): Promise<void> {
  if (!(await stat(provider, path).catch(() => undefined))) return;
  const target = await freePath(provider, trashPath(path, now));
  await provider.write(target, await provider.read(path));
  await provider.remove(path);
}

export interface ApplyResult {
  fetched: string[];
  trashed: string[];
  conflicts: string[];
  failed: string[];
}

/** Carry out a plan; `fetch` gets a file of the other device. */
export async function applyPlan(provider: StorageProvider, plan: SyncAction[], fetch: (path: string) => Promise<Uint8Array>, now = Date.now()): Promise<ApplyResult> {
  const result: ApplyResult = { fetched: [], trashed: [], conflicts: [], failed: [] };
  for (const action of plan) {
    try {
      if (action.kind === 'trash') {
        await toTrash(provider, action.path, now);
        result.trashed.push(action.path);
      } else if (action.kind === 'rename') {
        await provider.move(action.path, await freePath(provider, action.to));
        result.conflicts.push(action.to);
      } else {
        const data = await fetch(action.path);
        const target = action.to ?? action.path;
        // A version replaced here goes to the trash first.
        if (!action.to && (await stat(provider, target).catch(() => undefined))) await toTrash(provider, target, now);
        await provider.write(target, new Blob([data as BlobPart]));
        if (action.to) result.conflicts.push(action.to);
        else result.fetched.push(action.path);
      }
    } catch {
      result.failed.push(action.path);
    }
  }
  return result;
}

/** Remove from the trash what has been there more than 30 days; what was removed. */
export async function emptyOldTrash(provider: StorageProvider, now = Date.now()): Promise<string[]> {
  let days;
  try {
    days = await provider.list(TRASH);
  } catch {
    return [];
  }
  const removed: string[] = [];
  for (const d of days) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d.name);
    if (d.kind !== 'directory' || !m) continue;
    if (now - new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() > TOMBSTONE_DAYS * DAY) {
      await provider.remove(d.path, { recursive: true });
      removed.push(d.name);
    }
  }
  return removed;
}
