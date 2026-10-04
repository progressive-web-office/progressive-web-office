import { expect, test } from '@playwright/test';
import { openApp, openFile, saveAs } from './helpers';

// DOC-046: the document's paper and margins, on screen as on paper.

const px = (mm: number) => (mm * 96) / 25.4;

test('shows the page of the document, and a page break starts the next page (DOC-046)', async ({ page }) => {
  const errors = await openApp(page);
  await openFile(page, 'a5.md', '---\npapersize: a5\ngeometry: "top=15mm,right=20mm,bottom=15mm,left=25mm"\n---\n\nFirst page.\n\n\\newpage\n\nSecond page.\n');
  const sheet = page.getByRole('textbox', { name: 'Document' });
  // A5: 148 mm wide, the left margin 25 mm.
  const box = (await sheet.boundingBox())!;
  expect(Math.abs(box.width - px(148))).toBeLessThan(2);
  const first = (await sheet.locator('p').first().boundingBox())!;
  expect(Math.abs(first.x - box.x - px(25))).toBeLessThan(2);
  // The second page's text starts one text height (210 − 30 mm) below the first's.
  const second = sheet.locator('p', { hasText: 'Second page.' });
  await expect.poll(async () => Math.round((await second.boundingBox())!.y - first.y - px(180))).toBeLessThan(4);
  await expect.poll(async () => Math.round((await second.boundingBox())!.y - first.y - px(180))).toBeGreaterThan(-4);

  // Changed in the page setup: A4 landscape, 2 cm margins.
  await page.getByRole('button', { name: 'Page setup' }).click({ force: true }).catch(async () => {
    await page.keyboard.press('Control+Shift+P');
    await page.getByRole('dialog', { name: 'Commands' }).getByRole('combobox').fill('page setup');
    await page.keyboard.press('Enter');
  });
  const dialog = page.getByRole('dialog', { name: 'Page setup' });
  await dialog.getByLabel('Paper', { exact: true }).selectOption('A4');
  await dialog.getByLabel('Orientation', { exact: true }).selectOption('landscape');
  await dialog.getByLabel('Unit of measure').selectOption('cm');
  for (const side of ['Top', 'Right', 'Bottom', 'Left']) await dialog.getByLabel(side, { exact: true }).fill('2');
  await dialog.getByRole('button', { name: 'OK' }).click();
  await expect.poll(async () => Math.round((await sheet.boundingBox())!.width)).toBe(Math.round(Math.min(px(297), (await page.locator('.doc-scroll').boundingBox())!.width)));
  const md = (await saveAs(page, 'Markdown (.md)')).data.toString();
  expect(md).toContain('papersize: a4\ngeometry: "landscape,margin=20mm"');
  expect(errors).toEqual([]);
});
