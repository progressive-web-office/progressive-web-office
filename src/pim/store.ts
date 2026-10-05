/**
 * CAL-001, CONTACT-001: where events and contacts are kept — notes of the
 * `Events` and `People` folders of the folder open (both set by the user) —
 * read, written and removed.
 */
import { readText, walk, type StorageProvider } from '../fs';
import { contactNote, contactOfNote, contactPath, eventFolder, eventNote, eventOfNote, eventPath, isPersonNote, type Remote } from './notes';
import type { CalEvent } from './ical';
import type { Contact } from './vcard';

export interface PimSettings {
  events: string;
  people: string;
}

const KEY = 'pwo.pim';
export const DEFAULT_PIM: PimSettings = { events: 'Events', people: 'People' };
const clean = (folder: string): string => folder.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');

export function loadPimSettings(): PimSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<PimSettings>;
    return { events: typeof saved.events === 'string' ? clean(saved.events) : DEFAULT_PIM.events, people: typeof saved.people === 'string' ? clean(saved.people) : DEFAULT_PIM.people };
  } catch {
    return { ...DEFAULT_PIM };
  }
}

export function savePimSettings(settings: PimSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ events: clean(settings.events), people: clean(settings.people) }));
  } catch {
    /* not kept */
  }
}

export type StoredEvent = CalEvent & { calendar?: string; remote?: Remote };
export type StoredContact = Contact & { remote?: Remote };

export interface Stored<T> {
  path: string;
  text: string;
  item: T;
  /** Where the note was before it moved to the folder of its new day. */
  movedFrom?: string;
}

const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1).replace(/\.(md|markdown)$/i, '');

async function notesIn(provider: StorageProvider, folder: string): Promise<{ path: string; text: string }[]> {
  const out: { path: string; text: string }[] = [];
  try {
    for await (const e of walk(provider, folder, { maxDepth: 8, maxEntries: 20_000 })) {
      if (e.kind !== 'file' || !/\.(md|markdown)$/i.test(e.path)) continue;
      const text = await readText(provider, e.path).catch(() => undefined);
      if (text !== undefined) out.push({ path: e.path, text });
    }
  } catch {
    /* no such folder yet */
  }
  return out;
}

/** The events of the folder: its event notes. */
export async function loadEvents(provider: StorageProvider, folder = loadPimSettings().events): Promise<Stored<StoredEvent>[]> {
  const out: Stored<StoredEvent>[] = [];
  for (const n of await notesIn(provider, folder)) {
    const item = eventOfNote(n.text, baseName(n.path));
    if (item) out.push({ ...n, item });
  }
  return out;
}

/** The contacts of the folder: its person notes. */
export async function loadContacts(provider: StorageProvider, folder = loadPimSettings().people): Promise<Stored<StoredContact>[]> {
  return (await notesIn(provider, folder)).filter((n) => isPersonNote(n.text)).map((n) => ({ ...n, item: contactOfNote(n.text, baseName(n.path)) }));
}

/** A path not taken yet: `name.md`, else `name 2.md`… */
async function freePath(provider: StorageProvider, path: string): Promise<string> {
  const taken = async (p: string): Promise<boolean> => readText(provider, p).then(() => true, () => false);
  if (!(await taken(path))) return path;
  for (let i = 2; ; i++) {
    const candidate = path.replace(/\.md$/, ` ${i}.md`);
    if (!(await taken(candidate))) return candidate;
  }
}

/**
 * Write an event: into its note (`text` kept but for its fields), or a new
 * note of the events folder. Returns where it is and what it holds.
 */
export async function saveEvent(provider: StorageProvider, event: StoredEvent, at?: Stored<StoredEvent>, isNote?: (name: string) => boolean, body?: string): Promise<Stored<StoredEvent>> {
  const uid = event.uid || `${crypto.randomUUID()}@pwo`;
  const item = { ...event, uid };
  let text = eventNote(item, at?.text ?? '', isNote);
  if (body !== undefined && at) text = text.slice(0, text.indexOf('\n---\n') + 5) + (body.trim() ? `\n${body.trim()}\n` : '');
  const folder = loadPimSettings().events;
  let path = at?.path ?? (await freePath(provider, eventPath(folder, item)));
  // Moved to another day: its note goes to the folder of that day, under the same name (its links still find it).
  const day = eventFolder(folder, item.start);
  const inEvents = !folder || path.startsWith(`${folder}/`);
  if (at && inEvents && path.slice(0, path.lastIndexOf('/')) !== day) {
    path = await freePath(provider, `${day}/${path.slice(path.lastIndexOf('/') + 1)}`);
    await provider.write(path, new Blob([text]));
    await provider.remove(at.path);
    return { path, text, item, movedFrom: at.path };
  }
  await provider.write(path, new Blob([text]));
  return { path, text, item };
}

export async function saveContact(provider: StorageProvider, contact: StoredContact, at?: Stored<StoredContact>, isNote?: (name: string) => boolean): Promise<Stored<StoredContact>> {
  const uid = contact.uid || crypto.randomUUID();
  const item = { ...contact, uid };
  const text = contactNote(item, at?.text ?? '', isNote);
  const path = at?.path ?? (await freePath(provider, contactPath(loadPimSettings().people, item)));
  await provider.write(path, new Blob([text]));
  return { path, text, item };
}
