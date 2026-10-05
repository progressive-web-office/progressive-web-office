/**
 * CONTACT-007, CAL-007: the calendar and the contacts as tools for AI
 * agents — the built-in assistant, or an agent reached through WebMCP that
 * reads the user's e-mail: find and update people, tell an interaction (it
 * goes to the daily note of its day), list and create events. Inputs come
 * from a model: they are checked before use.
 */
import type { AgentTool } from '../ai/tools';
import { occurrences } from './ical';
import { INTERACTION_KINDS, type InteractionKind } from './interactions';
import { contactTimeline, logInteraction, type PeopleHost } from './people';
import { loadContacts, loadEvents, saveContact, saveEvent, type StoredContact, type StoredEvent } from './store';

export interface PimToolsHost extends PeopleHost {
  noteNames(): string[];
}

const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const strings = (v: unknown): string[] | undefined => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim()) : undefined);
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

export function pimAgentTools(host: PimToolsHost): AgentTool[] {
  const isNote = (name: string): boolean => host.noteNames().some((n) => n.toLowerCase() === name.toLowerCase());
  const findContact = async (name: string) => {
    const all = await loadContacts(host.provider);
    const q = fold(name);
    return all.find((c) => fold(c.item.name) === q) ?? all.find((c) => (c.item.emails ?? []).some((e) => fold(e) === q));
  };
  const brief = (c: StoredContact) => ({ name: c.name, emails: c.emails ?? [], phones: c.phones ?? [], organization: c.organization ?? null, role: c.role ?? null });
  return [
    {
      name: 'find_contacts',
      description: 'Find the contacts (people kept as notes) whose name, e-mail, organisation, role or tag holds the query; all of them without one. At most 50.',
      input_schema: { type: 'object', properties: { query: { type: 'string', description: 'Part of a name, an e-mail address, an organisation…' } } },
      mutates: false,
      run: async (input) => {
        const q = fold(str(input.query) ?? '');
        const found = (await loadContacts(host.provider)).filter((c) => !q || [c.item.name, c.item.organization, c.item.role, ...(c.item.emails ?? []), ...(c.item.categories ?? [])].some((v) => v && fold(v).includes(q)));
        return JSON.stringify(found.slice(0, 50).map((c) => ({ ...brief(c.item), note: c.path })));
      },
    },
    {
      name: 'get_contact',
      description: 'A contact by its name or e-mail address: its fields, when the user first met it and was last in touch, and its interactions (events, daily notes, other notes), the latest first.',
      input_schema: { type: 'object', properties: { name: { type: 'string', description: 'Name or e-mail address' } }, required: ['name'] },
      mutates: false,
      run: async (input) => {
        const c = await findContact(str(input.name) ?? '');
        if (!c) return JSON.stringify({ error: 'No such contact.' });
        const { items, first, last } = await contactTimeline(host, c);
        return JSON.stringify({ ...brief(c.item), birthday: c.item.birthday ?? null, address: c.item.address ?? null, website: c.item.website ?? null, tags: c.item.categories ?? [], note: c.path, first_met: first ?? null, last_contact: last ?? null, interactions: items.slice(0, 30).map((i) => ({ when: i.when ?? null, kind: i.kind, note: i.path, context: i.context ?? i.label })) });
      },
    },
    {
      name: 'save_contact',
      description: 'Create a contact, or update the one of that name (or e-mail): the fields given replace those of the contact, the others stay.',
      input_schema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Full name' },
          given_name: { type: 'string' },
          family_name: { type: 'string' },
          emails: { type: 'array', items: { type: 'string' } },
          phones: { type: 'array', items: { type: 'string' } },
          organization: { type: 'string' },
          role: { type: 'string' },
          birthday: { type: 'string', description: 'YYYY-MM-DD' },
          address: { type: 'string' },
          website: { type: 'string' },
        },
        required: ['name'],
      },
      mutates: true,
      run: async (input) => {
        const name = str(input.name);
        if (!name) return 'A name is needed.';
        const birthday = str(input.birthday);
        if (birthday && !DAY.test(birthday)) return 'The birthday is written YYYY-MM-DD.';
        const at = await findContact(name);
        const fields: Partial<StoredContact> = {};
        for (const [key, value] of [['givenName', str(input.given_name)], ['familyName', str(input.family_name)], ['organization', str(input.organization)], ['role', str(input.role)], ['birthday', birthday], ['address', str(input.address)], ['website', str(input.website)]] as const) if (value) fields[key] = value;
        const emails = strings(input.emails);
        const phones = strings(input.phones);
        const contact: StoredContact = { ...(at?.item ?? { uid: '', name }), ...fields, ...(emails ? { emails } : {}), ...(phones ? { phones } : {}), name: at?.item.name ?? name };
        const saved = await saveContact(host.provider, contact, at, isNote);
        host.changed([saved.path]);
        return `${at ? 'Updated' : 'Created'} ${saved.path}.`;
      },
    },
    {
      name: 'log_interaction',
      description: 'Tell an interaction with a person — a meeting, a call, an e-mail, a message — as a line of the daily note of its day, linked to the contact; the contact\'s "first met" and "last contact" follow. Use it for an e-mail read or sent, a call made.',
      input_schema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name or e-mail address of the person' },
          kind: { type: 'string', enum: INTERACTION_KINDS },
          summary: { type: 'string', description: 'What it was about, in one sentence' },
          when: { type: 'string', description: 'YYYY-MM-DDTHH:mm (local time); now if left out' },
          create_contact: { type: 'boolean', description: 'Create the contact when there is none (default true)' },
        },
        required: ['name', 'kind', 'summary'],
      },
      mutates: true,
      run: async (input) => {
        const name = str(input.name);
        const kind = str(input.kind) as InteractionKind | undefined;
        if (!name || !kind || !INTERACTION_KINDS.includes(kind)) return `A name and a kind (${INTERACTION_KINDS.join(', ')}) are needed.`;
        const whenText = str(input.when);
        if (whenText && !TIME.test(whenText)) return 'The time is written YYYY-MM-DDTHH:mm.';
        const when = whenText ? new Date(whenText.slice(0, 16)) : new Date();
        let contact = await findContact(name);
        if (!contact) {
          if (input.create_contact === false) return 'No such contact.';
          const email = /@/.test(name) && !/\s/.test(name);
          contact = await saveContact(host.provider, { uid: '', name, ...(email ? { emails: [name] } : {}) }, undefined, isNote);
        }
        const daily = await logInteraction(host, contact, kind, when, str(input.summary) ?? '');
        return `Written in ${daily}, linked to ${contact.path}.`;
      },
    },
    {
      name: 'list_events',
      description: 'The events of the calendar between two days (repeating ones expanded), with their attendees.',
      input_schema: { type: 'object', properties: { from: { type: 'string', description: 'YYYY-MM-DD, included' }, to: { type: 'string', description: 'YYYY-MM-DD, excluded' } }, required: ['from', 'to'] },
      mutates: false,
      run: async (input) => {
        const from = str(input.from);
        const to = str(input.to);
        if (!from || !to || !DAY.test(from) || !DAY.test(to)) return 'from and to are written YYYY-MM-DD.';
        const out = (await loadEvents(host.provider)).flatMap((s) => occurrences(s.item, from, to).map((start) => ({ title: s.item.title, start, all_day: s.item.allDay, location: s.item.location ?? null, attendees: s.item.attendees ?? [], calendar: s.item.calendar ?? null, note: s.path })));
        return JSON.stringify(out.sort((a, b) => a.start.localeCompare(b.start)).slice(0, 200));
      },
    },
    {
      name: 'create_event',
      description: 'Create an event of the calendar (a note of the Events folder); attendees who are notes become links.',
      input_schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          start: { type: 'string', description: 'YYYY-MM-DDTHH:mm (local time), or YYYY-MM-DD for a whole day' },
          end: { type: 'string', description: 'Same form; for whole days, the day after the last one' },
          location: { type: 'string' },
          attendees: { type: 'array', items: { type: 'string' } },
          calendar: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['title', 'start'],
      },
      mutates: true,
      run: async (input) => {
        const title = str(input.title);
        const start = str(input.start);
        if (!title || !start || !(DAY.test(start) || TIME.test(start))) return 'A title and a start (YYYY-MM-DD or YYYY-MM-DDTHH:mm) are needed.';
        const end = str(input.end);
        if (end && !(DAY.test(end) || TIME.test(end))) return 'The end is written as the start.';
        const allDay = DAY.test(start);
        const attendees = strings(input.attendees);
        const event: StoredEvent = {
          uid: '',
          title,
          start: allDay ? start : start.slice(0, 16),
          allDay,
          ...(end ? { end: allDay ? end.slice(0, 10) : end.slice(0, 16) } : {}),
          ...(str(input.location) ? { location: str(input.location)! } : {}),
          ...(attendees?.length ? { attendees } : {}),
          ...(str(input.calendar) ? { calendar: str(input.calendar)! } : {}),
          ...(str(input.description) ? { description: str(input.description)! } : {}),
        };
        const saved = await saveEvent(host.provider, event, undefined, isNote);
        host.changed([saved.path]);
        return `Created ${saved.path}.`;
      },
    },
  ];
}
