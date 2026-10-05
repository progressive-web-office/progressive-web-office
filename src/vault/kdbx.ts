/**
 * VAULT-001: vaults of passwords in the KDBX 4 format — the open format of
 * the password managers of every system — read and written on the device:
 * the key derived by Argon2 (WebAssembly bundled with the application),
 * entries and groups as plain values to show and change.
 */
import * as kdbxModule from 'kdbxweb';
import { argon2d, argon2id } from 'hash-wasm';

type Kdbxweb = typeof kdbxModule;
const kdbxweb = ((kdbxModule as unknown as { default?: Kdbxweb }).default ?? kdbxModule) as Kdbxweb;
export type Kdbx = kdbxModule.Kdbx;
type KdbxEntry = kdbxModule.KdbxEntry;
type KdbxGroup = kdbxModule.KdbxGroup;

let argonSet = false;
function setup(): void {
  if (argonSet) return;
  argonSet = true;
  kdbxweb.CryptoEngine.setArgon2Impl(async (password, salt, memory, iterations, length, parallelism, type) => {
    const fn = type === 2 ? argon2id : argon2d;
    const out = await fn({ password: new Uint8Array(password), salt: new Uint8Array(salt), memorySize: memory, iterations, hashLength: length, parallelism, outputType: 'binary' });
    return out.slice().buffer;
  });
}

/** Whether bytes are a KDBX file (its two signatures). */
export function isKdbx(bytes: Uint8Array): boolean {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return bytes.length >= 12 && v.getUint32(0, true) === 0x9aa2d903 && v.getUint32(4, true) === 0xb54bfb67;
}

const credentials = async (password: string, keyFile?: Uint8Array): Promise<kdbxModule.Credentials> => {
  const c = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString(password), keyFile ? (keyFile.slice().buffer as ArrayBuffer) : null);
  await c.ready;
  return c;
};

export class WrongKeyError extends Error {
  constructor() {
    super('The master password (or the key file) does not open this vault.');
    this.name = 'WrongKeyError';
  }
}

export async function openVault(bytes: Uint8Array, password: string, keyFile?: Uint8Array): Promise<Kdbx> {
  setup();
  try {
    return await kdbxweb.Kdbx.load(bytes.slice().buffer as ArrayBuffer, await credentials(password, keyFile));
  } catch (err) {
    if ((err as { code?: string }).code === kdbxweb.Consts.ErrorCodes.InvalidKey) throw new WrongKeyError();
    throw err;
  }
}

/** A new vault, its key derived by Argon2id (64 MiB, 3 passes, as recommended for such files). */
export async function newVault(name: string, password: string): Promise<Kdbx> {
  setup();
  const db = kdbxweb.Kdbx.create(await credentials(password), name);
  db.setKdf(kdbxweb.Consts.KdfId.Argon2id);
  const params = db.header.kdfParameters!;
  params.set('M', kdbxweb.VarDictionary.ValueType.UInt64, kdbxweb.Int64.from(64 * 1024 * 1024));
  params.set('I', kdbxweb.VarDictionary.ValueType.UInt64, kdbxweb.Int64.from(3));
  params.set('P', kdbxweb.VarDictionary.ValueType.UInt32, 2);
  return db;
}

export async function saveVault(db: Kdbx): Promise<Uint8Array> {
  setup();
  return new Uint8Array(await db.save());
}

// --- entries and groups, as plain values ------------------------------------------

export interface VaultEntry {
  uuid: string;
  group: string;
  title: string;
  username: string;
  url: string;
  notes: string;
  tags: string[];
  /** The other fields (`otp`, custom fields), by name; protected ones flagged. */
  fields: { name: string; protected: boolean }[];
  modified?: Date;
}

export interface VaultGroup {
  uuid: string;
  name: string;
  depth: number;
  /** The group of deleted entries. */
  recycle: boolean;
}

const STANDARD = new Set(['Title', 'UserName', 'Password', 'URL', 'Notes']);
const text = (v: string | kdbxModule.ProtectedValue | undefined): string => (v === undefined ? '' : typeof v === 'string' ? v : v.getText());

