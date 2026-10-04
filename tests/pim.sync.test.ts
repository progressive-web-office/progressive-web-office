import { describe, expect, it } from 'vitest';
import { MemoryProvider, readText } from '../src/fs';
import { DavSyncClient } from '../src/pim/dav';
import { contactKind, eventKind, loadState, saveState, synchronise, type SyncState } from '../src/pim/sync';
import { loadContacts, loadEvents, saveEvent } from '../src/pim/store';

// CAL-006, CONTACT-005: notes synchronised both ways with CalDAV and CardDAV.

const ORIGIN = 'https://cloud.example.org';
const ROOT = '/remote.php/dav/';
const PRINCIPAL = '/remote.php/dav/principals/users/ada/';
const CAL_HOME = '/remote.php/dav/calendars/ada/';
const CARD_HOME = '/remote.php/dav/addressbooks/users/ada/';

/** A CalDAV / CardDAV server in memory: enough of RFC 4791 and 6352 for the client. */
class FakeDav {
  items = new Map<string, { data: string; etag: string }>();
  requests: string[] = [];
  private n = 0;
  readonly collections = new Map<string, { kind: 'calendar' | 'tasks' | 'addressbook'; name: string; colour?: string }>([
    [`${CAL_HOME}personal/`, { kind: 'calendar', name: 'Personal', colour: '#0082c9ff' }],
    [`${CAL_HOME}tasks/`, { kind: 'tasks', name: 'Tasks' }],
    [`${CARD_HOME}contacts/`, { kind: 'addressbook', name: 'Contacts' }],
  ]);

  put(path: string, data: string): string {
    const etag = `"e${++this.n}"`;
    this.items.set(path, { data, etag });
    return etag;
  }

  private ms(responses: string[]): Response {
    return new Response(`<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav" xmlns:card="urn:ietf:params:xml:ns:carddav" xmlns:x1="http://apple.com/ns/ical/">${responses.join('')}</d:multistatus>`, { status: 207 });
  }

  private response(href: string, props: string): string {
    return `<d:response><d:href>${href}</d:href><d:propstat><d:prop>${props}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`;
  }

  fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(String(input));
    const path = decodeURIComponent(url.pathname);
    const method = init.method ?? 'GET';
    const headers = init.headers as Record<string, string>;
    const body = String(init.body ?? '');
    this.requests.push(`${method} ${path}`);
    if (headers.Authorization !== `Basic ${btoa('ada:app-password')}`) return new Response('', { status: 401 });
    if (method === 'PROPFIND') {
      if (path === ROOT) return this.ms([this.response(ROOT, `<d:current-user-principal><d:href>${PRINCIPAL}</d:href></d:current-user-principal>`)]);
      if (path === PRINCIPAL) return this.ms([this.response(PRINCIPAL, `<cal:calendar-home-set><d:href>${CAL_HOME}</d:href></cal:calendar-home-set><card:addressbook-home-set><d:href>${CARD_HOME}</d:href></card:addressbook-home-set>`)]);
      if (path === CAL_HOME || path === CARD_HOME) {
        const out = [this.response(path, '<d:resourcetype><d:collection/></d:resourcetype>')];
        for (const [p, c] of this.collections) {
          if (!p.startsWith(path)) continue;
          const type = c.kind === 'addressbook' ? '<card:addressbook/>' : '<cal:calendar/>';
          const comps = c.kind === 'calendar' ? '<cal:comp name="VEVENT"/>' : c.kind === 'tasks' ? '<cal:comp name="VTODO"/>' : '';
          out.push(this.response(p, `<d:resourcetype><d:collection/>${type}</d:resourcetype><d:displayname>${c.name}</d:displayname>${c.kind === 'addressbook' ? '' : `<cal:supported-calendar-component-set>${comps}</cal:supported-calendar-component-set>`}${c.colour ? `<x1:calendar-color>${c.colour}</x1:calendar-color>` : ''}`));
        }
        return this.ms(out);
      }
      if (this.collections.has(path)) {
        const out = [this.response(path, '<d:resourcetype><d:collection/></d:resourcetype>')];
        for (const [p, item] of this.items) if (p.startsWith(path)) out.push(this.response(p, `<d:getetag>${item.etag}</d:getetag><d:resourcetype/>`));
        return this.ms(out);
      }
      const item = this.items.get(path);
      return item ? this.ms([this.response(path, `<d:getetag>${item.etag}</d:getetag>`)]) : new Response('', { status: 404 });
    }
    if (method === 'REPORT') {
      const hrefs = [...body.matchAll(/<d:href>([^<]+)<\/d:href>/g)].map((m) => decodeURIComponent(m[1]!));
      const tag = body.includes('calendar-multiget') ? 'cal:calendar-data' : 'card:address-data';
      return this.ms(hrefs.filter((h) => this.items.has(h)).map((h) => this.response(h, `<d:getetag>${this.items.get(h)!.etag}</d:getetag><${tag}>${this.items.get(h)!.data.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</${tag}>`)));
    }
    if (method === 'PUT') {
      const existing = this.items.get(path);
      if (headers['If-None-Match'] === '*' && existing) return new Response('', { status: 412 });
      if (headers['If-Match'] && headers['If-Match'] !== existing?.etag) return new Response('', { status: 412 });
      const etag = this.put(path, body);
      return new Response(null, { status: existing ? 204 : 201, headers: { ETag: etag } });
    }
    if (method === 'DELETE') {
      if (headers['If-Match'] && headers['If-Match'] !== this.items.get(path)?.etag) return new Response('', { status: 412 });
      this.items.delete(path);
      return new Response(null, { status: 204 });
    }
    return new Response('', { status: 405 });
  };
}

