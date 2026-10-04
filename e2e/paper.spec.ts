import { expect, test } from '@playwright/test';
import { openApp, openFile } from './helpers';

// UI-023: the paper of documents on screen — as the theme, light or dark.

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVQI12P4z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64');

test('shows a document on dark paper, its pictures in their colours, and prints it as it is (UI-023)', async ({ page }) => {
  const errors = await openApp(page);
  await openFile(page, 'night.md', `# Night reading\n\nPlain text, <span style="color:#c00000">red text</span> and ==marked==.\n\n![picture](data:image/png;base64,${PNG.toString('base64')})\n`);
  const doc = page.getByRole('textbox', { name: 'Document' });
  await expect(doc).toContainText('Night reading');
  const filters = () => doc.evaluate((el) => ({ page: getComputedStyle(el).filter, img: el.querySelector('img') ? getComputedStyle(el.querySelector('img')!).filter : 'no image' }));
  // Light theme, paper as the theme: white paper.
  expect((await filters()).page).toBe('none');

  await page.getByLabel('View', { exact: true }).first().selectOption({ label: 'Dark (light text on black)' });
  await expect.poll(async () => (await filters()).page).toBe('invert(1) hue-rotate(180deg)');
  // The pictures are turned back to their colours.
  expect((await filters()).img).toBe('invert(1) hue-rotate(180deg)');
  await page.screenshot({ path: 'test-results/paper-dark.png' });
  // Printed as it is.
  await page.emulateMedia({ media: 'print' });
  expect((await filters()).page).toBe('none');
  await page.emulateMedia({ media: 'screen' });

  // As the theme: dark with a dark system theme, light otherwise; the choice is kept.
  await page.getByLabel('View', { exact: true }).first().selectOption({ label: 'As the theme' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(async () => (await filters()).page).toBe('invert(1) hue-rotate(180deg)');
  await page.getByLabel('View', { exact: true }).first().selectOption({ label: 'Light (dark text on white)' });
  await expect.poll(async () => (await filters()).page).toBe('none');
  expect(await page.evaluate(() => localStorage.getItem('pwo.paper'))).toBe('light');
  expect(errors).toEqual([]);
});
