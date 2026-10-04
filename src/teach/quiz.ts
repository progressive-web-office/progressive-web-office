/**
 * TEACH-003: the questions of a text document exported for learning
 * platforms and exam scanners — Moodle XML, GIFT (Moodle, and others that
 * read it) and AMC (Auto Multiple Choice, LaTeX).
 *
 * The questions are written as in any exercise sheet, with the form fields of
 * the word processor (FORM-003):
 * - a multiple choice question: its text, then a list whose items start with
 *   a check box — ticked for the right answers (one or several);
 * - a short answer: a text field in the paragraph, holding the expected
 *   answer (a number makes a numerical question);
 * - a drop-down list in the paragraph, set on the right choice.
 * Headings become categories (Moodle) or groups (AMC). Equations are kept as
 * LaTeX (`\(…\)`, which Moodle shows with MathJax).
 */
import { isInputRun, isTextRun, type Block, type InputRun, type Paragraph, type RichDocument, type Run } from '../document/model';

export interface QuizAnswer {
  text: string;
  right: boolean;
}

export type QuizQuestion =
  | { kind: 'choice'; category: string; text: string; answers: QuizAnswer[] }
  | { kind: 'short'; category: string; text: string; answer: string; numeric: boolean };

const isMath = (r: Run): r is Run & { math: string } => 'math' in r;

