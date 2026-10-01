import { expect, test } from '@playwright/test';
import { PDFDocument, StandardFonts } from '@pdfme/pdf-lib';
import { openApp, openFile } from './helpers';

async function samplePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 3; i++) {
    const page = doc.addPage([595, 842]);
    page.drawText(`Hello page ${i}`, { x: 72, y: 760, size: 24, font });
  }
  const field = doc.getForm().createTextField('full_name');
  field.addToPage(doc.getPage(0), { x: 72, y: 700, width: 220, height: 24 });
  const box = doc.getForm().createCheckBox('accept');
  box.addToPage(doc.getPage(0), { x: 72, y: 660, width: 16, height: 16 });
  return Buffer.from(await doc.save());
}

async function download(page: import('@playwright/test').Page): Promise<Buffer> {
  const d = page.waitForEvent('download');
  await page.locator('.header-actions').getByRole('button', { name: 'Save' }).click();
  const stream = await (await d).createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

test('views a PDF, navigates, zooms and selects text (PDF-001..005)', async ({ page }) => {
  const errors = await openApp(page);
  await openFile(page, 'sample.pdf', await samplePdf(), 'application/pdf');
  await expect(page.locator('.pdf-page')).toHaveCount(3);
  await expect(page.locator('.pdf-page').first().locator('canvas')).toBeVisible();
  await expect(page.locator('.pdf-page').first().locator('.textLayer')).toContainText('Hello page 1');
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByLabel('Page number')).toHaveValue('2');
  const before = await page.locator('.pdf-page').first().boundingBox();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect.poll(async () => (await page.locator('.pdf-page').first().boundingBox())!.width).toBeGreaterThan(before!.width);
  expect(errors).toEqual([]);
});

test('fills form fields, adds text and saves a valid PDF (PDF-008, PDF-009, PDF-013)', async ({ page }) => {
  await openApp(page);
  await openFile(page, 'form.pdf', await samplePdf(), 'application/pdf');
  await page.getByLabel('full_name').fill('Ada Lovelace');
  await page.getByLabel('accept').check();
  page.once('dialog', (d) => void d.accept('2026-10-01'));
  await page.getByRole('button', { name: 'Add text' }).click();
  await expect(page.locator('.pdf-stamp.text')).toHaveCount(1);
  const saved = await download(page);
  const doc = await PDFDocument.load(saved);
  expect(doc.getForm().getTextField('full_name').getText()).toBe('Ada Lovelace');
  expect(doc.getForm().getCheckBox('accept').isChecked()).toBe(true);
  expect(doc.getPageCount()).toBe(3);
});

test('draws a handwritten signature, places it and saves it into the PDF (PDF-011, PDF-012)', async ({ page }) => {
  await openApp(page);
  await openFile(page, 'sign.pdf', await samplePdf(), 'application/pdf');
  await page.getByRole('button', { name: 'Add signature' }).click();
  const pad = page.getByLabel('Signature drawing area');
  const box = (await pad.boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + 60);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) await page.mouse.move(box.x + 30 + i * 15, box.y + 60 + Math.sin(i) * 25);
  await page.mouse.up();
  await page.getByRole('button', { name: 'Place signature' }).click();
  const stamp = page.locator('.pdf-stamp.image');
  await expect(stamp).toHaveCount(1);
  // move it with the keyboard
  await stamp.focus();
  await page.keyboard.press('Shift+ArrowDown');
  const saved = await download(page);
  const doc = await PDFDocument.load(saved);
  const { PDFName } = await import('@pdfme/pdf-lib');
  expect(doc.getPage(0).node.Resources()?.lookup(PDFName.of('XObject'))).toBeDefined();
});
