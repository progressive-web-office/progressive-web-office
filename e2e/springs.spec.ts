import { expect, test } from '@playwright/test';
import { openApp, openFile, saveAs } from './helpers';

// DOC-042: springs as in LaTeX, vertical and horizontal.

test('a vertical spring fills the page, a horizontal one the line, and they are kept in files (DOC-042)', async ({ page }) => {
  const errors = await openApp(page);
  await openFile(page, 'springs.md', 'Jeanne Martin \\hfill Paris\n\n\\vfill\n\nP. J. : CV\n');
  const editor = page.locator('.doc-page');
  const spring = editor.locator('.space.spring');
  await expect(spring).toHaveCount(1);
  // The page is full: from the first line to the last, the height of the printed page's text.
  // The printed page's text: A4 or Letter (by the browser's language), 15 mm margins.
  const letter = await page.evaluate(() => /^en-(US|CA)$|^es-(MX|US)$/.test(navigator.language));
  const pageHeight = (((letter ? 279.4 : 297) - 40) * 96) / 25.4; // the default page: 2 cm margins (DOC-046)
  await expect.poll(async () => (await spring.boundingBox())!.height).toBeGreaterThan(500);
  const first = (await editor.locator('p').first().boundingBox())!;
  const last = (await editor.locator('p').last().boundingBox())!;
  const span = last.y + last.height - first.y;
  expect(Math.abs(span - pageHeight)).toBeLessThan(30);
  // "Paris" at the end of its line.
  const line = editor.locator('p.has-hfill');
  const lineBox = (await line.boundingBox())!;
  const paris = await line.evaluate((p) => {
    const range = document.createRange();
    const text = [...p.childNodes].at(-1)!;
    range.selectNodeContents(text);
    return range.getBoundingClientRect().right;
  });
  expect(lineBox.x + lineBox.width - paris).toBeLessThan(4);

  // Typed as in LaTeX.
  await editor.locator('p').last().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' \\hfill sign');
  await expect(editor.locator('.hfill')).toHaveCount(2);
  await page.keyboard.press('Enter');
  await page.keyboard.type('\\vspace{2cm}');
  await page.keyboard.press('Enter');
  await expect(editor.locator('.space:not(.spring)')).toHaveCount(1);

  // Kept in Markdown, OpenDocument (with the height shown) and Word.
  const md = (await saveAs(page, 'Markdown (.md)')).data.toString('utf8');
  expect(md).toContain('Jeanne Martin \\hfill Paris');
  expect(md).toContain('\n\\vfill\n');
  expect(md).toContain('\\vspace{56.69pt}');
  const odt = await saveAs(page, 'OpenDocument text (.odt)');
  await page.locator('.header-actions').getByRole('button', { name: 'Close' }).click();
  await openFile(page, 'springs.odt', odt.data);
  await expect(page.locator('.doc-page .space.spring')).toHaveCount(1);
  await expect(page.locator('.doc-page .hfill')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('gives a spring its share of the free space in percent, and a space a share of the page (DOC-042)', async ({ page }) => {
  const errors = await openApp(page);
  await openFile(page, 'shares.md', 'Top\n\n\\vfill\n\nMiddle\n\n\\vfill\n\nBottom\n');
  const springs = page.locator('.doc-page .space.spring');
  await expect(springs).toHaveCount(2);
  await expect.poll(async () => (await springs.first().boundingBox())!.height).toBeGreaterThan(100);
  // Double click: the share of the free space, here half of it.
  await springs.first().dblclick();
  const dialog = page.getByRole('dialog', { name: 'Springs and spaces' });
  const share = dialog.getByLabel('Share of the free space');
  await expect(share).toHaveValue('50');
  await share.fill('30');
  await expect(dialog.getByLabel('Weight')).toHaveValue('0.429');
  await dialog.getByRole('button', { name: 'OK' }).click();
  await expect
    .poll(async () => {
      const [a, b] = [(await springs.nth(0).boundingBox())!.height, (await springs.nth(1).boundingBox())!.height];
      return Math.round((100 * a) / (a + b));
    })
    .toBe(30);

  // The second becomes a fixed space of a quarter of the page.
  await springs.nth(1).dblclick();
  await dialog.getByLabel('Fixed height').check();
  await dialog.getByLabel('Unit').selectOption({ label: '% of the page height' });
  await dialog.getByLabel('Height', { exact: true }).fill('25');
  await dialog.getByRole('button', { name: 'OK' }).click();
  const letter = await page.evaluate(() => /^en-(US|CA)$|^es-(MX|US)$/.test(navigator.language));
  const pageHeight = (((letter ? 279.4 : 297) - 40) * 96) / 25.4; // the default page: 2 cm margins (DOC-046)
  const fixed = page.locator('.doc-page .space:not(.spring)');
  await expect.poll(async () => Math.abs((await fixed.boundingBox())!.height - pageHeight / 4)).toBeLessThan(3);
  const md = (await saveAs(page, 'Markdown (.md)')).data.toString();
  expect(md).toContain('\\vspace{\\stretch{0.429}}');
  expect(md).toContain('\\vspace{0.25\\textheight}');
  expect(errors).toEqual([]);
});
