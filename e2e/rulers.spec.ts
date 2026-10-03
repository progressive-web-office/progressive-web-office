import { expect, test } from '@playwright/test';
import { openApp, openFile, saveAs } from './helpers';

// DOC-047: graduated rulers around the page.

test.use({ viewport: { width: 1280, height: 900 }, locale: 'en-GB' });

test('rulers in centimetres show the paper and its margins, and drag them and the indents (DOC-047)', async ({ page }) => {
  const errors = await openApp(page);
  await openFile(page, 'r.md', '---\npapersize: a4\ngeometry: "margin=20mm"\n---\n\nUn paragraphe.\n\nUn autre.\n');
  const ruler = page.getByRole('group', { name: 'Horizontal ruler' });
  await expect(ruler).toBeVisible();
  await expect(page.getByRole('group', { name: 'Vertical ruler' })).toBeVisible();
  // 21 cm of paper: labels 1 to 20.
  await expect(ruler.locator('text')).toHaveCount(20);
  await page.screenshot({ path: 'test-results/rulers.png' });
  // The left margin, one centimetre further.
  const left = ruler.getByRole('slider', { name: 'Left margin' });
  const box = (await left.boundingBox())!;
  const mm = (await ruler.boundingBox())!.width / 210;
  await page.mouse.move(box.x + box.width / 2, box.y + 5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 5 * mm, box.y + 5);
  await page.mouse.move(box.x + box.width / 2 + 10 * mm, box.y + 5);
  await page.mouse.up();
  await expect(left).toHaveAttribute('aria-valuenow', /^(29\.\d|30|30\.\d)$/);
  // The first line of the paragraph indented by 1 cm with the keyboard (10 × 1 mm).
  await page.getByRole('textbox', { name: 'Document' }).locator('p').first().click();
  const first = ruler.getByRole('slider', { name: 'First line' });
  await first.focus();
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
  await expect.poll(async () => page.getByRole('textbox', { name: 'Document' }).locator('p').first().evaluate((p) => getComputedStyle(p).textIndent)).toMatch(/^3[78]\.\d+px$/);
  const md = (await saveAs(page, 'Markdown (.md)')).data.toString();
  expect(md).toMatch(/geometry: "top=20mm,right=20mm,bottom=20mm,left=(29\.\d|30|30\.\d)mm"/);
  // Hidden from the View menu.
  await page.getByLabel('View', { exact: true }).first().selectOption({ label: '✓ Rulers' });
  await expect(ruler).toBeHidden();
  expect(errors).toEqual([]);
});
