/**
 * What another app (QRShare, the system share sheet) hands over is checked
 * before it is opened (SHARE-013): it must be a file this app opens, and its
 * content must be what its name says, so that the transfer cannot be used to
 * pass off anything else as a document.
 */
import { detectFormat, isArchive, type DocumentFormat } from '../core/format';

export type ReceivedFormat = DocumentFormat | 'archive';

export type Inspection = { ok: true; format: ReceivedFormat } | { ok: false; reason: 'empty' | 'unknown' | 'mismatch'; format?: ReceivedFormat };

/** The formats a name's extension may hold (none listed: any the content shows). */
const EXPECTED: Record<string, ReceivedFormat[]> = {
  docx: ['docx'], dotx: ['docx'], docm: ['docx'],
  odt: ['odt'], ott: ['odt'], odm: ['odt'],
  xlsx: ['xlsx'], xltx: ['xlsx'], xlsm: ['xlsx'],
  ods: ['ods'], ots: ['ods'],
  pptx: ['pptx'], potx: ['pptx'], pptm: ['pptx'],
  odp: ['odp'], otp: ['odp'],
  pdf: ['pdf'],
  mdz: ['mdz', 'archive'],
  zip: ['archive', 'mdz', 'texzip', 'docx', 'odt', 'xlsx', 'ods', 'pptx', 'odp'],
  md: ['md'], markdown: ['md'],
  csv: ['csv'], tsv: ['csv'],
  tex: ['tex'], latex: ['tex'], ltx: ['tex'],
  png: ['image'], jpg: ['image'], jpeg: ['image'], gif: ['image'], webp: ['image'], bmp: ['image'], avif: ['image'], ico: ['image'], svg: ['image'],
};

/** Check a received file before opening it. */
export function inspectReceived(name: string, bytes: Uint8Array): Inspection {
  if (!bytes.length) return { ok: false, reason: 'empty' };
  const format: ReceivedFormat | null = isArchive(bytes) ? 'archive' : detectFormat(name, bytes);
  if (!format) return { ok: false, reason: 'unknown' };
  const dot = name.lastIndexOf('.');
  const expected = dot > 0 ? EXPECTED[name.slice(dot + 1).toLowerCase()] : undefined;
  if (expected && !expected.includes(format)) return { ok: false, reason: 'mismatch', format };
  return { ok: true, format };
}
