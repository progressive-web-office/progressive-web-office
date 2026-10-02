import { describe, expect, it } from 'vitest';
import { TEMPLATES, contentLang, type Built } from '../src/templates/catalog';
import { allParagraphs, isCiteRun, isCodeCellRun, isDiagramRun, isFootnoteRun, isMathRun, isRefRun, isSeqRun, type RichDocument } from '../src/document/model';
import { readDocument, writeDocument } from '../src/document/io';
import { Calculator } from '../src/sheet/engine';
import { isError } from '../src/sheet/model';
import { readWorkbook, writeWorkbook } from '../src/sheet/io';
import { readPresentation, writePresentation } from '../src/slides/io';

const byId = (id: string) => TEMPLATES.find((t) => t.id === id)!;
const doc = (id: string, lang: 'en' | 'fr' = 'en'): RichDocument => (byId(id).build(lang) as Extract<Built, { kind: 'document' }>).doc;
const runs = (d: RichDocument) => allParagraphs(d.blocks).flatMap((p) => p.runs);

describe('FILE-018 built-in templates', () => {
  it('picks the content language from the interface language', () => {
    expect(contentLang('fr')).toBe('fr');
    expect(contentLang('zh')).toBe('en');
  });

  it.each(TEMPLATES.flatMap((t) => (['en', 'fr'] as const).map((lang) => [t.id, lang] as const)))('%s (%s) builds and can be written in every format of its kind', async (id, lang) => {
    const built = byId(id).build(lang, new Date(2026, 9, 2));
    expect(built.kind).toBe(byId(id).kind);
    if (built.kind === 'document') {
      expect(JSON.stringify(built.doc.blocks)).not.toContain('{date}');
      for (const f of ['odt', 'docx', 'md', 'tex'] as const) expect((await readDocument(f, writeDocument(built.doc, f))).blocks.length).toBeGreaterThan(3);
    } else if (built.kind === 'spreadsheet') {
      const calc = new Calculator(built.wb);
      for (const [key] of built.wb.sheets[0]!.cells) expect(isError(calc.value(0, key.split(',').map(Number) as [number, number]))).toBe(false);
      for (const f of ['xlsx', 'ods'] as const) expect(readWorkbook(f, writeWorkbook(built.wb, f)).sheets[0]!.cells.size).toBe(built.wb.sheets[0]!.cells.size);
    } else {
      for (const f of ['pptx', 'odp'] as const) expect(readPresentation(f, writePresentation(built.pres, f)).slides.length).toBe(built.pres.slides.length);
    }
  });

  it('report: title page, table of contents, numbered pages and a captioned table', () => {
    const report = doc('report', 'fr');
    expect(report.blocks.some((b) => b.type === 'toc')).toBe(true);
    expect(report.page).toMatchObject({ footer: { center: 'Page {page} sur {pages}' }, hideOnFirstPage: true });
    expect(runs(report).some((r) => isSeqRun(r) && r.seq === 'table')).toBe(true);
    expect(runs(report).some(isRefRun)).toBe(true);
  });

  it('tour: equations, a diagram, a code cell, a footnote, citations and their list', () => {
    const tour = doc('tour');
    const all = runs(tour);
    expect(all.some((r) => isMathRun(r) && r.display)).toBe(true);
    expect(all.some((r) => isSeqRun(r) && r.seq === 'equation')).toBe(true);
    expect(all.some(isDiagramRun)).toBe(true);
    expect(all.some(isCodeCellRun)).toBe(true);
    expect(all.some(isFootnoteRun)).toBe(true);
    expect(all.filter(isCiteRun).flatMap((r) => r.cite)).toEqual(['knuth1984', 'shapiro2011']);
    expect(tour.references?.entries.map((e) => e.key)).toEqual(['knuth1984', 'shapiro2011']);
    expect(tour.blocks.some((b) => b.type === 'bibliography')).toBe(true);
  });

  it('letter: the place and date on the right, with the date of the day', () => {
    const letter = doc('letter', 'fr');
    const dated = allParagraphs(letter.blocks).find((p) => p.align === 'right');
    expect(JSON.stringify(dated?.runs)).toMatch(/Paris, le \d+ \w+ \d{4}/);
  });

  it('spreadsheets compute their totals', () => {
    const value = (id: string, ref: [number, number]) => {
      const wb = (byId(id).build('en') as Extract<Built, { kind: 'spreadsheet' }>).wb;
      return new Calculator(wb).value(0, ref);
    };
    expect(value('budget', [9, 4])).toBe(6300 + 450 - (2250 + 1260 + 255 + 410));
    expect(value('invoice', [13, 3])).toBeCloseTo((12 * 45 + 200 * 0.35 + 15) * 1.2);
    expect(value('grades', [9, 4])).toBe(5);
  });
});
