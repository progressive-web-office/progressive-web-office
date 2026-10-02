import { expect, test } from '@playwright/test';
import { PDFDocument, StandardFonts } from '@pdfme/pdf-lib';
import { openApp, openFile } from './helpers';

async function pdf(pages: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i++) doc.addPage([595, 842]).drawText(`Page ${i}`, { x: 72, y: 760, size: 24, font });
  return Buffer.from(await doc.save());
}

test('keeps settings by category: two whole pages side by side, page by page, in review mode (SET-001, SET-002)', async ({ page }) => {
  const errors = await openApp(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog.getByRole('tab', { name: 'General' })).toHaveAttribute('aria-selected', 'true');
  await dialog.getByLabel('Your name').fill('Ann Lee');
  await dialog.getByLabel('Your name').press('Tab');
  await dialog.getByRole('tab', { name: 'Reading and review' }).click();
  await dialog.getByLabel('Pages side by side').selectOption('2');
  await dialog.getByLabel('Zoom').selectOption('page');
  await dialog.getByLabel('Page layout').selectOption('pages');
  await dialog.getByLabel('Remember the last choice made in the toolbar').uncheck();
  await dialog.getByLabel('Open PDF files in review mode').check();
  await dialog.getByRole('button', { name: 'Close' }).click();

  await openFile(page, 'report.pdf', await pdf(5), 'application/pdf');
  await expect(page.locator('.pdf-page:visible')).toHaveCount(2);
  await expect(page.getByRole('combobox', { name: 'Pages side by side' })).toHaveValue('2');
  await expect(page.getByRole('button', { name: 'Review mode' })).toHaveAttribute('aria-pressed', 'true');
  // A choice of the toolbar is not kept: the settings are.
  await page.getByRole('combobox', { name: 'Pages side by side' }).selectOption('1');
  await page.reload();
  await openFile(page, 'report.pdf', await pdf(5), 'application/pdf');
  await expect(page.getByRole('combobox', { name: 'Pages side by side' })).toHaveValue('2');

  // The settings are found in the palette too, and kept.
  await page.keyboard.press('Control+Shift+P');
  await page.getByRole('dialog', { name: 'Commands' }).getByRole('combobox').fill('paramètres');
  await page.keyboard.press('Enter');
  await expect(dialog.getByLabel('Your name')).toHaveValue('Ann Lee');
  await dialog.getByRole('tab', { name: 'Reading and review' }).click();
  await expect(dialog.getByLabel('Page layout')).toHaveValue('pages');
  expect(errors).toEqual([]);
});
