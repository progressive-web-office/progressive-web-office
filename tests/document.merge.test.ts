import { describe, expect, it } from 'vitest';
import { mergeAll, mergeFields, mergeNames, mergeOne, mergeTable } from '../src/document/merge';
import { emptyDocument, paragraph, type Paragraph, type RichDocument } from '../src/document/model';
import { readCsv } from '../src/sheet/csv';

const letter = (): RichDocument => ({
  ...emptyDocument(),
  blocks: [
    paragraph('Dear {{First name}} {{Name}},'),
    { type: 'paragraph', style: 'normal', runs: [{ text: 'Your mark: {{' }, { text: 'Mark', bold: true }, { text: '}}/20, {{=1+1}}.' }] },
  ],
});
const text = (p: unknown): string => (p as Paragraph).runs.map((r) => ('text' in r ? r.text : '')).join('');

describe('DOC-036 mail merge', () => {
  it('lists the fields of the document, not the expressions of variants', () => {
    expect(mergeFields(letter())).toEqual(['First name', 'Name', 'Mark']);
  });

  it('reads the rows of a table named by its first row', () => {
    const t = mergeTable(readCsv(new TextEncoder().encode('Name,First name,Mark\nCurie,Marie,18\n,,\nNoether,Emmy,19.5\n')));
    expect(t.fields).toEqual(['Name', 'First name', 'Mark']);
    expect(t.rows).toEqual([
      { Name: 'Curie', 'First name': 'Marie', Mark: '18' },
      { Name: 'Noether', 'First name': 'Emmy', Mark: '19.5' },
    ]);
  });

  it('fills a document with a row, fields split by formatting included', () => {
    const one = mergeOne(letter(), { Name: 'Curie', 'First name': 'Marie', Mark: '18' });
    expect(one.blocks.map(text)).toEqual(['Dear Marie Curie,', 'Your mark: 18/20, 2.']);
    // The source is untouched.
    expect(text(letter().blocks[1])).toBe('Your mark: {{Mark}}/20, {{=1+1}}.');
  });

  it('puts every row in one document, a page each, and names the files', () => {
    const rows = [{ Name: 'Curie' }, { Name: 'Noether' }];
    const all = mergeAll(letter(), rows);
    expect(all.blocks).toHaveLength(5);
    expect(all.blocks[2]).toEqual({ type: 'rule', page: true });
    expect(mergeNames([{ Name: 'Curie' }, { Name: 'Curie' }, { Name: 'a/b' }, { Name: '' }], 'Name', 'letter')).toEqual(['Curie', 'Curie (2)', 'a-b', 'letter-4']);
  });
});
