import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { openApp, openFile } from './helpers';

/**
 * PDF-020: a text document typeset as a PDF by Typst in the browser. The
 * engine and the fonts come from the CDN (CI); `TYPST_LOCAL=<dir>` serves
 * them from a folder instead (the wasm from node_modules, the fonts from
 * `<dir>/typst-assets` and `<dir>/node_modules/@expo-google-fonts`).
 */
const local = process.env.TYPST_LOCAL;

test('typesets a document as a PDF, after asking to download the engine (PDF-020)', async ({ page, context }) => {
  test.setTimeout(180_000);
  test.skip(!local && !process.env.CI, 'needs the network (CI) or TYPST_LOCAL for the engine and the fonts');
  if (local) {
    await context.route('https://cdn.jsdelivr.net/**', async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname.includes('typst-ts-web-compiler')
        ? 'node_modules/@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm'
        : url.pathname.includes('typst-assets')
          ? join(local, 'typst-assets', url.pathname.replace(/^.*typst-assets@[^/]+\//, ''))
          : join(local, 'node_modules', url.pathname.replace(/^\/npm\//, '').replace(/@[\d.]+\//, '/'));
      if (!existsSync(path)) return route.fulfill({ status: 404, body: path });
      await route.fulfill({ status: 200, body: readFileSync(path), headers: { 'content-type': 'application/octet-stream', 'access-control-allow-origin': '*' } });
    });
  }
  const errors = await openApp(page);
  await openFile(page, 'rapport.md', '---\ntitle: Rapport\nlang: fr\n---\n\n# Introduction\n\nDu **gras**, une note[^1] et $\\frac{a}{b}$.\n\n[^1]: La note.\n\n| A | B |\n|---|---|\n| 1 | 2 |\n');
  await expect(page.getByRole('textbox', { name: 'Document' })).toContainText('Introduction');
  const download = page.waitForEvent('download', { timeout: 150_000 });
  await page.getByLabel('Save as format').selectOption({ label: 'PDF (.pdf), typeset' });
  const ask = page.getByRole('dialog', { name: 'Typeset the PDF?' });
  await expect(ask).toBeVisible();
  await ask.getByRole('button', { name: 'Download and typeset' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('rapport.pdf');
  const stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  const pdf = Buffer.concat(chunks);
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  // The text is there, selectable, in the embedded fonts.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf) }).promise;
  const text = (await (await doc.getPage(1)).getTextContent()).items.map((i) => ('str' in i ? i.str : '')).join(' ');
  expect(text).toContain('Introduction');
  expect(text).toContain('gras');
  // A second time, nothing is asked: the engine is kept.
  const again = page.waitForEvent('download', { timeout: 60_000 });
  await page.getByLabel('Save as format').selectOption({ label: 'PDF (.pdf), typeset' });
  await again;
  expect(errors).toEqual([]);
});
