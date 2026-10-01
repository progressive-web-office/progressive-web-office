import { zipSync, strToU8 } from 'fflate';

/** Build an in-memory ZIP archive from a map of path -> text content. */
export function makeZip(files: Record<string, string>): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const [path, text] of Object.entries(files)) entries[path] = strToU8(text);
  return zipSync(entries);
}

export const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
