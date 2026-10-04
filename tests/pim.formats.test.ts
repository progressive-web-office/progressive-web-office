import { describe, expect, it } from 'vitest';
import { addDuration, fold, occurrences, readCalendar, readDate, writeCalendar, type CalEvent } from '../src/pim/ical';
import { readContacts, writeContact } from '../src/pim/vcard';
import { contactNote, contactOfNote, eventNote, eventOfNote, eventPath, isEventNote, isPersonNote, withValues } from '../src/pim/notes';

// CAL-001, CAL-003, CONTACT-001, CONTACT-003: events and contacts, as notes and as iCalendar / vCard.

/** A moment as the local wall time the events keep, whatever the time zone of the tests. */
const local = (iso: string): string => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

const ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Paris',
  'END:VTIMEZONE',
  'BEGIN:VEVENT',
  'UID:kick-off@example.org',
  'DTSTAMP:20261001T080000Z',
  'DTSTART;TZID=Europe/Paris:20261005T090000',
  'DTEND;TZID=Europe/Paris:20261005T103000',
  'SUMMARY:Kick-off\\, team A',
  'LOCATION:Room 12',
  'DESCRIPTION:Agenda:\\n- goals\\n- roles',
  'ATTENDEE;CN="Ada Lovelace";ROLE=REQ-PARTICIPANT:mailto:ada@example.org',
  'ATTENDEE:mailto:charles@example.org',
  'CATEGORIES:work,project',
  'RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=4',
  'EXDATE;TZID=Europe/Paris:20261012T090000',
  'BEGIN:VALARM',
  'ACTION:DISPLAY',
  'DESCRIPTION:Reminder',
  'TRIGGER:-PT15M',
  'END:VALARM',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:holiday@example.org',
  'DTSTART;VALUE=DATE:20261101',
  'DTEND;VALUE=DATE:20261102',
  'SUMMARY:All Saints',
  '  Day',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

