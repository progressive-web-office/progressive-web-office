import { describe, expect, it } from 'vitest';
import { bibText, citations, formatEntry, fromCsl, parseBibtex, parseNames, shortAuthors, toCsl, writeBibtex, writeNames, type BibEntry } from '../src/document/bibliography';
import type { Block, Paragraph } from '../src/document/model';
import { makeZip } from './helpers';

export const BIB = String.raw`
@string{tug = "TeX Users Group"}
@comment{ignored {nested} braces}
@book{knuth1984,
  author    = {Knuth, Donald E.},
  title     = {The {\TeX}book},
  publisher = tug # ", Addison-Wesley",
  year      = 1984,
}
@article{lamport1994,
  author  = "Leslie Lamport and Jean-Pierre Dupont and others",
  title   = {Les {\'e}quations de {G}{\"o}del},
  journal = {Journal of Tests},
  volume  = {12},
  number  = {3},
  pages   = {10--20},
  year    = {1994},
  doi     = {10.1000/xyz},
}
@inproceedings{beethoven2020, author = {Ludwig van Beethoven}, title = {Ninth}, booktitle = {Proc. of Music}, year = {2020}}
`;

describe('DOC-027 bibliography: BibTeX', () => {
  it('parses entries, strings, accents and concatenation', () => {
    const entries = parseBibtex(BIB);
    expect(entries.map((e) => e.key)).toEqual(['knuth1984', 'lamport1994', 'beethoven2020']);
    expect(entries[0]).toEqual({ key: 'knuth1984', type: 'book', fields: { author: 'Knuth, Donald E.', title: 'The \\TeXbook', publisher: 'TeX Users Group, Addison-Wesley', year: '1984' } });
    expect(entries[1]!.fields.title).toBe('Les équations de Gödel');
    expect(entries[1]!.fields.pages).toBe('10–20');
    expect(bibText('Stra{\\ss}e \\& co~1')).toBe('Straße & co 1');
  });

  it('reads names in both orders, with particles', () => {
    expect(parseNames('Knuth, Donald E. and Leslie Lamport and Ludwig van Beethoven and others')).toEqual([
      { family: 'Knuth', given: 'Donald E.' },
      { family: 'Lamport', given: 'Leslie' },
      { family: 'van Beethoven', given: 'Ludwig' },
      { family: 'others' },
    ]);
    const [knuth, lamport, beethoven] = parseBibtex(BIB) as [BibEntry, BibEntry, BibEntry];
    expect([shortAuthors(knuth), shortAuthors(lamport), shortAuthors(beethoven)]).toEqual(['Knuth', 'Lamport et al.', 'van Beethoven']);
  });

  it('writes BibTeX that reads back the same', () => {
    const entries = parseBibtex(BIB).filter((e) => e.key !== 'knuth1984');
    expect(parseBibtex(writeBibtex(entries))).toEqual(entries);
  });

  it('converts to and from CSL (pandoc references)', () => {
    // Names come back as "Family, Given".
    const norm = (e: BibEntry): BibEntry => ({ ...e, fields: { ...e.fields, ...(e.fields.author ? { author: writeNames(parseNames(e.fields.author)) } : {}) } });
    for (const e of parseBibtex(BIB).filter((x) => x.key !== 'knuth1984')) expect(fromCsl(toCsl(e))).toEqual(norm(e));
    expect(toCsl(parseBibtex(BIB)[1]!)).toMatchObject({ id: 'lamport1994', type: 'article-journal', 'container-title': 'Journal of Tests', issued: { 'date-parts': [[1994]] }, DOI: '10.1000/xyz' });
  });

  it('formats references', () => {
    const [knuth, lamport] = parseBibtex(BIB) as [BibEntry, BibEntry];
    expect(formatEntry(knuth)).toEqual([{ text: 'Knuth, D. E. (1984). ' }, { text: 'The \\TeXbook.', italic: true }, { text: ' TeX Users Group, Addison-Wesley.' }]);
    expect(formatEntry(lamport).map((r) => r.text).join('')).toBe('Lamport, L., Dupont, J.-P. & et al. (1994). Les équations de Gödel. Journal of Tests, 12(3), 10–20. https://doi.org/10.1000/xyz');
  });

  it('numbers citations in reading order, or cites author and year', () => {
    const entries = parseBibtex(BIB);
    const blocks: Block[] = [
      { type: 'paragraph', style: 'normal', runs: [{ text: 'A ' }, { cite: ['lamport1994'] }, { text: ' B ' }, { cite: ['knuth1984', 'lamport1994'], locator: 'p. 12' }] },
      { type: 'paragraph', style: 'normal', runs: [{ footnote: [{ cite: ['beethoven2020'] }] }, { cite: ['missing'] }] },
    ];
    const numeric = citations(blocks, { entries });
    expect([...numeric.numbers]).toEqual([['lamport1994', 1], ['knuth1984', 2], ['beethoven2020', 3]]);
    expect(numeric.text({ cite: ['knuth1984', 'lamport1994'], locator: 'p. 12' })).toBe('[2, 1, p. 12]');
    expect(numeric.text({ cite: ['missing'] })).toBe('[?]');
    const ay = citations(blocks, { entries, style: 'author-year' });
    expect(ay.text({ cite: ['knuth1984', 'lamport1994'] })).toBe('(Knuth, 1984; Lamport et al., 1994)');
    expect(ay.cited.map((e) => e.key)).toEqual(['knuth1984', 'lamport1994', 'beethoven2020']);
  });
});

