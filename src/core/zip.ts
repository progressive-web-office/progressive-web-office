/**
 * Thin wrappers around fflate for reading and writing ZIP packages
 * (OOXML and OpenDocument files are both ZIP containers).
 */
import { strToU8, strFromU8, unzipSync, zipSync, type Zippable } from 'fflate';

export type ZipEntries = Record<string, Uint8Array>;

/** Decompress a ZIP archive into a path -> bytes map. */
export function readZip(bytes: Uint8Array): ZipEntries {
  try {
    return unzipSync(bytes);
  } catch (err) {
    throw new Error(`Invalid or corrupt archive: ${(err as Error).message}`);
  }
}

/** Read an entry as UTF-8 text, or `undefined` if missing. */
export function readZipText(zip: ZipEntries, path: string): string | undefined {
  const data = zip[path];
  return data ? strFromU8(data) : undefined;
}

export interface ZipEntryInput {
  path: string;
  data: string | Uint8Array;
  /** Store without compression (required for the ODF `mimetype` entry). */
  store?: boolean;
}

/** Build a ZIP archive; entries are written in the given order. */
export function writeZip(entries: ZipEntryInput[]): Uint8Array {
  const files: Zippable = {};
  for (const e of entries) {
    const data = typeof e.data === 'string' ? strToU8(e.data) : e.data;
    files[e.path] = [data, { level: e.store ? 0 : 6 }];
  }
  return zipSync(files);
}
