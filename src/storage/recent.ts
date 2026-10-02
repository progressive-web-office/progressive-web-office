/**
 * Recent files (FILE-008, FILE-009) and autosaved drafts (FILE-011),
 * stored only in this browser's IndexedDB.
 */
import type { DocumentFormat } from '../core/format';

const DB_NAME = 'pwo';
const DB_VERSION = 3;
export const MAX_RECENT = 12;
/** Larger files are not kept in the recent list (storage quota). */
export const MAX_RECENT_SIZE = 25 * 1024 * 1024;

export interface RecentEntry {
  id: string;
  name: string;
  format: DocumentFormat;
  size: number;
  lastOpened: number;
}

interface RecentRecord extends RecentEntry {
  data: Uint8Array;
  type: string;
}

export interface Draft {
  name: string;
  format: DocumentFormat;
  bytes: Uint8Array;
  savedAt?: number;
}

let dbPromise: Promise<IDBDatabase> | undefined;

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('recent')) d.createObjectStore('recent', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('drafts')) d.createObjectStore('drafts', { keyPath: 'id' });
      // FOLDER-001: the last opened folder (a directory handle).
      if (!d.objectStoreNames.contains('folders')) d.createObjectStore('folders', { keyPath: 'id' });
      // FILE-019: the user's own templates.
      if (!d.objectStoreNames.contains('templates')) d.createObjectStore('templates', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function store(name: 'recent' | 'drafts' | 'folders' | 'templates', mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return (await db()).transaction(name, mode).objectStore(name);
}

export async function listRecent(): Promise<RecentEntry[]> {
  const all = (await request((await store('recent', 'readonly')).getAll())) as RecentRecord[];
  return all
    .map(({ data: _data, type: _type, ...meta }) => meta)
    .sort((a, b) => b.lastOpened - a.lastOpened);
}

export async function addRecent(file: File, format: DocumentFormat): Promise<void> {
  if (file.size > MAX_RECENT_SIZE) return;
  const record: RecentRecord = {
    id: `${file.name}:${format}`,
    name: file.name,
    format,
    size: file.size,
    lastOpened: Date.now(),
    data: new Uint8Array(await file.arrayBuffer()),
    type: file.type,
  };
  await request((await store('recent', 'readwrite')).put(record));
  const list = await listRecent();
  for (const old of list.slice(MAX_RECENT)) await removeRecent(old.id);
}

export async function getRecent(id: string): Promise<File | undefined> {
  const rec = (await request((await store('recent', 'readonly')).get(id))) as RecentRecord | undefined;
  return rec ? new File([rec.data as BlobPart], rec.name, { type: rec.type }) : undefined;
}

export async function removeRecent(id: string): Promise<void> {
  await request((await store('recent', 'readwrite')).delete(id));
}

export async function clearRecent(): Promise<void> {
  await request((await store('recent', 'readwrite')).clear());
}

export async function saveDraft(draft: Draft): Promise<void> {
  await request((await store('drafts', 'readwrite')).put({ id: 'current', ...draft, savedAt: draft.savedAt ?? Date.now() }));
}

export async function loadDraft(): Promise<Draft | undefined> {
  const rec = (await request((await store('drafts', 'readonly')).get('current'))) as (Draft & { id: string }) | undefined;
  if (!rec) return undefined;
  const { id: _id, ...draft } = rec;
  return draft;
}

export async function clearDraft(): Promise<void> {
  await request((await store('drafts', 'readwrite')).delete('current'));
}

/** Remember the folder opened last, to offer it again (FOLDER-001). */
export async function rememberFolder(handle: FileSystemDirectoryHandle): Promise<void> {
  try {
    await request((await store('folders', 'readwrite')).put({ id: 'last', name: handle.name, handle }));
  } catch {
    /* no storage: nothing to offer next time */
  }
}

export async function lastFolder(): Promise<FileSystemDirectoryHandle | undefined> {
  try {
    const rec = (await request((await store('folders', 'readonly')).get('last'))) as { handle?: FileSystemDirectoryHandle } | undefined;
    return rec?.handle;
  } catch {
    return undefined;
  }
}

export async function forgetFolder(): Promise<void> {
  try {
    await request((await store('folders', 'readwrite')).delete('last'));
  } catch {
    /* nothing stored */
  }
}

/** A template of the user, kept in this browser (FILE-019). */
export interface UserTemplate {
  id: string;
  name: string;
  format: DocumentFormat;
  size: number;
  savedAt: number;
}

/** Keep `bytes` as a template; one with the same name and format is replaced. Returns its id. */
export async function saveTemplate(name: string, format: DocumentFormat, bytes: Uint8Array): Promise<string> {
  const id = `${name}:${format}`;
  await request((await store('templates', 'readwrite')).put({ id, name, format, size: bytes.byteLength, savedAt: Date.now(), data: bytes }));
  return id;
}

export async function listTemplates(): Promise<UserTemplate[]> {
  const all = (await request((await store('templates', 'readonly')).getAll())) as (UserTemplate & { data: Uint8Array })[];
  return all.map(({ data: _data, ...meta }) => meta).sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadTemplate(id: string): Promise<Uint8Array | undefined> {
  const rec = (await request((await store('templates', 'readonly')).get(id))) as { data: Uint8Array } | undefined;
  return rec?.data;
}

export async function deleteTemplate(id: string): Promise<void> {
  await request((await store('templates', 'readwrite')).delete(id));
}
