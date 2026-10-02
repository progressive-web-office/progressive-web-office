/**
 * What the offline synchronisation keeps on this device (COLLAB-008), in
 * IndexedDB only: the device key, the trusted devices, the import log, and
 * each synchronised document as a Yjs snapshot.
 */
import * as Y from 'yjs';
import { offline } from '@scelles/collab';

const DB_NAME = 'pwo-offline';
const DB_VERSION = 1;
/** Entries kept in the import log. */
export const MAX_LOG = 500;

/** A document synchronised offline, as listed on this device. */
export interface SyncedDocument {
  id: string;
  title: string;
  /** Last change (edit saved to the CRDT, or a sync). */
  updated: number;
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
      d.createObjectStore('device');
      d.createObjectStore('peers', { keyPath: 'id' });
      d.createObjectStore('log', { autoIncrement: true });
      d.createObjectStore('docs', { keyPath: 'id' });
      d.createObjectStore('crdt');
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

async function store(name: string, mode: IDBTransactionMode = 'readonly'): Promise<IDBObjectStore> {
  return (await db()).transaction(name, mode).objectStore(name);
}

/** This device's key, created on first use (the private key is not extractable). */
export async function deviceKey(): Promise<offline.PeerKey> {
  const found = (await request((await store('device')).get('key'))) as offline.PeerKey | undefined;
  if (found) return found;
  const key = await offline.generatePeerKey();
  await request((await store('device', 'readwrite')).put(key, 'key'));
  return key;
}

export class IdbPeerStore implements offline.PeerStore {
  async get(id: string): Promise<offline.TrustedPeer | undefined> {
    return (await request((await store('peers')).get(id))) as offline.TrustedPeer | undefined;
  }
  async put(peer: offline.TrustedPeer): Promise<void> {
    await request((await store('peers', 'readwrite')).put(peer));
  }
  async list(): Promise<offline.TrustedPeer[]> {
    return (await request((await store('peers')).getAll())) as offline.TrustedPeer[];
  }
  async remove(id: string): Promise<void> {
    await request((await store('peers', 'readwrite')).delete(id));
  }
}

export class IdbImportLog implements offline.ImportLog {
  async add(entry: offline.ImportLogEntry): Promise<void> {
    const s = await store('log', 'readwrite');
    await request(s.add(entry));
    const keys = await request(s.getAllKeys());
    for (const key of keys.slice(0, Math.max(0, keys.length - MAX_LOG))) s.delete(key);
  }
  async list(docId?: string): Promise<offline.ImportLogEntry[]> {
    const all = (await request((await store('log')).getAll())) as offline.ImportLogEntry[];
    return all.filter((e) => !docId || e.docId === docId);
  }
}

/** The synchronised documents of this device, most recent first. */
export async function syncedDocuments(): Promise<SyncedDocument[]> {
  const all = (await request((await store('docs')).getAll())) as SyncedDocument[];
  return all.sort((a, b) => b.updated - a.updated);
}

/** The stored Yjs document, or null when this device does not have it. */
export async function loadCrdt(id: string): Promise<Y.Doc | null> {
  const bytes = (await request((await store('crdt')).get(id))) as Uint8Array | undefined;
  if (!bytes) return null;
  const doc = new Y.Doc();
  Y.applyUpdate(doc, bytes);
  return doc;
}

/** Store the Yjs document and its entry in the list. */
export async function saveCrdt(id: string, title: string, doc: Y.Doc): Promise<void> {
  const tx = (await db()).transaction(['crdt', 'docs'], 'readwrite');
  tx.objectStore('crdt').put(Y.encodeStateAsUpdate(doc), id);
  tx.objectStore('docs').put({ id, title, updated: Date.now() } satisfies SyncedDocument);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Forget a document on this device (its file is not touched). */
export async function forgetCrdt(id: string): Promise<void> {
  const tx = (await db()).transaction(['crdt', 'docs'], 'readwrite');
  tx.objectStore('crdt').delete(id);
  tx.objectStore('docs').delete(id);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
