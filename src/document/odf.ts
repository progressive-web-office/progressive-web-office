/** Shared OpenDocument helpers: namespaces, lengths, manifest and meta. */
import { cleanMeta, isoTimestamp, normalizeDate, type DocumentMeta, type PageNumberFormat } from './model';
import { escapeXml as esc, parseXml } from '../core/xml';
import { readZipText, type ZipEntries } from '../core/zip';

export const ODF_NS = {
  office: 'urn:oasis:names:tc:opendocument:xmlns:office:1.0',
  style: 'urn:oasis:names:tc:opendocument:xmlns:style:1.0',
  text: 'urn:oasis:names:tc:opendocument:xmlns:text:1.0',
  table: 'urn:oasis:names:tc:opendocument:xmlns:table:1.0',
  draw: 'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0',
  fo: 'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0',
  xlink: 'http://www.w3.org/1999/xlink',
  dc: 'http://purl.org/dc/elements/1.1/',
  meta: 'urn:oasis:names:tc:opendocument:xmlns:meta:1.0',
  number: 'urn:oasis:names:tc:opendocument:xmlns:datastyle:1.0',
  presentation: 'urn:oasis:names:tc:opendocument:xmlns:presentation:1.0',
  svg: 'urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0',
  of: 'urn:oasis:names:tc:opendocument:xmlns:of:1.2',
  manifest: 'urn:oasis:names:tc:opendocument:xmlns:manifest:1.0',
  loext: 'urn:org:documentfoundation:names:experimental:office:xmlns:loext:1.0',
};

/** All namespace declarations, for root elements. */
export const ODF_XMLNS = Object.entries(ODF_NS)
  .filter(([k]) => k !== 'manifest')
  .map(([k, v]) => `xmlns:${k}="${v}"`)
  .join(' ');

/** Convert an ODF length (`2.54cm`, `1in`, `12pt`...) to CSS pixels. */
export function lengthToPx(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const m = /^(-?[\d.]+)\s*(cm|mm|in|pt|pc|px)?$/.exec(value.trim());
  if (!m) return undefined;
  const n = Number(m[1]);
  switch (m[2]) {
    case 'cm':
      return (n * 96) / 2.54;
    case 'mm':
      return (n * 96) / 25.4;
    case 'in':
      return n * 96;
    case 'pt':
      return (n * 96) / 72;
    case 'pc':
      return n * 16;
    default:
      return n;
  }
}

/** Pixels to an ODF length in inches. */
export const pxToIn = (px: number): string => `${(px / 96).toFixed(4)}in`;

export function manifestXml(mimetype: string, files: { path: string; mediaType: string }[]): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    `<manifest:manifest xmlns:manifest="${ODF_NS.manifest}" manifest:version="1.3">` +
    `<manifest:file-entry manifest:full-path="/" manifest:version="1.3" manifest:media-type="${mimetype}"/>` +
    files.map((f) => `<manifest:file-entry manifest:full-path="${esc(f.path)}" manifest:media-type="${esc(f.mediaType)}"/>`).join('') +
    '</manifest:manifest>'
  );
}

/** Document properties → meta.xml (DOC-017); the licence is a user-defined property. */
export function metaXml(meta: DocumentMeta): string {
  const m = cleanMeta(meta);
  const now = new Date().toISOString().replace(/\.\d+Z$/, '');
  const el = (tag: string, value: string | undefined): string => (value ? `<${tag}>${esc(value)}</${tag}>` : '');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    `<office:document-meta ${ODF_XMLNS} office:version="1.3"><office:meta>` +
    '<meta:generator>ProgressiveWebOffice</meta:generator>' +
    el('dc:title', m.title) +
    el('dc:subject', m.subject) +
    el('dc:description', m.description) +
    (m.keywords ?? []).map((k) => el('meta:keyword', k)).join('') +
    (m.author ? `${el('meta:initial-creator', m.author)}${el('dc:creator', m.author)}` : '') +
    el('dc:language', m.language) +
    `<meta:creation-date>${isoTimestamp(m.date, false) ?? now}</meta:creation-date><dc:date>${now}</dc:date>` +
    (m.license ? `<meta:user-defined meta:name="License">${esc(m.license)}</meta:user-defined>` : '') +
    (m.identifier ? `<meta:user-defined meta:name="Identifier">${esc(m.identifier)}</meta:user-defined>` : '') +
    (m.source ? `<meta:user-defined meta:name="Source">${esc(m.source)}</meta:user-defined>` : '') +
    '</office:meta></office:document-meta>'
  );
}

