/**
 * A ZIP archive as a folder (FILE-021). Files are decompressed when read;
 * changes stay in memory until the archive is written again with
 * `archiveBytes`. An archive inside the archive is shown as a folder too,
 * read when it is first opened and written back with its changes.
 */
import { unzipSync, zipSync, type Zippable } from 'fflate';
import { basename, byKindThenName, dirname, FsError, isInside, normalize, type Entry, type StorageProvider } from '../fs';

export interface ArchiveOptions {
  /** Largest file read, uncompressed (default 200 MB). */
  maxFileSize?: number;
  /** Most entries listed (default 20 000). */
  maxEntries?: number;
  /** Archives inside archives shown as folders, at most this deep (default 8). */
  maxDepth?: number;
}

/** Files shown as folders: archives inside the archive. */
const isZipName = (path: string): boolean => /\.zip$/i.test(path);

interface ArchiveFile {
  size: number;
  lastModified: number;
  /** Name of the entry in the archive, while the file is unchanged. */
  entry?: string;
  data?: Blob;
}

/** Entries other systems leave in archives. */
const JUNK = /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db|desktop\.ini)(\/|$)/i;

/** Formats already compressed, stored as they are. */
const COMPRESSED = /\.(zip|docx|xlsx|pptx|odt|ods|odp|ott|ots|otp|dotx|xltx|potx|mdz|jpe?g|png|gif|webp|avif|mp3|mp4|m4a|ogg|webm|gz|7z|rar|xz|bz2)$/i;

export class ArchiveProvider implements StorageProvider {
  readonly id: string;
  readonly capabilities = { write: true, persistentAccess: false };
  /** Whether a file was written, moved or removed since the archive was read. */
  modified = false;
  private readonly files = new Map<string, ArchiveFile>();
  private readonly dirs = new Set<string>(['']);
  private readonly maxFileSize: number;
  private readonly maxDepth: number;
  private readonly maxEntries: number;
  /** Archives inside this one, opened as folders. */
  private readonly mounts = new Map<string, ArchiveProvider>();

  constructor(
    private readonly bytes: Uint8Array,
    readonly label: string,
    opts: ArchiveOptions = {},
  ) {
    this.id = `zip:${label}`;
    this.maxFileSize = opts.maxFileSize ?? 200 * 1024 * 1024;
    this.maxDepth = opts.maxDepth ?? 8;
    this.maxEntries = opts.maxEntries ?? 20_000;
    let left = this.maxEntries;
    const now = Date.now();
    try {
      // Only the directory of the archive is read here: the filter keeps nothing.
      unzipSync(bytes, {
        filter: (f) => {
          if (left <= 0 || JUNK.test(f.name)) return false;
          let path: string;
          try {
            path = normalize(f.name.replace(/^\/+/, ''));
          } catch {
            return false; // a path leaving the archive
          }
          if (!path) return false;
          left--;
          if (f.name.endsWith('/')) this.addDirs(path);
          else this.put(path, { size: f.originalSize, lastModified: now, entry: f.name });
          return false;
        },
      });
    } catch (err) {
      throw new FsError('Invalid', '', `Invalid or corrupt archive: ${(err as Error).message}`);
    }
  }

  private addDirs(path: string): void {
    for (let d = path; d; d = dirname(d)) this.dirs.add(d);
  }

  private put(path: string, file: ArchiveFile): void {
    this.addDirs(dirname(path));
    this.files.set(path, file);
  }

  /** Whether a file is an archive shown as a folder. */
  private mountable(path: string): boolean {
    return this.maxDepth > 0 && isZipName(path) && this.files.has(path);
  }

  /** The archive inside this one holding `path`, and the path inside it. */
  private async route(path: string, inside = false): Promise<[ArchiveProvider, string, string] | undefined> {
    const parts = normalize(path).split('/');
    for (let i = 1; i <= parts.length; i++) {
      const prefix = parts.slice(0, i).join('/');
      if (!this.mountable(prefix)) continue;
      // `inside`: the archive file itself is routed as the root of its folder.
      if (i === parts.length && !inside) return undefined;
      return [await this.mount(prefix), prefix, parts.slice(i).join('/')];
    }
    return undefined;
  }

  private async mount(path: string): Promise<ArchiveProvider> {
    let inner = this.mounts.get(path);
    if (!inner) {
      const bytes = new Uint8Array(await (await this.readOwn(path)).arrayBuffer());
      inner = new ArchiveProvider(bytes, basename(path), { maxFileSize: this.maxFileSize, maxEntries: this.maxEntries, maxDepth: this.maxDepth - 1 });
      this.mounts.set(path, inner);
    }
    return inner;
  }

  private changedInside(prefix: string): void {
    const f = this.files.get(prefix);
    if (f) f.lastModified = Date.now();
    this.modified = true;
  }

  async list(path: string): Promise<Entry[]> {
    const routed = await this.route(path, true);
    if (routed) {
      const [inner, prefix, rest] = routed;
      return (await inner.list(rest)).map((e) => ({ ...e, path: `${prefix}/${e.path}` }));
    }
    const dir = normalize(path);
    if (!this.dirs.has(dir)) throw new FsError(this.files.has(dir) ? 'Invalid' : 'NotFound', dir);
    const out: Entry[] = [];
    for (const d of this.dirs) if (d && dirname(d) === dir) out.push({ name: basename(d), path: d, kind: 'directory' });
    for (const [p, f] of this.files) {
      if (dirname(p) !== dir) continue;
      if (this.mountable(p)) out.push({ name: basename(p), path: p, kind: 'directory', size: f.size, lastModified: f.lastModified });
      else out.push({ name: basename(p), path: p, kind: 'file', size: f.size, lastModified: f.lastModified });
    }
    return out.sort(byKindThenName);
  }

