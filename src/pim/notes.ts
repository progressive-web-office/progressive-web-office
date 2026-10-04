/**
 * CAL-001, CONTACT-001: events and contacts kept as Markdown notes — their
 * fields in the front matter, the rest of the note free — so that they are
 * linked, found, tagged and shown like any note. Writing a note keeps its
 * other properties, their lines and its text.
 */
import { parseFrontMatter, writeFrontMatter } from '../document/frontmatter';
import { changed, readProperties, writeProperties, type Property, type PropertyValue } from '../document/note-properties';
import type { CalEvent } from './ical';
import type { Contact } from './vcard';

/** Where a note was synchronised from (CAL-006, CONTACT-005): its address on the server and its version. */
export interface Remote {
  href: string;
  etag?: string;
}

export const EVENT_TYPE = '[[Event]]';
export const PERSON_TYPE = '[[Person]]';

type Value = string | string[] | boolean | undefined;

/** The properties of a note, by key. */
function valuesOf(text: string): { values: Map<string, Value>; body: string } {
  const f = parseFrontMatter(text);
  const values = new Map<string, Value>();
  for (const p of readProperties(f.meta, f.extra)) {
    if (!p.key) continue;
    const v = p.value;
    values.set(
      p.key.toLowerCase(),
      v.kind === 'list' ? v.items : v.kind === 'bool' ? v.value : v.kind === 'text' ? v.text || undefined : v.kind === 'date' ? v.value : v.kind === 'number' ? String(v.value) : v.text,
    );
  }
  return { values, body: f.body };
}

const asValue = (v: Value): PropertyValue | undefined =>
  v === undefined || (Array.isArray(v) && !v.length) || v === '' ? undefined : Array.isArray(v) ? { kind: 'list', items: v } : typeof v === 'boolean' ? { kind: 'bool', value: v } : /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(v) ? { kind: 'date', value: v } : { kind: 'text', text: v };

/**
 * A note with these properties set (`undefined` removes one), the others
 * and the text kept; new properties go after the existing ones, in the
 * order given.
 */
export function withValues(text: string, set: [string, Value][], body?: string): string {
  const f = parseFrontMatter(text);
  let props: Property[] = readProperties(f.meta, f.extra);
  for (const [key, value] of set) {
    const v = asValue(value);
    const i = props.findIndex((p) => p.key.toLowerCase() === key.toLowerCase());
    if (i >= 0) {
      if (!v) props = props.filter((_, j) => j !== i);
      else if (JSON.stringify(props[i]!.value) !== JSON.stringify(v)) props[i] = changed(props[i]!, v);
    } else if (v) props.push({ key, value: v, ...(key === 'title' ? { meta: 'title' as const } : {}) });
  }
  const { meta, extra } = writeProperties(props);
  const head = writeFrontMatter(meta, extra).replace(/\n\n$/, '\n');
  const rest = (body ?? f.body).replace(/^\n+/, '');
  return `${head}\n${rest}`;
}

/** The items of a list property of a note (a single value as one item). */
export function listOf(text: string, key: string): string[] {
  const v = valuesOf(text).values.get(key.toLowerCase());
  return Array.isArray(v) ? v : typeof v === 'string' ? [v] : [];
}

const str = (v: Value): string | undefined => (typeof v === 'string' ? v : Array.isArray(v) ? v.join(', ') : undefined);
const list = (v: Value): string[] | undefined => (Array.isArray(v) ? v : typeof v === 'string' ? [v] : undefined);
/** `[[Ada Lovelace|Ada]]` → `Ada Lovelace`. */
export const unlink = (s: string): string => s.replace(/^\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]$/, '$1').trim();

// --- events --------------------------------------------------------------------

/** Whether a note is an event: its `type`, or a `start` with a `title`. */
export function isEventNote(text: string): boolean {
  const { values } = valuesOf(text);
  const type = str(values.get('type'));
  return type ? unlink(type).toLowerCase() === 'event' : false;
}

