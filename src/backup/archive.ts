/**
 * BACKUP-001, BACKUP-002: backup archives of what the browser keeps — the
 * files of its private storage and the records of its database (recent files,
 * drafts, templates, versions) — as a ZIP with a manifest, encrypted with a
 * password when one is given (AES-GCM, key derived with PBKDF2), dated, and
 * kept for days and weeks.
 */
import { readZip, readZipText, writeZip, type ZipEntryInput } from '../core/zip';

export interface BackupFile {
  /** Path in the browser's storage. */
  path: string;
  data: Uint8Array;
  lastModified?: number;
}

export const BACKUP_STORES = ['recent', 'drafts', 'templates', 'versions'] as const;
export type BackupStore = (typeof BACKUP_STORES)[number];
export type BackupRecords = Partial<Record<BackupStore, Record<string, unknown>[]>>;

export interface Manifest {
  app: 'pwo';
  format: 1;
  createdAt: string;
  encrypted: boolean;
  files: { path: string; size: number; lastModified?: number }[];
  records: Partial<Record<BackupStore, number>>;
}

export interface Backup {
  manifest: Manifest;
  files: BackupFile[];
  records: BackupRecords;
}

const MAGIC = 'PWOBAK1\n';
export const BACKUP_ITERATIONS = 600_000;
export const BACKUP_EXTENSION = '.pwobackup';

const b64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function key(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** Byte fields of a record, kept as entries of their own. */
function splitBytes(value: unknown, entries: ZipEntryInput[], prefix: string): unknown {
  // Typed arrays may come from another realm (a worker, a test environment).
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    const path = `${prefix}.bin`;
    entries.push({ path, data: new Uint8Array(value.buffer, value.byteOffset, value.byteLength) });
    return { $bytes: path };
  }
  if (Array.isArray(value)) return value.map((v, i) => splitBytes(v, entries, `${prefix}-${i}`));
  if (Object.prototype.toString.call(value) === '[object Object]') {
    return Object.fromEntries(Object.entries(value as object).map(([k, v]) => [k, splitBytes(v, entries, `${prefix}-${k.replace(/[^\w-]/g, '_')}`)]));
  }
  return value;
}

function joinBytes(value: unknown, zip: Record<string, Uint8Array>): unknown {
  if (Array.isArray(value)) return value.map((v) => joinBytes(v, zip));
  if (value && typeof value === 'object') {
    const bytes = (value as { $bytes?: unknown }).$bytes;
    if (typeof bytes === 'string' && Object.keys(value).length === 1) return zip[bytes] ?? new Uint8Array();
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, joinBytes(v, zip)]));
  }
  return value;
}

export async function buildArchive(opts: { files: BackupFile[]; records: BackupRecords; password?: string; iterations?: number; createdAt?: Date }): Promise<Uint8Array> {
  const entries: ZipEntryInput[] = [];
  const manifest: Manifest = {
    app: 'pwo',
    format: 1,
    createdAt: (opts.createdAt ?? new Date()).toISOString(),
    encrypted: !!opts.password,
    files: opts.files.map((f) => ({ path: f.path, size: f.data.length, ...(f.lastModified !== undefined ? { lastModified: f.lastModified } : {}) })),
    records: {},
  };
  for (const f of opts.files) entries.push({ path: `files/${f.path}`, data: f.data });
  for (const store of BACKUP_STORES) {
    const list = opts.records[store];
    if (!list?.length) continue;
    manifest.records[store] = list.length;
    const json = list.map((r, i) => splitBytes(r, entries, `records/${store}/${i}`));
    entries.push({ path: `records/${store}.json`, data: JSON.stringify(json) });
  }
  entries.unshift({ path: 'manifest.json', data: JSON.stringify(manifest, null, 2) });
  const zip = writeZip(entries);
  if (!opts.password) return zip;
  const iterations = opts.iterations ?? BACKUP_ITERATIONS;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(opts.password, salt, iterations), zip as BufferSource));
  const header = new TextEncoder().encode(`${MAGIC}${JSON.stringify({ salt: b64(salt), iv: b64(iv), iterations })}\n`);
  const out = new Uint8Array(header.length + data.length);
  out.set(header);
  out.set(data, header.length);
  return out;
}

