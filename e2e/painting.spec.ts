import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

async function saveDownload(page: Page): Promise<{ name: string; data: Buffer }> {
  const download = page.waitForEvent('download');
  await page.locator('.header-actions').getByRole('button', { name: 'Save', exact: true }).click();
  const d = await download;
  const chunks: Buffer[] = [];
  for await (const c of await d.createReadStream()) chunks.push(c as Buffer);
  return { name: d.suggestedFilename(), data: Buffer.concat(chunks) };
}

/** The colour of a pixel of the painted canvas. */
const pixel = (page: Page, x: number, y: number): Promise<number[]> =>
  page.locator('canvas.paint-canvas').evaluate((c: HTMLCanvasElement, [px, py]) => Array.from(c.getContext('2d')!.getImageData(px!, py!, 1, 1).data), [x, y]);

test('paints a new picture from the start screen and saves it as PNG (DRAW-008)', async ({ page }) => {
  const errors = await openApp(page);
  await page.getByRole('button', { name: 'New painting' }).click();
  const dialog = page.getByRole('dialog', { name: 'Painting' });
  const canvas = dialog.locator('canvas.paint-canvas');
  const box = (await canvas.boundingBox())!;
  const scale = box.width / 800;
  const at = (x: number, y: number): [number, number] => [box.x + x * scale, box.y + y * scale];

  // A filled rectangle, then the fill bucket around it.
  await dialog.getByLabel('Colour', { exact: true }).first().fill('#ff0000');
  await dialog.getByRole('button', { name: 'Rectangle' }).click();
  await dialog.getByLabel('filled shapes').check();
  await page.mouse.move(...at(100, 100));
  await page.mouse.down();
  await page.mouse.move(...at(200, 180), { steps: 4 });
  await page.mouse.up();
  expect(await pixel(page, 150, 140)).toEqual([255, 0, 0, 255]);
  await dialog.getByLabel('Colour', { exact: true }).first().fill('#0000ff');
  await dialog.getByRole('button', { name: 'Fill' }).click();
  await page.mouse.click(...at(400, 300));
  expect(await pixel(page, 400, 300)).toEqual([0, 0, 255, 255]);
  expect(await pixel(page, 150, 140)).toEqual([255, 0, 0, 255]);

  // A brush stroke, undone and redone.
  await dialog.getByRole('button', { name: 'Brush' }).click();
  await dialog.getByLabel('Colour', { exact: true }).first().fill('#00ff00');
  await page.mouse.move(...at(300, 50));
  await page.mouse.down();
  await page.mouse.move(...at(500, 50), { steps: 6 });
  await page.mouse.up();
  expect(await pixel(page, 400, 50)).toEqual([0, 255, 0, 255]);
  await canvas.press('Control+z');
  expect(await pixel(page, 400, 50)).toEqual([0, 0, 255, 255]);
  await canvas.press('Control+y');
  expect(await pixel(page, 400, 50)).toEqual([0, 255, 0, 255]);

  // The colour picker reads the red of the rectangle.
  await dialog.getByRole('button', { name: 'Pick a colour' }).click();
  await page.mouse.click(...at(150, 140));
  await expect(dialog.getByLabel('Colour', { exact: true }).first()).toHaveValue('#ff0000');

  // A selection moved with the arrows.
  await dialog.getByRole('button', { name: 'Select', exact: true }).click();
  await page.mouse.move(...at(90, 90));
  await page.mouse.down();
  await page.mouse.move(...at(210, 190), { steps: 3 });
  await page.mouse.up();
  for (let i = 0; i < 5; i++) await canvas.press('Shift+ArrowRight');
  await canvas.press('Escape');
  expect(await pixel(page, 245, 140)).toEqual([255, 0, 0, 255]);

  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.picture-view img')).toBeVisible();
  const file = await saveDownload(page);
  expect(file.name).toBe('Untitled picture.png');
  expect(file.data.subarray(1, 4).toString()).toBe('PNG');

  // Painted again from the picture's toolbar.
  await page.getByRole('button', { name: 'Paint on the picture' }).click();
  await expect(dialog).toBeVisible();
  expect(await pixel(page, 245, 140)).toEqual([255, 0, 0, 255]);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  expect(errors).toEqual([]);
});

test('makes a new drawing from the start screen, saved as SVG (DRAW-001)', async ({ page }) => {
  const errors = await openApp(page);
  await page.getByRole('button', { name: 'New drawing or schematic' }).click();
  const dialog = page.getByRole('dialog', { name: 'Drawing' });
  await dialog.getByLabel('Search a symbol…').fill('npn');
  await dialog.getByRole('listitem', { name: 'NPN transistor' }).click();
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('.picture-view img')).toBeVisible();
  const file = await saveDownload(page);
  expect(file.name).toBe('Untitled drawing.svg');
  expect(file.data.toString()).toContain('<metadata id="pwo-drawing">');
  // Edited again from the picture's toolbar.
  await page.getByRole('button', { name: 'Edit the drawing' }).click();
  await expect(dialog.locator('.draw-objects button', { hasText: 'NPN transistor Q1' })).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  expect(errors).toEqual([]);
});
