/**
 * Recent files (FILE-008, FILE-009) and autosaved drafts (FILE-011),
 * stored only in this browser's IndexedDB.
 */
import type { DocumentFormat } from '../core/format';

const DB_NAME = 'pwo';
const DB_VERSION = 1;
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

async function store(name: 'recent' | 'drafts', mode: IDBTransactionMode): Promise<IDBObjectStore> {
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
