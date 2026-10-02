/**
 * Built-in templates and examples (FILE-018): each builds a new document,
 * opened as an untitled file in the user's preferred format.
 */
import type { MessageKey } from '../i18n';
import { readMarkdown } from '../document/markdown-reader';
import { isTextRun, type Paragraph, type RichDocument } from '../document/model';
import { getCell, newWorkbook, setInput, type Workbook } from '../sheet/model';
import { contentSlide, DEFAULT_SIZE, textShape, titleSlide, type Presentation, type Slide } from '../slides/model';
import { DOCUMENT_TEXTS, LABELS, type DocumentTexts, type TemplateLang } from './content';

export type Built = { kind: 'document'; doc: RichDocument } | { kind: 'spreadsheet'; wb: Workbook } | { kind: 'presentation'; pres: Presentation };

export interface Template {
  id: string;
  kind: Built['kind'];
  /** An example showing the features, rather than a starting point. */
  example?: boolean;
  icon: string;
  /** i18n keys of the name and description. */
  name: MessageKey;
  description: MessageKey;
  build(lang: TemplateLang, today?: Date): Built;
}

/** Template content language for an interface language (Chinese uses the English content). */
export const contentLang = (locale: string): TemplateLang => (locale.startsWith('fr') ? 'fr' : 'en');

function documentFrom(text: keyof DocumentTexts, after?: (doc: RichDocument, lang: TemplateLang) => void): Template['build'] {
  return (lang, today = new Date()) => {
    const date = today.toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const doc = readMarkdown(DOCUMENT_TEXTS[lang][text].replace(/\{date\}/g, date));
    // Markdown keeps the extra front matter of a file: a template has none left.
    if (doc.extras) delete doc.extras.frontMatter;
    after?.(doc, lang);
    return { kind: 'document', doc };
  };
}

const textOf = (p: Paragraph): string => p.runs.map((r) => (isTextRun(r) ? r.text : '')).join('');

/** A letter: the sender's block is one paragraph per line, the place and date on the right. */
function letterLayout(doc: RichDocument): void {
  const paragraphs = doc.blocks.filter((b): b is Paragraph => b.type === 'paragraph');
  const dated = paragraphs.find((p) => /\d{4}$/.test(textOf(p)) && /,/.test(textOf(p)));
  if (dated) dated.align = 'right';
}

function budget(lang: TemplateLang): Workbook {
  const L = LABELS[lang].budget;
  const wb = newWorkbook();
  const s = wb.sheets[0]!;
  s.name = L.sheet;
  const rows: (string | number)[][] = [
    [L.item, ...L.months, L.total],
    [L.income],
    [L.salary, 2100, 2100, 2100],
    [L.other, 150, 0, 300],
    [L.expenses, ...L.months],
    [L.rent, 750, 750, 750],
    [L.food, 420, 390, 450],
    [L.transport, 80, 80, 95],
    [L.leisure, 120, 200, 90],
    [L.balance],
  ];
  rows.forEach((row, r) => row.forEach((v, c) => setInput(s, [r, c], String(v))));
  const cols = ['B', 'C', 'D'];
  for (const r of [3, 4, 6, 7, 8, 9]) setInput(s, `E${r}`, `=SUM(B${r}:D${r})`);
  for (const c of [...cols, 'E']) setInput(s, `${c}10`, `=SUM(${c}3:${c}4)-SUM(${c}6:${c}9)`);
  for (const cell of s.cells.values()) if (typeof cell.value === 'number' || cell.formula) cell.numFmt = '#,##0.00';
  s.colWidths = new Map([[0, 160]]);
  s.freeze = { rows: 1, cols: 1 };
  // The expenses' heading row repeats the months: they name the series.
  s.charts = [{ type: 'column', title: L.chart, range: 'A5:D9', headers: true, anchor: { row: 11, col: 0 }, width: 480, height: 280 }];
  return wb;
}

