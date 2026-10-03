/**
 * Recent files (FILE-008, FILE-009) and autosaved drafts (FILE-011),
 * stored only in this browser's IndexedDB.
 */
import type { DocumentFormat } from '../core/format';

const DB_NAME = 'pwo';
const DB_VERSION = 4;
/** Versions kept per document (FILE-025). */
export const MAX_VERSIONS = 30;
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
      // FILE-025: versions of the documents, saved locally.
      if (!d.objectStoreNames.contains('versions')) d.createObjectStore('versions', { keyPath: 'id' }).createIndex('doc', 'doc');
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

async function store(name: 'recent' | 'drafts' | 'folders' | 'templates' | 'versions', mode: IDBTransactionMode): Promise<IDBObjectStore> {
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

/** FILE-026: the recent entries of a file renamed in the app follow its new name. */
export async function renameRecent(oldName: string, newName: string): Promise<number> {
  const all = (await request((await store('recent', 'readonly')).getAll())) as RecentRecord[];
  const matching = all.filter((r) => r.name === oldName);
  for (const r of matching) {
    const os = await store('recent', 'readwrite');
    await request(os.delete(r.id));
    await request((await store('recent', 'readwrite')).put({ ...r, id: `${newName}:${r.format}`, name: newName }));
  }
  return matching.length;
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

/** Folders offered again on the start screen (FOLDER-015). */
export const MAX_FOLDERS = 5;

export interface RecentFolder {
  id: string;
  name: string;
  handle: FileSystemDirectoryHandle;
  openedAt: number;
}

async function sameFolder(a: FileSystemDirectoryHandle, b: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    if (typeof a.isSameEntry === 'function') return await a.isSameEntry(b);
  } catch {
    /* compared by name below */
  }
  return a.name === b.name;
}

/** The folders opened last, most recent first (FOLDER-001, FOLDER-015). */
export async function recentFolders(): Promise<RecentFolder[]> {
  try {
    const all = (await request((await store('folders', 'readonly')).getAll())) as Partial<RecentFolder>[];
    return all
      .filter((f): f is RecentFolder => !!f.handle && typeof f.id === 'string' && f.id !== BACKUP_FOLDER)
      .map((f) => ({ ...f, name: f.name ?? f.handle.name, openedAt: f.openedAt ?? 0 }))
      .sort((a, b) => b.openedAt - a.openedAt);
  } catch {
    return [];
  }
}

/** Remember a folder just opened, to offer it again; the oldest ones are forgotten. */
export async function rememberFolder(handle: FileSystemDirectoryHandle): Promise<void> {
  try {
    const known = await recentFolders();
    let same: RecentFolder | undefined;
    for (const f of known) if (await sameFolder(f.handle, handle)) same = f;
    const id = same?.id ?? `folder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const os = await store('folders', 'readwrite');
    await request(os.put({ id, name: handle.name, handle, openedAt: Date.now() }));
    const others = known.filter((f) => f.id !== id);
    for (const old of others.slice(MAX_FOLDERS - 1)) await request((await store('folders', 'readwrite')).delete(old.id));
  } catch {
    /* no storage: nothing to offer next time */
  }
}

export async function lastFolder(): Promise<FileSystemDirectoryHandle | undefined> {
  return (await recentFolders())[0]?.handle;
}

/** Forget a folder of the list (the folder itself is not touched). */
export async function forgetFolder(id: string): Promise<void> {
  try {
    await request((await store('folders', 'readwrite')).delete(id));
  } catch {
    /* nothing stored */
  }
}

// --- backups (BACKUP-001) ------------------------------------------------------------

/** The folder backups go to, kept apart from the recent folders. */
const BACKUP_FOLDER = 'backup';

export async function backupFolder(): Promise<FileSystemDirectoryHandle | undefined> {
  try {
    const rec = (await request((await store('folders', 'readonly')).get(BACKUP_FOLDER))) as { handle?: FileSystemDirectoryHandle } | undefined;
    return rec?.handle;
  } catch {
    return undefined;
  }
}

export async function setBackupFolder(handle: FileSystemDirectoryHandle | undefined): Promise<void> {
  const os = await store('folders', 'readwrite');
  if (handle) await request(os.put({ id: BACKUP_FOLDER, name: handle.name, handle, openedAt: 0 }));
  else await request(os.delete(BACKUP_FOLDER));
}

export type RecordStore = 'recent' | 'drafts' | 'templates' | 'versions';

/** Every record of a store, its bytes included. */
export async function exportRecords(name: RecordStore): Promise<Record<string, unknown>[]> {
  try {
    return (await request((await store(name, 'readonly')).getAll())) as Record<string, unknown>[];
  } catch {
    return [];
  }
}

/** Add records to a store, leaving those already there untouched; how many were added. */
export async function importRecords(name: RecordStore, records: Record<string, unknown>[]): Promise<number> {
  let added = 0;
  for (const r of records) {
    if (typeof r.id !== 'string') continue;
    const existing = await request((await store(name, 'readonly')).get(r.id));
    if (existing !== undefined) continue;
    await request((await store(name, 'readwrite')).put(r));
    added++;
  }
  return added;
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

// --- local version history (FILE-025) ------------------------------------------

export interface VersionEntry {
  id: string;
  /** The document's key: where it lives (file name, folder path, server path). */
  doc: string;
  name: string;
  format: DocumentFormat;
  size: number;
  savedAt: number;
  /** A name given to the version, if any. */
  label?: string;
}

/** A short digest, to skip versions identical to the previous one. */
function digest(bytes: Uint8Array): string {
  let h = 2166136261;
  for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i]!, 16777619);
  return `${bytes.length}:${(h >>> 0).toString(16)}`;
}

/** The versions of a document, newest first. */
export async function listVersions(doc: string): Promise<VersionEntry[]> {
  const all = (await request((await store('versions', 'readonly')).index('doc').getAll(doc))) as (VersionEntry & { data: Uint8Array; hash: string })[];
  return all.map(({ data: _d, hash: _h, ...meta }) => meta).sort((a, b) => b.savedAt - a.savedAt);
}

/** Keep a version, unless it is the same as the last one; the oldest go beyond MAX_VERSIONS. */
export async function saveVersion(doc: string, name: string, format: DocumentFormat, bytes: Uint8Array, label?: string): Promise<boolean> {
  const hash = digest(bytes);
  const all = (await request((await store('versions', 'readonly')).index('doc').getAll(doc))) as (VersionEntry & { hash: string })[];
  all.sort((a, b) => b.savedAt - a.savedAt);
  if (!label && all[0]?.hash === hash) return false;
  const savedAt = Math.max(Date.now(), (all[0]?.savedAt ?? 0) + 1);
  const os = await store('versions', 'readwrite');
  await request(os.put({ id: `${doc}@${savedAt}`, doc, name, format, size: bytes.byteLength, savedAt, hash, data: bytes, ...(label ? { label } : {}) }));
  for (const old of all.slice(MAX_VERSIONS - 1)) await request((await store('versions', 'readwrite')).delete(old.id));
  return true;
}

/** FILE-026: the versions of a renamed or moved document follow it. */
export async function moveVersions(fromDoc: string, toDoc: string, name: string): Promise<number> {
  const all = (await request((await store('versions', 'readonly')).index('doc').getAll(fromDoc))) as (VersionEntry & { data: Uint8Array; hash: string })[];
  for (const v of all) {
    await request((await store('versions', 'readwrite')).delete(v.id));
    await request((await store('versions', 'readwrite')).put({ ...v, id: `${toDoc}@${v.savedAt}`, doc: toDoc, name }));
  }
  return all.length;
}

export async function loadVersion(id: string): Promise<Uint8Array | undefined> {
  const rec = (await request((await store('versions', 'readonly')).get(id))) as { data: Uint8Array } | undefined;
  return rec?.data;
}

export async function deleteVersion(id: string): Promise<void> {
  await request((await store('versions', 'readwrite')).delete(id));
}
