import { describe, expect, it } from 'vitest';
import { TEMPLATES, contentLang, type Built } from '../src/templates/catalog';
import { allParagraphs, type Paragraph, isCiteRun, isCodeCellRun, isDiagramRun, isFootnoteRun, isMathRun, isRefRun, isSeqRun, type RichDocument } from '../src/document/model';
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
    } else if (built.kind === 'presentation') {
      for (const f of ['pptx', 'odp'] as const) expect(readPresentation(f, writePresentation(built.pres, f)).slides.length).toBe(built.pres.slides.length);
    } else if (built.ext === 'svg') {
      // DRAW-012: a drawing that opens again editable, its wires attached.
      const { fromSvg } = await import('../src/draw/svg');
      const d = fromSvg(new TextDecoder().decode(await built.bytes()));
      expect(d.shapes.filter((s) => s.kind === 'symbol').length).toBeGreaterThan(3);
      expect(d.alt).toBeTruthy();
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

describe('FILE-018 examples with plots', () => {
  it.each(['en', 'fr'] as const)('lab (%s): Python cells with their output and figures already drawn', async (lang) => {
    const lab = doc('lab', lang);
    const cells = runs(lab).filter(isCodeCellRun);
    expect(cells.map((c) => c.lang)).toEqual(['python', 'python', 'python', 'python', 'python', 'python']);
    expect(cells[0]!.cell).toContain('np.polyfit');
    expect(cells[0]!.output?.text).toMatch(/R = 47\.0 Ω/);
    expect(cells.filter((c) => c.output?.images?.length)).toHaveLength(5);
    for (const c of cells) for (const key of c.output?.images ?? []) expect(lab.resources.get(key)?.mediaType).toBe('image/png');
    expect(cells[5]!.cell).toContain('sp.dsolve');
    expect(cells[5]!.output?.text).toContain('E - E*exp(-t/(C*R))');
    // The figures stay with the document when it is saved.
    const back = await readDocument('mdz', writeDocument(lab, 'mdz'));
    expect(runs(back).filter(isCodeCellRun).filter((c) => c.output?.images?.length)).toHaveLength(5);
  });

  it('letter: addresses on separate lines, laid out as usual in French (FILE-018)', () => {
    const paras = doc('letter', 'fr').blocks.filter((b) => b.type === 'paragraph') as Paragraph[];
    const text = (p: Paragraph) => p.runs.map((r) => ('text' in r ? r.text : '')).join('');
    expect(text(paras[0]!).split('\n')).toEqual(['Jeanne MARTIN', '12 rue des Jardins', '75011 Paris', '06 12 34 56 78', 'jeanne.martin@example.org']);
    expect(text(paras[1]!).split('\n')[0]).toBe('Monsieur Jean DUPONT');
    expect(text(paras[1]!).split('\n').at(-1)).toBe('69000 Lyon');
    // Recipient, place and date, and signature from 9 cm; spaces between the blocks.
    for (const i of [1, 2, paras.length - 1]) expect(paras[i]!.indent).toBe(255);
    // The date of the day is a field (DOC-041).
    expect(text(paras[2]!)).toBe('Paris, le ');
    expect(paras[2]!.runs.at(-1)).toEqual({ field: 'date' });
    expect(text(paras[3]!)).toContain('Objet :');
    expect(paras[3]!.spaceBefore).toBeGreaterThan(0);
    expect(text(paras.at(-1)!)).toBe('Jeanne MARTIN');
  });

  it.each(['en', 'fr'] as const)('names (%s): SURNAME First name at school, one line per member of a team; First name SURNAME elsewhere', (lang) => {
    const md = (id: string) => JSON.stringify(doc(id, lang).blocks);
    const school = lang === 'fr' ? ['NOM1 Prénom1', 'NOM2 Prénom2', 'NOM3 Prénom3'] : ['SURNAME1 First name1', 'SURNAME2 First name2', 'SURNAME3 First name3'];
    const team = allParagraphs(doc('report', lang).blocks).filter((p) => p.list).map((p) => p.runs.map((r) => ('text' in r ? r.text : '')).join(''));
    expect(team.slice(0, 3)).toEqual(school);
    expect(md('minutes')).toContain(lang === 'fr' ? 'Prénom NOM' : 'First name SURNAME');
    expect(JSON.stringify(doc('exercises', lang).page)).toContain(lang === 'fr' ? 'NOM Prénom' : 'SURNAME First name');
  });

  it('letter: block style in English', () => {
    const paras = doc('letter', 'en').blocks.filter((b) => b.type === 'paragraph') as Paragraph[];
    const text = (p: Paragraph) => p.runs.map((r) => ('text' in r ? r.text : '')).join('');
    expect(text(paras[0]!).split('\n')).toHaveLength(4);
    expect(paras[1]!.runs).toEqual([{ field: 'date' }]);
    expect(text(paras[2]!).split('\n')[0]).toBe('Mr John Doe');
    expect(paras.every((p) => !p.indent)).toBe(true);
    expect(text(paras.at(-2)!)).toBe('Jane Smith');
    expect(paras.at(-2)!.spaceBefore).toBeGreaterThan(0);
  });

  it.each(['en', 'fr'] as const)('widgets (%s): a reactive Python slider driving a plot, and a JavaScript widget (CODE-016)', (lang) => {
    const cells = runs(doc('widgets', lang)).filter(isCodeCellRun);
    expect(cells.map((c) => c.lang)).toEqual(['python', 'python', 'javascript', 'javascript']);
    expect(cells[0]!.cell).toContain('class Slider(anywidget.AnyWidget)');
    expect(cells[0]!.cell).toContain('freq = pwo.ui(Slider(');
    expect(cells[1]!.cell).toContain('freq.value');
    expect(cells[2]!.cell).toContain('const clicks = ui(widget(');
    expect(cells[3]!.cell).toContain('clicks.get("count")');
  });

  it.each(['en', 'fr'] as const)('instruments (%s): the anywidget instruments installed, reactive controls driving indicators (CODE-016)', (lang) => {
    const cells = runs(doc('instruments', lang)).filter(isCodeCellRun);
    expect(cells.map((c) => c.lang)).toEqual(['python', 'python', 'python', 'python']);
    expect(cells[0]!.cell).toContain('await pwo.install("https://anywidgetinstruments.github.io/anywidget-instruments-industrial/marimo/gallery/public/wheel.txt")');
    expect(cells[1]!.cell).toContain('setpoint = pwo.ui(ai.Knob(');
    expect(cells[2]!.cell).toContain('ai.Tank(level');
    expect(cells[3]!.cell).toContain('ai.StackLight(');
  });

  it.each(['en', 'fr'] as const)('instrument families (%s): automation, aeronautics and automotive, each installed from its wheels (CODE-016)', (lang) => {
    const cells = (id: string) => runs(doc(id, lang)).filter(isCodeCellRun).map((c) => c.cell);
    const automation = cells('instruments-automation');
    expect(automation[0]).toContain('anywidget-instruments-industrial/marimo/gallery/public/wheel.txt');
    expect(automation[1]).toContain('kp = pwo.ui(ai.Knob(');
    expect(automation[2]).toContain('pid.step(y, dt)');
    expect(automation[3]).toContain('ai.StateMachine("packml"');
    const aeronautics = cells('instruments-aeronautics');
    expect(aeronautics[0]).toContain('anywidget-instruments-aeronautics/marimo/flight/public/wheels.txt');
    expect(aeronautics[1]).toContain('class Slider(anywidget.AnyWidget)');
    expect(aeronautics[2]).toContain('aw.AttitudeIndicator(pitch=pitch.value, roll=bank.value');
    const automotive = cells('instruments-automotive');
    expect(automotive[0]).toContain('anywidget-instruments-automotive/marimo/dials/public/wheels.txt');
    expect(automotive[2]).toContain('aa.Speedometer(speed.value, limit=limit.value)');
    expect(automotive[2]).toContain('aa.TellTaleCluster(');
  });

  it.each(['en', 'fr'] as const)('languages (%s): one runnable cell per supported language (CODE-017, CODE-018)', (lang) => {
    const cells = runs(doc('languages', lang)).filter(isCodeCellRun);
    expect(cells.map((c) => c.lang)).toEqual(['python', 'javascript', 'lua', 'sql', 'sql', 'cpp', 'cpp', 'r', 'r']);
    expect(cells[3]!.cell).toContain('CREATE TABLE');
    expect(cells[4]!.cell).toContain('GROUP BY');
    expect(cells[5]!.cell).toContain('#include <stdio.h>');
    expect(cells[6]!.cell).toContain('#include <vector>');
    expect(cells[8]!.cell).toContain('plot(');
  });

  it('measurements: scientific functions and charts drawn from the data', () => {
    const built = byId('measurements').build('fr') as Extract<Built, { kind: 'spreadsheet' }>;
    const charts = built.wb.sheets.flatMap((s) => s.charts ?? []);
    expect(charts.map((c) => c.type).sort()).toEqual(['line', 'scatter']);
    const calc = new Calculator(built.wb);
    for (const [si, sheet] of built.wb.sheets.entries()) for (const [key] of sheet.cells) expect(isError(calc.value(si, key.split(',').map(Number) as [number, number]))).toBe(false);
    const formulas = built.wb.sheets.flatMap((s) => [...s.cells.values()].map((c) => c.formula ?? '')).join(' ');
    for (const fn of ['EXP(', 'SIN(', 'SLOPE(', 'INTERCEPT(', 'RSQ(', 'STDEV(']) expect(formulas).toContain(fn);
  });
});

describe('BIB-011 the scientific article template', () => {
  it.each(['en', 'fr'] as const)('holds the parts of an article (%s)', async (lang) => {
    const { TEMPLATES } = await import('../src/templates/catalog');
    const { allParagraphs, isCiteRun } = await import('../src/document/model');
    const built = TEMPLATES.find((x) => x.id === 'article')!.build(lang);
    if (built.kind !== 'document') throw new Error('not a document');
    const doc = built.doc;
    expect(doc.page?.geometry).toMatchObject({ top: 25, left: 25 });
    expect(doc.meta.keywords?.length).toBe(3);
    expect(doc.references?.entries.map((e) => e.key)).toEqual(['knuth1984', 'lamport1994']);
    const runs = allParagraphs(doc.blocks).flatMap((p) => p.runs);
    expect(runs.filter(isCiteRun).map((r) => r.cite[0])).toEqual(['knuth1984', 'lamport1994']);
    expect(runs.some((r) => 'math' in r && r.display)).toBe(true);
    expect(doc.blocks.some((b) => b.type === 'bibliography')).toBe(true);
  });
});

describe('DOC-049 the newspaper template', () => {
  it.each(['en', 'fr'] as const)('sets its articles in columns (%s)', async (lang) => {
    const { columnSegments } = await import('../src/document/model');
    const d = doc('newspaper', lang);
    const sets = columnSegments(d.blocks).filter((s) => s.columns).map((s) => s.columns);
    expect(sets).toEqual([{ count: 3, gap: 14, rule: true }, { count: 2, gap: 18 }]);
    expect(d.blocks.some((b) => b.type === 'rule' && b.column && b.columns?.count === 3)).toBe(true);
    expect(runs(d).some((r) => 'field' in r && r.field === 'date')).toBe(true);
    expect(d.page?.geometry).toMatchObject({ top: 15, left: 15 });
  });
});

describe('FILE-018 templates keep their LaTeX and line breaks', () => {
  const documents = TEMPLATES.filter((x) => x.kind === 'document');
  it.each(documents.flatMap((x) => (['en', 'fr'] as const).map((lang) => [x.id, lang] as const)))('%s (%s): no backslash lost in the source', (id, lang) => {
    const built = byId(id).build(lang);
    if (built.kind !== 'document') return;
    for (const r of runs(built.doc)) {
      // A lost backslash leaves a tab, a carriage return or a bell (\t, \r, \b…) in the text or the equations.
      if ('text' in r) expect(r.text).not.toMatch(/[\t\r\b\f\v]/);
      if ('math' in r) {
        expect(r.math).not.toMatch(/[\t\r\b\f\v]/);
        expect(r.math).not.toMatch(/(^|[^\\a-z])(infty|tau|left|right|label|frac|alpha|sum)\b/);
      }
    }
  });

  it('writes the equation of the article whole, with its number and label', () => {
    const d = doc('article');
    const maths = runs(d).filter(isMathRun).map((r) => r.math);
    expect(maths).toContain('\\tau');
    expect(maths.find((m) => m.includes('y(t)'))).toBe('y(t) = y_\\infty \\left(1 - e^{-t/\\tau}\\right)');
    expect(runs(d).some(isSeqRun)).toBe(true);
    // The affiliations and the corresponding author on two lines.
    expect(allParagraphs(d.blocks).some((p) => p.runs.some((r) => 'text' in r && /Country\n$/.test(r.text)))).toBe(true);
    // One list of references, under its own title.
    expect(allParagraphs(d.blocks).filter((p) => /^h/.test(p.style) && p.runs.some((r) => 'text' in r && r.text === 'References'))).toHaveLength(0);
  });
});

describe('BIB-011 the article refers to its equation by name', () => {
  it.each(['en', 'fr'] as const)('keeps the word before the number (%s)', (lang) => {
    const p = allParagraphs(doc('article', lang).blocks).find((x) => x.runs.some(isRefRun))!;
    const at = p.runs.findIndex(isRefRun);
    const before = p.runs[at - 1];
    expect(before && 'text' in before ? before.text : '').toMatch(lang === 'en' ? /Equation $/ : /équation $/);
  });
});

describe('FILE-018 an emoji for each template', () => {
  it('gives every built-in template its own emoji', () => {
    expect(TEMPLATES.every((tpl) => tpl.icon.length > 0)).toBe(true);
    expect(new Set(TEMPLATES.map((tpl) => tpl.icon)).size).toBe(TEMPLATES.length);
  });

  it('shows what a template kept as a file makes', async () => {
    const { fileIcon } = await import('../src/templates/ui');
    expect(['Letter.ott', 'a/Report.docx', 'Budget.xlsx', 'Data.csv', 'Talk.odp', 'Notes.md', 'Paper.tex', 'Plan.svg', 'Logo.PNG', '.ods'].map(fileIcon)).toEqual(['📄', '📄', '📊', '📊', '📽️', '📝', '📐', '🎨', '🖼️', '📊']);
  });
});
