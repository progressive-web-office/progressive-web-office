import { beforeEach, describe, expect, it } from 'vitest';
import { defaultFormat, isOpenFormat, loadFormatFamily, saveFormatFamily } from '../src/core/format-preference';
import { saveFormatsFor } from '../src/core/format';

describe('FILE-016 preference for open formats', () => {
  beforeEach(() => localStorage.clear());

  it('creates OpenDocument files by default, Microsoft Office ones on request', () => {
    expect(loadFormatFamily()).toBe('open');
    expect(['document', 'spreadsheet', 'presentation'].map((k) => defaultFormat(k as 'document'))).toEqual(['odt', 'ods', 'odp']);
    saveFormatFamily('microsoft');
    expect(loadFormatFamily()).toBe('microsoft');
    expect(defaultFormat('spreadsheet')).toBe('xlsx');
    saveFormatFamily('open');
    expect(localStorage.getItem('pwo.formats')).toBeNull();
  });

  it('offers the preferred family first', () => {
    expect(saveFormatsFor('document')).toEqual(['odt', 'docx', 'md', 'mdz', 'tex', 'texzip', 'jl', 'marimo']);
    expect(saveFormatsFor('spreadsheet', 'microsoft')).toEqual(['xlsx', 'ods', 'csv']);
    expect(saveFormatsFor('presentation')).toEqual(['odp', 'pptx']);
  });

  it('tells open standards from proprietary formats', () => {
    expect(['odt', 'ods', 'odp', 'md', 'csv', 'pdf', 'tex'].every((f) => isOpenFormat(f as 'odt'))).toBe(true);
    expect(['docx', 'xlsx', 'pptx'].some((f) => isOpenFormat(f as 'docx'))).toBe(false);
  });
});
