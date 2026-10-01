/** Document format detection (FILE-003, FILE-004). */
import { readZip, readZipText } from './zip';
import { t } from '../i18n';

export type DocumentFormat = 'docx' | 'odt' | 'md' | 'mdz' | 'tex' | 'texzip' | 'xlsx' | 'ods' | 'csv' | 'pptx' | 'odp' | 'pdf';
export type DocumentKind = 'document' | 'spreadsheet' | 'presentation' | 'pdf';

/** Maximum accepted file size (FILE-012). */
export const MAX_FILE_SIZE = 50 * 1024 * 1024;

export const MIME_TYPES: Record<DocumentFormat, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  odt: 'application/vnd.oasis.opendocument.text',
  md: 'text/markdown',
  mdz: 'application/x-mdz',
  tex: 'application/x-tex',
  texzip: 'application/zip',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  csv: 'text/csv',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odp: 'application/vnd.oasis.opendocument.presentation',
  pdf: 'application/pdf',
};

/** Human-readable, translated format name. */
export function formatLabel(format: DocumentFormat): string {
  return t(`format.${format}`);
}


/** File extensions accepted by the open dialog. */
export const ACCEPTED_EXTENSIONS = ['.docx', '.odt', '.md', '.markdown', '.mdz', '.tex', '.zip', '.xlsx', '.ods', '.csv', '.tsv', '.pptx', '.odp', '.pdf'];

export function formatKind(format: DocumentFormat): DocumentKind {
  switch (format) {
    case 'docx':
    case 'odt':
    case 'md':
    case 'mdz':
    case 'tex':
    case 'texzip':
      return 'document';
    case 'xlsx':
    case 'ods':
    case 'csv':
      return 'spreadsheet';
    case 'pptx':
    case 'odp':
      return 'presentation';
    case 'pdf':
      return 'pdf';
  }
}

/** Formats a document of the given kind can be saved to. */
/** Formats a document can be saved in, the preferred family first (FILE-016). */
export function saveFormatsFor(kind: DocumentKind, family: 'open' | 'microsoft' = 'open'): DocumentFormat[] {
  const pair = (open: DocumentFormat, ms: DocumentFormat): DocumentFormat[] => (family === 'open' ? [open, ms] : [ms, open]);
  if (kind === 'document') return [...pair('odt', 'docx'), 'md', 'mdz', 'tex', 'texzip'];
  if (kind === 'spreadsheet') return [...pair('ods', 'xlsx'), 'csv'];
  if (kind === 'presentation') return pair('odp', 'pptx');
  return ['pdf'];
}

const startsWith = (bytes: Uint8Array, sig: number[]): boolean =>
  sig.every((b, i) => bytes[i] === b);

const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
};

/** File extension used when saving a format. */
export function fileExtension(format: DocumentFormat): string {
  return format === 'texzip' ? 'zip' : format;
}

/**
 * Detect a document format from its content, falling back to the file
 * extension for plain-text formats. Returns `null` when unsupported/corrupt.
 */
export function detectFormat(name: string, bytes: Uint8Array): DocumentFormat | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'pdf'; // %PDF-
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return detectZipFormat(bytes);
  const ext = extensionOf(name);
  if (!looksLikeText(bytes)) return null;
  if (ext === 'csv' || ext === 'tsv') return 'csv';
  if (ext === 'md' || ext === 'markdown') return 'md';
  if (ext === 'tex' || ext === 'latex' || ext === 'ltx') return 'tex';
  return null;
}

function detectZipFormat(bytes: Uint8Array): DocumentFormat | null {
  let zip;
  try {
    zip = readZip(bytes);
  } catch {
    return null;
  }
  const mimetype = readZipText(zip, 'mimetype')?.trim();
  if (mimetype === MIME_TYPES.odt) return 'odt';
  if (mimetype === MIME_TYPES.ods) return 'ods';
  if (mimetype === MIME_TYPES.odp) return 'odp';
  if (mimetype === MIME_TYPES.mdz) return 'mdz';
  if (zip['index.md'] && zip['manifest.json']) return 'mdz';
  const types = readZipText(zip, '[Content_Types].xml') ?? '';
  if (types.includes('wordprocessingml.document.main') || zip['word/document.xml']) return 'docx';
  if (types.includes('spreadsheetml.sheet.main') || zip['xl/workbook.xml']) return 'xlsx';
  if (types.includes('presentationml.presentation.main') || zip['ppt/presentation.xml']) return 'pptx';
  // TEX-003: a ZIP holding a LaTeX project.
  if (!types && Object.keys(zip).some((p) => /\.tex$/i.test(p))) return 'texzip';
  // MD-014: a plain ZIP of Markdown files (and assets) is imported as MDZ.
  if (!types && Object.keys(zip).some((p) => /\.(md|markdown)$/i.test(p))) return 'mdz';
  return null;
}

function looksLikeText(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, 4096);
  for (const b of sample) if (b === 0) return false;
  return true;
}
