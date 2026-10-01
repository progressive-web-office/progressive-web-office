import { describe, expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { isSafeArchivePath, validateManifest, MDZ_VERSION } from '../src/document/mdz-manifest';
import { readMdz, MdzCancelled } from '../src/document/mdz-reader';
import { writeMdz } from '../src/document/mdz-writer';
import { detectFormat } from '../src/core/format';
import { paragraph } from '../src/document/model';
import { PNG_1PX, richSample } from './fixtures';
import { zipSync, strToU8 } from 'fflate';

const schema = JSON.parse(readFileSync(resolve(process.cwd(), 'schemas/mdz-manifest-1.schema.json'), 'utf8'));
const ajv = new Ajv2020({ strict: true, allowUnionTypes: true });
const schemaValidate = ajv.compile(schema);

const SAMPLES: [unknown, boolean][] = [
  [{ version: '1.1.0', title: 'T' }, true],
  [{ version: '1.0.0', title: 'T', author: null, date: '2025-12-13', filename: 'a.md', assets: [] }, true],
  [{ version: '1.2.0', title: 'T', 'x-app-feature': { a: 1 }, unknown: 3 }, true],
  [{ version: '1.1.0', title: 'T', assets: [{ id: 'i', path: 'assets/images/a.png', type: 'image', alt: 'A' }] }, true],
  [{ version: '2.0.0', title: 'T' }, false],
  [{ title: 'T' }, false],
  [{ version: '1.1.0' }, false],
  [{ version: '1.1.0', title: 3 }, false],
  [{ version: '1.1.0', title: 'T', assets: [{ id: 'i', path: '../evil.png', type: 'image' }] }, false],
  [{ version: '1.1.0', title: 'T', assets: [{ id: 'i', path: '/abs.png', type: 'image' }] }, false],
  [{ version: '1.1.0', title: 'T', assets: [{ id: 'i', path: 'a\\b.png', type: 'image' }] }, false],
  [{ version: '1.1.0', title: 'T', assets: [{ path: 'a.png', type: 'image' }] }, false],
  [[], false],
];

describe('MD-005 manifest schema and validator', () => {
  it('the published JSON Schema is itself valid (draft 2020-12, strict)', () => {
    expect(typeof schemaValidate).toBe('function');
  });

  it.each(SAMPLES)('agrees with the JSON Schema on %j', (sample, valid) => {
    expect(schemaValidate(sample)).toBe(valid);
    expect(validateManifest(sample).ok).toBe(valid);
  });

  it('MD-007 recognises unsafe archive paths', () => {
    expect(isSafeArchivePath('assets/images/a.png')).toBe(true);
    expect(isSafeArchivePath('a/../../b')).toBe(false);
    expect(isSafeArchivePath('/etc/passwd')).toBe(false);
    expect(isSafeArchivePath('C:\\x')).toBe(false);
    expect(isSafeArchivePath('')).toBe(false);
  });
});

const mdzBytes = (files: Record<string, string | Uint8Array>) =>
  zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, typeof v === 'string' ? strToU8(v) : v])));

describe('MD-004 MDZ reader', () => {
  it('reads index.md, manifest metadata and assets', async () => {
    const bytes = mdzBytes({
      'index.md': '# Hello\n\n![An image](./assets/images/img1.png)\n\n[Video](./assets/videos/v.mp4)\n',
      'manifest.json': JSON.stringify({
        version: '1.1.0',
        title: 'Doc',
        author: 'Ada',
        date: '2025-12-13',
        filename: 'doc.md',
        'x-other': true,
        assets: [
          { id: 'img1', path: 'assets/images/img1.png', type: 'image', alt: 'An image' },
          { id: 'vid1', path: 'assets/videos/v.mp4', type: 'video', title: 'Intro' },
        ],
      }),
      'assets/images/img1.png': PNG_1PX,
      'assets/videos/v.mp4': new Uint8Array([0, 0, 0, 1]),
    });
    expect(detectFormat('doc.mdz', bytes)).toBe('mdz');
    const doc = await readMdz(bytes);
    expect(doc.meta).toEqual({ title: 'Doc', author: 'Ada', date: '2025-12-13' });
    expect(doc.blocks[0]).toEqual(paragraph('Hello', { style: 'h1' }));
    expect(doc.resources.size).toBe(1);
  });

  it('MD-006 refuses invalid packages with explanatory messages', async () => {
    await expect(readMdz(mdzBytes({ 'index.md': '', 'manifest.json': '{oops' }))).rejects.toThrow(/manifest\.json.*JSON/i);
    await expect(readMdz(mdzBytes({ 'index.md': '', 'manifest.json': '{"version":"2.0.0","title":"x"}' }))).rejects.toThrow(/version 2/);
    await expect(readMdz(mdzBytes({ 'manifest.json': '{"version":"1.1.0","title":"x"}', 'a.md': '' }))).rejects.toThrow(/index\.md/);
    await expect(readMdz(mdzBytes({ 'index.md': '', 'manifest.json': '{"version":"1.1.0"}' }))).rejects.toThrow(/title/);
  });

  it('MD-007 does not resolve images outside the archive root', async () => {
    const doc = await readMdz(mdzBytes({ 'index.md': '![x](../secret.png)', 'manifest.json': '{"version":"1.1.0","title":"x"}' }));
    expect(doc.resources.size).toBe(0);
  });
});

