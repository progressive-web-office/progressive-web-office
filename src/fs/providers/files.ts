/** A read-only folder from `<input type=file webkitdirectory>` (browsers without the File System Access API). */
import { basename, byKindThenName, dirname, normalize } from '../path';
import { FsError, type Entry, type StorageProvider } from '../types';

export class FileListProvider implements StorageProvider {
  readonly capabilities = { write: false, persistentAccess: false };
  readonly label: string;
  readonly id: string;
  private readonly files = new Map<string, File>();
  private readonly dirs = new Set<string>(['']);

  /** Files by path (dropped files and folders, FILE-027), under the name `label`. */
  static fromPaths(label: string, files: Iterable<[string, File]>, id = `drop:${label}`): FileListProvider {
    const p = new FileListProvider([], label, id);
    for (const [path, f] of files) {
      const n = normalize(path);
      p.files.set(n, f);
      for (let d = dirname(n); d; d = dirname(d)) p.dirs.add(d);
    }
    return p;
  }

  constructor(files: Iterable<File>, label?: string, id?: string) {
    let top = '';
    for (const f of files) {
      const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
      const [first, ...rest] = rel.split('/');
      top ||= rest.length ? first! : '';
      const path = normalize(rest.length ? rest.join('/') : rel);
      this.files.set(path, f);
      for (let d = dirname(path); d; d = dirname(d)) this.dirs.add(d);
    }
    this.label = label ?? (top || 'folder');
    this.id = id ?? `files:${this.label}`;
  }

  async list(path: string): Promise<Entry[]> {
    const dir = normalize(path);
    if (!this.dirs.has(dir)) throw new FsError('NotFound', dir);
    const out: Entry[] = [];
    for (const d of this.dirs) if (d && dirname(d) === dir) out.push({ name: basename(d), path: d, kind: 'directory' });
    for (const [p, f] of this.files) if (dirname(p) === dir) out.push({ name: basename(p), path: p, kind: 'file', size: f.size, lastModified: f.lastModified });
    return out.sort(byKindThenName);
  }

  async read(path: string): Promise<Blob> {
    const f = this.files.get(normalize(path));
    if (!f) throw new FsError('NotFound', path);
    return f;
  }

  private readOnly(path: string): never {
    throw new FsError('ReadOnly', path, 'This folder is read-only in this browser.');
  }

  async write(path: string): Promise<void> {
    this.readOnly(path);
  }
  async mkdir(path: string): Promise<void> {
    this.readOnly(path);
  }
  async move(from: string): Promise<void> {
    this.readOnly(from);
  }
  async remove(path: string): Promise<void> {
    this.readOnly(path);
  }
}

/** Let the user choose a folder to read (any browser). */
export function pickFileList(): Promise<FileListProvider | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    (input as HTMLInputElement & { webkitdirectory: boolean }).webkitdirectory = true;
    input.addEventListener('change', () => resolve(input.files?.length ? new FileListProvider([...input.files]) : null));
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}
