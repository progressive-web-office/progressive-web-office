import { expect, test } from '@playwright/test';
import { openApp, openFile, saveAs, pickTemplate } from './helpers';

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

test('very large font sizes on a text box and on selected text (UI-016)', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'New presentation' }).click();
  const title = page.locator('.stage .shape.text').first();
  await title.click();
  const size = page.getByLabel('Font size');
  await size.fill('250');
  await size.press('Enter');
  await expect(title).toHaveCSS('font-size', /\d+px/);

  // While editing: only the selected word gets the size.
  await title.dblclick();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Big title');
  await page.keyboard.press('Shift+Control+ArrowLeft');
  await size.fill('300');
  await size.press('Enter');
  await expect(title.locator('span[style*="300pt"]')).toHaveText('title');
  await page.locator('.stage-wrap').click({ position: { x: 5, y: 5 } });

  const pptx = await saveAs(page, 'PowerPoint presentation (.pptx)');
  const { unzipSync, strFromU8 } = await import('fflate');
  const slide = strFromU8(unzipSync(new Uint8Array(pptx.data))['ppt/slides/slide1.xml']!);
  expect(slide).toContain('sz="25000"');
  expect(slide).toContain('sz="30000"');
});

test('race signs in very large letters, turned to portrait and back (FILE-018, PRES-013)', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Templates and examples' }).click();
  await pickTemplate(page, 'Race signs');
  await expect(page.locator('.slide-thumb')).toHaveCount(8);
  await expect(page.getByLabel('Slide size')).toHaveValue('A4');
  await expect(page.getByLabel('Orientation')).toHaveValue('landscape');
  const slide = page.locator('.stage-slide');
  const landscape = (await slide.boundingBox())!;
  expect(landscape.width).toBeGreaterThan(landscape.height);
  if (process.env.SCREENSHOTS) await page.screenshot({ path: 'test-results/signs-landscape.png' });

  await page.getByLabel('Orientation').selectOption('portrait');
  const portrait = (await slide.boundingBox())!;
  expect(portrait.height).toBeGreaterThan(portrait.width);
  await page.locator('.slide-thumb').nth(1).click();
  if (process.env.SCREENSHOTS) await page.screenshot({ path: 'test-results/signs-portrait.png' });

  await page.getByRole('button', { name: 'Print', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('combobox', { name: 'Orientation' })).toHaveValue('portrait');
  await page.keyboard.press('Escape');

  await page.locator('.stage-wrap').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+z');
  await expect(page.getByLabel('Orientation').first()).toHaveValue('landscape');
});

test('the background of a slide and the vertical alignment of a text box can be changed (PRES-005)', async ({ page }) => {
  const errors = await openApp(page);
  await page.getByRole('button', { name: 'New presentation' }).first().click();
  const bg = page.getByLabel('Slide background colour', { exact: true });
  await bg.evaluate((el: HTMLInputElement) => {
    el.value = '#ffd400';
    el.dispatchEvent(new Event('change'));
  });
  await expect(page.locator('.stage .slide').first()).toHaveCSS('background-color', 'rgb(255, 212, 0)');
  const box = page.locator('.stage .shape').first();
  await box.click();
  await page.getByLabel('Vertical alignment of the text').selectOption('bottom');
  await expect(page.locator('.stage .shape').first()).toHaveAttribute('data-anchor', 'bottom');
  expect(errors).toEqual([]);
});

test('presenter view: notes, next slide and timer in a second window, driving the slideshow (PRES-014)', async ({ page }) => {
  const errors = await openApp(page);
  await page.getByRole('button', { name: 'New presentation' }).click();
  await page.getByLabel('Speaker notes').fill('Greet everyone');
  await page.getByRole('button', { name: 'New slide' }).click();
  await page.locator('.slide-thumb').first().click();

  const [console_] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: /^Presenter view/ }).click()]);
  const show = page.locator('.slideshow');
  await expect(show).toHaveAttribute('aria-label', 'Slide 1 of 2');
  await expect(console_.locator('.presenter-position')).toHaveText('Slide 1 of 2');
  await expect(console_.locator('.presenter-notes')).toHaveText('Greet everyone');
  await expect(console_.locator('.presenter-current .slide')).toHaveCount(1);
  await expect(console_.locator('.presenter-next .slide')).toHaveCount(1);
  await expect(console_.locator('.presenter-elapsed')).toHaveText(/^00:0\d$/);

  // The console moves the slideshow.
  await console_.getByRole('button', { name: 'Next slide' }).click();
  await expect(show).toHaveAttribute('aria-label', 'Slide 2 of 2');
  await expect(console_.locator('.presenter-notes')).toHaveText('No notes for this slide.');
  await expect(console_.locator('.presenter-next')).toHaveText('End of the slideshow');
  // And the slideshow moves the console.
  await show.press('ArrowLeft');
  await expect(console_.locator('.presenter-position')).toHaveText('Slide 1 of 2');

  // Ending the slideshow closes the console.
  const closed = console_.waitForEvent('close');
  await show.press('Escape');
  await closed;
  await expect(show).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('new slides with a layout, and shapes snapped to alignment guides (PRES-015, PRES-016)', async ({ page }) => {
  const errors = await openApp(page);
  await page.getByRole('button', { name: 'New presentation' }).click();
  await page.getByRole('button', { name: 'Add a slide with a layout' }).click();
  await page.getByRole('menuitem', { name: 'Two contents' }).click();
  await expect(page.locator('.slide-thumb')).toHaveCount(2);
  await expect(page.locator('.stage .shape.text')).toHaveCount(3);
  await page.getByRole('button', { name: 'Add a slide with a layout' }).click();
  await page.getByRole('menuitem', { name: 'Blank' }).click();
  await expect(page.locator('.stage .shape')).toHaveCount(0);

  // Two rectangles: the second dragged near the left edge of the first snaps to it.
  await page.getByRole('button', { name: 'Add rectangle' }).click();
  await page.getByRole('button', { name: 'Add rectangle' }).click();
  const rects = page.locator('.stage .shape.rect');
  await expect(rects).toHaveCount(2);
  const second = rects.nth(1);
  const a = (await rects.nth(0).boundingBox())!;
  const b = (await second.boundingBox())!;
  // Move the second well below the first, 3 pixels off its left edge.
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  const targetX = b.x + b.width / 2 + (a.x - b.x) + 3;
  await page.mouse.move(targetX, b.y + b.height / 2 + 150, { steps: 6 });
  await expect(page.locator('.stage .guide-x')).not.toHaveCount(0);
  await page.mouse.up();
  await expect(page.locator('.stage .guide')).toHaveCount(0);
  const after = (await second.boundingBox())!;
  expect(Math.abs(after.x - a.x)).toBeLessThan(1);
  expect(errors).toEqual([]);
});
