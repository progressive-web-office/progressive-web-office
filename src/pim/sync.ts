/**
 * CAL-006, CONTACT-005: event and contact notes synchronised both ways with
 * the calendars and address books of CalDAV / CardDAV servers. What each
 * item was at the last synchronisation (its version, a digest of its
 * fields, the text of the server) is kept in `.pwo/sync.json` of the folder,
 * to tell what changed on which side:
 *
 * - changed on the server only: its note is updated;
 * - changed in its note only: written to the server, with the version it
 *   replaces (If-Match), what the server held besides its fields kept;
 * - changed on both: the note takes the server's version, and the note's is
 *   kept as a copy tagged `conflict`, for the user to choose;
 * - removed on one side, unchanged on the other: removed there too;
 * - a new note of the folder goes to the calendar named by its `calendar`
 *   (else the first one), a new contact to the first address book.
 */
import { readText, type StorageProvider } from '../fs';
import { mergeEvent, readCalendar, writeCalendar, type CalEvent } from './ical';
import { mergeContact, readContacts, writeContact, type Contact } from './vcard';
import { loadContacts, loadEvents, saveContact, saveEvent, type Stored, type StoredContact, type StoredEvent } from './store';
import { canonical, type Collection, type DavSyncClient } from './dav';

export interface SyncState {
  version: 1;
  items: Record<string, { etag: string; digest: string; raw: string }>;
}

export const STATE_PATH = '.pwo/sync.json';

export async function loadState(provider: StorageProvider): Promise<SyncState> {
  try {
    const s = JSON.parse(await readText(provider, STATE_PATH)) as SyncState;
    return s.version === 1 && s.items ? s : { version: 1, items: {} };
  } catch {
    return { version: 1, items: {} };
  }
}

export const saveState = (provider: StorageProvider, state: SyncState): Promise<void> => provider.write(STATE_PATH, new Blob([JSON.stringify(state)]));

export interface SyncReport {
  received: number;
  sent: number;
  removedHere: number;
  removedThere: number;
  conflicts: string[];
  errors: string[];
}

/** What the synchronisation needs to know of a kind of item. */
interface Kind<T extends { uid: string; remote?: { href: string; etag?: string } }> {
  load(): Promise<Stored<T>[]>;
  /** A note not yet on a server goes to this collection. */
  belongs(item: T, collection: Collection, isDefault: boolean): boolean;
  parse(raw: string): T | undefined;
  write(item: T): string;
  merge(raw: string, item: T): string;
  /** The fields compared from one synchronisation to the next. */
  digest(item: T): string;
  /** Write the note: `body` replaces its text. */
  save(item: T, at: Stored<T> | undefined, body: string | undefined): Promise<Stored<T>>;
  /** Of a collection: the calendar of the events. */
  adopt(item: T, collection: Collection): T;
  /** A copy, tagged `conflict`, not to be sent. */
  conflictCopy(item: T): T;
  isConflictCopy(item: T): boolean;
  /** The text of the note made of the item (its description, its note). */
  body(item: T): string;
  label(item: T): string;
  extension: string;
}

const digestOf = (o: object): string => {
  // FNV-1a of a stable JSON: the fields in a fixed order.
  const s = JSON.stringify(o, Object.keys(o).sort());
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16);
};

const eventFields = (e: CalEvent): object => ({ uid: e.uid, title: e.title, start: e.start, end: e.end ?? '', allDay: e.allDay, location: e.location ?? '', description: (e.description ?? '').trim(), attendees: e.attendees ?? [], categories: (e.categories ?? []).filter((c) => c !== 'conflict'), recurrence: e.recurrence ?? '', exceptions: e.exceptions ?? [], url: e.url ?? '' });
const contactFields = (c: Contact): object => ({ uid: c.uid, name: c.name, givenName: c.givenName ?? '', familyName: c.familyName ?? '', emails: c.emails ?? [], phones: (c.phones ?? []).map((p) => p.replace(/\s/g, '')), organization: c.organization ?? '', role: c.role ?? '', birthday: c.birthday ?? '', address: c.address ?? '', website: c.website ?? '', note: (c.note ?? '').trim(), categories: (c.categories ?? []).filter((x) => x !== 'conflict') });

export function eventKind(provider: StorageProvider, isNote?: (name: string) => boolean): Kind<StoredEvent> {
  return {
    load: () => loadEvents(provider),
    belongs: (e, c, isDefault) => (e.calendar ? e.calendar === c.name : isDefault),
    parse: (raw) => readCalendar(raw)[0],
    write: (e) => writeCalendar([e]),
    merge: (raw, e) => mergeEvent(raw, e),
    digest: (e) => digestOf(eventFields(e)),
    save: (e, at, body) => saveEvent(provider, e, at, isNote, at ? body : undefined),
    adopt: (e, c) => ({ ...e, calendar: c.name }),
    conflictCopy: (e) => ({ ...e, uid: `${crypto.randomUUID()}@pwo`, title: `${e.title} (conflict)`, categories: [...(e.categories ?? []), 'conflict'], remote: undefined }) as StoredEvent,
    isConflictCopy: (e) => !!e.categories?.includes('conflict'),
    body: (e) => e.description ?? '',
    label: (e) => `${e.start.slice(0, 10)} ${e.title}`,
    extension: '.ics',
  };
}

