import { expect, test } from '@playwright/test';
import { openApp, openFile, saveAs } from './helpers';

test('creates a presentation, edits text, adds slides and shapes, presents and saves (PRES-004..008)', async ({ page }) => {
  const errors = await openApp(page);
  await page.getByRole('button', { name: 'New presentation' }).click();
  const title = page.locator('.stage .shape.text').first();
  await expect(title).toContainText('Presentation title');
  await title.dblclick();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Quarterly results');
  await page.locator('.stage-wrap').click({ position: { x: 5, y: 5 } });
  await page.getByRole('button', { name: 'New slide' }).click();
  await page.getByRole('button', { name: 'Add rectangle' }).click();
  await expect(page.locator('.slide-thumb')).toHaveCount(2);
  await expect(page.locator('.stage .shape.rect')).toHaveCount(1);

  await page.getByRole('button', { name: 'Start slideshow' }).click();
  const show = page.locator('.slideshow');
  await expect(show).toHaveAttribute('aria-label', 'Slide 2 of 2');
  await page.keyboard.press('ArrowLeft');
  await expect(show).toHaveAttribute('aria-label', 'Slide 1 of 2');
  await expect(show).toContainText('Quarterly results');
  await page.keyboard.press('Escape');
  await expect(show).toHaveCount(0);

  const pptx = await saveAs(page, 'PowerPoint presentation (.pptx)');
  expect(pptx.name).toBe('Untitled presentation.pptx');
  await openFile(page, 'reopened.pptx', pptx.data);
  await expect(page.locator('.slide-thumb')).toHaveCount(2);
  await expect(page.locator('.stage')).toContainText('Quarterly results');
  const odp = await saveAs(page, 'OpenDocument presentation (.odp)');
  expect(odp.data.subarray(30, 38).toString()).toBe('mimetype');
  expect(errors).toEqual([]);
});
