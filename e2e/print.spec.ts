import { expect, test } from '@playwright/test';
import { openApp, openFile } from './helpers';

test('print preview for a document with page settings (PRINT-001..003)', async ({ page }) => {
  const errors = await openApp(page);
  await openFile(page, 'report.md', '# Report\n\nSome text with $x^2$.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n');
  await page.getByRole('button', { name: 'Print', exact: true }).click();
  const dialog = page.locator('.print-dialog');
  await expect(dialog).toBeVisible();
  const frame = page.frameLocator('.print-frame');
  await expect(frame.locator('h1')).toHaveText('Report');
  await expect(frame.locator('table')).toHaveCount(1);
  await dialog.locator('select[name="orientation"]').selectOption('landscape');
  await expect.poll(() => frame.locator('style.page-style').evaluate((e) => e.textContent)).toMatch(/297mm 210mm|279.4mm 215.9mm/);
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
