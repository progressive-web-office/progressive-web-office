import { describe, expect, it } from 'vitest';
import { isDiffable, orderForGit, preferDiffable, withExtension } from '../src/git/diffable';

const DOC = ['odt', 'docx', 'md', 'mdz', 'tex', 'zip', 'jl', 'py'];

describe('GIT-010 diffable formats proposed for repositories', () => {
  it('knows text formats', () => {
    expect(isDiffable('md')).toBe(true);
    expect(isDiffable('CSV')).toBe(true);
    expect(isDiffable('docx')).toBe(false);
    expect(isDiffable('mdz')).toBe(false);
  });

  it('orders text formats first', () => {
    expect(orderForGit(DOC)).toEqual({ text: ['md', 'tex', 'jl', 'py'], binary: ['odt', 'docx', 'mdz', 'zip'] });
    expect(orderForGit(['odp', 'pptx'])).toEqual({ text: [], binary: ['odp', 'pptx'] });
  });

  it('proposes a text format without imposing it', () => {
    expect(preferDiffable('report.docx', DOC)).toBe('report.md');
    expect(preferDiffable('report.tex', DOC)).toBe('report.tex');
    expect(preferDiffable('marks.xlsx', ['ods', 'xlsx', 'csv'])).toBe('marks.csv');
    expect(preferDiffable('slides.pptx', ['odp', 'pptx'])).toBe('slides.pptx');
    expect(preferDiffable('', DOC)).toBe('document.md');
    expect(withExtension('a.b.odt', 'md')).toBe('a.b.md');
  });
});
