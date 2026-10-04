/**
 * CAL-003: iCalendar (RFC 5545) events read and written — the format of
 * calendar files (.ics) and of CalDAV servers. Times are kept as the
 * user's local wall time (`2026-10-05T09:00`), or a day (`2026-10-05`)
 * for an event of whole days; times given in UTC or in a time zone are
 * converted to it.
 */

export interface CalEvent {
  uid: string;
  title: string;
  /** `YYYY-MM-DD` (whole days) or `YYYY-MM-DDTHH:mm` (local time). */
  start: string;
  /** Exclusive for whole days (the day after the last one), as iCalendar has it. */
  end?: string;
  allDay: boolean;
  location?: string;
  description?: string;
  /** People invited: their names (or e-mail addresses). */
  attendees?: string[];
  categories?: string[];
  /** RRULE, as written: `FREQ=WEEKLY;BYDAY=MO,WE`. */
  recurrence?: string;
  /** Occurrences left out, as `start` is written. */
  exceptions?: string[];
  url?: string;
}

// --- lines ---------------------------------------------------------------------

interface Prop {
  name: string;
  params: Record<string, string>;
  value: string;
}

/** Content lines: unfolded (RFC 5545 §3.1), split into name, parameters and value. */
export function contentLines(text: string): Prop[] {
  const out: Prop[] = [];
  for (const line of text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    // The value starts at the first ':' outside a quoted parameter.
    let quoted = false;
    let colon = -1;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') quoted = !quoted;
      else if (line[i] === ':' && !quoted) {
        colon = i;
        break;
      }
    }
    if (colon < 0) continue;
    const [name, ...params] = line.slice(0, colon).match(/(?:[^;"]|"[^"]*")+/g) ?? [''];
    const record: Record<string, string> = {};
    for (const p of params) {
      const eq = p.indexOf('=');
      if (eq > 0) record[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
    }
    out.push({ name: name!.toUpperCase(), params: record, value: line.slice(colon + 1) });
  }
  return out;
}

/** A TEXT value (§3.3.11): \\n, \\, \\; \\\\ unescaped. */
export const unescapeText = (s: string): string => s.replace(/\\([nN,;\\])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c));
export const escapeText = (s: string): string => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** A line folded at 75 octets (§3.1), continuation lines starting with a space. */
export function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let size = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (size + n > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = '';
      size = 0;
    }
    current += ch;
    size += n;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

// --- dates ---------------------------------------------------------------------

const pad = (n: number, w = 2): string => String(n).padStart(w, '0');
const localIso = (d: Date): string => `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** The offset of a time zone at a time, in minutes (from the browser's time zone data). */
function zoneOffset(utcMs: number, zone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(utcMs));
  const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value);
  return (Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - utcMs) / 60_000;
}

/** A wall time of a time zone, as a moment. */
function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, s: number, zone: string): number {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  try {
    const first = guess - zoneOffset(guess, zone) * 60_000;
    return guess - zoneOffset(first, zone) * 60_000;
  } catch {
    // A zone the browser does not know: taken as the local time.
    return new Date(y, mo - 1, d, h, mi, s).getTime();
  }
}

/** A DATE or DATE-TIME value as the event keeps it: a day, or a local time. */
export function readDate(value: string, params: Record<string, string> = {}): { value: string; allDay: boolean } | undefined {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value.trim());
  if (!m) return undefined;
  const [, y, mo, d, h, mi, s, z] = m;
  if (h === undefined || params.VALUE === 'DATE') return { value: `${y}-${mo}-${d}`, allDay: true };
  const n = (x: string | undefined): number => Number(x ?? 0);
  if (z) return { value: localIso(new Date(Date.UTC(n(y), n(mo) - 1, n(d), n(h), n(mi), n(s)))), allDay: false };
  if (params.TZID) return { value: localIso(new Date(zonedToUtc(n(y), n(mo), n(d), n(h), n(mi), n(s), params.TZID))), allDay: false };
  // Floating: the same wall time wherever one is.
  return { value: `${y}-${mo}-${d}T${h}:${mi}`, allDay: false };
}

/** A day or a local time as iCalendar writes it: a DATE, or a DATE-TIME in UTC. */
export function writeDate(value: string): { params: string; value: string } {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return { params: ';VALUE=DATE', value: value.replace(/-/g, '') };
  const d = new Date(value);
  return { params: '', value: `${pad(d.getUTCFullYear(), 4)}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z` };
}

// --- events --------------------------------------------------------------------

/** The events (VEVENT) of an iCalendar text; the others components are left out. */
export function readCalendar(text: string): CalEvent[] {
  const events: CalEvent[] = [];
  let current: Partial<CalEvent> | undefined;
  let depth = 0;
  for (const p of contentLines(text)) {
    if (p.name === 'BEGIN') {
      if (p.value.toUpperCase() === 'VEVENT' && depth === 0) current = { allDay: false };
      else if (current) depth++;
      continue;
    }
    if (p.name === 'END') {
      if (depth > 0) depth--;
      else if (current && p.value.toUpperCase() === 'VEVENT') {
        if (current.start) events.push({ uid: current.uid ?? crypto.randomUUID(), title: current.title ?? '', allDay: !!current.allDay, ...(current as object), start: current.start } as CalEvent);
        current = undefined;
      }
      continue;
    }
    // The properties of an alarm (VALARM) are not the event's.
    if (!current || depth > 0) continue;
    const text = unescapeText(p.value);
    switch (p.name) {
      case 'UID':
        current.uid = p.value;
        break;
      case 'SUMMARY':
        current.title = text;
        break;
      case 'DTSTART': {
        const d = readDate(p.value, p.params);
        if (d) {
          current.start = d.value;
          current.allDay = d.allDay;
        }
        break;
      }
      case 'DTEND': {
        const d = readDate(p.value, p.params);
        if (d) current.end = d.value;
        break;
      }
      case 'DURATION': {
        const end = current.start ? addDuration(current.start, p.value) : undefined;
        if (end) current.end = end;
        break;
      }
      case 'LOCATION':
        current.location = text;
        break;
      case 'DESCRIPTION':
        current.description = text;
        break;
      case 'URL':
        current.url = p.value;
        break;
      case 'RRULE':
        current.recurrence = p.value;
        break;
      case 'EXDATE':
        for (const v of p.value.split(',')) {
          const d = readDate(v, p.params);
          if (d) (current.exceptions ??= []).push(d.value);
        }
        break;
      case 'CATEGORIES':
        (current.categories ??= []).push(...p.value.split(/(?<!\\),/).map(unescapeText).filter(Boolean));
        break;
      case 'ATTENDEE': {
        const who = p.params.CN ?? p.value.replace(/^mailto:/i, '');
        if (who) (current.attendees ??= []).push(who);
        break;
      }
    }
  }
  return events;
}

/** `start` plus an iCalendar DURATION (`PT1H30M`, `P1D`). */
export function addDuration(start: string, duration: string): string | undefined {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(duration.trim());
  if (!m) return undefined;
  const sign = m[1] === '-' ? -1 : 1;
  const days = Number(m[2] ?? 0) * 7 + Number(m[3] ?? 0);
  const minutes = Number(m[4] ?? 0) * 60 + Number(m[5] ?? 0) + Number(m[6] ?? 0) / 60;
  if (/^\d{4}-\d{2}-\d{2}$/.test(start)) {
    const d = new Date(`${start}T00:00`);
    d.setDate(d.getDate() + sign * days);
    return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  const d = new Date(start);
  d.setDate(d.getDate() + sign * days);
  d.setMinutes(d.getMinutes() + sign * minutes);
  return localIso(d);
}

/** One VEVENT, its lines folded. */
export function writeEvent(e: CalEvent, stamp = new Date()): string {
  const lines = ['BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${writeDate(localIso(stamp)).value}`];
  const start = writeDate(e.start);
  lines.push(`DTSTART${start.params}:${start.value}`);
  if (e.end) {
    const end = writeDate(e.end);
    lines.push(`DTEND${end.params}:${end.value}`);
  }
  lines.push(`SUMMARY:${escapeText(e.title)}`);
  if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
  if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
  if (e.url) lines.push(`URL:${e.url}`);
  if (e.recurrence) lines.push(`RRULE:${e.recurrence}`);
  for (const x of e.exceptions ?? []) {
    const d = writeDate(x);
    lines.push(`EXDATE${d.params}:${d.value}`);
  }
  if (e.categories?.length) lines.push(`CATEGORIES:${e.categories.map(escapeText).join(',')}`);
  for (const who of e.attendees ?? []) lines.push(/@/.test(who) && !/\s/.test(who) ? `ATTENDEE:mailto:${who}` : `ATTENDEE;CN="${who.replace(/"/g, "'")}":invalid:nomail`);
  lines.push('END:VEVENT');
  return lines.map(fold).join('\r\n');
}