  async read(path: string): Promise<Blob> {
    const routed = await this.route(path);
    if (routed) return routed[0].read(routed[2]);
    return this.readOwn(normalize(path));
  }

  private async readOwn(p: string): Promise<Blob> {
    const f = this.files.get(p);
    if (!f) throw new FsError('NotFound', p);
    const inner = this.mounts.get(p);
    if (inner?.modified) return new Blob([(await archiveBytes(inner)) as BlobPart]);
    if (f.data) return f.data;
    if (f.size > this.maxFileSize) throw new FsError('Invalid', p, `File too large: ${p} (${Math.round(f.size / 1024 / 1024)} MB)`);
    const entry = f.entry!;
    const out = unzipSync(this.bytes, { filter: (x) => x.name === entry })[entry];
    if (!out) throw new FsError('NotFound', p);
    return new Blob([out as BlobPart]);
  }

  async write(path: string, data: Blob): Promise<void> {
    const routed = await this.route(path);
    if (routed) {
      await routed[0].write(routed[2], data);
      return this.changedInside(routed[1]);
    }
    const p = normalize(path);
    if (this.dirs.has(p)) throw new FsError('Exists', p);
    this.mounts.delete(p);
    this.put(p, { size: data.size, lastModified: Date.now(), data });
    this.modified = true;
  }

  async mkdir(path: string): Promise<void> {
    const routed = await this.route(path);
    if (routed) {
      await routed[0].mkdir(routed[2]);
      return this.changedInside(routed[1]);
    }
    const p = normalize(path);
    if (this.files.has(p)) throw new FsError('Exists', p);
    this.addDirs(p);
    this.modified = true;
  }

  async move(from: string, to: string): Promise<void> {
    const [ra, rb] = [await this.route(from), await this.route(to)];
    if (ra || rb) {
      if (!ra || !rb || ra[1] !== rb[1]) throw new FsError('Invalid', to, `Cannot move ${from} out of or into an archive`);
      await ra[0].move(ra[2], rb[2]);
      return this.changedInside(ra[1]);
    }
    const a = normalize(from);
    const b = normalize(to);
    if (this.files.has(b) || this.dirs.has(b)) throw new FsError('Exists', b);
    if (isInside(b, a)) throw new FsError('Invalid', b, `Cannot move ${a} into itself`);
    const rebase = (p: string): string => b + p.slice(a.length);
    for (const [p, inner] of [...this.mounts]) if (isInside(p, a)) {
      this.mounts.delete(p);
      this.mounts.set(rebase(p), inner);
    }
    if (this.files.has(a)) {
      this.put(b, this.files.get(a)!);
      this.files.delete(a);
    } else {
      if (!this.dirs.has(a) || !a) throw new FsError('NotFound', a);
      for (const d of [...this.dirs]) if (isInside(d, a)) {
        this.dirs.delete(d);
        this.dirs.add(rebase(d));
      }
      for (const [p, f] of [...this.files]) if (isInside(p, a)) {
        this.files.delete(p);
        this.put(rebase(p), f);
      }
      this.addDirs(dirname(b));
    }
    this.modified = true;
  }

  async remove(path: string, opts: { recursive?: boolean } = {}): Promise<void> {
    const routed = await this.route(path);
    if (routed) {
      await routed[0].remove(routed[2], opts);
      return this.changedInside(routed[1]);
    }
    const p = normalize(path);
    for (const m of [...this.mounts.keys()]) if (isInside(m, p)) this.mounts.delete(m);
    if (this.files.delete(p)) {
      this.modified = true;
      return;
    }
    if (!this.dirs.has(p) || !p) throw new FsError('NotFound', p);
    const inside = [...this.files.keys(), ...this.dirs].some((x) => x !== p && isInside(x, p));
    if (inside && !opts.recursive) throw new FsError('NotEmpty', p);
    for (const d of [...this.dirs]) if (isInside(d, p)) this.dirs.delete(d);
    for (const f of [...this.files.keys()]) if (isInside(f, p)) this.files.delete(f);
    this.modified = true;
  }

  /** A file of this archive itself (an archive inside it as bytes, with its changes). */
  readFile(path: string): Promise<Blob> {
    return this.readOwn(normalize(path));
  }

  /** Every file path, and every directory left empty. */
  paths(): { files: string[]; emptyDirs: string[] } {
    const files = [...this.files.keys()].sort();
    const emptyDirs = [...this.dirs].filter((d) => d && ![...this.files.keys(), ...this.dirs].some((x) => x !== d && isInside(x, d))).sort();
    return { files, emptyDirs };
  }
}

/** The archive with its changes, as ZIP bytes. */
export async function archiveBytes(archive: ArchiveProvider): Promise<Uint8Array> {
  const { files, emptyDirs } = archive.paths();
  const out: Zippable = {};
  for (const path of files) {
    const data = new Uint8Array(await (await archive.readFile(path)).arrayBuffer());
    out[path] = [data, { level: COMPRESSED.test(path) ? 0 : 6 }];
  }
  for (const dir of emptyDirs) out[`${dir}/`] = new Uint8Array();
  return zipSync(out);
}
