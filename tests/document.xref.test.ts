import { describe, expect, it } from 'vitest';
import { crossTargets, emptyDocument, type Block, type Paragraph, type RichDocument } from '../src/document/model';
import { readDocx } from '../src/document/docx-reader';
import { writeDocx } from '../src/document/docx-writer';
import { readOdt } from '../src/document/odt-reader';
import { writeOdt } from '../src/document/odt-writer';
import { readLatex } from '../src/document/latex-reader';
import { writeLatex } from '../src/document/latex-writer';
import { readMarkdown } from '../src/document/markdown-reader';
import { writeMarkdown } from '../src/document/markdown-writer';
import { blocksToDom, domToBlocks } from '../src/document/html';
import { blocksToPm, pmCrossTargets, pmToBlocks } from '../src/document/pm/convert';
import { unzipSync, strFromU8 } from 'fflate';
import { makeZip } from './helpers';

const sample = (): Block[] => [
  { type: 'paragraph', style: 'h1', id: 'sec_intro', runs: [{ text: 'Introduction' }] },
  { type: 'paragraph', style: 'normal', runs: [{ text: 'See ' }, { ref: 'fig_a' }, { text: ', ' }, { ref: 'tbl_b' }, { text: ', ' }, { ref: 'eq_c' }, { text: ' and ' }, { ref: 'sec_intro' }, { text: '.' }] },
  { type: 'paragraph', style: 'caption', id: 'fig_a', runs: [{ text: 'Figure ' }, { seq: 'figure' }, { text: ': A cat' }] },
  { type: 'paragraph', style: 'caption', id: 'tbl_b', runs: [{ text: 'Table ' }, { seq: 'table' }, { text: ': Data' }] },
  { type: 'paragraph', style: 'normal', id: 'eq_c', runs: [{ math: 'E = mc^2', display: true }, { seq: 'equation' }] },
  { type: 'paragraph', style: 'caption', id: 'fig_z', runs: [{ text: 'Figure ' }, { seq: 'figure' }, { text: ': Unreferenced' }] },
];

/** Without MathML (MathLive is not loaded in unit tests), equations are written as `$$…$$` text. */
const mathAsText = (blocks: Block[]): Block[] =>
  blocks.map((b) => (b.type === 'paragraph' ? { ...b, runs: b.runs.map((r) => ('math' in r ? { text: `$$${r.math}$$` } : r)) } : b));

const docWith = (blocks: Block[]): RichDocument => {
  const doc = emptyDocument();
  doc.blocks = blocks;
  return doc;
};

