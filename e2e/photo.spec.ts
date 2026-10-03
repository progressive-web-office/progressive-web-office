import { expect, test } from '@playwright/test';
import { openApp, openFile } from './helpers';

// IMG-001: a picture of a document edited in place.

test('turns, crops, blurs and resizes a picture of a document (IMG-001)', async ({ page }) => {
  const errors = await openApp(page);
  // A 200×100 picture: red on the left half, blue on the right.
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 200;
    c.height = 100;
    const g = c.getContext('2d')!;
    g.fillStyle = '#f00';
    g.fillRect(0, 0, 100, 100);
    g.fillStyle = '#00f';
    g.fillRect(100, 0, 100, 100);
    return c.toDataURL('image/png');
  });
  await openFile(page, 'pic.md', `# Picture\n\n![A test](${png})\n`);
  const img = page.getByRole('textbox', { name: 'Document' }).getByRole('img', { name: 'A test' });
  await expect(img).toHaveCount(1);
  const natural = () => img.evaluate((el: HTMLImageElement) => (el.complete ? [el.naturalWidth, el.naturalHeight] : [0, 0]));
  await expect.poll(natural).toEqual([200, 100]);

  // Turned to the right: 100×200.
  await img.click({ button: 'right' });
  await page.getByRole('menu').getByRole('menuitem', { name: 'Edit the picture…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit the picture' });
  await dialog.getByRole('button', { name: 'Turn right' }).click();
  await expect(dialog.getByRole('status')).toHaveText('100 × 200 px');
  // Cropped to its top half by dragging: 100×100.
  const box = (await dialog.getByRole('img', { name: 'Picture being edited' }).boundingBox())!;
  await page.mouse.move(box.x + 0.3, box.y + 0.3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 4);
  await page.mouse.move(box.x + box.width + 5, box.y + box.height / 2);
  await page.mouse.up();
  await expect(dialog.getByRole('status')).toHaveText('100 × 100 px');
  // A region blurred, the size halved.
  await dialog.getByLabel('▒ Blur').check();
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 40, box.y + 40);
  await page.mouse.up();
  await dialog.getByLabel('Size (%)').fill('50');
  await expect(dialog.getByRole('status')).toHaveText('50 × 50 px');
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect.poll(natural).toEqual([50, 50]);
  // The top of the turned picture was the red half.
  const centre = await img.evaluate((el: HTMLImageElement) => {
    const c = document.createElement('canvas');
    c.width = el.naturalWidth;
    c.height = el.naturalHeight;
    const g = c.getContext('2d')!;
    g.drawImage(el, 0, 0);
    return Array.from(g.getImageData(40, 40, 1, 1).data.slice(0, 3));
  });
  expect(centre[0]).toBeGreaterThan(200);
  expect(centre[2]).toBeLessThan(60);
  // Undone like any change.
  await page.locator('.doc-page h1').click();
  await page.keyboard.press('Control+z');
  await expect.poll(natural).toEqual([200, 100]);
  expect(errors).toEqual([]);
});

test('draws arrows, highlights and text on a picture (IMG-004)', async ({ page }) => {
  const errors = await openApp(page);
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 300;
    c.height = 200;
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, 300, 200);
    return c.toDataURL('image/png');
  });
  await openFile(page, 'pic.md', `![White](${png})\n`);
  const img = page.getByRole('textbox', { name: 'Document' }).getByRole('img', { name: 'White' });
  await img.click({ button: 'right' });
  await page.getByRole('menu').getByRole('menuitem', { name: 'Edit the picture…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit the picture' });
  const box = (await dialog.getByRole('img', { name: 'Picture being edited' }).boundingBox())!;
  const drag = async (x1: number, y1: number, x2: number, y2: number) => {
    await page.mouse.move(box.x + x1, box.y + y1);
    await page.mouse.down();
    await page.mouse.move(box.x + (x1 + x2) / 2, box.y + (y1 + y2) / 2);
    await page.mouse.move(box.x + x2, box.y + y2);
    await page.mouse.up();
  };
  await dialog.getByLabel('🖍 Highlight').check();
  await drag(10, 10, 100, 60);
  await dialog.getByLabel('➚ Arrow').check();
  await drag(150, 150, 280, 100);
  await dialog.getByLabel('T Text').check();
  page.once('dialog', (d) => void d.accept('Here'));
  await drag(160, 40, 161, 41);
  await dialog.getByRole('button', { name: 'Apply' }).click();
  const pixel = (x: number, y: number) =>
    img.evaluate((el: HTMLImageElement, [px, py]) => {
      const c = document.createElement('canvas');
      c.width = el.naturalWidth;
      c.height = el.naturalHeight;
      const g = c.getContext('2d')!;
      g.drawImage(el, 0, 0);
      return Array.from(g.getImageData(px!, py!, 1, 1).data.slice(0, 3));
    }, [x, y]);
  // Yellow highlight, red arrow head near its end, white elsewhere.
  await expect.poll(async () => {
    const [r, g, b] = await pixel(50, 30);
    return r! > 240 && g! > 200 && b! < 170;
  }).toBe(true);
  const head = await pixel(272, 103);
  expect(head[0]).toBeGreaterThan(180);
  expect(head[2]).toBeLessThan(120);
  expect(await pixel(20, 180)).toEqual([255, 255, 255]);
  expect(errors).toEqual([]);
});
