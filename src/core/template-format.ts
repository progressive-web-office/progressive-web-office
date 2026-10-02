/**
 * Template file formats (FILE-020): `.ott`, `.ots`, `.otp` and `.dotx`,
 * `.xltx`, `.potx` are their document formats with another declared media
 * type. Opened as new documents, written from a document's bytes.
 */
import { MIME_TYPES, type DocumentFormat } from './format';
import { readZip, readZipText, writeZip, type ZipEntries } from './zip';

export const TEMPLATE_FORMATS = ['odt', 'docx', 'ods', 'xlsx', 'odp', 'pptx'] as const;
export type TemplateBase = (typeof TEMPLATE_FORMATS)[number];

const EXTENSIONS: Record<TemplateBase, string> = { odt: 'ott', docx: 'dotx', ods: 'ots', xlsx: 'xltx', odp: 'otp', pptx: 'potx' };

/** OpenDocument templates: `…-template` media types. */
const ODF_TEMPLATE: Partial<Record<TemplateBase, string>> = {
  odt: 'application/vnd.oasis.opendocument.text-template',
  ods: 'application/vnd.oasis.opendocument.spreadsheet-template',
  odp: 'application/vnd.oasis.opendocument.presentation-template',
};

/** Office Open XML: the content type of the main part, document then template. */
const OOXML_MAIN: Partial<Record<TemplateBase, [string, string]>> = {
  docx: ['wordprocessingml.document.main+xml', 'wordprocessingml.template.main+xml'],
  xlsx: ['spreadsheetml.sheet.main+xml', 'spreadsheetml.template.main+xml'],
  pptx: ['presentationml.presentation.main+xml', 'presentationml.template.main+xml'],
};

export const templateExtension = (format: TemplateBase): string => EXTENSIONS[format];

export const isTemplateBase = (format: DocumentFormat): format is TemplateBase => (TEMPLATE_FORMATS as readonly string[]).includes(format);

/** The media type of a template file. */
export function templateMimeType(format: TemplateBase): string {
  return ODF_TEMPLATE[format] ?? `application/vnd.openxmlformats-officedocument.${OOXML_MAIN[format]![1].replace(/\.main\+xml$/, '')}`;
}

function zipOf(bytes: Uint8Array): ZipEntries | null {
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return null;
  try {
    return readZip(bytes);
  } catch {
    return null;
  }
}

/** Whether the file is a template (OpenDocument or Office Open XML). */
export function isTemplate(bytes: Uint8Array): boolean {
  const zip = zipOf(bytes);
  if (!zip) return false;
  const mimetype = readZipText(zip, 'mimetype')?.trim() ?? '';
  if (Object.values(ODF_TEMPLATE).includes(mimetype)) return true;
  const types = readZipText(zip, '[Content_Types].xml') ?? '';
  return Object.values(OOXML_MAIN).some(([, template]) => types.includes(template));
}

/** The template version of a document written in `format`. */
export function toTemplate(bytes: Uint8Array, format: TemplateBase): Uint8Array {
  const zip = readZip(bytes);
  const enc = new TextEncoder();
  const odf = ODF_TEMPLATE[format];
  if (odf) {
    const manifest = (readZipText(zip, 'META-INF/manifest.xml') ?? '').replace(`manifest:media-type="${MIME_TYPES[format]}"`, `manifest:media-type="${odf}"`);
    // The mimetype entry stays first and stored, as ODF requires.
    return writeZip([
      { path: 'mimetype', data: odf, store: true },
      ...Object.entries(zip)
        .filter(([path]) => path !== 'mimetype')
        .map(([path, data]) => ({ path, data: path === 'META-INF/manifest.xml' ? enc.encode(manifest) : data })),
    ]);
  }
  const [doc, template] = OOXML_MAIN[format]!;
  const types = (readZipText(zip, '[Content_Types].xml') ?? '').replace(doc, template);
  return writeZip(Object.entries(zip).map(([path, data]) => ({ path, data: path === '[Content_Types].xml' ? enc.encode(types) : data })));
}
