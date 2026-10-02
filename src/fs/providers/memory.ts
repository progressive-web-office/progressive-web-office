/** A provider in memory, for tests and scratch work. */
import { basename, byKindThenName, dirname, isInside, normalize } from '../path';
import { FsError, type Entry, type StorageProvider } from '../types';

export class MemoryProvider implements StorageProvider {
  readonly capabilities: StorageProvider['capabilities'];
  private readonly files = new Map<string, { data: Blob; lastModified: number }>();
  private readonly dirs = new Set<string>(['']);

  constructor(
    readonly id = 'memory',
    readonly label = 'Memory',
    initial: Record<string, string | Blob> = {},
    write = true,
  ) {
    this.capabilities = { write, persistentAccess: false };
    for (const [path, data] of Object.entries(initial)) this.put(normalize(path), typeof data === 'string' ? new Blob([data]) : data);
  }

  private put(path: string, data: Blob): void {
    for (let d = dirname(path); d; d = dirname(d)) this.dirs.add(d);
    this.files.set(path, { data, lastModified: Date.now() });
  }

  private writable(path: string): void {
    if (!this.capabilities.write) throw new FsError('ReadOnly', path);
  }

  async list(path: string): Promise<Entry[]> {
    const dir = normalize(path);
    if (!this.dirs.has(dir)) throw new FsError(this.files.has(dir) ? 'Invalid' : 'NotFound', dir);
    const out: Entry[] = [];
    for (const d of this.dirs) if (d && dirname(d) === dir) out.push({ name: basename(d), path: d, kind: 'directory' });
    for (const [p, f] of this.files) if (dirname(p) === dir) out.push({ name: basename(p), path: p, kind: 'file', size: f.data.size, lastModified: f.lastModified });
    return out.sort(byKindThenName);
  }

  async read(path: string): Promise<Blob> {
    const f = this.files.get(normalize(path));
    if (!f) throw new FsError('NotFound', path);
    return f.data;
  }

  async write(path: string, data: Blob): Promise<void> {
    const p = normalize(path);
    this.writable(p);
    if (this.dirs.has(p)) throw new FsError('Exists', p);
    this.put(p, data);
  }

  async mkdir(path: string): Promise<void> {
    const p = normalize(path);
    this.writable(p);
    if (this.files.has(p)) throw new FsError('Exists', p);
    for (let d = p; d; d = dirname(d)) this.dirs.add(d);
  }

  async move(from: string, to: string): Promise<void> {
    const a = normalize(from);
    const b = normalize(to);
    this.writable(a);
    if (this.files.has(b) || this.dirs.has(b)) throw new FsError('Exists', b);
    if (isInside(b, a)) throw new FsError('Invalid', b, `Cannot move ${a} into itself`);
    if (this.files.has(a)) {
      this.put(b, this.files.get(a)!.data);
      this.files.delete(a);
      return;
    }
    if (!this.dirs.has(a)) throw new FsError('NotFound', a);
    const rebase = (p: string): string => b + p.slice(a.length);
    for (const d of [...this.dirs]) if (isInside(d, a)) {
      this.dirs.delete(d);
      this.dirs.add(rebase(d));
    }
    for (const [p, f] of [...this.files]) if (isInside(p, a)) {
      this.files.delete(p);
      this.put(rebase(p), f.data);
    }
    for (let d = dirname(b); d; d = dirname(d)) this.dirs.add(d);
  }

  async remove(path: string, opts: { recursive?: boolean } = {}): Promise<void> {
    const p = normalize(path);
    this.writable(p);
    if (this.files.delete(p)) return;
    if (!this.dirs.has(p) || !p) throw new FsError('NotFound', p);
    const inside = [...this.files.keys(), ...this.dirs].some((x) => x !== p && isInside(x, p));
    if (inside && !opts.recursive) throw new FsError('NotEmpty', p);
    for (const d of [...this.dirs]) if (isInside(d, p)) this.dirs.delete(d);
    for (const f of [...this.files.keys()]) if (isInside(f, p)) this.files.delete(f);
  }
}
