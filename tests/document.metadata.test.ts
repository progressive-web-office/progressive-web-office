import { describe, expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { parseFrontMatter, writeFrontMatter } from '../src/document/frontmatter';
import { readDocument, writeDocument } from '../src/document/io';
import { writeLatex } from '../src/document/latex-writer';
import { readLatex } from '../src/document/latex-reader';
import { emptyDocument, paragraph, type DocumentMeta, type RichDocument } from '../src/document/model';

const META: DocumentMeta = {
  title: 'Rapport annuel',
  author: 'Ada Lovelace',
  date: '2026-09-30',
  subject: 'Bilan',
  description: 'Résumé des activités: "2026"',
  keywords: ['bilan', 'énergie', 'a, b'],
  language: 'fr',
  license: 'CC-BY-4.0',
};

const docWith = (meta: DocumentMeta): RichDocument => ({ ...emptyDocument(), blocks: [paragraph('Rapport', { style: 'h1' }), paragraph('Texte.')], meta: { ...meta } });

describe('DOC-018 YAML front matter', () => {
  it('parses scalars, quoted strings, inline and block lists, and keeps unknown keys', () => {
    const text = `---
title: "Mon titre: suite"
author: Ada
date: 2026-09-30
keywords: [un, "deux, trois"]
tags:
  - x
  - y
lang: fr
description: >-
  plié
custom: 42
---
# Corps
`;
    const fm = parseFrontMatter(text);
    expect(fm.meta).toEqual({ title: 'Mon titre: suite', author: 'Ada', date: '2026-09-30', keywords: ['un', 'deux, trois'], language: 'fr' });
    expect(fm.body).toBe('# Corps\n');
    // Not understood (or not ours): kept verbatim, in order.
    expect(fm.extra).toBe('tags:\n  - x\n  - y\ndescription: >-\n  plié\ncustom: 42');
  });

  it('returns the text untouched without front matter', () => {
    expect(parseFrontMatter('# Hi\n---\n')).toEqual({ meta: {}, extra: '', body: '# Hi\n---\n' });
    // A rule followed by ordinary text (a setext heading) is Markdown, not YAML.
    const hr = '---\nJust a paragraph\n---\n\nMore.\n';
    expect(parseFrontMatter(hr)).toEqual({ meta: {}, extra: '', body: hr });
  });

  it('writes YAML that reads back identically', () => {
    const yaml = writeFrontMatter(META, 'custom: 42');
    expect(yaml.startsWith('---\ntitle: Rapport annuel\n')).toBe(true);
    expect(yaml.endsWith('custom: 42\n---\n\n')).toBe(true);
    expect(parseFrontMatter(yaml + 'x').meta).toEqual(META);
    expect(writeFrontMatter({}, '')).toBe('');
  });
});

describe('DOC-017 metadata in every format', () => {
  it('Markdown: front matter round-trip; no front matter for a plain heading title', async () => {
    const md = strFromU8(writeDocument(docWith(META), 'md'));
    expect(md.startsWith('---\n')).toBe(true);
    expect((await readDocument('md', new TextEncoder().encode(md))).meta).toEqual(META);
    const plain = strFromU8(writeDocument(docWith({ title: 'Rapport' }), 'md'));
    expect(plain.startsWith('# Rapport')).toBe(true);
  });

  it('Markdown: unknown front matter keys survive a round-trip', async () => {
    const src = '---\ntitle: T\ncustom: 42\n---\n\nHello\n';
    const doc = await readDocument('md', new TextEncoder().encode(src));
    expect(strFromU8(writeDocument(doc, 'md'))).toContain('custom: 42');
  });

  it('DOCX: core properties round-trip, creation date preserved', async () => {
    const bytes = writeDocument(docWith(META), 'docx');
    const core = strFromU8(unzipSync(bytes)['docProps/core.xml']!);
    expect(core).toContain('<cp:keywords>bilan, énergie, a, b</cp:keywords>');
    expect(core).toContain('<dcterms:created xsi:type="dcterms:W3CDTF">2026-09-30');
    const { license: _license, keywords: _k, ...rest } = META;
    // OOXML has no licence property; keywords are a single comma-separated string.
    expect((await readDocument('docx', bytes)).meta).toEqual({ ...rest, keywords: ['bilan', 'énergie', 'a', 'b'] });
  });

  it('ODT: meta.xml round-trip including the licence', async () => {
    const bytes = writeDocument(docWith(META), 'odt');
    const meta = strFromU8(unzipSync(bytes)['meta.xml']!);
    expect(meta).toContain('<meta:keyword>a, b</meta:keyword>');
    expect((await readDocument('odt', bytes)).meta).toEqual(META);
  });

  it('MDZ: manifest fields valid against the JSON Schema', async () => {
    const bytes = writeDocument(docWith(META), 'mdz');
    const manifest = JSON.parse(strFromU8(unzipSync(bytes)['manifest.json']!));
    expect(manifest).toMatchObject({ title: 'Rapport annuel', author: 'Ada Lovelace', date: '2026-09-30', subject: 'Bilan', description: META.description, keywords: META.keywords, language: 'fr', license: 'CC-BY-4.0' });
    const schema = JSON.parse(readFileSync(resolve(process.cwd(), 'schemas/mdz-manifest-1.schema.json'), 'utf8'));
    const validate = new Ajv2020({ strict: true, allowUnionTypes: true }).compile(schema);
    expect(validate(manifest), JSON.stringify(validate.errors)).toBe(true);
    // index.md carries no duplicate front matter.
    expect(strFromU8(unzipSync(bytes)['index.md']!).startsWith('---')).toBe(false);
    expect((await readDocument('mdz', bytes)).meta).toEqual(META);
  });

  it('LaTeX: title page and PDF metadata, read back', () => {
    const { tex } = writeLatex(docWith(META));
    expect(tex).toContain('\\date{2026-09-30}');
    expect(tex).toContain('pdfkeywords={bilan, énergie, a, b}');
    expect(tex).toContain('pdflang={fr}');
    const back = readLatex(tex).meta;
    expect(back).toMatchObject({ title: 'Rapport annuel', author: 'Ada Lovelace', date: '2026-09-30', subject: 'Bilan', keywords: ['bilan', 'énergie', 'a', 'b'], language: 'fr' });
  });
});

describe('COLLAB-008 document identifier', () => {
  const ID = '0f8c2b1e-5d4a-4c3b-9a21-7e6f5d4c3b2a';
  for (const format of ['md', 'docx', 'odt'] as const) {
    it(`${format}: the identifier survives a round-trip`, async () => {
      const back = await readDocument(format, writeDocument(docWith({ ...META, identifier: ID }), format));
      expect(back.meta.identifier).toBe(ID);
      expect(back.meta.title).toBe(META.title);
    });
  }
});
