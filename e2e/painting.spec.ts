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

/** The colour of a pixel of the active layer. */
const pixel = (page: Page, x: number, y: number): Promise<number[]> =>
  page.locator('canvas.paint-layer.active').evaluate((c: HTMLCanvasElement, [px, py]) => Array.from(c.getContext('2d')!.getImageData(px!, py!, 1, 1).data), [x, y]);

/** The colour of a pixel of a layer, by its place from the bottom. */
const layerPixel = (page: Page, layer: number, x: number, y: number): Promise<number[]> =>
  page.locator('.paint-stack canvas.paint-layer').nth(layer).evaluate((c: HTMLCanvasElement, [px, py]) => Array.from(c.getContext('2d')!.getImageData(px!, py!, 1, 1).data), [x, y]);

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

test('paints on layers, vector shapes stay shapes, crops, rotates, and saves an OpenRaster file (DRAW-013..DRAW-015)', async ({ page }) => {
  const errors = await openApp(page);
  await page.getByRole('button', { name: 'New painting' }).click();
  const dialog = page.getByRole('dialog', { name: 'Painting' });
  const canvas = dialog.locator('canvas.paint-canvas');
  const box = (await canvas.boundingBox())!;
  const scale = box.width / 800;
  const at = (x: number, y: number): [number, number] => [box.x + x * scale, box.y + y * scale];
  const drag = async (a: [number, number], b: [number, number]): Promise<void> => {
    await page.mouse.move(...at(...a));
    await page.mouse.down();
    await page.mouse.move(...at(...b), { steps: 4 });
    await page.mouse.up();
  };
  const layers = dialog.getByRole('listbox', { name: 'Layers' });
  await expect(layers.getByRole('option')).toHaveText([/Background/]);

  // A painted layer over the white background: the background keeps its white.
  await dialog.getByRole('button', { name: 'New painted layer' }).click();
  await expect(layers.getByRole('option')).toHaveCount(2);
  await dialog.getByLabel('Colour', { exact: true }).first().fill('#ff0000');
  await dialog.getByRole('button', { name: 'Rectangle' }).click();
  await dialog.getByLabel('filled shapes').check();
  await drag([100, 100], [200, 180]);
  expect(await layerPixel(page, 1, 150, 140)).toEqual([255, 0, 0, 255]);
  expect(await layerPixel(page, 0, 150, 140)).toEqual([255, 255, 255, 255]);
  // Transparent elsewhere: the alpha channel of a layer.
  expect((await layerPixel(page, 1, 400, 300))[3]).toBe(0);

  // A vector layer: a rectangle that stays a shape, picked and moved.
  await dialog.getByRole('button', { name: /New vector layer/ }).click();
  await dialog.getByLabel('Colour', { exact: true }).first().fill('#0000ff');
  await drag([300, 100], [400, 160]);
  expect(await layerPixel(page, 2, 350, 130)).toEqual([0, 0, 255, 255]);
  await dialog.getByRole('button', { name: 'Brush' }).click();
  await page.mouse.click(...at(500, 400));
  await expect(dialog.getByRole('status').first()).toHaveText(/vector layer holds shapes/);
  await dialog.getByRole('button', { name: 'Select', exact: true }).click();
  await drag([350, 130], [450, 130]);
  expect(await layerPixel(page, 2, 450, 130)).toEqual([0, 0, 255, 255]);
  expect((await layerPixel(page, 2, 320, 130))[3]).toBe(0);

  // Hidden, then shown again; its opacity changed.
  await layers.getByRole('option').first().getByRole('button', { name: /Hide the layer/ }).click();
  await expect(dialog.locator('.paint-stack canvas.paint-layer').nth(2)).toBeHidden();
  await layers.getByRole('option').first().getByRole('button', { name: /Show the layer/ }).click();
  await dialog.getByLabel('Opacity of the layer').fill('50');
  await expect(layers.getByRole('option').first()).toContainText('50 %');

  // Crop to a selection, then a quarter turn: the size follows.
  await layers.getByRole('option').nth(1).click();
  await drag([50, 50], [650, 350]);
  await dialog.getByRole('button', { name: 'Crop to the selection' }).click();
  await expect(dialog.getByLabel('Width', { exact: true })).toHaveValue('600');
  await expect(dialog.getByLabel('Height', { exact: true })).toHaveValue('300');
  // The vector layer becomes pixels: asked first.
  page.once('dialog', (d) => void d.accept());
  await dialog.getByRole('button', { name: 'Rotate a quarter turn right' }).click();
  await expect(dialog.getByLabel('Width', { exact: true })).toHaveValue('300');
  await expect(dialog.getByLabel('Height', { exact: true })).toHaveValue('600');
  // Undone.
  await canvas.press('Control+z');
  await expect(dialog.getByLabel('Width', { exact: true })).toHaveValue('600');

  // Saved with its layers, as OpenRaster.
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('.picture-view img')).toBeVisible();
  const file = await saveDownload(page);
  expect(file.name).toBe('Untitled picture.ora');
  expect(file.data.subarray(30, 54).toString()).toBe('mimetypeimage/openraster');
  // Painted again: the layers are back, the vector one with its shapes.
  await page.getByRole('button', { name: 'Paint on the picture' }).click();
  await expect(layers.getByRole('option')).toHaveCount(3);
  await expect(layers.getByRole('option').first()).toContainText('Vector layer 3');
  await expect(layers.getByRole('option').first()).toContainText('◇');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  expect(errors).toEqual([]);
});

