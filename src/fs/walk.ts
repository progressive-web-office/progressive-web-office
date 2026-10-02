/** Helpers over any storage provider. */
import { isInside, join } from './path';
import { FsError, type Entry, type StorageProvider } from './types';

export interface WalkOptions {
  /** Directories or files left out (default: hidden names and `node_modules`). */
  skip?: (entry: Entry) => boolean;
  maxDepth?: number;
  maxEntries?: number;
}

export const skipHidden = (e: Entry): boolean => e.name.startsWith('.') || e.name === 'node_modules' || e.name === '__MACOSX';

/** Every file under `path`, depth first, in listing order. */
export async function* walk(provider: StorageProvider, path = '', opts: WalkOptions = {}): AsyncGenerator<Entry> {
  const skip = opts.skip ?? skipHidden;
  const maxDepth = opts.maxDepth ?? 16;
  let left = opts.maxEntries ?? 10000;
  const visit = async function* (dir: string, depth: number): AsyncGenerator<Entry> {
    for (const e of await provider.list(dir)) {
      if (left <= 0 || skip(e)) continue;
      if (e.kind === 'directory') {
        if (depth < maxDepth) yield* visit(e.path, depth + 1);
      } else {
        left--;
        yield e;
      }
    }
  };
  yield* visit(path, 0);
}

/** Paths of every file under `path`. */
export async function listFiles(provider: StorageProvider, path = '', opts?: WalkOptions): Promise<string[]> {
  const out: string[] = [];
  for await (const e of walk(provider, path, opts)) out.push(e.path);
  return out;
}

export async function exists(provider: StorageProvider, path: string): Promise<boolean> {
  return (await stat(provider, path)) !== undefined;
}

/** The entry at `path`, or undefined. */
export async function stat(provider: StorageProvider, path: string): Promise<Entry | undefined> {
  const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  try {
    return (await provider.list(dir)).find((e) => e.path === path);
  } catch (err) {
    if (err instanceof FsError && err.code === 'NotFound') return undefined;
    throw err;
  }
}

/** Copy a file or directory, possibly to another provider. */
export async function copy(from: StorageProvider, src: string, to: StorageProvider, dest: string): Promise<void> {
  const entry = await stat(from, src);
  if (!entry) throw new FsError('NotFound', src);
  if (entry.kind === 'file') return to.write(dest, await from.read(src));
  await to.mkdir(dest);
  for (const e of await from.list(src)) await copy(from, e.path, to, join(dest, e.name));
}

/** Move by copy and remove, for providers without a native move. */
export async function moveByCopy(provider: StorageProvider, from: string, to: string): Promise<void> {
  if (isInside(to, from)) throw new FsError('Invalid', to, `Cannot move ${from} into itself`);
  if (await exists(provider, to)) throw new FsError('Exists', to);
  await copy(provider, from, provider, to);
  await provider.remove(from, { recursive: true });
}

/** A name not used yet in `dir`: `name`, `name 2`, `name 3`… */
export async function freeName(provider: StorageProvider, dir: string, name: string): Promise<string> {
  const taken = new Set((await provider.list(dir)).map((e) => e.name.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  const dot = name.lastIndexOf('.');
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
  for (let i = 2; ; i++) if (!taken.has(`${stem} ${i}${ext}`.toLowerCase())) return `${stem} ${i}${ext}`;
}

export const readText = async (provider: StorageProvider, path: string): Promise<string> => (await provider.read(path)).text();
export const readBytes = async (provider: StorageProvider, path: string): Promise<Uint8Array> => new Uint8Array(await (await provider.read(path)).arrayBuffer());
