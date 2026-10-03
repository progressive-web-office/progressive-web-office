import { expect, test } from '@playwright/test';
import { openApp, openFile, saveAs } from './helpers';

// UNIT-001..UNIT-004: physical quantities and dimensional analysis in spreadsheets.

test('computes with quantities, checks their dimensions, converts them and keeps them in files (UNIT-001..UNIT-004)', async ({ page }) => {
  const errors = await openApp(page);
  await page.getByRole('button', { name: 'New spreadsheet' }).click();
  const grid = page.getByRole('grid', { name: 'Spreadsheet' });
  await grid.click({ position: { x: 80, y: 40 } });
  for (const input of ['12 mm', '3 m', '=A1+A2', '=A1+2 s', '=A1*A1', '2 kN', '=A6*A2', '=CONVERT(100;"C";"F")']) {
    await page.keyboard.type(input.replace('2 s', 'QTY(2;"s")'));
    await page.keyboard.press('Enter');
  }
  const cell = (r: number) => page.locator(`td[data-r="${r}"][data-c="0"]`);
  await expect(cell(0)).toHaveText('12 mm');
  await expect(cell(1)).toHaveText('3 m');
  await expect(cell(2)).toHaveText('3012 mm');
  await expect(cell(3)).toHaveText('#UNIT!');
  await expect(cell(4)).toHaveText('144 mm²');
  await expect(cell(6)).toHaveText('6 kN·m');
  await expect(cell(7)).toHaveText('212');
  // The formula bar shows the quantity as typed.
  await cell(0).click();
  await expect(page.getByLabel('Cell content')).toHaveValue('12 mm');
  // Shown in another unit: converted.
  await cell(2).click();
  page.once('dialog', (d) => void d.accept('m'));
  await page.getByLabel('Number format').selectOption({ label: 'Unit…' });
  await expect(cell(2)).toHaveText('3.012 m');
  await cell(0).click();
  page.once('dialog', (d) => void d.accept('cm'));
  await page.getByLabel('Number format').selectOption({ label: 'Unit…' });
  await expect(cell(0)).toHaveText('1.2 cm');
  await expect(cell(2)).toHaveText('3.012 m');
  // Kept in the file, readable by other spreadsheets as a number with its unit.
  const xlsx = await saveAs(page, 'Excel workbook (.xlsx)');
  await openFile(page, 'units.xlsx', xlsx.data);
  await expect(cell(0)).toHaveText('1.2 cm');
  await expect(cell(2)).toHaveText('3.012 m');
  await expect(cell(6)).toHaveText('6 kN·m');
  expect(errors).toEqual([]);
});
