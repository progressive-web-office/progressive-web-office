import { describe, expect, it } from 'vitest';
import { assemble, resolvePath } from '../src/document/master';
import { crossTargets, emptyDocument, type Block, type RichDocument } from '../src/document/model';
import { readDocx } from '../src/document/docx-reader';
import { writeDocx } from '../src/document/docx-writer';
import { readOdt } from '../src/document/odt-reader';
import { writeOdt } from '../src/document/odt-writer';
import { readLatex } from '../src/document/latex-reader';
import { writeLatex } from '../src/document/latex-writer';
import { readMarkdown } from '../src/document/markdown-reader';
import { writeMarkdown } from '../src/document/markdown-writer';
import { blocksToPm, pmToBlocks } from '../src/document/pm/convert';
import { unzipSync, strFromU8 } from 'fflate';

const doc = (...blocks: Block[]): RichDocument => ({ ...emptyDocument(), blocks });
const p = (text: string): Block => ({ type: 'paragraph', style: 'normal', runs: [{ text }] });
const caption = (id: string): Block => ({ type: 'paragraph', style: 'caption', id, runs: [{ text: 'Figure ' }, { seq: 'figure' }] });

describe('DOC-028 master documents', () => {
  it('resolves paths relative to the including document', () => {
    expect(resolvePath('book/main.md', 'chapters/one.md')).toBe('book/chapters/one.md');
    expect(resolvePath('book/chapters/one.md', '../annex.md')).toBe('book/annex.md');
    expect(resolvePath('main.md', './a.md')).toBe('a.md');
  });

  it('assembles sub-documents recursively, numbering across chapters', async () => {
    const files: Record<string, RichDocument> = {
      'main.md': doc(p('Intro'), { type: 'include', src: 'ch/one.md' }, { type: 'include', src: 'ch/two.md' }, { type: 'include', src: 'gone.md' }),
      'ch/one.md': doc(caption('fig_a'), { type: 'include', src: 'nested.md' }),
      'ch/nested.md': doc(p('Nested'), { type: 'include', src: '../main.md' }),
      'ch/two.md': doc(caption('fig_b'), { type: 'paragraph', style: 'normal', runs: [{ ref: 'fig_a' }] }),
    };
    files['ch/two.md']!.references = { entries: [{ key: 'k', type: 'misc', fields: {} }] };
    const { doc: out, missing } = await assemble(files['main.md']!, 'main.md', async (path) => files[path]);
    expect(out.blocks.map((b) => (b.type === 'paragraph' ? b.id ?? b.runs.map((r) => ('text' in r ? r.text : 'ref' in r ? `->${r.ref}` : '')).join('') : b.type))).toEqual(['Intro', 'fig_a', 'Nested', 'fig_b', '->fig_a']);
    expect(missing).toEqual(['main.md', 'gone.md']);
    expect(crossTargets(out.blocks).targets.get('fig_b')?.label).toBe('Figure\u00a02');
    expect(out.references?.entries.map((e) => e.key)).toEqual(['k']);
  });

  const master = (): Block[] => [p('Book'), { type: 'include', src: 'chapters/one.odt' }, { type: 'include', src: 'two.docx' }];

  it('keeps sub-documents in every format', () => {
    expect(pmToBlocks(blocksToPm(master()))).toEqual(master());
    expect(readMarkdown(writeMarkdown(doc(...master()))).blocks).toEqual(master());
    expect(writeMarkdown(doc(...master()))).toContain('{{#include chapters/one.odt}}');
    const odt = writeOdt(doc(...master()));
    expect(strFromU8(unzipSync(odt)['content.xml']!)).toContain('<text:section-source xlink:href="../chapters/one.odt" xlink:type="simple" text:filter-name="writer8"/>');
    expect(readOdt(odt).blocks).toEqual(master());
    const docx = writeDocx(doc(...master()));
    expect(strFromU8(unzipSync(docx)['word/_rels/document.xml.rels']!)).toMatch(/subDocument" Target="two\.docx" TargetMode="External"/);
    expect(readDocx(docx).blocks).toEqual(master());
    const tex = writeLatex(doc(p('Book'), { type: 'include', src: 'chapters/one.tex' })).tex;
    expect(tex).toContain('\\include{chapters/one}');
    expect(readLatex(tex).blocks).toEqual([p('Book'), { type: 'include', src: 'chapters/one.tex' }]);
  });
});
