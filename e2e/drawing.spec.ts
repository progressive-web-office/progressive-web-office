import { expect, test, type Page } from '@playwright/test';
import { unzipSync, strFromU8 } from 'fflate';
import { openApp, saveAs } from './helpers';

/** The centre of a placed symbol, from its transform. */
async function centre(page: Page, name: string): Promise<[number, number]> {
  const id = await page.locator('.draw-objects button', { hasText: name }).getAttribute('data-id');
  const t = await page.locator(`.draw-content g[data-id="${id}"]`).getAttribute('transform');
  const m = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(t ?? '')!;
  return [Number(m[1]), Number(m[2])];
}

/** Screen coordinates of a drawing point. */
async function screen(page: Page, [x, y]: [number, number]): Promise<[number, number]> {
  const stage = page.locator('svg.draw-stage');
  const box = (await stage.boundingBox())!;
  const [, , w, h] = ((await stage.getAttribute('viewBox')) ?? '').split(' ').map(Number) as [number, number, number, number];
  return [box.x + (x * box.width) / w, box.y + (y * box.height) / h];
}

test('draws a schematic with symbols and wires, inserted in a document and edited again (DRAW-001..DRAW-007, DRAW-011)', async ({ page }) => {
  const errors = await openApp(page);
  await page.getByRole('button', { name: 'New document' }).click();
  await page.getByRole('button', { name: 'Drawing or schematic…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Drawing' });

  // DRAW-005: symbols found by name, placed with a numbered reference.
  await dialog.getByLabel('Search a symbol…').fill('resistor');
  await dialog.getByRole('listitem', { name: 'Resistor', exact: true }).click();
  await dialog.getByLabel('Value').fill('4k7');
  await dialog.getByLabel('Value').press('Enter');
  await expect(dialog.locator('.draw-content')).toContainText('4.7 kΩ');
  await dialog.getByLabel('Search a symbol…').fill('capacitor');
  await dialog.getByRole('listitem', { name: 'Capacitor', exact: true }).click();
  // DRAW-011: moved with the keyboard, a grid step at a time.
  const stage = dialog.locator('svg.draw-stage');
  const before = await centre(page, 'Capacitor C1');
  for (let i = 0; i < 8; i++) await stage.press('ArrowRight');
  const c = await centre(page, 'Capacitor C1');
  expect(c[0]).toBe(before[0] + 80);
  const r = await centre(page, 'Resistor R1');

  // DRAW-006: a wire from pin to pin, kept connected when the capacitor moves.
  await dialog.getByRole('button', { name: 'Wire' }).click();
  const a = await screen(page, [r[0] + 30, r[1]]);
  const b = await screen(page, [c[0] - 30, c[1]]);
  await page.mouse.move(...a);
  await page.mouse.down();
  await page.mouse.move(b[0] - 10, b[1], { steps: 4 });
  await page.mouse.move(...b, { steps: 2 });
  await page.mouse.up();
  const wire = dialog.locator('.draw-content polyline');
  await expect(wire).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Select and move' }).click();
  await dialog.locator('.draw-objects button', { hasText: 'Capacitor C1' }).click();
  await dialog.locator('.draw-objects button', { hasText: 'Capacitor C1' }).press('ArrowDown');
  await dialog.locator('.draw-objects button', { hasText: 'Capacitor C1' }).press('ArrowDown');
  const points = (await wire.getAttribute('points'))!.split(' ');
  expect(points[0]).toBe(`${r[0] + 30},${r[1]}`);
  expect(points[points.length - 1]).toBe(`${c[0] - 30},${c[1] + 20}`);

  // Deleted, then back with undo.
  await stage.focus();
  await stage.press('Delete');
  await expect(dialog.locator('.draw-objects button', { hasText: 'Capacitor C1' })).toHaveCount(0);
  await stage.press('Control+z');
  await expect(dialog.locator('.draw-objects button', { hasText: 'Capacitor C1' })).toHaveCount(1);

  // DRAW-001: a rectangle drawn with the mouse.
  await dialog.getByRole('button', { name: 'Rectangle' }).click();
  const p = await screen(page, [40, 40]);
  await page.mouse.move(...p);
  await page.mouse.down();
  await page.mouse.move(p[0] + 60, p[1] + 40, { steps: 3 });
  await page.mouse.up();
  await expect(dialog.locator('.draw-objects button', { hasText: 'Rectangle' })).toHaveCount(1);
  await expect(dialog.getByLabel('Value')).toBeHidden();

  if (process.env.SCREENSHOTS) await page.screenshot({ path: 'test-results/drawing.png' });
  // DRAW-009: the netlist and the bill of materials.
  const net = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Netlist (SPICE)' }).click();
  const netFile = await net;
  expect(netFile.suggestedFilename()).toBe('schematic.cir');
  const text = (await import('node:fs')).readFileSync((await netFile.path())!, 'utf8');
  expect(text).toMatch(/^R1 N\d+ N\d+ 4\.7k$/m);
  expect(text).toMatch(/^C1 N\d+ N\d+ 1u$/m);
  const bom = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Bill of materials' }).click();
  expect((await import('node:fs')).readFileSync((await (await bom).path())!, 'utf8')).toContain('1,R1,Resistor,4.7 kΩ');
  await dialog.getByLabel('Description').fill('An RC circuit');
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toBeHidden();

  // DRAW-007: a picture of the document, opened again by a double click.
  const img = page.locator('.doc-page img[alt="An RC circuit"]');
  await expect(img).toBeVisible();
  await img.dblclick();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.draw-objects button', { hasText: 'Resistor R1 4.7 kΩ' })).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  // DRAW-003: kept as an SVG holding the editable drawing.
  const odt = unzipSync(new Uint8Array((await saveAs(page, 'OpenDocument text (.odt)')).data));
  const svg = Object.entries(odt).find(([p]) => p.endsWith('.svg'));
  expect(svg).toBeDefined();
  expect(strFromU8(svg![1])).toContain('<metadata id="pwo-drawing">');
  // Word gets a PNG version beside the SVG.
  const docx = unzipSync(new Uint8Array((await saveAs(page, 'Word document (.docx)')).data));
  expect(Object.keys(docx).filter((p) => p.startsWith('word/media/')).sort()).toEqual(['word/media/image1.png', 'word/media/image1.svg']);
  expect(docx['word/media/image1.png']!.length).toBeGreaterThan(1000);
  expect(errors).toEqual([]);
});

test('puts a drawing on a slide, edited again by a double click (DRAW-007)', async ({ page }) => {
  const errors = await openApp(page);
  await page.getByRole('button', { name: 'New presentation' }).click();
  await page.getByRole('button', { name: 'Drawing or schematic…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Drawing' });
  await dialog.getByLabel('Library').selectOption({ label: 'Flowcharts (ISO 5807)' });
  await dialog.getByRole('listitem', { name: 'Decision' }).click();
  await dialog.getByLabel('Value').fill('x > 0 ?');
  await dialog.getByLabel('Value').press('Enter');
  await dialog.getByRole('button', { name: 'Fit to the content' }).click();
  await dialog.getByRole('button', { name: 'Done' }).click();
  const img = page.locator('.stage img');
  await expect(img).toBeVisible();
  await img.dblclick();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.draw-objects button', { hasText: 'Decision x > 0 ?' })).toHaveCount(1);
  expect(await dialog.getByLabel('Width').inputValue()).toBe('140');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  expect(errors).toEqual([]);
});