/** Whether the archive needs a password. */
export const isEncryptedBackup = (bytes: Uint8Array): boolean => new TextDecoder().decode(bytes.slice(0, MAGIC.length)) === MAGIC;

export class BackupError extends Error {
  constructor(readonly code: 'password' | 'invalid') {
    super(code === 'password' ? 'Wrong or missing password' : 'Not a backup of this application');
  }
}

export async function openArchive(bytes: Uint8Array, password?: string, iterations?: number): Promise<Backup> {
  let zipBytes = bytes;
  if (isEncryptedBackup(bytes)) {
    if (!password) throw new BackupError('password');
    const end = bytes.indexOf(10, MAGIC.length);
    const header = JSON.parse(new TextDecoder().decode(bytes.slice(MAGIC.length, end))) as { salt: string; iv: string; iterations: number };
    try {
      zipBytes = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(header.iv) as BufferSource }, await key(password, unb64(header.salt), iterations ?? header.iterations), bytes.slice(end + 1) as BufferSource));
    } catch {
      throw new BackupError('password');
    }
  }
  let zip: Record<string, Uint8Array>;
  let manifest: Manifest;
  try {
    zip = readZip(zipBytes);
    manifest = JSON.parse(readZipText(zip, 'manifest.json') ?? 'null') as Manifest;
  } catch {
    throw new BackupError('invalid');
  }
  if (manifest?.app !== 'pwo') throw new BackupError('invalid');
  const files = manifest.files.map((f) => ({ path: f.path, data: zip[`files/${f.path}`] ?? new Uint8Array(), ...(f.lastModified !== undefined ? { lastModified: f.lastModified } : {}) }));
  const records: BackupRecords = {};
  for (const store of BACKUP_STORES) {
    const json = readZipText(zip, `records/${store}.json`);
    if (json) records[store] = joinBytes(JSON.parse(json), zip) as Record<string, unknown>[];
  }
  return { manifest, files, records };
}

// --- names and retention --------------------------------------------------------------

const pad = (n: number): string => String(n).padStart(2, '0');
const NAME = /^pwo-backup-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})\.pwobackup$/;

export const backupName = (d: Date): string => `pwo-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${BACKUP_EXTENSION}`;
export const isBackupName = (name: string): boolean => NAME.test(name);

export function backupDate(name: string): Date | undefined {
  const m = NAME.exec(name);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])) : undefined;
}

export const DAILY = 7;
export const WEEKLY = 8;

/**
 * The names to keep: the newest backup of each of the last 7 days, the newest
 * of each week for 8 weeks before, and always the newest of all; files that
 * are not backups are kept.
 */
export function keepBackups(names: string[], now = new Date()): string[] {
  const day = (d: Date): number => Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86_400_000);
  const today = day(now);
  const dated = names.flatMap((n) => {
    const d = backupDate(n);
    return d ? [{ n, t: d.getTime(), age: today - day(d) }] : [];
  });
  dated.sort((a, b) => b.t - a.t);
  const kept = new Set(names.filter((n) => !isBackupName(n)));
  if (dated[0]) kept.add(dated[0].n);
  const buckets = new Set<string>();
  for (const b of dated) {
    const bucket = b.age < DAILY ? `d${b.age}` : b.age < DAILY + WEEKLY * 7 ? `w${Math.floor((b.age - DAILY) / 7)}` : undefined;
    if (bucket && !buckets.has(bucket)) {
      buckets.add(bucket);
      kept.add(b.n);
    }
  }
  return names.filter((n) => kept.has(n));
}

/** Where a restored file goes when a file of that name exists: `name (restored 2026-10-03).ext`. */
export function restoredName(path: string, d = new Date()): string {
  const slash = path.lastIndexOf('/');
  const dot = path.lastIndexOf('.');
  const tag = ` (restored ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())})`;
  return dot > slash + 1 ? `${path.slice(0, dot)}${tag}${path.slice(dot)}` : `${path}${tag}`;
}
