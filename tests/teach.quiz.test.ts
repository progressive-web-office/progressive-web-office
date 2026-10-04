import { describe, expect, it } from 'vitest';
import { amcLatex, giftText, moodleXml, quizQuestions } from '../src/teach/quiz';
import type { Block, Paragraph, RichDocument, Run } from '../src/document/model';

const p = (runs: Run[] | string, extra: Partial<Paragraph> = {}): Paragraph => ({ type: 'paragraph', style: 'normal', runs: typeof runs === 'string' ? [{ text: runs }] : runs, ...extra });
const box = (checked: boolean): Run => ({ input: 'checkbox', name: 'c', checked }) as Run;
const item = (checked: boolean, text: string): Paragraph => p([box(checked), { text: ` ${text}` }], { list: { ordered: false, level: 0 } });
const doc = (...blocks: Block[]): RichDocument => ({ blocks, meta: {}, resources: new Map() }) as unknown as RichDocument;

const sample = doc(
  p('Geography', { style: 'h1' }),
  p('Which city is the capital of France?'),
  item(false, 'Lyon'),
  item(true, 'Paris'),
  item(false, 'Marseille'),
  p('Which are rivers of France?'),
  item(true, 'The Loire'),
  item(true, 'The Seine'),
  item(false, 'The Danube'),
  p('Maths', { style: 'h1' }),
  p([{ text: 'Compute ' }, { math: '6 \\times 7' } as Run, { text: ': ' }, { input: 'text', name: 'a', value: '42' } as Run]),
  p([{ text: 'The longest river of Europe is the ' }, { input: 'text', name: 'b', value: 'Volga' } as Run, { text: '.' }]),
  p([{ text: 'A prime number: ' }, { input: 'dropdown', name: 'd', options: ['4', '7', '9'], value: '7' } as Run]),
  p('Just some text, not a question.'),
  item(false, 'a list with no right answer is not a question'),
);

describe('TEACH-003 quiz export', () => {
  it('finds the questions written with form fields', () => {
    const qs = quizQuestions(sample);
    expect(qs.map((q) => [q.kind, q.category, q.text])).toEqual([
      ['choice', 'Geography', 'Which city is the capital of France?'],
      ['choice', 'Geography', 'Which are rivers of France?'],
      ['short', 'Maths', 'Compute \\(6 \\times 7\\): _____'],
      ['short', 'Maths', 'The longest river of Europe is the _____.'],
      ['choice', 'Maths', 'A prime number: _____'],
    ]);
    expect(qs[0]).toMatchObject({ answers: [{ text: 'Lyon', right: false }, { text: 'Paris', right: true }, { text: 'Marseille', right: false }] });
    expect(qs[2]).toMatchObject({ answer: '42', numeric: true });
    expect(qs[3]).toMatchObject({ answer: 'Volga', numeric: false });
  });

  it('writes Moodle XML with categories and grades Moodle accepts', () => {
    const out = moodleXml(quizQuestions(sample), 'Test');
    expect(out).toContain('<text>$course$/Test/Geography</text>');
    expect(out).toContain('<single>true</single>');
    expect(out).toMatch(/<answer fraction="100" format="html"><text><!\[CDATA\[Paris\]\]><\/text><\/answer>/);
    // Two right answers of three: 50 each, the wrong one -100.
    expect(out).toMatch(/fraction="50" format="html"><text><!\[CDATA\[The Loire/);
    expect(out).toMatch(/fraction="-100" format="html"><text><!\[CDATA\[The Danube/);
    expect(out).toContain('<question type="numerical">');
    expect(out).toContain('<question type="shortanswer">');
    expect(new DOMParser().parseFromString(out, 'application/xml').querySelector('parsererror')).toBeNull();
  });

  it('writes GIFT, escaping its special characters', () => {
    const out = giftText(quizQuestions(sample));
    expect(out).toContain('$CATEGORY: Geography');
    expect(out).toMatch(/\{\n {2}~Lyon\n {2}=Paris\n {2}~Marseille\n\}/);
    expect(out).toContain('~%50%The Loire');
    expect(out).toContain('{#42}');
    expect(out).toContain('{=Volga}');
    expect(giftText([{ kind: 'short', category: '', text: 'a = b {c}?', answer: 'x~y', numeric: false }])).toContain('a \\= b \\{c\\}? {=x\\~y}');
  });

  it('writes an AMC source with the choice questions', () => {
    const out = amcLatex(quizQuestions(sample), { title: 'Test 1', copies: 30, lang: 'fr' });
    expect(out).toContain('\\usepackage[francais]{automultiplechoice}');
    expect(out).toContain('\\begin{question}{q1}');
    expect(out).toContain('\\begin{questionmult}{q2}');
    expect(out).toContain('\\correctchoice{Paris}');
    expect(out).toContain('\\onecopy{30}{');
    expect(out).toContain('\\insertgroup{Geography}');
    expect(out).not.toContain('Volga');
  });
});