export function contactKind(provider: StorageProvider, isNote?: (name: string) => boolean): Kind<StoredContact> {
  return {
    load: () => loadContacts(provider),
    belongs: (_c, _col, isDefault) => isDefault,
    parse: (raw) => readContacts(raw)[0],
    write: (c) => writeContact(c) + '\r\n',
    merge: (raw, c) => mergeContact(raw, c),
    digest: (c) => digestOf(contactFields(c)),
    save: (c, at, body) => saveContact(provider, body !== undefined ? { ...c, ...(body.trim() ? { note: body.trim() } : {}) } : c, at, isNote),
    adopt: (c) => c,
    conflictCopy: (c) => ({ ...c, uid: crypto.randomUUID(), name: `${c.name} (conflict)`, categories: [...(c.categories ?? []), 'conflict'], remote: undefined }) as StoredContact,
    isConflictCopy: (c) => !!c.categories?.includes('conflict'),
    body: (c) => c.note ?? '',
    label: (c) => c.name,
    extension: '.vcf',
  };
}

/** Synchronise the notes of a kind with the collections of a server, the first one taking the new notes. */
export async function synchronise<T extends { uid: string; remote?: { href: string; etag?: string } }>(
  client: DavSyncClient,
  collections: Collection[],
  kind: Kind<T>,
  state: SyncState,
  remove: (path: string) => Promise<void>,
): Promise<SyncReport> {
  const report: SyncReport = { received: 0, sent: 0, removedHere: 0, removedThere: 0, conflicts: [], errors: [] };
  let local = await kind.load();
  for (const [index, collection] of collections.entries()) {
    try {
      const remote = await client.versions(collection);
      const mine = local.filter((s) => s.item.remote && canonical(s.item.remote.href).startsWith(collection.url));
      const byHref = new Map(mine.map((s) => [canonical(s.item.remote!.href), s]));
      // What changed on the server, or is new there, is read together.
      const toRead: string[] = [];
      for (const [href, etag] of remote) {
        const known = state.items[href];
        if (!known || known.etag !== etag) toRead.push(href);
      }
      const read = await client.read(collection, toRead);
      const take = async (href: string, at: Stored<T> | undefined): Promise<Stored<T> | undefined> => {
        const got = read.get(href);
        const item = got && kind.parse(got.data);
        if (!got || !item) return undefined;
        const adopted = { ...kind.adopt(item, collection), remote: { href, etag: got.etag } } as T;
        const saved = await kind.save(adopted, at, kind.body(adopted));
        state.items[href] = { etag: got.etag, digest: kind.digest(saved.item), raw: got.data };
        report.received++;
        return saved;
      };
      const send = async (s: Stored<T>, href: string, etag: string | undefined, raw: string | undefined): Promise<void> => {
        const data = raw ? kind.merge(raw, s.item) : kind.write(s.item);
        const newTag = (await client.write(collection, href, data, etag)) ?? '';
        const item = { ...s.item, remote: { href, etag: newTag } } as T;
        const saved = await kind.save(item, s, undefined);
        state.items[href] = { etag: newTag, digest: kind.digest(saved.item), raw: data };
        report.sent++;
      };
      for (const [href, etag] of remote) {
        const known = state.items[href];
        const at = byHref.get(href);
        if (!at && !known) {
          await take(href, undefined);
          continue;
        }
        if (!at && known) {
          // Its note was removed here: removed there too, unless changed there meanwhile.
          if (known.etag === etag) {
            await client.remove(href, etag);
            delete state.items[href];
            report.removedThere++;
          } else await take(href, undefined);
          continue;
        }
        if (at && !known) {
          // Known by its note only (the state was lost): the server's version.
          if (at.item.remote?.etag !== etag) await take(href, at);
          else state.items[href] = { etag, digest: kind.digest(at.item), raw: read.get(href)?.data ?? kind.write(at.item) };
          continue;
        }
        const changedHere = kind.digest(at!.item) !== known!.digest;
        const changedThere = etag !== known!.etag;
        if (changedThere && changedHere) {
          // Both: the server's in the note, the note's as a copy.
          const copy = await kind.save(kind.conflictCopy(at!.item), undefined, kind.body(at!.item));
          report.conflicts.push(kind.label(copy.item));
          await take(href, at);
        } else if (changedThere) await take(href, at);
        else if (changedHere) await send(at!, href, etag, known!.raw);
      }
      // Removed on the server: removed here, unless changed here (then sent again).
      for (const [href, at] of byHref) {
        if (remote.has(href)) continue;
        const known = state.items[href];
        delete state.items[href];
        if (known && kind.digest(at.item) === known.digest) {
          await remove(at.path);
          report.removedHere++;
        } else await send(at, `${collection.url}${(at.item.uid || crypto.randomUUID()).replace(/[^\w.@-]/g, '_')}${kind.extension}`, undefined, undefined);
      }
      // New notes of the folder.
      for (const s of local) {
        if (s.item.remote || kind.isConflictCopy(s.item) || !kind.belongs(s.item, collection, index === 0)) continue;
        const uid = s.item.uid || `${crypto.randomUUID()}@pwo`;
        const item = { ...s.item, uid };
        await send({ ...s, item }, `${collection.url}${uid.replace(/[^\w.@-]/g, '_')}${kind.extension}`, undefined, undefined);
      }
      local = await kind.load();
    } catch (err) {
      report.errors.push(`${collection.name}: ${(err as Error).message}`);
    }
  }
  return report;
}
