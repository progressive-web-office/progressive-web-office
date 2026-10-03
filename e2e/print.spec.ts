import { expect, test } from '@playwright/test';
import { openApp, openFile } from './helpers';

test('print preview for a document with page settings (PRINT-001..003)', async ({ page }) => {
  const errors = await openApp(page);
  // DOC-046: the document's own paper, landscape.
  await openFile(page, 'report.md', '---\npapersize: a4\ngeometry: "landscape,top=15mm,right=20mm,bottom=15mm,left=20mm"\n---\n\n# Report\n\nSome text with $x^2$.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n');
  await page.getByRole('button', { name: 'Print', exact: true }).click();
  const dialog = page.locator('.print-dialog');
  await expect(dialog).toBeVisible();
  const frame = page.frameLocator('.print-frame');
  await expect(frame.locator('h1')).toHaveText('Report');
  await expect(frame.locator('table')).toHaveCount(1);
  await expect(dialog).toContainText('Paper of the document: 297 × 210 mm');
  await expect(dialog.locator('select[name="orientation"]')).toHaveCount(0);
  await expect.poll(() => frame.locator('style.page-style').evaluate((e) => e.textContent)).toContain('size: 297mm 210mm; margin: 15mm 20mm 15mm 20mm;');
  // Stub the real print dialog and check it is invoked on the preview frame.
  await page.evaluate(() => {
    const f = document.querySelector<HTMLIFrameElement>('.print-frame')!;
    (f.contentWindow as Window & { print: () => void }).print = () => ((window as unknown as { printed: boolean }).printed = true);
  });
  await dialog.getByRole('button', { name: 'Print…' }).click();
  expect(await page.evaluate(() => (window as unknown as { printed?: boolean }).printed)).toBe(true);
  expect(errors).toEqual([]);
});

test('spreadsheet and presentation print previews (PRINT-004, PRINT-005)', async ({ page }) => {
  await openApp(page);
  await openFile(page, 'data.csv', 'a,b\n1,2\n', 'text/csv');
  await page.getByRole('button', { name: 'Print', exact: true }).click();
  await page.locator('.print-dialog').getByLabel('Row and column headings').check();
  await expect(page.frameLocator('.print-frame').locator('thead th')).toHaveCount(3);
  await page.locator('.print-dialog').getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'New presentation' }).click();
  await page.getByRole('button', { name: 'New slide' }).click();
  await page.getByRole('button', { name: 'Print', exact: true }).click();
  await page.locator('.print-dialog select[name="slidesPerPage"]').selectOption('2');
  await expect(page.frameLocator('.print-frame').locator('.print-page')).toHaveCount(1);
  await expect(page.frameLocator('.print-frame').locator('.slide-frame')).toHaveCount(2);
});
