import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import * as wasm from '@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler.mjs';
import { TEMPLATES, type Built } from '../src/templates/catalog';
import { readMarkdown } from '../src/document/markdown-reader';
import { fontStandIn, typstString, writeTypst } from '../src/document/typst-writer';
import { createEngine, type TypstEngine } from '../src/pdf/typst-engine';
import type { RichDocument } from '../src/document/model';

// PDF-020: documents typeset as PDF by Typst (here without fonts: the source must compile).

let engine: TypstEngine;
beforeAll(async () => {
  wasm.initSync({ module: readFileSync(resolve('node_modules/@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm')) });
  engine = await createEngine(wasm, []);
}, 60_000);

const pdf = (doc: RichDocument): Uint8Array => engine.typeset(writeTypst(doc, { now: new Date(2026, 9, 4), fileName: 'test.md' }));
const isPdf = (bytes: Uint8Array): boolean => new TextDecoder().decode(bytes.subarray(0, 5)) === '%PDF-';

describe('Typst writer', () => {
  it('writes text as strings, so that nothing in it is markup', () => {
    expect(typstString('a "b" \\ #c\n')).toBe('"a \\"b\\" \\\\ #c\\n"');
    const { source } = writeTypst(readMarkdown('Price: $5 #tag *not bold* @ref <x> // no comment\n'));
    expect(source).toContain('#"Price: $5 #tag ";');
    expect(isPdf(pdf(readMarkdown('Price: $5 #tag \\*not\\* @ref <x> // no comment = [a] - b\n')))).toBe(true);
  });

  it('keeps the page, the headings, lists, tables, footnotes and equations', () => {
    const doc = readMarkdown(
      [
        '---',
        'title: Rapport',
        'lang: fr',
        'papersize: a5',
        'geometry: "landscape,margin=15mm"',
        '---',
        '',
        '# Introduction',
        '',
        'Du **gras**, de l’*italique*, du `code` et un [lien](https://example.org)[^1].',
        '',
        '[^1]: Une note.',
        '',
        '- un',
        '  - deux',
        '1. trois',
        '',
        '| A | B |',
        '|---|---|',
        '| 1 | 2 |',
        '',
        '$$\\frac{a}{b} + \\sqrt{x}$$',
        '',
        'En ligne : $\\alpha^2$.',
        '',
        '> Une citation.',
        '',
        '```',
        'print("x")',
        '```',
      ].join('\n'),
    );
    const out = writeTypst(doc);
    expect(out.source).toContain('#set page(width: 595.28pt, height: 419.53pt');
    expect(out.source).toContain('lang: "fr"');
    expect(out.source).toContain('#heading(level: 1)[#"Introduction";]');
    expect(out.source).toContain('#footnote[#"Une note.";]');
    expect(out.source).toContain('$ a/b + sqrt(x) $');
    expect(out.source).toContain('#table(columns: (1fr, 1fr)');
    expect(out.fonts).toEqual(new Set(['carlito', 'math', 'cousine']));
    expect(isPdf(engine.typeset(out))).toBe(true);
  });

  it('writes an equation Typst refuses as its LaTeX, instead of failing', () => {
    const doc = readMarkdown('Bon : $x^2$, mauvais : $\\unknowncommand{y}$.\n');
    expect(isPdf(pdf(doc))).toBe(true);
  });

  it('uses stand-ins with the widths of the usual fonts', () => {
    expect(fontStandIn('Calibri').family).toBe('Carlito');
    expect(fontStandIn('Arial').family).toBe('Arimo');
    expect(fontStandIn('Times New Roman').family).toBe('Tinos');
    expect(fontStandIn('Courier New').family).toBe('Cousine');
    expect(fontStandIn('Georgia').family).toBe('Tinos');
  });

  // Every template and example of the application typesets.
  const documents = TEMPLATES.filter((t) => t.kind === 'document');
  it.each(documents.map((t) => t.id))('typesets the template %s', (id) => {
    const t = documents.find((x) => x.id === id)!;
    for (const lang of ['en', 'fr'] as const) {
      const built = t.build(lang) as Extract<Built, { kind: 'document' }>;
      expect(isPdf(pdf(built.doc))).toBe(true);
    }
  });
});

describe('Typst engine', () => {
  it('downloads the engine of the version installed', async () => {
    const { TYPST_COMPILER_VERSION, TYPST_WASM } = await import('../src/pdf/typst-pdf');
    const pkg = JSON.parse(readFileSync(resolve('node_modules/@myriaddreamin/typst-ts-web-compiler/package.json'), 'utf8')) as { version: string };
    expect(TYPST_COMPILER_VERSION).toBe(pkg.version);
    expect(TYPST_WASM).toContain(`typst-ts-web-compiler@${pkg.version}/`);
  });
});

describe('Typst downloads', () => {
  it('has the SHA-256 of the engine installed and of every font file', async () => {
    const { createHash } = await import('node:crypto');
    const { TYPST_HASHES } = await import('../src/pdf/typst-hashes');
    const { TYPST_WASM } = await import('../src/pdf/typst-pdf');
    const { FONT_FILES } = await import('../src/pdf/typst-fonts');
    const key = (url: string): string => url.replace('https://cdn.jsdelivr.net/', '');
    const wasmBytes = readFileSync(resolve('node_modules/@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm'));
    expect(TYPST_HASHES[key(TYPST_WASM)]).toBe(createHash('sha256').update(wasmBytes).digest('hex'));
    for (const url of Object.values(FONT_FILES).flat()) expect(TYPST_HASHES[key(url)], url).toMatch(/^[0-9a-f]{64}$/);
  });
});