function grades(lang: TemplateLang): Workbook {
  const L = LABELS[lang].grades;
  const wb = newWorkbook();
  const s = wb.sheets[0]!;
  s.name = L.sheet;
  [L.student, ...L.tests, L.average, L.mention].forEach((v, c) => setInput(s, [0, c], v));
  const marks = [
    [15, 17, 16],
    [11, 9.5, 12],
    [18, 16, 19],
    [8, 12, 10.5],
    [13, 14, 12],
    [9, 7.5, 11],
  ];
  L.students.forEach((name, i) => {
    const r = i + 2;
    setInput(s, `A${r}`, name);
    marks[i]!.forEach((m, j) => setInput(s, [r - 1, j + 1], String(m)));
    setInput(s, `E${r}`, `=ROUND(AVERAGE(B${r}:D${r}),1)`);
    const [a, b, c, d, e] = L.mentions;
    setInput(s, `F${r}`, `=IF(E${r}>=16,"${a}",IF(E${r}>=14,"${b}",IF(E${r}>=12,"${c}",IF(E${r}>=10,"${d}","${e}"))))`);
  });
  const last = L.students.length + 1;
  setInput(s, `A${last + 2}`, L.classAverage);
  for (const c of ['B', 'C', 'D', 'E']) setInput(s, `${c}${last + 2}`, `=ROUND(AVERAGE(${c}2:${c}${last}),1)`);
  setInput(s, `A${last + 3}`, L.passed);
  setInput(s, `E${last + 3}`, `=COUNTIF(E2:E${last},">=10")`);
  s.colWidths = new Map([[0, 170], [5, 120]]);
  s.freeze = { rows: 1, cols: 1 };
  return wb;
}

function invoice(lang: TemplateLang): Workbook {
  const L = LABELS[lang].invoice;
  const wb = newWorkbook();
  const s = wb.sheets[0]!;
  s.name = L.sheet;
  setInput(s, 'A1', L.title);
  setInput(s, 'A3', L.number);
  setInput(s, 'B3', '2026-001');
  setInput(s, 'A4', L.date);
  setInput(s, 'B4', '=TODAY()');
  getCell(s, 'B4')!.numFmt = 'yyyy-mm-dd';
  setInput(s, 'A5', L.client);
  [L.description, L.qty, L.price, L.amount].forEach((v, c) => setInput(s, [6, c], v));
  const items: [string, number, number][] = [
    [L.items[0], 12, 45],
    [L.items[1], 200, 0.35],
    [L.items[2], 1, 15],
  ];
  items.forEach(([d, q, p], i) => {
    const r = i + 8;
    setInput(s, `A${r}`, d);
    setInput(s, `B${r}`, String(q));
    setInput(s, `C${r}`, String(p));
    setInput(s, `D${r}`, `=B${r}*C${r}`);
  });
  setInput(s, 'C12', L.subtotal);
  setInput(s, 'D12', '=SUM(D8:D10)');
  setInput(s, 'C13', L.tax);
  setInput(s, 'B13', '20%');
  setInput(s, 'D13', '=D12*B13');
  setInput(s, 'C14', L.total);
  setInput(s, 'D14', '=D12+D13');
  for (const ref of ['C8', 'C9', 'C10', 'D8', 'D9', 'D10', 'D12', 'D13', 'D14']) getCell(s, ref)!.numFmt = '#,##0.00';
  s.colWidths = new Map([[0, 220], [2, 110], [3, 110]]);
  return wb;
}

/** A4 landscape at 96 dpi: signs are printed one per page. */
const A4_LANDSCAPE = { width: 1123, height: 794 };

/** Width in em of a character in a bold sans-serif font, roughly (wide letters, capitals, digits, the rest). */
function charWidth(c: string): number {
  if (/[WM]/.test(c)) return 1.0;
  if (/[A-Z]|[À-Þ]/.test(c)) return 0.78;
  if (/[0-9]/.test(c)) return 0.7;
  if (c === ' ') return 0.35;
  if (/[a-z]|[ß-ÿ]/.test(c)) return 0.64;
  return 0.9;
}

/** The largest font size (points) for which `text` fits in a box, on one line. */
export function fitFontSize(text: string, boxWidth: number, boxHeight: number): number {
  const ems = [...text].reduce((n, c) => n + charWidth(c), 0) || 1;
  // A line is about 1.2 em high; keep 8 % to spare for the fonts that are wider.
  const px = Math.min(boxWidth / ems, boxHeight / 1.2) * 0.92;
  return Math.floor(px * 0.75);
}