describe('DOC-026 cross-references', () => {
  it('numbers figures, tables and equations in document order', () => {
    const { targets } = crossTargets(sample());
    expect(targets.get('fig_a')).toMatchObject({ kind: 'figure', number: 1, label: 'Figure\u00a01' });
    expect(targets.get('fig_z')).toMatchObject({ kind: 'figure', number: 2, label: 'Figure\u00a02' });
    expect(targets.get('tbl_b')).toMatchObject({ kind: 'table', number: 1, label: 'Table\u00a01' });
    expect(targets.get('eq_c')).toMatchObject({ kind: 'equation', number: 1, label: '(1)' });
    expect(targets.get('sec_intro')).toMatchObject({ kind: 'heading', label: 'Introduction' });
  });

  it('numbers the editor document the same way', () => {
    const { targets, numbers } = pmCrossTargets(blocksToPm(sample()));
    expect([...numbers.values()]).toEqual([1, 1, 1, 2]);
    expect(targets.get('fig_z')?.label).toBe('Figure\u00a02');
    expect(targets.get('eq_c')?.label).toBe('(1)');
  });

  it('round-trips through the editor model and HTML', () => {
    expect(pmToBlocks(blocksToPm(sample()))).toEqual(sample());
    const div = document.createElement('div');
    div.append(blocksToDom(sample(), document, () => undefined));
    expect(div.querySelector('a.xref')?.textContent).toBe('Figure\u00a01');
    expect(div.querySelector('#fig_z .seq')?.textContent).toBe('2');
    expect(domToBlocks(div, () => undefined)).toEqual(sample());
  });

  it('round-trips through DOCX (SEQ and REF fields, bookmarks)', () => {
    const bytes = writeDocx(docWith(sample()));
    const xml = strFromU8(unzipSync(bytes)['word/document.xml']!);
    expect(xml).toContain('w:instr=" SEQ Figure \\* ARABIC "');
    expect(xml).toContain('<w:bookmarkStart w:id="1" w:name="_Ref_fig_a"/>');
    expect(xml).toContain('w:instr=" REF _Ref_fig_a \\h "');
    expect(readDocx(bytes).blocks).toEqual(mathAsText(sample()));
  });

  it('reads Word complex fields and numeric bookmarks', () => {
    const p = (inner: string) => `<w:p>${inner}</w:p>`;
    const r = (inner: string) => `<w:r>${inner}</w:r>`;
    const field = (instr: string, shown: string) => r('<w:fldChar w:fldCharType="begin"/>') + r(`<w:instrText xml:space="preserve"> ${instr} </w:instrText>`) + r('<w:fldChar w:fldCharType="separate"/>') + r(`<w:t>${shown}</w:t>`) + r('<w:fldChar w:fldCharType="end"/>');
    const body =
      p(`<w:pPr><w:pStyle w:val="Caption"/></w:pPr><w:bookmarkStart w:id="0" w:name="_Ref123"/>${r('<w:t xml:space="preserve">Figure </w:t>')}${field('SEQ Figure \\* ARABIC', '1')}<w:bookmarkEnd w:id="0"/>${r('<w:t>: Plan</w:t>')}`) +
      p(`${r('<w:t xml:space="preserve">As in </w:t>')}${field('REF _Ref123 \\h', 'Figure 1')}${r('<w:t>.</w:t>')}`);
    const doc = readDocx(makeZip({ 'word/document.xml': `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>` }));
    expect(doc.blocks).toEqual([
      { type: 'paragraph', style: 'caption', id: '_Ref123', runs: [{ text: 'Figure ' }, { seq: 'figure' }, { text: ': Plan' }] },
      { type: 'paragraph', style: 'normal', runs: [{ text: 'As in ' }, { ref: '_Ref123' }, { text: '.' }] },
    ]);
  });

  it('round-trips through ODT (sequences, bookmarks and bookmark references)', () => {
    const bytes = writeOdt(docWith(sample()));
    const xml = strFromU8(unzipSync(bytes)['content.xml']!);
    expect(xml).toContain('<text:sequence text:ref-name="fig_a" text:name="Figure" text:formula="ooow:Figure+1" style:num-format="1">1</text:sequence>');
    expect(xml).toContain('<text:bookmark-ref text:reference-format="text" text:ref-name="fig_a">Figure\u00a01</text:bookmark-ref>');
    expect(readOdt(bytes).blocks).toEqual(mathAsText(sample()));
  });

  it('round-trips through LaTeX (\\captionof, \\label, \\ref, \\eqref, \\nameref)', () => {
    const { tex } = writeLatex(docWith(sample()));
    expect(tex).toContain('See Figure~\\ref{fig_a}, Table~\\ref{tbl_b}, \\eqref{eq_c} and \\nameref{sec_intro}.');
    expect(tex).toContain('\\captionof{figure}{A cat}\\label{fig_a}');
    expect(tex).toContain('\\begin{equation}\nE = mc^2\n\\label{eq_c}\n\\end{equation}');
    expect(tex).toContain('\\section{Introduction}\\label{sec_intro}');
    expect(readLatex(tex).blocks).toEqual(sample());
  });

  it('reads figure and table floats with their captions', () => {
    const blocks = readLatex('\\begin{figure}\\centering\\caption{Setup}\\label{fig:setup}\\end{figure}\nSee Fig.~\\ref{fig:setup} and (\\ref{eq:x}).\n\\begin{equation}a=b\\label{eq:x}\\end{equation}').blocks;
    expect(blocks[0]).toEqual({ type: 'paragraph', style: 'caption', id: 'fig:setup', align: 'center', runs: [{ text: 'Figure ' }, { seq: 'figure' }, { text: ': Setup' }] });
    expect((blocks[1] as Paragraph).runs).toEqual([{ text: 'See ' }, { ref: 'fig:setup' }, { text: ' and ' }, { ref: 'eq:x' }, { text: '.' }]);
  });

  it('round-trips through Markdown (anchors, links, \\tag and \\label)', () => {
    const md = writeMarkdown(docWith(sample()));
    expect(md).toContain('# <a id="sec_intro"></a>Introduction');
    expect(md).toContain('See [Figure\u00a01](#fig_a), [Table\u00a01](#tbl_b), [(1)](#eq_c) and [Introduction](#sec_intro).');
    expect(md).toContain('<a id="fig_a"></a>Figure 1: A cat');
    expect(md).toContain('$$\nE = mc^2 \\tag{1}\\label{eq_c}\n$$');
    expect(readMarkdown(md).blocks).toEqual(sample());
  });
});
