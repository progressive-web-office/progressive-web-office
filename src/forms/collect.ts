/**
 * Answers of filled forms, compiled (FORM-002): the fields of many filled
 * files become the rows of one table — one row per file, one column per
 * field, in the order the fields first appear — to save as a spreadsheet or
 * send to a database.
 */
import { newWorkbook, setCell, type Scalar, type Workbook } from '../sheet/model';
import { applyCellStyle } from '../sheet/ops';

export interface FormAnswer {
  name: string;
  /** Text, a ticked box, or the choices of a list. */
  value: string | boolean | string[];
}

export interface FilledForm {
  file: string;
  answers: FormAnswer[];
  /** Why it could not be read. */
  error?: string;
}

/** The fields of a filled PDF form (FORM-002). */
export async function readPdfAnswers(file: string, bytes: Uint8Array): Promise<FilledForm> {
  try {
    const { inspectPdf } = await import('../pdf/forms');
    const info = await inspectPdf(bytes);
    if (info.readOnlyCode === 'encrypted') return { file, answers: [], error: info.readOnlyReason ?? 'encrypted' };
    return { file, answers: info.fields.filter((f) => f.type !== 'other').map((f) => ({ name: f.name, value: f.value })) };
  } catch (err) {
    return { file, answers: [], error: (err as Error).message };
  }
}

/** The form fields of a filled text document — ODT, DOCX, Markdown (FORM-003). */
export async function readDocumentAnswers(file: string, bytes: Uint8Array): Promise<FilledForm> {
  try {
    const [{ detectFormat }, { readDocument }, { allParagraphs, isInputRun, inputAnswer }] = await Promise.all([import('../core/format'), import('../document/io'), import('../document/model')]);
    const format = detectFormat(file, bytes);
    if (format !== 'odt' && format !== 'docx' && format !== 'md') return { file, answers: [], error: 'not a text document' };
    const doc = await readDocument(format, bytes);
    const answers: FormAnswer[] = [];
    const seen = new Set<string>();
    const visit = (runs: import('../document/model').Run[]): void => {
      for (const run of runs) {
        if (!isInputRun(run) || seen.has(run.name)) continue;
        seen.add(run.name);
        answers.push({ name: run.name, value: inputAnswer(run) });
      }
    };
    for (const p of allParagraphs(doc.blocks)) visit(p.runs);
    return { file, answers };
  } catch (err) {
    return { file, answers: [], error: (err as Error).message };
  }
}

/** Files whose answers can be compiled. */
export const FORM_FILES = /\.(pdf|odt|docx|md)$/i;

/** The answers of a filled form, PDF or text document. */
export const readFormAnswers = (file: string, bytes: Uint8Array): Promise<FilledForm> => (/\.pdf$/i.test(file) ? readPdfAnswers(file, bytes) : readDocumentAnswers(file, bytes));

/** A plain number ("12", "3,5", "-0.25"), not a code such as "01234". */
const NUMBER = /^-?(?:0|[1-9]\d*)(?:[.,]\d+)?$/;

function cellValue(value: FormAnswer['value'] | undefined): Scalar {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.join('; ') || null;
  const text = value.trim();
  if (!text) return null;
  return NUMBER.test(text) ? Number(text.replace(',', '.')) : value;
}

export interface AnswersTable {
  header: string[];
  rows: Scalar[][];
}

/** One row per file (its name first), one column per field. */
export function answersTable(forms: FilledForm[], fileColumn = 'File'): AnswersTable {
  const names: string[] = [];
  for (const f of forms) for (const a of f.answers) if (!names.includes(a.name)) names.push(a.name);
  const rows = forms
    .filter((f) => !f.error)
    .map((f) => {
      const byName = new Map(f.answers.map((a) => [a.name, a.value]));
      return [f.file, ...names.map((n) => cellValue(byName.get(n)))];
    });
  return { header: [fileColumn, ...names], rows };
}

/** The table as a workbook: the header in bold and frozen. */
export function answersWorkbook(table: AnswersTable, sheetName = 'Answers'): Workbook {
  const wb = newWorkbook();
  const sheet = wb.sheets[0]!;
  sheet.name = sheetName;
  table.header.forEach((h, c) => setCell(sheet, [0, c], { value: h }));
  table.rows.forEach((row, r) => row.forEach((v, c) => setCell(sheet, [r + 1, c], v === null ? undefined : { value: v })));
  sheet.freeze = { rows: 1, cols: 1 };
  if (table.header.length) applyCellStyle(wb, 0, { r1: 0, c1: 0, r2: 0, c2: table.header.length - 1 }, { bold: true, fill: '#d9e2f3' });
  return wb;
}
