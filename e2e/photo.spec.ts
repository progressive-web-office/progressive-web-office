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
