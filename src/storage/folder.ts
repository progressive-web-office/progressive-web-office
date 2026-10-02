/**
 * Folder mode (FOLDER-001): a local directory opened as a project. With the
 * File System Access API (Chromium) files are read and written in place;
 * elsewhere a folder picked with `<input webkitdirectory>` is read-only.
 */

export interface ProjectFolder {
  name: string;
  /** Whether Save writes back into the folder. */
  readonly writable: boolean;
  /** Paths of the files, relative to the folder, `/`-separated. */
  list(): Promise<string[]>;
  read(path: string): Promise<Uint8Array | undefined>;
  write(path: string, data: Uint8Array): Promise<void>;
  /** The directory handle, to remember the folder. */
  readonly handle?: FileSystemDirectoryHandle;
}

/** Folders and files left out of the list. */
const SKIP = /^(\.|node_modules$|__MACOSX$|__pycache__$|target$|dist$)/;
const MAX_FILES = 5000;
const MAX_DEPTH = 12;

type DirHandle = FileSystemDirectoryHandle & { values(): AsyncIterable<FileSystemHandle> };
type Writable = { write(data: Uint8Array): Promise<void>; close(): Promise<void> };
type PermissionHandle = FileSystemHandle & {
  queryPermission?(opts: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission?(opts: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
};

const sortPaths = (paths: string[]): string[] => paths.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

/** A folder read and written through a directory handle. */
export class HandleFolder implements ProjectFolder {
  readonly writable = true;
  constructor(readonly handle: FileSystemDirectoryHandle) {}

  get name(): string {
    return this.handle.name;
  }

  async list(): Promise<string[]> {
    const out: string[] = [];
    const walk = async (dir: DirHandle, prefix: string, depth: number): Promise<void> => {
      for await (const entry of dir.values()) {
        if (out.length >= MAX_FILES || SKIP.test(entry.name)) continue;
        if (entry.kind === 'file') out.push(prefix + entry.name);
        else if (depth < MAX_DEPTH) await walk(entry as DirHandle, `${prefix}${entry.name}/`, depth + 1);
      }
    };
    await walk(this.handle as DirHandle, '', 0);
    return sortPaths(out);
  }

  private async dir(path: string, create: boolean): Promise<FileSystemDirectoryHandle> {
    let dir = this.handle;
    for (const seg of path.split('/').slice(0, -1)) if (seg && seg !== '.') dir = await dir.getDirectoryHandle(seg, { create });
    return dir;
  }

  async read(path: string): Promise<Uint8Array | undefined> {
    try {
      const file = await (await (await this.dir(path, false)).getFileHandle(path.split('/').pop()!)).getFile();
      return new Uint8Array(await file.arrayBuffer());
    } catch {
      return undefined;
    }
  }

  async write(path: string, data: Uint8Array): Promise<void> {
    const file = await (await this.dir(path, true)).getFileHandle(path.split('/').pop()!, { create: true });
    const w = (await (file as unknown as { createWritable(): Promise<Writable> }).createWritable()) as Writable;
    await w.write(data);
    await w.close();
  }

  /** Ask again for access to a remembered folder (needs a user gesture). */
  static async reopen(handle: FileSystemDirectoryHandle): Promise<HandleFolder | null> {
    const h = handle as PermissionHandle;
    const mode = { mode: 'readwrite' as const };
    if ((await h.queryPermission?.(mode)) === 'granted' || (await h.requestPermission?.(mode)) === 'granted') return new HandleFolder(handle);
    return null;
  }
}

/** A read-only folder from `<input type=file webkitdirectory>`. */
export class FilesFolder implements ProjectFolder {
  readonly writable = false;
  private readonly files = new Map<string, File>();
  readonly name: string;

  constructor(files: File[]) {
    let name = '';
    for (const f of files) {
      const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
      const [top, ...rest] = rel.split('/');
      name ||= rest.length ? top! : '';
      const path = rest.length ? rest.join('/') : rel;
      if (path.split('/').some((seg) => SKIP.test(seg))) continue;
      if (this.files.size < MAX_FILES) this.files.set(path, f);
    }
    this.name = name || 'folder';
  }

  async list(): Promise<string[]> {
    return sortPaths([...this.files.keys()]);
  }

  async read(path: string): Promise<Uint8Array | undefined> {
    const f = this.files.get(path);
    return f ? new Uint8Array(await f.arrayBuffer()) : undefined;
  }

  async write(): Promise<void> {
    throw new Error('This folder is read-only in this browser.');
  }
}

/** Let the user choose a folder: writable with the File System Access API, read-only otherwise. */
export async function pickFolder(): Promise<ProjectFolder | null> {
  const picker = (window as unknown as { showDirectoryPicker?: (opts?: { mode?: string }) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
  if (picker) {
    try {
      return new HandleFolder(await picker({ mode: 'readwrite' }));
    } catch (err) {
      if ((err as Error).name === 'AbortError') return null;
      throw err;
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    (input as HTMLInputElement & { webkitdirectory: boolean }).webkitdirectory = true;
    input.addEventListener('change', () => resolve(input.files?.length ? new FilesFolder([...input.files]) : null));
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

/** Folder holding a path, `''` at the top. */
export const dirname = (path: string): string => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