/** Race signs (FILE-018): one big word, arrow or distance per page, in high-contrast colours. */
function raceSigns(lang: TemplateLang): Presentation {
  const L = LABELS[lang].signs;
  const { width, height } = A4_LANDSCAPE;
  const margin = 40;
  const sign = (text: string, background: string, color: string, caption?: string): Slide => {
    const boxH = caption ? height * 0.72 : height - 2 * margin;
    const big = textShape(text, {
      x: margin,
      y: margin,
      width: width - 2 * margin,
      height: boxH,
      anchor: 'middle',
      fontSize: fitFontSize(text, width - 2 * margin, boxH),
      paragraphs: [{ type: 'paragraph', style: 'normal', align: 'center', runs: [{ text, bold: true, color }] }],
    });
    const shapes = [big];
    if (caption) {
      shapes.push(
        textShape(caption, {
          x: margin,
          y: margin + boxH,
          width: width - 2 * margin,
          height: height - boxH - 2 * margin,
          anchor: 'middle',
          fontSize: 32,
          paragraphs: [{ type: 'paragraph', style: 'normal', align: 'center', runs: [{ text: caption, color }] }],
        }),
      );
    }
    return { shapes, background, notes: L.notes };
  };
  const slides: Slide[] = [
    sign(L.start, '#1b7f3b', '#ffffff', L.event),
    sign('→', '#ffd400', '#000000'),
    sign('←', '#ffd400', '#000000'),
    sign('↑', '#ffd400', '#000000'),
    sign(`1 ${L.km}`, '#ffffff', '#000000', L.event),
    sign(`2 ${L.km}`, '#ffffff', '#000000', L.event),
    sign(L.water, '#0b5cad', '#ffffff', L.event),
    sign(L.finish, '#c4161c', '#ffffff', L.event),
  ];
  return { ...A4_LANDSCAPE, slides, resources: new Map(), meta: { title: L.title } };
}

function talk(lang: TemplateLang): Presentation {
  const L = LABELS[lang].talk;
  const first = titleSlide();
  first.shapes[0]!.paragraphs = [{ type: 'paragraph', style: 'normal', align: 'center', runs: [{ text: L.title }] }];
  first.shapes[1]!.paragraphs = [{ type: 'paragraph', style: 'normal', align: 'center', runs: [{ text: L.subtitle }] }];
  const slides: Slide[] = [first];
  for (const s of L.slides) {
    const slide = contentSlide();
    slide.shapes[0]!.paragraphs = [{ type: 'paragraph', style: 'normal', runs: [{ text: s.title }] }];
    slide.shapes[1]!.paragraphs = s.points.map((p) => ({ type: 'paragraph', style: 'normal', list: { ordered: false, level: 0 }, runs: [{ text: p }] }));
    if (s.notes) slide.notes = s.notes;
    slides.push(slide);
  }
  return { ...DEFAULT_SIZE, slides, resources: new Map(), meta: { title: L.title } };
}

export const TEMPLATES: Template[] = [
  { id: 'letter', kind: 'document', icon: '✉️', name: 'tpl.letter', description: 'tpl.letterDesc', build: documentFrom('letter', letterLayout) },
  { id: 'report', kind: 'document', icon: '📘', name: 'tpl.report', description: 'tpl.reportDesc', build: documentFrom('report') },
  { id: 'minutes', kind: 'document', icon: '🗒️', name: 'tpl.minutes', description: 'tpl.minutesDesc', build: documentFrom('minutes') },
  { id: 'exercises', kind: 'document', icon: '✏️', name: 'tpl.exercises', description: 'tpl.exercisesDesc', build: documentFrom('exercises') },
  { id: 'budget', kind: 'spreadsheet', icon: '💶', name: 'tpl.budget', description: 'tpl.budgetDesc', build: (lang) => ({ kind: 'spreadsheet', wb: budget(lang) }) },
  { id: 'grades', kind: 'spreadsheet', icon: '🎓', name: 'tpl.grades', description: 'tpl.gradesDesc', build: (lang) => ({ kind: 'spreadsheet', wb: grades(lang) }) },
  { id: 'invoice', kind: 'spreadsheet', icon: '🧾', name: 'tpl.invoice', description: 'tpl.invoiceDesc', build: (lang) => ({ kind: 'spreadsheet', wb: invoice(lang) }) },
  { id: 'talk', kind: 'presentation', icon: '🎤', name: 'tpl.talk', description: 'tpl.talkDesc', build: (lang) => ({ kind: 'presentation', pres: talk(lang) }) },
  { id: 'race-signs', kind: 'presentation', icon: '🏁', name: 'tpl.signs', description: 'tpl.signsDesc', build: (lang) => ({ kind: 'presentation', pres: raceSigns(lang) }) },
  { id: 'tour', kind: 'document', example: true, icon: '🧭', name: 'tpl.tour', description: 'tpl.tourDesc', build: documentFrom('tour') },
];