/** The text of runs, fields replaced by a blank, equations as `\(…\)`. */
function runsText(runs: Run[]): string {
  return runs
    .map((r) => {
      if (isTextRun(r)) return r.deleted ? '' : r.text;
      if (isMath(r)) return `\\(${r.math}\\)`;
      if (isInputRun(r)) return r.input === 'checkbox' ? '' : '_____';
      return '';
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

const firstInput = (p: Paragraph): InputRun | undefined => p.runs.find(isInputRun);

/** A list item that is an answer: it starts with a check box. */
function answerOf(p: Paragraph): QuizAnswer | undefined {
  if (!p.list) return undefined;
  const runs = p.runs.filter((r) => !(isTextRun(r) && !r.text.trim()));
  const box = runs[0];
  if (!box || !isInputRun(box) || box.input !== 'checkbox') return undefined;
  return { text: runsText(p.runs), right: !!box.checked };
}

/** The questions of the document, in order. */
export function quizQuestions(doc: RichDocument): QuizQuestion[] {
  const out: QuizQuestion[] = [];
  const blocks: Block[] = doc.blocks;
  let category = '';
  let stem: string[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    if (b.type !== 'paragraph') {
      stem = [];
      continue;
    }
    if (/^h[1-6]$/.test(b.style)) {
      category = runsText(b.runs);
      stem = [];
      continue;
    }
    const answer = answerOf(b);
    if (answer) {
      // The answers that follow, and the text before them.
      const answers = [answer];
      while (i + 1 < blocks.length && blocks[i + 1]!.type === 'paragraph') {
        const next = answerOf(blocks[i + 1] as Paragraph);
        if (!next) break;
        answers.push(next);
        i++;
      }
      if (stem.length && answers.some((a) => a.right)) out.push({ kind: 'choice', category, text: stem.join('\n'), answers });
      stem = [];
      continue;
    }
    const field = firstInput(b);
    if (field && field.input === 'text' && field.value?.trim()) {
      const value = field.value.trim();
      out.push({ kind: 'short', category, text: [...stem, runsText(b.runs)].join('\n'), answer: value, numeric: /^-?\d+(?:[.,]\d+)?$/.test(value) });
      stem = [];
      continue;
    }
    if (field && field.input === 'dropdown' && field.options?.length && field.value) {
      out.push({ kind: 'choice', category, text: [...stem, runsText(b.runs)].join('\n'), answers: field.options.map((o) => ({ text: o, right: o === field.value })) });
      stem = [];
      continue;
    }
    const text = runsText(b.runs);
    if (text && !b.list) stem.push(text);
    else if (!text) stem = [];
  }
  return out;
}

// --- Moodle XML ------------------------------------------------------------------

/** The grades Moodle accepts for an answer, in percent. */
const MOODLE_FRACTIONS = [100, 90, 83.33333, 80, 75, 70, 66.66667, 60, 50, 40, 33.33333, 30, 25, 20, 16.66667, 14.28571, 12.5, 11.11111, 10, 5];
const nearestFraction = (v: number): number => MOODLE_FRACTIONS.reduce((best, f) => (Math.abs(f - v) < Math.abs(best - v) ? f : best), 100);

const html = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
const cdata = (s: string): string => `<![CDATA[${s.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
const xml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const nameOf = (q: QuizQuestion, i: number): string => {
  const words = q.text.replace(/\\\(.*?\\\)/g, '…').split(/\s+/).slice(0, 8).join(' ');
  return `${String(i + 1).padStart(2, '0')} ${words}`.slice(0, 80);
};

export function moodleXml(questions: QuizQuestion[], course = 'Quiz'): string {
  const out = ['<?xml version="1.0" encoding="UTF-8"?>', '<quiz>'];
  let category: string | undefined;
  questions.forEach((q, i) => {
    if (q.category !== category) {
      category = q.category;
      out.push(`  <question type="category"><category><text>${xml(`$course$/${course}${category ? `/${category}` : ''}`)}</text></category></question>`);
    }
    const head = `    <name><text>${xml(nameOf(q, i))}</text></name>\n    <questiontext format="html"><text>${cdata(html(q.text))}</text></questiontext>`;
    if (q.kind === 'choice') {
      const right = q.answers.filter((a) => a.right).length;
      const wrong = q.answers.length - right;
      const single = right === 1;
      const answers = q.answers.map((a) => {
        const fraction = a.right ? (single ? 100 : nearestFraction(100 / right)) : single || !wrong ? 0 : -nearestFraction(100 / wrong);
        return `    <answer fraction="${fraction}" format="html"><text>${cdata(html(a.text))}</text></answer>`;
      });
      out.push(`  <question type="multichoice">\n${head}\n    <single>${single}</single>\n    <shuffleanswers>1</shuffleanswers>\n    <answernumbering>abc</answernumbering>\n${answers.join('\n')}\n  </question>`);
    } else if (q.numeric) {
      out.push(`  <question type="numerical">\n${head}\n    <answer fraction="100"><text>${xml(q.answer.replace(',', '.'))}</text><tolerance>0</tolerance></answer>\n  </question>`);
    } else {
      out.push(`  <question type="shortanswer">\n${head}\n    <usecase>0</usecase>\n    <answer fraction="100" format="moodle_auto_format"><text>${xml(q.answer)}</text></answer>\n  </question>`);
    }
  });
  out.push('</quiz>', '');
  return out.join('\n');
}

// --- GIFT ------------------------------------------------------------------------

/** Characters GIFT gives a meaning to, written with a backslash. */
const gift = (s: string): string => s.replace(/([~=#{}:\\])/g, '\\$1').replace(/\n/g, '\\n');

export function giftText(questions: QuizQuestion[]): string {
  const out: string[] = [];
  let category: string | undefined;
  questions.forEach((q, i) => {
    if (q.category !== category) {
      category = q.category;
      if (category) out.push(`$CATEGORY: ${category.replace(/\n/g, ' ')}`, '');
    }
    const title = `::${gift(nameOf(q, i))}::`;
    if (q.kind === 'choice') {
      const right = q.answers.filter((a) => a.right).length;
      const wrong = q.answers.length - right;
      const answers =
        right === 1
          ? q.answers.map((a) => `${a.right ? '=' : '~'}${gift(a.text)}`)
          : q.answers.map((a) => `~%${a.right ? nearestFraction(100 / right) : wrong ? -nearestFraction(100 / wrong) : 0}%${gift(a.text)}`);
      out.push(`${title}[html]${gift(html(q.text))} {\n${answers.map((a) => `  ${a}`).join('\n')}\n}`, '');
    } else if (q.numeric) out.push(`${title}${gift(q.text)} {#${q.answer.replace(',', '.')}}`, '');
    else out.push(`${title}${gift(q.text)} {=${gift(q.answer)}}`, '');
  });
  return `${out.join('\n')}\n`;
}

// --- AMC (Auto Multiple Choice) ----------------------------------------------------

/** Text for LaTeX: special characters escaped, equations kept. */
function tex(s: string): string {
  return s
    .split(/(\\\(.*?\\\))/)
    .map((part, i) =>
      i % 2
        ? part
        : part
            .replace(/\\/g, '\\textbackslash{}')
            .replace(/([#$%&_{}])/g, '\\$1')
            .replace(/~/g, '\\textasciitilde{}')
            .replace(/\^/g, '\\textasciicircum{}')
            .replace(/\n/g, '\n\n'),
    )
    .join('');
}

/** An AMC source: the choice questions, by group (short answers are left out: AMC reads ticks). */
export function amcLatex(questions: QuizQuestion[], opts: { title?: string; copies?: number; lang?: string } = {}): string {
  const groups = new Map<string, string[]>();
  questions.forEach((q, i) => {
    if (q.kind !== 'choice') return;
    const group = (q.category || 'questions').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || 'questions';
    const mult = q.answers.filter((a) => a.right).length > 1;
    const env = mult ? 'questionmult' : 'question';
    const body = [
      `  \\begin{${env}}{q${i + 1}}`,
      `    ${tex(q.text)}`,
      '    \\begin{choices}',
      ...q.answers.map((a) => `      \\${a.right ? 'correctchoice' : 'wrongchoice'}{${tex(a.text)}}`),
      '    \\end{choices}',
      `  \\end{${env}}`,
    ].join('\n');
    groups.set(group, [...(groups.get(group) ?? []), body]);
  });
  const lang = opts.lang?.startsWith('fr') ? 'francais' : '';
  return [
    '\\documentclass[a4paper]{article}',
    '\\usepackage[utf8]{inputenc}',
    '\\usepackage[T1]{fontenc}',
    `\\usepackage[${lang}]{automultiplechoice}`,
    '\\usepackage{amsmath,amssymb}',
    '\\begin{document}',
    '',
    ...[...groups].map(([g, qs]) => `\\element{${g}}{\n${qs.join('\n')}\n}\n`),
    ...[...groups.keys()].map((g) => `\\shufflegroup{${g}}`),
    `\\onecopy{${opts.copies ?? 1}}{`,
    '  \\noindent{\\bf ' + tex(opts.title ?? 'Quiz') + '} \\hfill \\namefield{\\fbox{\\begin{minipage}{.5\\linewidth}\\vspace*{.5cm}\\end{minipage}}}',
    '  \\vspace{4mm}',
    ...[...groups.keys()].map((g) => `  \\insertgroup{${g}}`),
    '}',
    '',
    '\\end{document}',
    '',
  ].join('\n');
}