/** The event a note holds, and where it was synchronised from. */
export function eventOfNote(text: string, fallbackTitle = ''): (CalEvent & { calendar?: string; remote?: Remote }) | undefined {
  const { values, body } = valuesOf(text);
  const start = str(values.get('start'));
  if (!start || !/^\d{4}-\d{2}-\d{2}/.test(start)) return undefined;
  const allDay = values.get('all day') === true || !/T\d/.test(start);
  const href = str(values.get('caldav'));
  const description = body.trim();
  const event: CalEvent & { calendar?: string; remote?: Remote } = {
    uid: str(values.get('uid')) ?? '',
    title: str(values.get('title')) ?? fallbackTitle,
    start: allDay ? start.slice(0, 10) : start.slice(0, 16),
    allDay,
  };
  const end = str(values.get('end'));
  if (end) event.end = allDay ? end.slice(0, 10) : end.slice(0, 16);
  const set = <K extends keyof typeof event>(k: K, v: (typeof event)[K] | undefined): void => {
    if (v !== undefined && !(Array.isArray(v) && !v.length)) event[k] = v;
  };
  set('location', str(values.get('location')));
  set('attendees', list(values.get('attendees'))?.map(unlink));
  set('categories', list(values.get('tags'))?.map((t) => t.replace(/^#/, '')));
  set('recurrence', str(values.get('recurrence')));
  set('exceptions', list(values.get('exceptions')));
  set('url', str(values.get('url')));
  set('calendar', str(values.get('calendar')));
  if (description) event.description = description;
  if (href) event.remote = { href, ...(str(values.get('etag')) ? { etag: str(values.get('etag'))! } : {}) };
  return event;
}

/**
 * An event written into a note (a new one, or `text` kept but for its
 * fields): attendees who are notes of the folder become links.
 */
export function eventNote(e: CalEvent & { calendar?: string; remote?: Remote }, text = '', isNote: (name: string) => boolean = () => false): string {
  const link = (name: string): string => (isNote(name) ? `[[${name}]]` : name);
  return withValues(
    text,
    [
      ['type', EVENT_TYPE],
      ['title', e.title],
      ['start', e.start],
      ['end', e.end],
      ['all day', e.allDay || undefined],
      ['location', e.location],
      ['attendees', e.attendees?.map(link)],
      ['calendar', e.calendar],
      ['recurrence', e.recurrence],
      ['exceptions', e.exceptions],
      ['tags', e.categories],
      ['url', e.url],
      ['uid', e.uid],
      ['caldav', e.remote?.href],
      ['etag', e.remote?.etag],
    ],
    // The description is the text of the note; a note already written keeps its own.
    text ? undefined : e.description ? `${e.description}\n` : '',
  );
}

// --- contacts ------------------------------------------------------------------

export function isPersonNote(text: string): boolean {
  const type = str(valuesOf(text).values.get('type'));
  return type ? ['person', 'contact'].includes(unlink(type).toLowerCase()) : false;
}

/** The contact a note holds; its name is the note's title, else its file name. */
export function contactOfNote(text: string, fallbackName = ''): Contact & { remote?: Remote } {
  const { values, body } = valuesOf(text);
  const contact: Contact & { remote?: Remote } = { uid: str(values.get('uid')) ?? '', name: str(values.get('title')) ?? fallbackName };
  const set = <K extends keyof typeof contact>(k: K, v: (typeof contact)[K] | undefined): void => {
    if (v !== undefined && !(Array.isArray(v) && !v.length)) contact[k] = v;
  };
  set('givenName', str(values.get('first name')));
  set('familyName', str(values.get('last name')));
  set('emails', list(values.get('emails')));
  set('phones', list(values.get('phones')));
  set('organization', str(values.get('organization')) && unlink(str(values.get('organization'))!));
  set('role', str(values.get('role')));
  set('birthday', str(values.get('birthday')));
  set('address', str(values.get('address')));
  set('website', str(values.get('website')));
  set('categories', list(values.get('tags'))?.map((t) => t.replace(/^#/, '')).filter((t) => t !== 'person'));
  if (body.trim()) contact.note = body.trim();
  const href = str(values.get('carddav'));
  if (href) contact.remote = { href, ...(str(values.get('etag')) ? { etag: str(values.get('etag'))! } : {}) };
  return contact;
}

/** A contact written into a note (a new one, or `text` kept but for its fields); its organisation a link when it is a note. */
export function contactNote(c: Contact & { remote?: Remote }, text = '', isNote: (name: string) => boolean = () => false): string {
  return withValues(
    text,
    [
      ['type', PERSON_TYPE],
      ['title', c.name],
      ['first name', c.givenName],
      ['last name', c.familyName],
      ['emails', c.emails],
      ['phones', c.phones],
      ['organization', c.organization && (isNote(c.organization) ? `[[${c.organization}]]` : c.organization)],
      ['role', c.role],
      ['birthday', c.birthday],
      ['address', c.address],
      ['website', c.website],
      ['tags', c.categories?.length ? c.categories : text ? undefined : ['person']],
      ['uid', c.uid],
      ['carddav', c.remote?.href],
      ['etag', c.remote?.etag],
    ],
    text ? undefined : c.note ? `${c.note}\n` : '',
  );
}

/** A file name from a title: what file systems refuse taken out. */
export const safeName = (title: string): string => title.replace(/[\\/:*?"<>|#^[\]]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Untitled';

/** The path of a new event's note: `Events/2026-10-05 Kick-off.md`. */
export const eventPath = (folder: string, e: Pick<CalEvent, 'start' | 'title'>): string => `${folder ? `${folder}/` : ''}${e.start.slice(0, 10)} ${safeName(e.title)}.md`;
export const contactPath = (folder: string, c: Pick<Contact, 'name'>): string => `${folder ? `${folder}/` : ''}${safeName(c.name)}.md`;
