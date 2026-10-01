import { describe, expect, it } from 'vitest';
import { replaceExtension, readFileBytes } from '../src/storage/file-io';

describe('storage/file-io', () => {
  it('replaces or appends extensions', () => {
    expect(replaceExtension('report.docx', 'odt')).toBe('report.odt');
    expect(replaceExtension('archive.tar.gz', 'csv')).toBe('archive.tar.csv');
    expect(replaceExtension('Untitled', 'xlsx')).toBe('Untitled.xlsx');
    expect(replaceExtension('.hidden', 'ods')).toBe('.hidden.ods');
  });

  it('reads a File into bytes', async () => {
    const bytes = await readFileBytes(new File(['abc'], 'a.txt'));
    expect(Array.from(bytes)).toEqual([97, 98, 99]);
  });
});
