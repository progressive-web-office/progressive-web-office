/** Shared OOXML (Office Open XML) helpers: relationships and namespaces. */
import { cleanMeta, isoTimestamp, normalizeDate, type DocumentMeta, type PageNumberFormat } from './model';
import { attr, children, parseXml } from '../core/xml';
import { readZipText, type ZipEntries } from '../core/zip';

export const NS = {
  w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  wp: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  pic: 'http://schemas.openxmlformats.org/drawingml/2006/picture',
  p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  ct: 'http://schemas.openxmlformats.org/package/2006/content-types',
  rel: 'http://schemas.openxmlformats.org/package/2006/relationships',
};

export const REL = {
  officeDocument: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument',
  styles: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles',
  numbering: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering',
  hyperlink: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink',
  footnotes: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes',
  header: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/header',
  footer: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer',
  image: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
  worksheet: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet',
  sharedStrings: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings',
  theme: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme',
  slide: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide',
  slideLayout: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout',
  slideMaster: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster',
  notesSlide: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide',
  coreProps: 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties',
  subDocument: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/subDocument',
  customXml: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml',
  customXmlProps: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXmlProps',
  extendedProps: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties',
};

export interface Relationship {
  id: string;
  type: string;
  target: string;
  external: boolean;
}

/** Path of the `.rels` part for a given part (`word/document.xml` -> `word/_rels/document.xml.rels`). */
export function relsPathFor(partPath: string): string {
  const slash = partPath.lastIndexOf('/');
  return `${partPath.slice(0, slash + 1)}_rels/${partPath.slice(slash + 1)}.rels`;
}

/** Resolve a relationship target relative to the source part. */
export function resolveTarget(partPath: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = partPath.split('/').slice(0, -1);
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.' && seg !== '') parts.push(seg);
  }
  return parts.join('/');
}

/** Read relationships of a part, keyed by id, with internal targets resolved to package paths. */
export function readRels(zip: ZipEntries, partPath: string): Map<string, Relationship> {
  const map = new Map<string, Relationship>();
  const text = readZipText(zip, relsPathFor(partPath));
  if (!text) return map;
  for (const el of children(parseXml(text).documentElement, 'Relationship')) {
    const id = attr(el, 'Id');
    const target = attr(el, 'Target') ?? '';
    if (!id) continue;
    const external = attr(el, 'TargetMode') === 'External';
    map.set(id, { id, type: attr(el, 'Type') ?? '', target: external ? target : resolveTarget(partPath, target), external });
  }
  return map;
}

/** OOXML boolean toggle property (`<w:b/>`, `<w:b w:val="0"/>`). */
export function onOff(el: Element | undefined): boolean | undefined {
  if (!el) return undefined;
  const v = attr(el, 'val');
  return !(v === '0' || v === 'false' || v === 'off');
}

/** Read Dublin Core metadata from `docProps/core.xml`. */
/** Core properties (docProps/core.xml) → document properties (DOC-017). */
export function readCoreProps(zip: ZipEntries): DocumentMeta {
  const text = readZipText(zip, 'docProps/core.xml');
  if (!text) return {};
  const doc = parseXml(text);
  const get = (name: string): string | undefined => doc.getElementsByTagNameNS('*', name)[0]?.textContent?.trim() || undefined;
  return cleanMeta({
    title: get('title'),
    author: get('creator'),
    date: normalizeDate(get('created')),
    subject: get('subject'),
    description: get('description'),
    keywords: get('keywords')?.split(/[,;]/),
    language: get('language'),
    identifier: get('identifier'),
  });
}

/** Document properties → docProps/core.xml (OOXML has no licence property). */
export function coreXml(meta: DocumentMeta, esc: (s: string) => string): string {
  const m = cleanMeta(meta);
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const el = (tag: string, value: string | undefined): string => (value ? `<${tag}>${esc(value)}</${tag}>` : '');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    el('dc:title', m.title) +
    el('dc:subject', m.subject) +
    el('dc:creator', m.author) +
    el('cp:keywords', m.keywords?.join(', ')) +
    el('dc:description', m.description) +
    el('dc:language', m.language) +
    el('dc:identifier', m.identifier) +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${isoTimestamp(m.date, true) ?? now}</dcterms:created>` +
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>` +
    '</cp:coreProperties>'
  );
}

export const APP_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Progressive Web Office</Application></Properties>';

/** Media type for an image part from its extension. */
export const IMAGE_CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  emf: 'image/x-emf',
  wmf: 'image/x-wmf',
};

export const EMU_PER_PX = 9525;

/** DOC-029: page number formats as w:pgNumType w:fmt values. */
export const DOCX_NUMBER_FORMAT: Record<PageNumberFormat, string> = { decimal: 'decimal', 'lower-roman': 'lowerRoman', 'upper-roman': 'upperRoman', 'lower-alpha': 'lowerLetter', 'upper-alpha': 'upperLetter' };