describe('DOC-027 bibliography in documents', async () => {
  const { emptyDocument } = await import('../src/document/model');
  const { readDocx } = await import('../src/document/docx-reader');
  const { writeDocx } = await import('../src/document/docx-writer');
  const { readOdt } = await import('../src/document/odt-reader');
  const { writeOdt } = await import('../src/document/odt-writer');
  const { readLatex } = await import('../src/document/latex-reader');
  const { writeLatex } = await import('../src/document/latex-writer');
  const { readMarkdown } = await import('../src/document/markdown-reader');
  const { writeMarkdown } = await import('../src/document/markdown-writer');
  const { blocksToDom, domToBlocks } = await import('../src/document/html');
  const { blocksToPm, pmToBlocks } = await import('../src/document/pm/convert');
  const { unzipSync, strFromU8 } = await import('fflate');

  const blocks = (): Block[] => [
    { type: 'paragraph', style: 'normal', runs: [{ text: 'As shown ' }, { cite: ['lamport1994'] }, { text: ' and ' }, { cite: ['knuth1984', 'beethoven2020'], locator: 'p. 12' }, { text: '.' }] },
    { type: 'bibliography' },
  ];
  const doc = (style?: 'author-year') => {
    const d = emptyDocument();
    d.blocks = blocks();
    d.references = { entries: parseBibtex(BIB), ...(style ? { style } : {}) };
    return d;
  };
  /** Names as "Family, Given", as Word, OpenDocument and CSL give them back. */
  const norm = (entries: BibEntry[]): BibEntry[] =>
    entries.map((e) => ({ ...e, fields: { ...e.fields, ...(e.fields.author ? { author: writeNames(parseNames(e.fields.author)) } : {}) } })).sort((a, b) => a.key.localeCompare(b.key));

  it('round-trips through the editor model and HTML', () => {
    expect(pmToBlocks(blocksToPm(blocks()))).toEqual(blocks());
    const div = document.createElement('div');
    div.append(blocksToDom(blocks(), document, () => undefined, doc().references));
    expect([...div.querySelectorAll('.cite')].map((c) => c.textContent)).toEqual(['[1]', '[2, 3, p. 12]']);
    expect([...div.querySelectorAll('.bibliography li')].map((li) => li.id)).toEqual(['ref-lamport1994', 'ref-knuth1984', 'ref-beethoven2020']);
    expect(domToBlocks(div, () => undefined)).toEqual(blocks());
  });

  it('round-trips through DOCX as Word sources and CITATION fields', () => {
    const bytes = writeDocx(doc());
    const zip = unzipSync(bytes);
    const xml = strFromU8(zip['word/document.xml']!);
    expect(xml).toContain('w:instr=" CITATION knuth1984 \\m beethoven2020 \\p &quot;12&quot; "');
    expect(xml).toContain('<w:docPartGallery w:val="Bibliographies"/>');
    expect(strFromU8(zip['customXml/item1.xml']!)).toContain('<b:Tag>lamport1994</b:Tag><b:SourceType>JournalArticle</b:SourceType>');
    const back = readDocx(bytes);
    expect(back.blocks).toEqual(blocks());
    expect(norm(back.references!.entries)).toEqual(norm(parseBibtex(BIB)));
  });

  it('reads Zotero citations with their items', () => {
    const item = { id: 42, itemData: { id: 42, type: 'book', title: 'Zotero Book', author: [{ family: 'Doe', given: 'Jane' }], issued: { 'date-parts': [[2001]] } }, locator: '5' };
    const instr = ` ADDIN ZOTERO_ITEM CSL_CITATION ${JSON.stringify({ citationItems: [item] })} `.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    const docXml = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:fldSimple w:instr="${instr}"><w:r><w:t>(Doe, 2001, p. 5)</w:t></w:r></w:fldSimple></w:p></w:body></w:document>`;
    const back = readDocx(makeZip({ 'word/document.xml': docXml }));
    expect(back.blocks).toEqual([{ type: 'paragraph', style: 'normal', runs: [{ cite: ['42'], locator: 'p. 5' }] }]);
    expect(back.references).toEqual({ entries: [{ key: '42', type: 'book', fields: { author: 'Doe, Jane', year: '2001', title: 'Zotero Book' } }], style: 'author-year' });
  });

  it('round-trips through ODT as bibliography marks (pages are not kept)', () => {
    const bytes = writeOdt(doc());
    expect(strFromU8(unzipSync(bytes)['content.xml']!)).toContain('<text:bibliography-mark text:identifier="lamport1994" text:bibliography-type="article" text:author="Lamport, Leslie and Dupont, Jean-Pierre and others"');
    const back = readOdt(bytes);
    const expected = blocks();
    delete (expected[0] as Paragraph).runs[3]!['locator' as never];
    expect(back.blocks).toEqual(expected);
    expect(norm(back.references!.entries)).toEqual(norm(parseBibtex(BIB)));
  });

  it('round-trips through LaTeX with the .bib inside the file', () => {
    const { tex, images } = writeLatex(doc('author-year'));
    expect(tex.startsWith('\\begin{filecontents*}[overwrite]{references.bib}\n@book{knuth1984,')).toBe(true);
    expect(tex).toContain('As shown \\citep{lamport1994} and \\citep[p. 12]{knuth1984,beethoven2020}.');
    expect(tex).toContain('\\usepackage{natbib}');
    expect(tex).toContain('\\bibliographystyle{plainnat}\n\\bibliography{references}');
    expect(images.has('references.bib')).toBe(true);
    const back = readLatex(tex);
    expect(back.blocks).toEqual(blocks());
    expect(back.references).toEqual({ entries: parseBibtex(writeBibtex(parseBibtex(BIB))), style: 'author-year' });
  });

  it('reads a hand-written thebibliography', () => {
    const back = readLatex('See \\cite{a}.\n\\begin{thebibliography}{9}\n\\bibitem{a} A. Author, \\emph{Title}, 2000.\n\\end{thebibliography}');
    expect(back.blocks).toEqual([{ type: 'paragraph', style: 'normal', runs: [{ text: 'See ' }, { cite: ['a'] }, { text: '.' }] }, { type: 'bibliography' }]);
    expect(back.references?.entries).toEqual([{ key: 'a', type: 'misc', fields: { note: 'A. Author, Title, 2000.' } }]);
  });

  it('round-trips through Markdown as pandoc citations and references', () => {
    const md = writeMarkdown(doc('author-year'));
    expect(md).toContain('As shown [@lamport1994] and [@knuth1984; @beethoven2020, p. 12].');
    expect(md).toContain('<div id="refs"></div>');
    expect(md).toContain('references:\n- {"id":"knuth1984","type":"book"');
    expect(md).toContain('citation-style: author-year');
    const back = readMarkdown(md);
    expect(back.blocks).toEqual(blocks());
    expect(norm(back.references!.entries)).toEqual(norm(parseBibtex(BIB)));
    expect(back.references!.style).toBe('author-year');
  });
});
