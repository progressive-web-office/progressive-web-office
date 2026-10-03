import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isKaimonSlate, readKaimonSlate, writeKaimonSlate } from '../src/document/kslate';
import type { Paragraph } from '../src/document/model';

const NB = `#%% md id=intro
# 🎛 Widgets

Drag the **sliders**.

#%% code id=controls collapsed
@bind n Slider(20:5:200)

#%% md id=more
* a list kept as written

#%% code id=wave
xs = range(0, 2π; length = Int(n))
`;

describe('DOC-038 KaimonSlate notebooks', () => {
  it('recognises a notebook by its first cell header', () => {
    expect(isKaimonSlate(NB)).toBe(true);
    expect(isKaimonSlate('\n#%% code\nx = 1')).toBe(true);
    expect(isKaimonSlate('using Plots\n#%% code\n')).toBe(false);
    expect(isKaimonSlate('x = 1')).toBe(false);
  });

  it('reads text cells as paragraphs and code cells as Julia cells, headers kept', () => {
    const doc = readKaimonSlate(NB);
    expect(doc.meta.title).toBe('🎛 Widgets');
    const [h1, p, code] = doc.blocks as Paragraph[];
    expect(h1).toMatchObject({ style: 'h1', cellHeader: 'md id=intro' });
    expect(p!.runs).toEqual([{ text: 'Drag the ' }, { text: 'sliders', bold: true }, { text: '.' }]);
    expect(code!.runs).toEqual([{ cell: '@bind n Slider(20:5:200)', lang: 'julia', header: 'code id=controls collapsed' }]);
  });

  it('gives the file back when nothing changed, and writes edits in place', () => {
    expect(writeKaimonSlate(readKaimonSlate(NB))).toBe(NB);
    const doc = readKaimonSlate(NB);
    (doc.blocks[1] as Paragraph).runs = [{ text: 'Move them.' }];
    const out = writeKaimonSlate(doc);
    expect(out).toContain('#%% md id=intro\n# 🎛 Widgets\n\nMove them.\n\n#%% code id=controls collapsed\n');
    expect(out).toContain('#%% md id=more\n* a list kept as written');
  });

  it('round-trips the example notebooks of KaimonSlate', () => {
    const dir = process.env.KSLATE_EXAMPLES;
    if (!dir) return;
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.jl'))) {
      const text = readFileSync(`${dir}/${f}`, 'utf8');
      if (!isKaimonSlate(text)) continue;
      const norm = (s: string) => s.replace(/\r\n/g, '\n').replace(/\n+(?=#%%)/g, '\n').trim();
      expect(norm(writeKaimonSlate(readKaimonSlate(text))), f).toBe(norm(text));
    }
  });
});
