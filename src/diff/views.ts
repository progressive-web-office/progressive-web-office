/**
 * VER-001: a version as something comparable — text files as they are,
 * documents as Markdown (their text with headings, emphasis, lists, tables,
 * equations), workbooks as their cells; other files cannot be compared.
 */
import { detectFormat, formatKind } from '../core/format';
import type { Workbook } from '../sheet/model';

export type VersionView = { kind: 'text'; text: string } | { kind: 'sheet'; workbook: Workbook } | { kind: 'none' };

const TEXT = /\.(md|markdown|tex|txt|csv|tsv|jl|py|js|ts|json|html|css|c|h|cpp|hpp|java|bib|yml|yaml|toml|xml|svg|r|sql|lua)$/i;

export async function versionView(name: string, bytes: Uint8Array): Promise<VersionView> {
  const format = detectFormat(name, bytes);
  try {
    if (format && formatKind(format) === 'document' && !['md', 'tex', 'jl', 'marimo'].includes(format)) {
      const [{ readDocument }, { writeMarkdown }] = await Promise.all([import('../document/io'), import('../document/markdown-writer')]);
      const doc = await readDocument(format as import('../document/io').TextFormat, bytes);
      return { kind: 'text', text: writeMarkdown(doc).trimEnd() };
    }
    if (format === 'xlsx' || format === 'ods') {
      const { readWorkbook } = await import('../sheet/io');
      return { kind: 'sheet', workbook: readWorkbook(format, bytes, name) };
    }
  } catch {
    return { kind: 'none' };
  }
  if (TEXT.test(name) || format === 'md' || format === 'tex' || format === 'csv' || format === 'text') {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    if (!text.includes('\u0000')) return { kind: 'text', text: text.replace(/\r\n/g, '\n').trimEnd() };
  }
  return { kind: 'none' };
}
