import { describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { ACCEPTED_EXTENSIONS, detectFormat } from '../src/core/format';
import { readDocument } from '../src/document/io';
import { allParagraphs, isImageRun } from '../src/document/model';

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 10, 73, 68, 65, 84, 120, 156, 99, 0, 1, 0, 0, 5, 0, 1, 13, 10, 45, 180, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);

const textpack = (root: string) =>
  zipSync({
    [`${root}info.json`]: strToU8(JSON.stringify({ version: 2, type: 'net.daringfireball.markdown', transient: false })),
    [`${root}text.md`]: strToU8('# Trip\n\nA picture: ![sea](assets/sea.png)\n'),
    [`${root}assets/sea.png`]: PNG,
    [`${root}assets/notes.md`]: strToU8('# Not the text\n'),
  });

describe('MD-011 TextBundle import', () => {
  it('accepts .textpack files', () => {
    expect(ACCEPTED_EXTENSIONS).toContain('.textpack');
  });

  it.each(['', 'Trip.textbundle/'])('reads the text and its assets (%s)', async (root) => {
    const bytes = textpack(root);
    expect(detectFormat('Trip.textpack', bytes)).toBe('mdz');
    const asked: string[][] = [];
    const doc = await readDocument('mdz', bytes, { chooseEntry: async (c) => (asked.push(c), null) });
    expect(asked).toEqual([]);
    const paras = allParagraphs(doc.blocks);
    expect(paras[0]!.runs).toMatchObject([{ text: 'Trip' }]);
    const image = paras.flatMap((p) => p.runs).find(isImageRun);
    expect(image && doc.resources.get(image.image)?.data.length).toBe(PNG.length);
  });
});
