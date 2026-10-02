import { describe, expect, it } from 'vitest';
import { curlyQuotes, dashesAndEllipsis, frenchSpaceBefore, frenchSpacing, NBSP, NNBSP, removeDoubleSpaces, sentenceCase, straightenQuotes, titleCase, zapGremlins } from '../src/document/typography';

describe('DOC-031 typography as you type', () => {
  it('puts the French no-break spaces before ; : ! ?', () => {
    expect(frenchSpaceBefore('Bonjour', '!')).toEqual({ space: NNBSP, replace: 0 });
    expect(frenchSpaceBefore('Bonjour ', '?')).toEqual({ space: NNBSP, replace: 1 });
    expect(frenchSpaceBefore('Note ', ':')).toEqual({ space: NBSP, replace: 1 });
    expect(frenchSpaceBefore('Il est 12', ':')).toBeUndefined();
    expect(frenchSpaceBefore('Voir https', ':')).toBeUndefined();
    expect(frenchSpaceBefore('page.php', '?')).toBeUndefined();
    expect(frenchSpaceBefore(`Quoi${NNBSP}?`, '!')).toBeUndefined();
    expect(frenchSpaceBefore('(', '!')).toBeUndefined();
  });
});

describe('DOC-032 text transforms', () => {
  it('curls and straightens quotes per language', () => {
    expect(curlyQuotes('Il dit "bonjour" et l\'autre', 'fr')).toBe(`Il dit «${NBSP}bonjour${NBSP}» et l’autre`);
    expect(curlyQuotes('She said "hi" and \'bye\'', 'en')).toBe('She said “hi” and ‘bye’');
    expect(curlyQuotes('Er sagt "ja"', 'de')).toBe('Er sagt „ja“');
    expect(straightenQuotes(`«${NBSP}a${NBSP}» “b” l’c`)).toBe('"a" "b" l\'c');
  });

  it('applies French spacing to a whole text', () => {
    expect(frenchSpacing('Vraiment ? Oui! Note: voir https://a.fr/x?y=1 à 12:30; «oui»')).toBe(`Vraiment${NNBSP}? Oui${NNBSP}! Note${NBSP}: voir https://a.fr/x?y=1 à 12:30${NNBSP}; «${NBSP}oui${NBSP}»`);
  });

  it('cleans spaces, invisible characters, dashes and case', () => {
    expect(removeDoubleSpaces('a  b   c\n  d')).toBe('a b c\n  d');
    expect(zapGremlins('a​b­c\u0007d')).toBe('abcd');
    expect(dashesAndEllipsis('wait... 1--2 --- end')).toBe('wait… 1–2 — end');
    expect(sentenceCase('THE FOX. IT RUNS! yes', 'en')).toBe('The fox. It runs! Yes');
    expect(titleCase('the lord of the rings', 'en')).toBe('The Lord of the Rings');
    expect(titleCase('le rouge et le noir', 'fr')).toBe('Le Rouge et le Noir');
  });
});

describe('DOC-032 text transforms in the editor', async () => {
  const { EditorState, TextSelection } = await import('prosemirror-state');
  const { blocksToPm, pmToBlocks } = await import('../src/document/pm/convert');
  const { transformText } = await import('../src/document/text-tools');
  const state = (texts: string[]) => EditorState.create({ doc: blocksToPm(texts.map((text) => ({ type: 'paragraph' as const, style: 'normal' as const, runs: [{ text }] }))) });
  const texts = (s: InstanceType<typeof EditorState>): string[] => pmToBlocks(s.doc).map((b) => (b.type === 'paragraph' ? b.runs.map((r) => ('text' in r ? r.text : '')).join('') : ''));

  it('joins the lines of text pasted from a PDF', () => {
    const s = state(['The motor turns', 'at constant speed. It is', 'con-', 'trolled.', 'Next paragraph.']);
    expect(texts(s.apply(transformText(s, 'join', 'en')))).toEqual(['The motor turns at constant speed. It is controlled.', 'Next paragraph.']);
  });

  it('keeps the formatting of the parts and changes only the selection', () => {
    const s0 = EditorState.create({ doc: blocksToPm([{ type: 'paragraph', style: 'normal', runs: [{ text: 'the ' }, { text: 'BIG', bold: true }, { text: ' fox. it runs' }] }]) });
    const s1 = s0.apply(transformText(s0, 'sentence', 'en'));
    expect(pmToBlocks(s1.doc)[0]).toMatchObject({ runs: [{ text: 'The ' }, { text: 'big', bold: true }, { text: ' fox. It runs' }] });
    const s2 = s1.apply(s1.tr.setSelection(TextSelection.create(s1.doc, 1, 4)));
    expect(texts(s2.apply(transformText(s2, 'upper', 'en')))).toEqual(['THE big fox. It runs']);
  });
});
