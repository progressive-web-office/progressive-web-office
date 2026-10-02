/**
 * Providers over the File System Access API: a local folder chosen by the user
 * (Chromium), or the browser's private storage (OPFS, every modern browser),
 * which is shared by the apps of the same origin.
 */
import { basename, byKindThenName, dirname, isInside, join, normalize } from '../path';
import { moveByCopy } from '../walk';
import { FsError, type Entry, type StorageProvider } from '../types';

type Dir = FileSystemDirectoryHandle & { values(): AsyncIterable<FileSystemHandle> };
type Movable = FileSystemHandle & { move?(parent: FileSystemDirectoryHandle, name: string): Promise<void> };
type Writable = { write(data: Blob): Promise<void>; close(): Promise<void> };
type Permissions = FileSystemHandle & {
  queryPermission?(opts: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission?(opts: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
};

/** File System Access errors as file system errors. */
function fsError(err: unknown, path: string): FsError {
  if (err instanceof FsError) return err;
  const name = (err as Error)?.name;
  if (name === 'NotFoundError') return new FsError('NotFound', path);
  if (name === 'TypeMismatchError') return new FsError('Invalid', path);
  if (name === 'NotAllowedError' || name === 'SecurityError') return new FsError('Permission', path);
  if (name === 'InvalidModificationError') return new FsError('NotEmpty', path);
  if (name === 'NoModificationAllowedError') return new FsError('ReadOnly', path);
  return new FsError('Invalid', path, (err as Error)?.message ?? String(err));
}

export class DirectoryHandleProvider implements StorageProvider {
  readonly capabilities = { write: true, persistentAccess: true };

  constructor(
    readonly root: FileSystemDirectoryHandle,
    readonly id = `fsa:${root.name}`,
    readonly label = root.name,
  ) {}

  private async dir(path: string, create = false): Promise<FileSystemDirectoryHandle> {
    let d = this.root;
    for (const seg of normalize(path).split('/').filter(Boolean)) d = await d.getDirectoryHandle(seg, { create });
    return d;
  }

  private async handle(path: string): Promise<FileSystemHandle> {
    const p = normalize(path);
    if (!p) return this.root;
    const parent = await this.dir(dirname(p));
    const name = basename(p);
    try {
      return await parent.getFileHandle(name);
    } catch {
      return parent.getDirectoryHandle(name);
    }
  }

  async list(path: string): Promise<Entry[]> {
    const p = normalize(path);
    try {
      const out: Entry[] = [];
      for await (const h of (await this.dir(p) as Dir).values()) {
        const entry: Entry = { name: h.name, path: join(p, h.name), kind: h.kind === 'file' ? 'file' : 'directory' };
        if (h.kind === 'file') {
          try {
            const f = await (h as FileSystemFileHandle).getFile();
            entry.size = f.size;
            entry.lastModified = f.lastModified;
          } catch {
            /* unreadable file: listed without details */
          }
        }
        out.push(entry);
      }
      return out.sort(byKindThenName);
    } catch (err) {
      throw fsError(err, p);
    }
  }

  async read(path: string): Promise<Blob> {
    const p = normalize(path);
    try {
      return await (await (await this.dir(dirname(p))).getFileHandle(basename(p))).getFile();
    } catch (err) {
      throw fsError(err, p);
    }
  }

  async write(path: string, data: Blob): Promise<void> {
    const p = normalize(path);
    try {
      const file = await (await this.dir(dirname(p), true)).getFileHandle(basename(p), { create: true });
      const w = (await (file as unknown as { createWritable(): Promise<Writable> }).createWritable()) as Writable;
      await w.write(data);
      await w.close();
    } catch (err) {
      throw fsError(err, p);
    }
  }

  async mkdir(path: string): Promise<void> {
    try {
      await this.dir(path, true);
    } catch (err) {
      throw fsError(err, path);
    }
  }

  async move(from: string, to: string): Promise<void> {
    const a = normalize(from);
    const b = normalize(to);
    if (!a) throw new FsError('Invalid', a);
    if (isInside(b, a)) throw new FsError('Invalid', b, `Cannot move ${a} into itself`);
    const target = await this.handle(b).catch(() => undefined);
    if (target) throw new FsError('Exists', b);
    let h: Movable;
    try {
      h = (await this.handle(a)) as Movable;
    } catch (err) {
      throw fsError(err, a);
    }
    // Native move where the browser has it (files everywhere in Chromium, directories in OPFS).
    if (h.move) {
      try {
        await h.move(await this.dir(dirname(b), true), basename(b));
        return;
      } catch {
        /* not supported for this handle: copy instead */
      }
    }
    await moveByCopy(this, a, b);
  }

  async remove(path: string, opts: { recursive?: boolean } = {}): Promise<void> {
    const p = normalize(path);
    if (!p) throw new FsError('Invalid', p, 'Cannot remove the root');
    try {
      await (await this.dir(dirname(p))).removeEntry(basename(p), { recursive: !!opts.recursive });
    } catch (err) {
      throw fsError(err, p);
    }
  }

  /** Whether access is granted; asks for it when `ask` (needs a user gesture). */
  async permitted(ask = false): Promise<boolean> {
    const h = this.root as Permissions;
    const mode = { mode: 'readwrite' as const };
    if (!h.queryPermission) return true;
    if ((await h.queryPermission(mode)) === 'granted') return true;
    return ask && (await h.requestPermission?.(mode)) === 'granted';
  }
}

/** Whether the browser lets the user pick a writable local folder. */
export const canPickDirectory = (): boolean => typeof (globalThis as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';

/** Let the user choose a local folder (File System Access API). */
export async function pickDirectory(): Promise<DirectoryHandleProvider | null> {
  const picker = (globalThis as unknown as { showDirectoryPicker?: (opts?: { mode?: string }) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
  if (!picker) return null;
  try {
    return new DirectoryHandleProvider(await picker({ mode: 'readwrite' }));
  } catch (err) {
    if ((err as Error).name === 'AbortError') return null;
    throw err;
  }
}

/**
 * The browser's private storage (Origin Private File System), under `dir`:
 * nothing to choose or allow, kept across visits, and visible to the other
 * apps of the same origin.
 */
export async function privateStorage(dir = '', label = 'Browser storage'): Promise<DirectoryHandleProvider | null> {
  const storage = (globalThis as { navigator?: { storage?: StorageManager & { getDirectory?(): Promise<FileSystemDirectoryHandle> } } }).navigator?.storage;
  if (!storage?.getDirectory) return null;
  let root = await storage.getDirectory();
  for (const seg of normalize(dir).split('/').filter(Boolean)) root = await root.getDirectoryHandle(seg, { create: true });
  // Ask the browser not to evict it under storage pressure.
  void storage.persist?.().catch(() => false);
  return new DirectoryHandleProvider(root, `opfs:${normalize(dir)}`, label);
}