export function groupsOf(db: Kdbx): VaultGroup[] {
  const out: VaultGroup[] = [];
  const recycle = db.meta.recycleBinUuid?.id;
  const visit = (g: KdbxGroup, depth: number): void => {
    out.push({ uuid: g.uuid.id, name: g.name ?? '', depth, recycle: g.uuid.id === recycle });
    for (const c of g.groups) visit(c, depth + 1);
  };
  for (const g of db.groups) visit(g, 0);
  return out;
}

function findGroup(db: Kdbx, uuid: string): KdbxGroup | undefined {
  let found: KdbxGroup | undefined;
  const visit = (g: KdbxGroup): void => {
    if (g.uuid.id === uuid) found = g;
    else g.groups.forEach(visit);
  };
  db.groups.forEach(visit);
  return found;
}

function findEntry(db: Kdbx, uuid: string): KdbxEntry | undefined {
  for (const e of db.getDefaultGroup().allEntries()) if (e.uuid.id === uuid) return e;
  for (const g of db.groups) for (const e of g.allEntries()) if (e.uuid.id === uuid) return e;
  return undefined;
}

const plain = (e: KdbxEntry): VaultEntry => ({
  uuid: e.uuid.id,
  group: e.parentGroup?.uuid.id ?? '',
  title: text(e.fields.get('Title')),
  username: text(e.fields.get('UserName')),
  url: text(e.fields.get('URL')),
  notes: text(e.fields.get('Notes')),
  tags: [...e.tags],
  fields: [...e.fields].filter(([k]) => !STANDARD.has(k)).map(([name, v]) => ({ name, protected: typeof v !== 'string' })),
  ...(e.times.lastModTime ? { modified: e.times.lastModTime } : {}),
});

/** The entries of a group (all of them without one), the deleted ones left out unless asked for. */
export function entriesOf(db: Kdbx, group?: string): VaultEntry[] {
  const recycle = db.meta.recycleBinUuid?.id;
  const root = group ? findGroup(db, group) : db.getDefaultGroup();
  if (!root) return [];
  const entries = group ? [...root.entries] : [...root.allEntries()].filter((e) => !recycle || !isInside(e.parentGroup, recycle));
  return entries.map(plain).sort((a, b) => a.title.localeCompare(b.title));
}

function isInside(g: KdbxGroup | undefined, uuid: string): boolean {
  for (let x = g; x; x = x.parentGroup) if (x.uuid.id === uuid) return true;
  return false;
}

/** A field of an entry (its password, a code…), as text: read only when asked for. */
export function fieldOf(db: Kdbx, uuid: string, name: string): string {
  return text(findEntry(db, uuid)?.fields.get(name));
}

/** Change fields of an entry (empty removes a field that is not standard); its previous version kept in its history. */
export function setFields(db: Kdbx, uuid: string, fields: Record<string, string>, protectedNames: string[] = ['Password']): void {
  const e = findEntry(db, uuid);
  if (!e) return;
  e.pushHistory();
  for (const [name, value] of Object.entries(fields)) {
    if (!value && !STANDARD.has(name)) e.fields.delete(name);
    else e.fields.set(name, protectedNames.includes(name) || name.toLowerCase() === 'otp' ? kdbxweb.ProtectedValue.fromString(value) : value);
  }
  e.times.update();
}

export function setTags(db: Kdbx, uuid: string, tags: string[]): void {
  const e = findEntry(db, uuid);
  if (!e) return;
  e.pushHistory();
  e.tags = tags;
  e.times.update();
}

export function newEntry(db: Kdbx, group: string | undefined, title: string): string {
  const g = (group && findGroup(db, group)) || db.getDefaultGroup();
  const e = db.createEntry(g);
  e.fields.set('Title', title);
  e.fields.set('Password', kdbxweb.ProtectedValue.fromString(''));
  return e.uuid.id;
}

export function newGroup(db: Kdbx, parent: string | undefined, name: string): string {
  const g = db.createGroup((parent && findGroup(db, parent)) || db.getDefaultGroup(), name);
  return g.uuid.id;
}

/** Delete an entry: to the recycle bin (made when needed), as the other applications of the format do. */
export function deleteEntry(db: Kdbx, uuid: string): void {
  const e = findEntry(db, uuid);
  if (e) db.remove(e);
}