describe('MD-005/008/009 MDZ writer', () => {
  it('writes index.md, a schema-valid manifest and content-addressed image assets', async () => {
    const bytes = writeMdz(richSample());
    const zip = unzipSync(bytes);
    const manifest = JSON.parse(strFromU8(zip['manifest.json']!));
    expect(schemaValidate(manifest)).toBe(true);
    expect(manifest.version).toBe(MDZ_VERSION);
    expect(manifest.title).toBe('Sample');
    expect(manifest.assets).toHaveLength(1);
    const asset = manifest.assets[0];
    expect(asset).toMatchObject({ type: 'image', alt: 'pixel' });
    expect(asset.path).toMatch(/^assets\/images\/[0-9a-f]{16}\.png$/);
    expect(zip[asset.path]).toEqual(PNG_1PX);
    expect(strFromU8(zip['index.md']!)).toContain(`](./${asset.path})`);
    expect(detectFormat('x.mdz', bytes)).toBe('mdz');
  });

  it('round-trips through readMdz', async () => {
    const doc = richSample();
    const back = await readMdz(writeMdz(doc));
    expect(back.resources.size).toBe(1);
    expect(back.meta.title).toBe('Sample');
  });

  it('MD-009 preserves unknown manifest fields, author and undisplayed assets', async () => {
    const original = mdzBytes({
      'index.md': '# A\n\n[Video](./assets/videos/v.mp4)\n',
      'manifest.json': JSON.stringify({
        version: '1.0.0',
        title: 'A',
        author: 'Ada',
        'x-tool': { keep: true },
        assets: [{ id: 'vid1', path: 'assets/videos/v.mp4', type: 'video', title: 'Intro' }],
      }),
      'assets/videos/v.mp4': new Uint8Array([9]),
    });
    const zip = unzipSync(writeMdz(await readMdz(original)));
    const manifest = JSON.parse(strFromU8(zip['manifest.json']!));
    expect(manifest['x-tool']).toEqual({ keep: true });
    expect(manifest.author).toBe('Ada');
    expect(manifest.assets).toContainEqual({ id: 'vid1', path: 'assets/videos/v.mp4', type: 'video', title: 'Intro' });
    expect(zip['assets/videos/v.mp4']).toEqual(new Uint8Array([9]));
  });
});

describe('MD-014..017 plain ZIP import', () => {
  const plain = (files: Record<string, string | Uint8Array>) => mdzBytes(files);

  it('MD-016 uses the only Markdown file as entry and resolves relative images', async () => {
    const doc = await readMdz(plain({ 'notes/readme.md': '# N\n\n![p](img/p.png)', 'notes/img/p.png': PNG_1PX }));
    expect(doc.resources.size).toBe(1);
    const zip = unzipSync(writeMdz(doc));
    expect(Object.keys(zip)).toContain('index.md');
    expect(Object.keys(zip).some((p) => /^assets\/images\/.+\.png$/.test(p))).toBe(true);
  });

  it('MD-017 asks for the entry when several Markdown files exist, pre-selecting index/README', async () => {
    const calls: [string[], string][] = [];
    const doc = await readMdz(plain({ 'b.md': '# B', 'README.md': '# R', 'a.md': '# A' }), {
      chooseEntry: async (candidates, preselected) => {
        calls.push([candidates, preselected]);
        return 'b.md';
      },
    });
    expect(calls).toEqual([[['a.md', 'b.md', 'README.md'], 'README.md']]);
    expect(doc.blocks[0]).toEqual(paragraph('B', { style: 'h1' }));
    // the other Markdown files are preserved as attached files
    const zip = unzipSync(writeMdz(doc));
    expect(Object.keys(zip)).toEqual(expect.arrayContaining(['assets/files/README.md', 'assets/files/a.md']));
  });

  it('MD-017 does not open the archive when the user cancels', async () => {
    await expect(readMdz(plain({ 'a.md': '', 'b.md': '' }), { chooseEntry: async () => null })).rejects.toBeInstanceOf(MdzCancelled);
  });

  it('rewrites links to other archive files so they keep working in the MDZ', async () => {
    const doc = await readMdz(plain({ 'index.md': '[next](chapter2.md)', 'chapter2.md': '# 2' }));
    const zip = unzipSync(writeMdz(doc));
    expect(strFromU8(zip['index.md']!)).toContain('(./assets/files/chapter2.md)');
  });
});