describe('CAL-003 iCalendar', () => {
  it('reads events: times of a zone made local, whole days, folded lines, escapes, alarms left out', () => {
    const [meeting, holiday] = readCalendar(ICS);
    // 09:00 in Paris in October (UTC+2) is 07:00 UTC.
    expect(meeting).toEqual({
      uid: 'kick-off@example.org',
      title: 'Kick-off, team A',
      start: local('2026-10-05T07:00Z'),
      end: local('2026-10-05T08:30Z'),
      allDay: false,
      location: 'Room 12',
      description: 'Agenda:\n- goals\n- roles',
      attendees: ['Ada Lovelace', 'charles@example.org'],
      categories: ['work', 'project'],
      recurrence: 'FREQ=WEEKLY;BYDAY=MO;COUNT=4',
      exceptions: [local('2026-10-12T07:00Z')],
    });
    expect(holiday).toMatchObject({ title: 'All Saints Day', start: '2026-11-01', end: '2026-11-02', allDay: true });
  });

  it('writes events that read back the same, lines folded at 75 octets', () => {
    const events = readCalendar(ICS);
    const text = writeCalendar(events, new Date('2026-10-04T10:00:00Z'));
    expect(text).toMatch(/^BEGIN:VCALENDAR\r\nVERSION:2\.0\r\n/);
    expect(text.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
    expect(readCalendar(text)).toEqual(events.map((e) => ({ ...e, attendees: e.attendees })));
    expect(fold('x'.repeat(80))).toBe(`${'x'.repeat(75)}\r\n ${'x'.repeat(5)}`);
    expect(fold('é'.repeat(40)).split('\r\n')[0]).toBe('é'.repeat(37));
  });

  it('reads dates and durations', () => {
    expect(readDate('20261005T090000')).toEqual({ value: '2026-10-05T09:00', allDay: false });
    expect(readDate('20261005T090000Z')).toEqual({ value: local('2026-10-05T09:00Z'), allDay: false });
    expect(readDate('20261005', { VALUE: 'DATE' })).toEqual({ value: '2026-10-05', allDay: true });
    expect(readDate('20260115T090000', { TZID: 'America/New_York' })).toEqual({ value: local('2026-01-15T14:00Z'), allDay: false });
    expect(addDuration('2026-10-05T09:00', 'PT1H30M')).toBe('2026-10-05T10:30');
    expect(addDuration('2026-10-05', 'P2D')).toBe('2026-10-07');
    expect(readCalendar('BEGIN:VEVENT\nUID:a\nDTSTART:20261005T090000\nDURATION:PT45M\nSUMMARY:x\nEND:VEVENT')[0]!.end).toBe('2026-10-05T09:45');
  });

  it('repeats events by their rule, the exceptions left out', () => {
    const weekly = { start: '2026-10-05T09:00', recurrence: 'FREQ=WEEKLY;BYDAY=MO,WE;COUNT=5', exceptions: ['2026-10-07T09:00'] };
    expect(occurrences(weekly, '2026-10-01', '2026-11-01')).toEqual(['2026-10-05T09:00', '2026-10-12T09:00', '2026-10-14T09:00', '2026-10-19T09:00']);
    expect(occurrences({ start: '2026-01-31', recurrence: 'FREQ=MONTHLY' }, '2026-01-01', '2026-06-01')).toEqual(['2026-01-31', '2026-03-31', '2026-05-31']);
    expect(occurrences({ start: '2026-10-05', recurrence: 'FREQ=DAILY;INTERVAL=2;UNTIL=20261011' }, '2026-10-01', '2026-12-01')).toEqual(['2026-10-05', '2026-10-07', '2026-10-09', '2026-10-11']);
    expect(occurrences({ start: '1815-12-10', recurrence: 'FREQ=YEARLY' }, '2026-01-01', '2027-01-01')).toEqual(['2026-12-10']);
    expect(occurrences({ start: '2026-10-05T09:00', end: '2026-10-05T10:00' }, '2026-10-05', '2026-10-06')).toEqual(['2026-10-05T09:00']);
    expect(occurrences({ start: '2026-10-05T09:00' }, '2026-10-06', '2026-10-07')).toEqual([]);
  });
});

const VCF = [
  'BEGIN:VCARD',
  'VERSION:3.0',
  'UID:urn:uuid:ada',
  'N:Lovelace;Ada;;;',
  'FN:Ada Lovelace',
  'ORG:Analytical Engines;Research',
  'TITLE:Mathematician',
  'item1.EMAIL;TYPE=INTERNET:ada@example.org',
  'TEL;TYPE=CELL:+33 6 12 34 56 78',
  'BDAY:1815-12-10',
  'ADR;TYPE=HOME:;;12 Rue de la Paix;Paris;;75002;France',
  'URL:https://example.org/ada',
  'NOTE:Met at the conference\\, 2026.',
  'END:VCARD',
  'BEGIN:VCARD',
  'VERSION:4.0',
  'FN:Charles',
  'BDAY:--0310',
  'END:VCARD',
].join('\r\n');

describe('CONTACT-003 vCard', () => {
  it('reads contacts of vCard 3 and 4', () => {
    const [ada, charles] = readContacts(VCF);
    expect(ada).toEqual({
      uid: 'ada',
      name: 'Ada Lovelace',
      givenName: 'Ada',
      familyName: 'Lovelace',
      organization: 'Analytical Engines, Research',
      role: 'Mathematician',
      emails: ['ada@example.org'],
      phones: ['+33 6 12 34 56 78'],
      birthday: '1815-12-10',
      address: '12 Rue de la Paix, 75002 Paris, France',
      website: 'https://example.org/ada',
      note: 'Met at the conference, 2026.',
    });
    expect(charles).toMatchObject({ name: 'Charles', birthday: '--03-10' });
  });

  it('writes contacts that read back the same', () => {
    for (const c of readContacts(VCF)) {
      const back = readContacts(writeContact(c))[0]!;
      expect({ ...back, phones: back.phones?.map((p) => p.replace(/\s/g, '')), address: undefined }).toEqual({ ...c, phones: c.phones?.map((p) => p.replace(/\s/g, '')), address: undefined });
    }
  });
});

describe('CAL-001 CONTACT-001 events and contacts as notes', () => {
  const event: CalEvent = { uid: 'kick-off@example.org', title: 'Kick-off', start: '2026-10-05T09:00', end: '2026-10-05T10:30', allDay: false, location: 'Room 12', attendees: ['Ada Lovelace', 'charles@example.org'], categories: ['work'], description: 'Agenda.' };

  it('writes an event as a note, its attendees who are notes as links, and reads it back', () => {
    const text = eventNote({ ...event, calendar: 'Work' }, '', (name) => name === 'Ada Lovelace');
    expect(text).toBe(
      '---\ntitle: Kick-off\ntype: "[[Event]]"\nstart: 2026-10-05T09:00\nend: 2026-10-05T10:30\nlocation: Room 12\nattendees:\n  - "[[Ada Lovelace]]"\n  - charles@example.org\ncalendar: Work\ntags:\n  - work\nuid: kick-off@example.org\n---\n\nAgenda.\n',
    );
    expect(isEventNote(text)).toBe(true);
    expect(eventOfNote(text)).toEqual({ ...event, calendar: 'Work' });
    expect(eventPath('Events', event)).toBe('Events/2026-10-05 Kick-off.md');
  });

  it('updates an event note, keeping its other properties and its text', () => {
    const mine = '---\ntitle: Kick-off\ntype: "[[Event]]"\nstart: 2026-10-05T09:00\nmood: good\n---\n\nMy notes [[Ada Lovelace]].\n';
    const updated = eventNote({ ...event, start: '2026-10-06T14:00', end: undefined, remote: { href: 'https://cloud.example.org/dav/k.ics', etag: '"2"' } }, mine);
    expect(updated).toContain('start: 2026-10-06T14:00\nmood: good\n');
    expect(updated).toContain('caldav: https://cloud.example.org/dav/k.ics\netag: "\\"2\\""');
    expect(updated.endsWith('\nMy notes [[Ada Lovelace]].\n')).toBe(true);
    expect(eventOfNote(updated)?.remote).toEqual({ href: 'https://cloud.example.org/dav/k.ics', etag: '"2"' });
    expect(eventOfNote('---\ntitle: x\n---\n')).toBeUndefined();
    expect(eventOfNote('---\ntype: "[[Event]]"\nstart: 2026-11-01\n---\n', 'From the file name')).toMatchObject({ title: 'From the file name', start: '2026-11-01', allDay: true });
  });

  it('writes a contact as a note and reads it back', () => {
    const [ada] = readContacts(VCF);
    const text = contactNote(ada!, '', (name) => name === 'Analytical Engines, Research');
    expect(text).toContain('title: Ada Lovelace\ntype: "[[Person]]"\nfirst name: Ada\nlast name: Lovelace\nemails:\n  - ada@example.org\n');
    expect(text).toContain('organization: "[[Analytical Engines, Research]]"');
    expect(text).toContain('tags:\n  - person\n');
    expect(isPersonNote(text)).toBe(true);
    expect(contactOfNote(text)).toEqual(ada);
  });

  it('sets and removes properties, the others in their place', () => {
    const text = '---\ntitle: A\nb: 1\nc: x\n---\n\nBody\n';
    expect(withValues(text, [['c', undefined], ['d', ['x', 'y']], ['b', '2']])).toBe('---\ntitle: A\nb: "2"\nd:\n  - x\n  - y\n---\n\nBody\n');
  });
});
