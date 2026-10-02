/**
 * Storage-independent file system interface (FOLDER-004). This module depends
 * on nothing outside `src/fs/`, so that it can become a library shared by other
 * web apps (e.g. QRShare).
 */

export interface Entry {
  name: string;
  /** `/`-separated path from the provider root, without a leading `/` (`''` is the root). */
  path: string;
  kind: 'file' | 'directory';
  size?: number;
  lastModified?: number;
}

export interface ProviderCapabilities {
  /** Files can be written, moved and removed. */
  write: boolean;
  /** Access survives a reload (a remembered handle, the browser's private storage, a server). */
  persistentAccess: boolean;
}

export interface StorageProvider {
  /** Stable identifier, e.g. `fsa:thesis`, `opfs`, `webdav:https://…`. */
  id: string;
  /** Name shown to the user. */
  label: string;
  capabilities: ProviderCapabilities;
  /** Entries of a directory (not recursive), directories first then by name. */
  list(path: string): Promise<Entry[]>;
  read(path: string): Promise<Blob>;
  /** Write a file, creating it and its parent directories when needed. */
  write(path: string, data: Blob): Promise<void>;
  mkdir(path: string): Promise<void>;
  /** Rename or move a file or directory; the target must not exist. */
  move(from: string, to: string): Promise<void>;
  remove(path: string, opts?: { recursive?: boolean }): Promise<void>;
}

export type FsErrorCode = 'NotFound' | 'Exists' | 'ReadOnly' | 'Permission' | 'Conflict' | 'NotEmpty' | 'Invalid';

export class FsError extends Error {
  constructor(
    readonly code: FsErrorCode,
    readonly path: string,
    message = `${code}: ${path}`,
  ) {
    super(message);
    this.name = 'FsError';
  }
}