/** A calendar file holding these events. */
export function writeCalendar(events: CalEvent[], stamp = new Date()): string {
  return [`BEGIN:VCALENDAR`, 'VERSION:2.0', 'PRODID:-//Progressive Web Office//Calendar//EN', 'CALSCALE:GREGORIAN', ...events.map((e) => writeEvent(e, stamp)), 'END:VCALENDAR', ''].join('\r\n');
}

// --- recurrence ----------------------------------------------------------------

const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/**
 * The starts of the occurrences of an event between two days (`from`
 * included, `to` excluded, `YYYY-MM-DD`): DAILY, WEEKLY (BYDAY), MONTHLY
 * (BYMONTHDAY, or the day of the start) and YEARLY rules, with INTERVAL,
 * COUNT and UNTIL; EXDATE left out. At most 1000 occurrences.
 */
export function occurrences(e: Pick<CalEvent, 'start' | 'end' | 'recurrence' | 'exceptions'>, from: string, to: string): string[] {
  const day = (s: string): string => s.slice(0, 10);
  if (!e.recurrence) return day(e.start) < to && day(e.end ?? e.start) >= from ? [e.start] : [];
  const rule = Object.fromEntries(e.recurrence.split(';').map((p) => p.split('=') as [string, string]));
  const freq = rule.FREQ;
  const interval = Math.max(1, Number(rule.INTERVAL ?? 1));
  const count = rule.COUNT ? Number(rule.COUNT) : Infinity;
  const until = rule.UNTIL ? (readDate(rule.UNTIL)?.value ?? '9999') : '9999';
  const time = e.start.length > 10 ? e.start.slice(10) : '';
  const first = new Date(`${day(e.start)}T00:00`);
  const byDay = rule.BYDAY ? rule.BYDAY.split(',').map((d) => DAYS.indexOf(d.slice(-2))).filter((d) => d >= 0) : undefined;
  const byMonthDay = rule.BYMONTHDAY ? rule.BYMONTHDAY.split(',').map(Number) : undefined;
  const skip = new Set((e.exceptions ?? []).map(day));
  const out: string[] = [];
  let n = 0;
  const iso = (d: Date): string => `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  for (let i = 0, guard = 0; guard < 20_000 && n < count; i++, guard++) {
    // The days of the i-th period.
    let days: Date[];
    if (freq === 'DAILY') days = [new Date(first.getFullYear(), first.getMonth(), first.getDate() + i * interval)];
    else if (freq === 'WEEKLY') {
      const monday = new Date(first.getFullYear(), first.getMonth(), first.getDate() - ((first.getDay() + 6) % 7) + i * 7 * interval);
      days = (byDay ?? [first.getDay()]).map((wd) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + ((wd + 6) % 7))).sort((a, b) => a.getTime() - b.getTime());
    } else if (freq === 'MONTHLY') {
      const y = first.getFullYear();
      const mo = first.getMonth() + i * interval;
      days = (byMonthDay ?? [first.getDate()]).map((d) => new Date(y, mo, d)).filter((d) => d.getMonth() === ((mo % 12) + 12) % 12);
    } else if (freq === 'YEARLY') days = [new Date(first.getFullYear() + i * interval, first.getMonth(), first.getDate())].filter((d) => d.getDate() === first.getDate());
    else return [e.start];
    for (const d of days) {
      const key = iso(d);
      if (key < day(e.start)) continue;
      if (key > until.slice(0, 10) || n >= count) return out;
      n++;
      if (key >= to) return out;
      if (key >= from && !skip.has(key)) out.push(key + time);
      if (out.length >= 1000) return out;
    }
  }
  return out;
}
