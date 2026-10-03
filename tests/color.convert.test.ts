import { describe, expect, it } from 'vitest';
import { cmykToHex, hexToCmyk, hexToRgb, inPrintGamut, labToHex, hexToLab, proofColor, rgbToHex, totalInk } from '../src/color/convert';

describe('COLOR-001 colour values', () => {
  it('reads and writes hexadecimal colours', () => {
    expect(hexToRgb('#C00000')).toEqual([192, 0, 0]);
    expect(hexToRgb('#abc')).toEqual([170, 187, 204]);
    expect(hexToRgb('nope')).toBeUndefined();
    expect(rgbToHex([192, 0, 0])).toBe('#c00000');
    expect(rgbToHex([300, -4, 15.6])).toBe('#ff0010');
  });

  it('converts between RGB and CMYK (device values, in percent)', () => {
    expect(hexToCmyk('#ffffff')).toEqual([0, 0, 0, 0]);
    expect(hexToCmyk('#000000')).toEqual([0, 0, 0, 100]);
    expect(hexToCmyk('#ff0000')).toEqual([0, 100, 100, 0]);
    expect(hexToCmyk('#00a0e0')).toEqual([100, 28.6, 0, 12.2]);
    expect(cmykToHex([0, 100, 100, 0])).toBe('#ff0000');
    expect(cmykToHex([100, 28.6, 0, 12.2])).toBe('#00a0e0');
    expect(totalInk([60, 40, 40, 100])).toBe(240);
  });

  it('converts to CIELAB and back', () => {
    const [l, a, b] = hexToLab('#ffffff');
    expect(l).toBeCloseTo(100, 0);
    expect(Math.abs(a) + Math.abs(b)).toBeLessThan(0.5);
    expect(hexToLab('#808080')[0]).toBeCloseTo(53.6, 0);
    for (const hex of ['#c00000', '#00a0e0', '#336699', '#f0e68c']) expect(labToHex(hexToLab(hex))).toBe(hex);
  });
});

describe('COLOR-002 colours for print', () => {
  it('tells the screen colours a press cannot print', () => {
    for (const hex of ['#0000ff', '#00ff00', '#ff00ff']) expect(inPrintGamut(hex)).toBe(false);
    for (const hex of ['#808080', '#000000', '#ffffff', '#336699', '#f2d0a4']) expect(inPrintGamut(hex)).toBe(true);
  });

  it('shows them as they would print: same hue, less vivid', () => {
    expect(proofColor('#336699')).toBe('#336699');
    const blue = proofColor('#0000ff');
    expect(blue).not.toBe('#0000ff');
    expect(inPrintGamut(blue)).toBe(true);
    const [, a1, b1] = hexToLab('#0000ff');
    const [, a2, b2] = hexToLab(blue);
    expect(Math.hypot(a2, b2)).toBeLessThan(Math.hypot(a1, b1));
    // The hue is kept (within a few degrees).
    const hue = (a: number, b: number) => (Math.atan2(b, a) * 180) / Math.PI;
    expect(Math.abs(hue(a1, b1) - hue(a2, b2))).toBeLessThan(8);
  });
});

describe('COLOR-001 colours in LaTeX (xcolor)', () => {
  it('reads the models of xcolor', async () => {
    const { latexColor } = await import('../src/color/convert');
    expect(latexColor('HTML', 'C00000')).toBe('#c00000');
    expect(latexColor('rgb', '1,0.5,0')).toBe('#ff8000');
    expect(latexColor('RGB', '0,112,192')).toBe('#0070c0');
    expect(latexColor('cmyk', '1,0.286,0,0.122')).toBe('#00a0e0');
    expect(latexColor('gray', '0.5')).toBe('#808080');
    expect(latexColor(undefined, 'red')).toBe('#ff0000');
    expect(latexColor(undefined, 'blue!20')).toBe('#ccccff');
    expect(latexColor(undefined, 'unknown')).toBeUndefined();
  });

  it('writes and reads coloured and highlighted text', async () => {
    const { readDocument, writeDocument } = await import('../src/document/io');
    const { allParagraphs, isTextRun } = await import('../src/document/model');
    const doc = { meta: {}, resources: new Map(), blocks: [{ type: 'paragraph' as const, style: 'normal' as const, runs: [{ text: 'red', color: '#c00000' }, { text: ' and ' }, { text: 'marked', highlight: '#ffff00' }] }] };
    const tex = new TextDecoder().decode(writeDocument(doc, 'tex'));
    expect(tex).toContain('\\usepackage{xcolor}');
    expect(tex).toContain('\\textcolor[HTML]{C00000}{red}');
    expect(tex).toContain('\\colorbox[HTML]{FFFF00}{marked}');
    const back = await readDocument('tex', new TextEncoder().encode(tex.replace('[HTML]{C00000}', '[cmyk]{0,1,1,0.25}')));
    const runs = allParagraphs(back.blocks).flatMap((p) => p.runs.filter(isTextRun));
    expect(runs.find((r) => r.text === 'red')?.color).toBe('#bf0000');
    expect(runs.find((r) => r.text === 'marked')?.highlight).toBe('#ffff00');
  });
});
