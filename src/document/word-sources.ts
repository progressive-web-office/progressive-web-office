/**
 * Word's own bibliography (DOC-027): the sources part (`customXml`, schema
 * `…/2006/bibliography`) and the CITATION field, so that Word lists the
 * sources in "Manage Sources" and updates the citations.
 */
import { children, parseXml } from '../core/xml';
import { fromCsl, parseNames, writeNames, type BibEntry, type Person } from './bibliography';
import type { CiteRun } from './model';

export const BIB_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/bibliography';

const SOURCE_TYPES: Record<string, string> = {
  article: 'JournalArticle',
  book: 'Book',
  inbook: 'BookSection',
  incollection: 'BookSection',
  inproceedings: 'ConferenceProceedings',
  conference: 'ConferenceProceedings',
  techreport: 'Report',
  phdthesis: 'Report',
  mastersthesis: 'Report',
  online: 'InternetSite',
  misc: 'Misc',
};
const BIB_TYPES: Record<string, string> = { JournalArticle: 'article', ArticleInAPeriodical: 'article', Book: 'book', BookSection: 'incollection', ConferenceProceedings: 'inproceedings', Report: 'techreport', InternetSite: 'online', DocumentFromInternetSite: 'online', ElectronicSource: 'online', Misc: 'misc' };
/** BibTeX field ↔ Word source element. */
const FIELDS: [string, string][] = [
  ['title', 'Title'],
  ['journal', 'JournalName'],
  ['booktitle', 'BookTitle'],
  ['year', 'Year'],
  ['month', 'Month'],
  ['volume', 'Volume'],
  ['number', 'Issue'],
  ['pages', 'Pages'],
  ['publisher', 'Publisher'],
  ['address', 'City'],
  ['institution', 'Institution'],
  ['school', 'Institution'],
  ['edition', 'Edition'],
  ['doi', 'DOI'],
  ['url', 'URL'],
  ['note', 'Comments'],
];

const xmlEsc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function nameList(role: string, people: Person[]): string {
  if (!people.length) return '';
  const persons = people.map((p) => `<b:Person><b:Last>${xmlEsc(p.family)}</b:Last>${p.given ? `<b:First>${xmlEsc(p.given)}</b:First>` : ''}</b:Person>`).join('');
  return `<b:${role}><b:NameList>${persons}</b:NameList></b:${role}>`;
}

/** The sources part: every entry of the document's bibliography. */
export function sourcesXml(entries: BibEntry[]): string {
  const sources = entries.map((e) => {
    const roles = nameList('Author', parseNames(e.fields.author)) + nameList('Editor', parseNames(e.fields.editor));
    // One element per Word field (institution and school are both Institution).
    const written = new Set<string>();
    let fields = '';
    for (const [bib, word] of FIELDS) {
      if (!e.fields[bib] || written.has(word)) continue;
      written.add(word);
      fields += `<b:${word}>${xmlEsc(e.fields[bib])}</b:${word}>`;
    }
    return `<b:Source><b:Tag>${xmlEsc(e.key)}</b:Tag><b:SourceType>${SOURCE_TYPES[e.type] ?? 'Misc'}</b:SourceType>${roles ? `<b:Author>${roles}</b:Author>` : ''}${fields}</b:Source>`;
  });
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    `<b:Sources xmlns:b="${BIB_NS}" xmlns="${BIB_NS}" SelectedStyle="\\APASixthEditionOfficeOnline.xsl" StyleName="APA" Version="6">${sources.join('')}</b:Sources>`
  );
}

export const SOURCES_PROPS =
  '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' +
  `<ds:datastoreItem ds:itemID="{6C1F2C4E-3D2B-4E8A-9C3B-5A0F7D1E2B10}" xmlns:ds="http://schemas.openxmlformats.org/officeDocument/2006/customXml"><ds:schemaRefs><ds:schemaRef ds:uri="${BIB_NS}"/></ds:schemaRefs></ds:datastoreItem>`;

