/**
 * Nextcloud / WebDAV as a storage provider of the file explorer (FOLDER-006).
 */
import { dirname, normalize, FsError, type Entry, type StorageProvider } from '../fs';
import { WebDavError, type WebDavClient } from './client';

function davError(err: unknown, path: string): FsError {
  if (!(err instanceof WebDavError)) return new FsError('Invalid', path, (err as Error)?.message ?? String(err));
  if (err.status === 404 || err.status === 409) return new FsError('NotFound', path, err.message);
  if (err.status === 412 || err.status === 405) return new FsError('Exists', path, err.message);
  if (err.status === 401 || err.status === 403) return new FsError('Permission', path, err.message);
  if (err.status === 423) return new FsError('Conflict', path, err.message);
  return new FsError('Invalid', path, err.status ? err.message : `The server could not be reached (${err.message}).`);
}

export class WebDavProvider implements StorageProvider {
  readonly capabilities = { write: true, persistentAccess: true };

  constructor(
    private readonly client: WebDavClient,
    readonly id: string,
    readonly label: string,
  ) {}

  async list(path: string): Promise<Entry[]> {
    const p = normalize(path);
    try {
      return (await this.client.list(p)).map((e) => ({
        name: e.name,
        path: e.path,
        kind: e.type === 'dir' ? ('directory' as const) : ('file' as const),
        ...(e.size !== undefined ? { size: e.size } : {}),
        ...(e.modified !== undefined ? { lastModified: e.modified } : {}),
      }));
    } catch (err) {
      throw davError(err, p);
    }
  }

  async read(path: string): Promise<Blob> {
    try {
      return new Blob([(await this.client.read(normalize(path))).bytes as BlobPart]);
    } catch (err) {
      throw davError(err, path);
    }
  }

  async write(path: string, data: Blob): Promise<void> {
    const p = normalize(path);
    try {
      if (dirname(p)) await this.mkdir(dirname(p));
      await this.client.write(p, new Uint8Array(await data.arrayBuffer()), undefined, true);
    } catch (err) {
      throw davError(err, p);
    }
  }

  async mkdir(path: string): Promise<void> {
    let at = '';
    for (const seg of normalize(path).split('/').filter(Boolean)) {
      at = at ? `${at}/${seg}` : seg;
      try {
        await this.client.mkdir(at);
      } catch (err) {
        // 405: it exists already.
        if (!(err instanceof WebDavError && err.status === 405)) throw davError(err, at);
      }
    }
  }

  private async isDir(path: string): Promise<boolean> {
    const entries = await this.list(dirname(path));
    const e = entries.find((x) => x.path === path);
    if (!e) throw new FsError('NotFound', path);
    return e.kind === 'directory';
  }

  async move(from: string, to: string): Promise<void> {
    const a = normalize(from);
    const b = normalize(to);
    const dir = await this.isDir(a);
    try {
      if (dirname(b)) await this.mkdir(dirname(b));
      await this.client.move(a, b, dir);
    } catch (err) {
      throw davError(err, err instanceof WebDavError && err.status === 412 ? b : a);
    }
  }

  async remove(path: string, opts: { recursive?: boolean } = {}): Promise<void> {
    const p = normalize(path);
    const dir = await this.isDir(p);
    if (dir && !opts.recursive && (await this.list(p)).length) throw new FsError('NotEmpty', p);
    try {
      await this.client.remove(p, dir);
    } catch (err) {
      throw davError(err, p);
    }
  }
}