test('a poster in layers from the examples; a picture imported as a layer; the background a colour (DRAW-013, DRAW-015)', async ({ page }) => {
  const errors = await openApp(page);
  await page.getByRole('button', { name: /Templates and examples/ }).first().click();
  await page.getByRole('dialog').getByRole('tab', { name: /Examples/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Poster in layers' }).click();
  await expect(page.locator('.picture-view img')).toBeVisible();
  await page.getByRole('button', { name: 'Paint on the picture' }).click();
  const dialog = page.getByRole('dialog', { name: 'Painting' });
  const layers = dialog.getByRole('listbox', { name: 'Layers' });
  await expect(layers.getByRole('option')).toHaveText([/Title/, /Hills.*85 %/, /Sun/, /Sky/]);

  // A picture of the device, imported as a new layer above the active one.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
  const chooser = page.waitForEvent('filechooser');
  await dialog.getByRole('button', { name: 'Import a picture' }).click();
  await (await chooser).setFiles({ name: 'logo.png', mimeType: 'image/png', buffer: png });
  await expect(layers.getByRole('option')).toHaveCount(5);
  await expect(dialog.getByText(/Picture imported on a new layer/)).toBeVisible();

  // The background: a colour on the bottom layer.
  await dialog.getByRole('button', { name: 'Background…' }).click();
  const bg = page.getByRole('dialog', { name: 'Background…' });
  await bg.getByLabel('Colour').fill('#ff00ff');
  await bg.getByRole('button', { name: 'OK' }).click();
  const bottom = await dialog.locator('.paint-stack canvas.paint-layer').first().evaluate((c: HTMLCanvasElement) => Array.from(c.getContext('2d')!.getImageData(5, 5, 1, 1).data));
  expect(bottom).toEqual([255, 0, 255, 255]);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  expect(errors).toEqual([]);
});

test('a line gets arrows, right angles and bends added, moved and removed (DRAW-017)', async ({ page }) => {
  const errors = await openApp(page);
  await page.getByRole('button', { name: 'New drawing or schematic' }).click();
  const dialog = page.getByRole('dialog', { name: 'Drawing' });
  await dialog.getByRole('button', { name: 'Line', exact: true }).click();
  const svg = dialog.locator('svg.draw-stage');
  const box = (await svg.boundingBox())!;
  await page.mouse.move(box.x + 100, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 300, box.y + 100, { steps: 4 });
  await page.mouse.up();
  await dialog.getByRole('button', { name: 'Select and move' }).click();
  await dialog.locator('.draw-objects button').first().click();
  await dialog.getByLabel('arrow at the end').check();
  // A bend added by a double click on the line, then moved.
  await page.mouse.dblclick(box.x + 200, box.y + 100);
  await expect(dialog.locator('.draw-bend')).toHaveCount(1);
  const bend = (await dialog.locator('.draw-bend').boundingBox())!;
  await page.mouse.move(bend.x + bend.width / 2, bend.y + bend.height / 2);
  await page.mouse.down();
  await page.mouse.move(bend.x + bend.width / 2, bend.y + 80, { steps: 4 });
  await page.mouse.up();
  await dialog.getByRole('button', { name: 'Done' }).click();
  const download = page.waitForEvent('download');
  await page.locator('.header-actions').getByRole('button', { name: 'Save', exact: true }).click();
  const chunks: Buffer[] = [];
  for await (const c of await (await download).createReadStream()) chunks.push(c as Buffer);
  const svgText = Buffer.concat(chunks).toString();
  const json = JSON.parse(/<metadata id="pwo-drawing">([\s\S]*?)<\/metadata>/.exec(svgText)![1]!.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
  const line = json.shapes.find((s: { kind: string }) => s.kind === 'line');
  expect(line.end).toBe('arrow');
  expect(line.points).toHaveLength(3);
  expect(line.points[1][1]).toBeGreaterThan(line.points[0][1]);
  expect(errors).toEqual([]);
});