/** Entries of a Word sources part, or none when the part is something else. */
export function readSources(xml: string): BibEntry[] {
  const root = parseXml(xml).documentElement;
  if (root.localName !== 'Sources') return [];
  const text = (el: Element, name: string): string | undefined => children(el, name)[0]?.textContent?.trim() || undefined;
  const people = (el: Element | undefined): string => {
    const list = el ? children(el, 'NameList')[0] : undefined;
    if (!list) {
      const corporate = el ? text(el, 'Corporate') : undefined;
      return corporate ? `{${corporate}}`.replace(/[{}]/g, '') : '';
    }
    return writeNames(children(list, 'Person').map((p) => ({ family: text(p, 'Last') ?? '', ...(text(p, 'First') ? { given: [text(p, 'First'), text(p, 'Middle')].filter(Boolean).join(' ') } : {}) })));
  };
  return children(root, 'Source').flatMap((s): BibEntry[] => {
    const key = text(s, 'Tag');
    if (!key) return [];
    const type = BIB_TYPES[text(s, 'SourceType') ?? ''] ?? 'misc';
    const fields: Record<string, string> = {};
    const roles = children(s, 'Author')[0];
    const author = roles ? people(children(roles, 'Author')[0]) : '';
    const editor = roles ? people(children(roles, 'Editor')[0]) : '';
    if (author) fields.author = author;
    if (editor) fields.editor = editor;
    for (const [bib, word] of FIELDS) {
      const v = text(s, word);
      if (!v) continue;
      if (word === 'Institution') fields[type === 'techreport' ? 'institution' : 'school'] ??= v;
      else fields[bib] ??= v;
    }
    return [{ key, type, fields }];
  });
}

/** ` CITATION key1 \m key2 \p 12 `: Word cites several sources with `\m`, a page with `\p`. */
export function citationInstr(cite: CiteRun): string {
  const [first, ...more] = cite.cite;
  const page = cite.locator ? ` \\p "${cite.locator.replace(/^p+\.\s*/, '').replace(/"/g, '')}"` : '';
  return ` CITATION ${first}${more.map((k) => ` \\m ${k}`).join('')}${page} `;
}

/** A citation from a CITATION field instruction. */
export function parseCitation(instr: string): CiteRun | undefined {
  const tokens = instr.match(/"[^"]*"|\S+/g)?.map((t) => t.replace(/^"|"$/g, '')) ?? [];
  if (tokens[0]?.toUpperCase() !== 'CITATION' || !tokens[1]) return undefined;
  const cite: CiteRun = { cite: [tokens[1]] };
  for (let i = 2; i < tokens.length; i++) {
    const sw = tokens[i]!.toLowerCase();
    if (sw === '\\m' && tokens[i + 1]) cite.cite.push(tokens[++i]!);
    else if (sw === '\\p' && tokens[i + 1]) cite.locator = `p. ${tokens[++i]}`;
    else if (/^\\[lsvfyt]$/.test(sw)) i++;
  }
  return cite;
}

/**
 * Zotero and Mendeley citations (`ADDIN ZOTERO_ITEM CSL_CITATION {…}`,
 * `ADDIN CSL_CITATION {…}`): the cited items with their data.
 */
export function parseCslCitation(instr: string): { cite: CiteRun; entries: BibEntry[] } | undefined {
  const m = /^\s*ADDIN\s+(?:ZOTERO_ITEM\s+)?CSL_CITATION\s+(\{[\s\S]*\})\s*$/.exec(instr);
  if (!m) return undefined;
  try {
    const data = JSON.parse(m[1]!) as { citationItems?: { id?: unknown; itemData?: Record<string, unknown>; locator?: string; label?: string }[] };
    const entries: BibEntry[] = [];
    const keys: string[] = [];
    let locator: string | undefined;
    for (const item of data.citationItems ?? []) {
      const entry = item.itemData ? fromCsl({ ...item.itemData, id: item.itemData.id ?? item.id }) : undefined;
      if (!entry) continue;
      entries.push(entry);
      keys.push(entry.key);
      if (item.locator) locator = `${item.label === 'page' || !item.label ? 'p.' : item.label} ${item.locator}`;
    }
    if (!keys.length) return undefined;
    return { cite: locator ? { cite: keys, locator } : { cite: keys }, entries };
  } catch {
    return undefined;
  }
}