/** meta.xml → document properties (DOC-017). */
export function readOdfMeta(zip: ZipEntries): DocumentMeta {
  const text = readZipText(zip, 'meta.xml');
  if (!text) return {};
  const doc = parseXml(text);
  const all = (ns: string, name: string): string[] => Array.from(doc.getElementsByTagNameNS(ns, name)).map((e) => e.textContent?.trim() ?? '').filter(Boolean);
  const get = (ns: string, name: string): string | undefined => all(ns, name)[0];
  const userDefined = (re: RegExp): string | undefined =>
    Array.from(doc.getElementsByTagNameNS(ODF_NS.meta, 'user-defined')).find((e) => re.test(e.getAttributeNS(ODF_NS.meta, 'name') ?? ''))?.textContent?.trim();
  const license = userDefined(/^licen[cs]e$/i);
  const keywords = all(ODF_NS.meta, 'keyword');
  return cleanMeta({
    title: get(ODF_NS.dc, 'title'),
    author: get(ODF_NS.meta, 'initial-creator') ?? get(ODF_NS.dc, 'creator'),
    date: normalizeDate(get(ODF_NS.meta, 'creation-date')),
    subject: get(ODF_NS.dc, 'subject'),
    description: get(ODF_NS.dc, 'description'),
    ...(keywords.length ? { keywords } : {}),
    language: get(ODF_NS.dc, 'language'),
    license,
    identifier: userDefined(/^identifier$/i),
    source: userDefined(/^source$/i),
  });
}

/** Encode text for ODF content: spaces runs, tabs and line breaks. */
export function odfText(text: string, atStart: boolean): string {
  let out = '';
  let i = 0;
  let prevSpace = atStart;
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === '\t') {
      out += '<text:tab/>';
      prevSpace = false;
    } else if (ch === '\n') {
      out += '<text:line-break/>';
      prevSpace = true;
    } else if (ch === ' ') {
      let n = 0;
      while (text[i + n] === ' ') n++;
      if (prevSpace) out += n === 1 ? '<text:s/>' : `<text:s text:c="${n}"/>`;
      else out += ' ' + (n > 1 ? (n === 2 ? '<text:s/>' : `<text:s text:c="${n - 1}"/>`) : '');
      i += n;
      prevSpace = false;
      continue;
    } else {
      out += esc(ch);
      prevSpace = false;
    }
    i++;
  }
  // A trailing space would be dropped by consumers that trim paragraphs.
  return out.replace(/ $/, '<text:s/>');
}

/** BibTeX fields with an ODF attribute of the same name (`doi` goes to `custom1`). */
export const ODF_BIB_FIELDS = ['address', 'annote', 'author', 'booktitle', 'chapter', 'edition', 'editor', 'howpublished', 'institution', 'journal', 'month', 'note', 'number', 'organizations', 'pages', 'publisher', 'school', 'series', 'title', 'report-type', 'volume', 'year', 'url', 'isbn', 'issn'];

/** DOC-029: page number formats as style:num-format values. */
export const ODF_NUMBER_FORMAT: Record<PageNumberFormat, string> = { decimal: '1', 'lower-roman': 'i', 'upper-roman': 'I', 'lower-alpha': 'a', 'upper-alpha': 'A' };
