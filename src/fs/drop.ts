/**
 * Files and folders dropped on the page (FILE-027). What a drop carries can
 * only be reached while its event runs, so `captureDrop` takes it at once,
 * and `droppedFolder` reads it afterwards:
 *
 * - one folder → that folder, writable where the browser gives a handle on it
 *   (File System Access API), read-only otherwise;
 * - several files or folders → one read-only folder holding them all;
 * - a single file → nothing: the caller opens it as usual.
 */
import { DirectoryHandleProvider } from './providers/handle';
import { FileListProvider } from './providers/files';
import type { StorageProvider } from './types';

/** The subset of the File and Directory Entries API used here. */
interface FsEntry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?(ok: (f: File) => void, ko: (e: unknown) => void): void;
  createReader?(): { readEntries(ok: (entries: FsEntry[]) => void, ko: (e: unknown) => void): void };
}

export interface CapturedDrop {
  files: File[];
  entries: (FsEntry | null)[];
  handles: (Promise<FileSystemHandle | null> | undefined)[];
}

/** Take what a drop carries, during its event. */
export function captureDrop(dt: DataTransfer): CapturedDrop {
  const items = [...dt.items].filter((i) => i.kind === 'file');
  type Item = DataTransferItem & { getAsFileSystemHandle?(): Promise<FileSystemHandle | null>; webkitGetAsEntry?(): FsEntry | null };
  return {
    files: [...dt.files],
    entries: items.map((i) => (i as Item).webkitGetAsEntry?.() ?? null),
    handles: items.map((i) => (i as Item).getAsFileSystemHandle?.().catch(() => null)),
  };
}

/** Whether the drop holds more than one file, or a folder. */
export function isFolderDrop(drop: CapturedDrop): boolean {
  return drop.entries.some((e) => e?.isDirectory) || Math.max(drop.files.length, drop.entries.length) > 1;
}

const fileOf = (e: FsEntry): Promise<File> => new Promise((ok, ko) => e.file!(ok, ko));

async function readAll(dir: FsEntry): Promise<FsEntry[]> {
  const reader = dir.createReader!();
  const out: FsEntry[] = [];
  // readEntries gives the entries in batches, until an empty one.
  for (;;) {
    const batch = await new Promise<FsEntry[]>((ok, ko) => reader.readEntries(ok, ko));
    if (!batch.length) return out;
    out.push(...batch);
  }
}

/** Every file under an entry, by path. */
async function filesUnder(entry: FsEntry, prefix: string, out: [string, File][]): Promise<void> {
  const path = prefix ? `${prefix}/${entry.name}` : entry.name;
  if (entry.isFile) out.push([path, await fileOf(entry)]);
  else if (entry.isDirectory) for (const child of await readAll(entry)) await filesUnder(child, path, out);
}

/** The folder a drop stands for; null for a single file. `several(n)` names a drop of several entries. */
export async function droppedFolder(drop: CapturedDrop, several: (n: number) => string): Promise<StorageProvider | null> {
  if (!isFolderDrop(drop)) return null;
  const count = Math.max(drop.files.length, drop.entries.length);
  // One folder: the folder itself, writable when the browser gives a handle on it.
  if (count === 1 && drop.entries[0]?.isDirectory) {
    const handle = await drop.handles[0];
    if (handle?.kind === 'directory') {
      const provider = new DirectoryHandleProvider(handle as FileSystemDirectoryHandle);
      if (await provider.permitted(true).catch(() => false)) return provider;
    }
    const files: [string, File][] = [];
    for (const child of await readAll(drop.entries[0])) await filesUnder(child, '', files);
    return FileListProvider.fromPaths(drop.entries[0].name, files);
  }
  // Several entries: one folder holding them (folders keep their name).
  const files: [string, File][] = [];
  if (drop.entries.some(Boolean)) {
    for (const e of drop.entries) if (e) await filesUnder(e, '', files);
  } else {
    for (const f of drop.files) files.push([f.name, f]);
  }
  return FileListProvider.fromPaths(several(count), files);
}