const EVENT = (uid: string, title: string, extra = '') =>
  `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Server//EN\r\nBEGIN:VEVENT\r\nUID:${uid}\r\nDTSTAMP:20261001T080000Z\r\nDTSTART:20261005T090000\r\nDTEND:20261005T100000\r\nSUMMARY:${title}\r\nORGANIZER:mailto:boss@example.org\r\n${extra}BEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:-PT15M\r\nEND:VALARM\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;

async function setup() {
  const server = new FakeDav();
  server.put(`${CAL_HOME}personal/standup.ics`, EVENT('standup@server', 'Stand-up'));
  server.put(`${CARD_HOME}contacts/ada.vcf`, 'BEGIN:VCARD\r\nVERSION:3.0\r\nUID:ada\r\nFN:Ada Lovelace\r\nEMAIL;TYPE=WORK:ada@example.org\r\nPHOTO;ENCODING=b;TYPE=JPEG:AAAA\r\nEND:VCARD\r\n');
  const provider = new MemoryProvider('memory', 'Notes', {
    'Events/2026-10-06 Review.md': '---\ntitle: Review\ntype: "[[Event]]"\nstart: 2026-10-06T14:00\nend: 2026-10-06T15:00\ncalendar: Personal\n---\n\nTo prepare.\n',
  });
  const client = new DavSyncClient({ url: `${ORIGIN}/remote.php/dav/files/ada/`, username: 'ada', password: 'app-password' }, server.fetch);
  const calendars = await client.discover('calendar');
  const books = await client.discover('addressbook');
  const state: SyncState = { version: 1, items: {} };
  const sync = async () => {
    const r = await synchronise(client, calendars, eventKind(provider), state, (p) => provider.remove(p));
    const c = await synchronise(client, books, contactKind(provider), state, (p) => provider.remove(p));
    return { r, c };
  };
  return { server, provider, client, calendars, books, state, sync };
}

describe('CAL-006 CONTACT-005 CalDAV and CardDAV', () => {
  it('finds the calendars of events and the address books of the account', async () => {
    const { calendars, books } = await setup();
    expect(calendars).toEqual([{ kind: 'calendar', url: `${ORIGIN}${CAL_HOME}personal/`, name: 'Personal', colour: '#0082c9' }]);
    expect(books).toEqual([{ kind: 'addressbook', url: `${ORIGIN}${CARD_HOME}contacts/`, name: 'Contacts' }]);
  });

  it('brings the server and the folder together, both ways', async () => {
    const { server, provider, sync } = await setup();
    const { r, c } = await sync();
    expect(r).toMatchObject({ received: 1, sent: 1, conflicts: [], errors: [] });
    expect(c).toMatchObject({ received: 1, sent: 0, errors: [] });
    // The server's event is a note, its calendar and its address on the server kept.
    const events = await loadEvents(provider);
    const standup = events.find((e) => e.item.title === 'Stand-up')!;
    expect(standup.path).toBe('Events/2026-10-05 Stand-up.md');
    expect(standup.item).toMatchObject({ uid: 'standup@server', calendar: 'Personal', remote: { href: `${ORIGIN}${CAL_HOME}personal/standup.ics`, etag: '"e1"' } });
    // The folder's event is on the server, its note knowing where.
    const review = events.find((e) => e.item.title === 'Review')!;
    expect(review.item.remote?.href).toMatch(new RegExp(`^${ORIGIN}${CAL_HOME}personal/.+@pwo\\.ics$`));
    expect(server.items.get(new URL(review.item.remote!.href).pathname)!.data).toContain('SUMMARY:Review\r\n');
    expect(server.items.get(new URL(review.item.remote!.href).pathname)!.data).toContain('DESCRIPTION:To prepare.\r\n');
    const [ada] = await loadContacts(provider);
    expect(ada!.item).toMatchObject({ name: 'Ada Lovelace', emails: ['ada@example.org'], remote: { href: `${ORIGIN}${CARD_HOME}contacts/ada.vcf` } });
    // Nothing changed: nothing read again, nothing sent.
    server.requests = [];
    const again = await sync();
    expect(again.r).toMatchObject({ received: 0, sent: 0 });
    expect(server.requests.filter((q) => !q.startsWith('PROPFIND'))).toEqual([]);
  });

  it('takes the changes of the server, and sends those of the notes, keeping what the server holds besides', async () => {
    const { server, provider, sync } = await setup();
    await sync();
    // Changed on the server.
    server.put(`${CAL_HOME}personal/standup.ics`, EVENT('standup@server', 'Stand-up (moved)').replace('DTSTART:20261005T090000', 'DTSTART:20261005T093000'));
    expect((await sync()).r).toMatchObject({ received: 1, sent: 0 });
    let standup = (await loadEvents(provider)).find((e) => e.item.uid === 'standup@server')!;
    expect(standup.item).toMatchObject({ title: 'Stand-up (moved)', start: '2026-10-05T09:30' });
    // Changed in its note (with words of the user in it): sent with the version it replaces.
    await provider.write(standup.path, new Blob([standup.text.replace('title: Stand-up (moved)', 'title: Daily stand-up') + 'My notes.\n']));
    expect((await sync()).r).toMatchObject({ received: 0, sent: 1 });
    const data = server.items.get(`${CAL_HOME}personal/standup.ics`)!.data;
    expect(data).toContain('SUMMARY:Daily stand-up\r\n');
    expect(data).toContain('DESCRIPTION:My notes.\r\n');
    expect(data).toContain('ORGANIZER:mailto:boss@example.org\r\n');
    expect(data).toContain('BEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:-PT15M\r\nEND:VALARM\r\n');
    standup = (await loadEvents(provider)).find((e) => e.item.uid === 'standup@server')!;
    expect(standup.item.remote?.etag).toBe(server.items.get(`${CAL_HOME}personal/standup.ics`)!.etag);
    // A contact changed in its note: its photo and the type of its e-mail kept.
    const [ada] = await loadContacts(provider);
    await provider.write(ada!.path, new Blob([ada!.text.replace('emails:\n  - ada@example.org\n', 'emails:\n  - ada@example.org\nphones:\n  - "+33 6 12 34 56 78"\n')]));
    expect((await sync()).c).toMatchObject({ sent: 1 });
    const card = server.items.get(`${CARD_HOME}contacts/ada.vcf`)!.data;
    expect(card).toContain('EMAIL;TYPE=WORK:ada@example.org\r\n');
    expect(card).toContain('PHOTO;ENCODING=b;TYPE=JPEG:AAAA\r\n');
    expect(card).toContain('TEL;VALUE=uri:tel:+33612345678\r\n');
  });

  it('keeps both versions of an event changed on both sides', async () => {
    const { server, provider, sync } = await setup();
    await sync();
    const standup = (await loadEvents(provider)).find((e) => e.item.uid === 'standup@server')!;
    server.put(`${CAL_HOME}personal/standup.ics`, EVENT('standup@server', 'Stand-up (server)'));
    await provider.write(standup.path, new Blob([standup.text.replace('title: Stand-up', 'title: Stand-up (here)')]));
    const { r } = await sync();
    expect(r.conflicts).toEqual(['2026-10-05 Stand-up (here) (conflict)']);
    const events = (await loadEvents(provider)).map((e) => [e.item.title, !!e.item.remote, e.item.categories ?? []]);
    expect(events).toContainEqual(['Stand-up (server)', true, []]);
    expect(events).toContainEqual(['Stand-up (here) (conflict)', false, ['conflict']]);
    // The copy is not sent.
    expect((await sync()).r).toMatchObject({ sent: 0, received: 0 });
  });

  it('removes on one side what was removed on the other', async () => {
    const { server, provider, sync, state } = await setup();
    await sync();
    const standup = (await loadEvents(provider)).find((e) => e.item.uid === 'standup@server')!;
    await provider.remove(standup.path);
    expect((await sync()).r).toMatchObject({ removedThere: 1 });
    expect(server.items.has(`${CAL_HOME}personal/standup.ics`)).toBe(false);
    const review = (await loadEvents(provider)).find((e) => e.item.title === 'Review')!;
    server.items.delete(new URL(review.item.remote!.href).pathname);
    expect((await sync()).r).toMatchObject({ removedHere: 1 });
    expect(await loadEvents(provider)).toEqual([]);
    expect(Object.keys(state.items).filter((h) => h.includes('/calendars/'))).toEqual([]);
  });

  it('keeps its state in the folder', async () => {
    const { provider, state, sync } = await setup();
    await sync();
    await saveState(provider, state);
    expect(JSON.parse(await readText(provider, '.pwo/sync.json'))).toEqual(state);
    expect(await loadState(provider)).toEqual(state);
    expect(await loadState(new MemoryProvider())).toEqual({ version: 1, items: {} });
    // A new event of the folder, with no calendar, goes to the first one.
    await saveEvent(provider, { uid: '', title: 'Lunch', start: '2026-10-07T12:00', allDay: false });
    expect((await sync()).r).toMatchObject({ sent: 1 });
  });
});
