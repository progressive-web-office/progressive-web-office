import { describe, expect, it } from 'vitest';
import { renamedKeepingExtension, splitExtension } from '../src/core/filename';

describe('FILE-026 renaming the open file keeps its extension', () => {
  it('splits a name into stem and extension', () => {
    expect(splitExtension('report.docx')).toEqual({ stem: 'report', ext: '.docx' });
    expect(splitExtension('archive.tar.gz')).toEqual({ stem: 'archive.tar', ext: '.gz' });
    expect(splitExtension('Makefile')).toEqual({ stem: 'Makefile', ext: '' });
    expect(splitExtension('.bashrc')).toEqual({ stem: '.bashrc', ext: '' });
  });

  it('gives the new name with the old extension', () => {
    expect(renamedKeepingExtension('report.docx', 'CR TP Info')).toBe('CR TP Info.docx');
    expect(renamedKeepingExtension('report.docx', '  final  ')).toBe('final.docx');
    // The extension typed again is not doubled; another one is kept as part of the name.
    expect(renamedKeepingExtension('report.docx', 'final.docx')).toBe('final.docx');
    expect(renamedKeepingExtension('report.docx', 'final.DOCX')).toBe('final.docx');
    expect(renamedKeepingExtension('report.docx', 'v1.2')).toBe('v1.2.docx');
    expect(renamedKeepingExtension('Makefile', 'GNUmakefile')).toBe('GNUmakefile');
  });

  it('refuses empty names and characters files cannot have', () => {
    expect(renamedKeepingExtension('report.docx', '   ')).toBeNull();
    expect(renamedKeepingExtension('report.docx', '.docx')).toBeNull();
    expect(renamedKeepingExtension('report.docx', 'a/b')).toBeNull();
    expect(renamedKeepingExtension('report.docx', 'a:b?')).toBeNull();
    expect(renamedKeepingExtension('report.docx', '..')).toBeNull();
  });
});
