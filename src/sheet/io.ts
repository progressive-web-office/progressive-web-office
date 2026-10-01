/** Read/write a workbook in any supported spreadsheet format. */
import type { DocumentFormat } from '../core/format';
import { readCsv, writeCsv } from './csv';
import type { Workbook } from './model';
import { readOds } from './ods-reader';
import { writeOds } from './ods-writer';
import { readXlsx } from './xlsx-reader';
import { writeXlsx } from './xlsx-writer';

export type SheetFormat = Extract<DocumentFormat, 'xlsx' | 'ods' | 'csv'>;

export function readWorkbook(format: SheetFormat, bytes: Uint8Array, fileName = 'Sheet1'): Workbook {
  switch (format) {
    case 'xlsx':
      return readXlsx(bytes);
    case 'ods':
      return readOds(bytes);
    case 'csv':
      return readCsv(bytes, fileName);
  }
}

/** CSV only holds one sheet: `activeSheet` selects which. */
export function writeWorkbook(wb: Workbook, format: SheetFormat, activeSheet = 0): Uint8Array {
  switch (format) {
    case 'xlsx':
      return writeXlsx(wb);
    case 'ods':
      return writeOds(wb);
    case 'csv':
      return writeCsv(wb, activeSheet);
  }
}
