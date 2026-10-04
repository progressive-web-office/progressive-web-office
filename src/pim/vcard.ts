/**
 * CONTACT-003: vCard (RFC 6350, and version 3.0 of RFC 2426) contacts read
 * and written — the format of address book files (.vcf) and of CardDAV
 * servers.
 */
import { contentLines, escapeText, fold, unescapeText } from './ical';

export interface Contact {
  uid: string;
  /** Formatted name (FN). */
  name: string;
  givenName?: string;
  familyName?: string;
  emails?: string[];
  phones?: string[];
  organization?: string;
  role?: string;
  /** `YYYY-MM-DD`, or `--MM-DD` without the year. */
  birthday?: string;
  address?: string;
  website?: string;
  note?: string;
  categories?: string[];
}

/** A birthday as written in vCard 3 or 4 (`19851210`, `1985-12-10`, `--1210`) → `YYYY-MM-DD` or `--MM-DD`. */
function readBirthday(value: string): string | undefined {
  const v = value.trim().replace(/T.*$/, '');
  const full = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(v);
  if (full) return `${full[1]}-${full[2]}-${full[3]}`;
  const noYear = /^--(\d{2})-?(\d{2})$/.exec(v);
  return noYear ? `--${noYear[1]}-${noYear[2]}` : undefined;
}

/** The components of a structured value (N, ADR), split on unescaped ';'. */
const components = (value: string): string[] => value.split(/(?<!\\);/).map(unescapeText);

/** The contacts (VCARD) of a text. */
export function readContacts(text: string): Contact[] {
  const out: Contact[] = [];
  let c: Partial<Contact> | undefined;
  for (const p of contentLines(text)) {
    // A property may carry a group: `item1.EMAIL`.
    const name = p.name.replace(/^[^.]+\./, '');
    if (name === 'BEGIN' && p.value.toUpperCase() === 'VCARD') {
      c = {};
      continue;
    }
    if (name === 'END' && p.value.toUpperCase() === 'VCARD') {
      if (c) {
        const display = c.name || [c.givenName, c.familyName].filter(Boolean).join(' ') || c.organization || c.emails?.[0] || '';
        if (display) out.push({ ...c, uid: c.uid ?? crypto.randomUUID(), name: display } as Contact);
      }
      c = undefined;
      continue;
    }
    if (!c) continue;
    const value = unescapeText(p.value);
    switch (name) {
      case 'UID':
        c.uid = p.value.replace(/^urn:uuid:/i, '');
        break;
      case 'FN':
        c.name = value;
        break;
      case 'N': {
        const [family, given] = components(p.value);
        if (family) c.familyName = family;
        if (given) c.givenName = given;
        break;
      }
      case 'EMAIL':
        if (value) (c.emails ??= []).push(value);
        break;
      case 'TEL':
        if (value) (c.phones ??= []).push(value.replace(/^tel:/i, ''));
        break;
      case 'ORG':
        c.organization = components(p.value).filter(Boolean).join(', ');
        break;
      case 'TITLE':
      case 'ROLE':
        c.role ??= value;
        break;
      case 'BDAY': {
        const b = readBirthday(p.value);
        if (b) c.birthday = b;
        break;
      }
      case 'ADR': {
        // PO box, extended, street, locality, region, code, country.
        const [, extended, street, locality, region, code, country] = components(p.value);
        const address = [street, extended, [code, locality].filter(Boolean).join(' '), region, country].filter(Boolean).join(', ');
        if (address) c.address ??= address;
        break;
      }
      case 'URL':
        c.website ??= p.value;
        break;
      case 'NOTE':
        c.note = value;
        break;
      case 'CATEGORIES':
        (c.categories ??= []).push(...p.value.split(/(?<!\\),/).map(unescapeText).filter(Boolean));
        break;
    }
  }
  return out;
}

/** A contact as a vCard 4.0, its lines folded. */
export function writeContact(c: Contact): string {
  const lines = ['BEGIN:VCARD', 'VERSION:4.0', `UID:${c.uid}`, `FN:${escapeText(c.name)}`];
  if (c.familyName || c.givenName) lines.push(`N:${escapeText(c.familyName ?? '')};${escapeText(c.givenName ?? '')};;;`);
  for (const e of c.emails ?? []) lines.push(`EMAIL:${escapeText(e)}`);
  for (const t of c.phones ?? []) lines.push(`TEL;VALUE=uri:tel:${t.replace(/\s+/g, '')}`);
  if (c.organization) lines.push(`ORG:${escapeText(c.organization)}`);
  if (c.role) lines.push(`TITLE:${escapeText(c.role)}`);
  if (c.birthday) lines.push(`BDAY:${c.birthday.replace(/^--(\d{2})-(\d{2})$/, '--$1$2').replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1$2$3')}`);
  if (c.address) lines.push(`ADR:;;${escapeText(c.address)};;;;`);
  if (c.website) lines.push(`URL:${c.website}`);
  if (c.note) lines.push(`NOTE:${escapeText(c.note)}`);
  if (c.categories?.length) lines.push(`CATEGORIES:${c.categories.map(escapeText).join(',')}`);
  lines.push('END:VCARD');
  return lines.map(fold).join('\r\n');
}

/** An address book file holding these contacts. */
export const writeContacts = (contacts: Contact[]): string => contacts.map(writeContact).join('\r\n') + '\r\n';

/**
 * CONTACT-005: a contact written back into the vCard it was read from: the
 * fields it changed replaced, the others — photo, labels, the types of
 * unchanged e-mails and phones, other properties — kept.
 */
export function mergeContact(raw: string, c: Contact): string {
  const lines = raw.replace(/\r?\n[ \t]/g, '').split(/\r?\n/).filter((l) => l.length);
  const before = readContacts(raw)[0];
  const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  // A field unchanged keeps its lines; a changed one is written again from the contact.
  const fields: [string[], boolean][] = [
    [['FN'], same(before?.name, c.name)],
    [['N'], same(before?.givenName, c.givenName) && same(before?.familyName, c.familyName)],
    [['EMAIL'], same(before?.emails, c.emails)],
    [['TEL'], same(before?.phones?.map((p) => p.replace(/\s/g, '')), c.phones?.map((p) => p.replace(/\s/g, '')))],
    [['ORG'], same(before?.organization, c.organization)],
    [['TITLE', 'ROLE'], same(before?.role, c.role)],
    [['BDAY'], same(before?.birthday, c.birthday)],
    [['ADR'], same(before?.address, c.address)],
    [['URL'], same(before?.website, c.website)],
    [['NOTE'], same(before?.note, c.note)],
    [['CATEGORIES'], same(before?.categories, c.categories)],
  ];
  const changed = new Set(fields.filter(([, kept]) => !kept).flatMap(([names]) => names));
  const name = (l: string): string => (/^[^:;]+/.exec(l)?.[0] ?? '').replace(/^[^.]+\./, '').toUpperCase();
  const ours = writeContact(c)
    .replace(/\r?\n[ \t]/g, '')
    .split(/\r?\n/)
    .filter((l) => changed.has(name(l)) || (name(l) === 'TITLE' && changed.has('ROLE')));
  const out: string[] = [];
  for (const l of lines) {
    if (changed.has(name(l))) continue;
    if (/^END:VCARD$/i.test(l)) out.push(...ours);
    out.push(l);
  }
  return out.map(fold).join('\r\n') + '\r\n';
}
