/**
 * Preferred family of formats (FILE-016): open standards (OpenDocument, ISO/IEC
 * 26300) by default, Microsoft Office formats on request. It sets the format
 * of new documents and the order in which formats are offered.
 */
import type { DocumentFormat, DocumentKind } from './format';

export type FormatFamily = 'open' | 'microsoft';

export const FORMAT_FAMILIES: FormatFamily[] = ['open', 'microsoft'];

const KEY = 'pwo.formats';

export function loadFormatFamily(): FormatFamily {
  try {
    return localStorage.getItem(KEY) === 'microsoft' ? 'microsoft' : 'open';
  } catch {
    return 'open';
  }
}

export function saveFormatFamily(family: FormatFamily): void {
  try {
    if (family === 'open') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, family);
  } catch {
    /* storage unavailable: the choice lasts for this session */
  }
}

const FORMATS: Record<Exclude<DocumentKind, 'pdf' | 'file'>, Record<FormatFamily, DocumentFormat>> = {
  document: { open: 'odt', microsoft: 'docx' },
  spreadsheet: { open: 'ods', microsoft: 'xlsx' },
  presentation: { open: 'odp', microsoft: 'pptx' },
};

/** Format of a new document of `kind`. */
export function defaultFormat(kind: Exclude<DocumentKind, 'pdf' | 'file'>, family: FormatFamily = loadFormatFamily()): DocumentFormat {
  return FORMATS[kind][family];
}

/** Whether a format is an open standard. */
export function isOpenFormat(format: DocumentFormat): boolean {
  return !['docx', 'xlsx', 'pptx'].includes(format);
}
