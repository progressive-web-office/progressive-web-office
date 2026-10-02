import { expect, test } from '@playwright/test';
import { openApp, openFile, saveAs } from './helpers';

test('creates a spreadsheet, enters values and formulas, saves as XLSX and reopens (SHEET-004..009)', async ({ page }) => {
  const errors = await openApp(page);
  await page.getByRole('button', { name: 'New spreadsheet' }).click();
  const grid = page.getByRole('grid', { name: 'Spreadsheet' });
  await grid.click({ position: { x: 80, y: 40 } });
  await page.keyboard.type('10');
  await page.keyboard.press('Enter');
  await page.keyboard.type('32');
  await page.keyboard.press('Enter');
  await page.keyboard.type('=SUM(A1:A2)');
  await page.keyboard.press('Enter');
  await expect(page.locator('td[data-r="2"][data-c="0"]')).toHaveText('42');
  await expect(page.locator('.name-box')).toHaveText('A4');

  const xlsx = await saveAs(page, 'Excel workbook (.xlsx)');
  expect(xlsx.name).toBe('Untitled spreadsheet.xlsx');
  await openFile(page, 'reopened.xlsx', xlsx.data);
  await expect(page.locator('td[data-r="2"][data-c="0"]')).toHaveText('42');
  await page.locator('td[data-r="2"][data-c="0"]').click();
  await expect(page.getByLabel('Cell content')).toHaveValue('=SUM(A1:A2)');
  expect(errors).toEqual([]);
});

test('opens a semicolon CSV and converts it to ODS (SHEET-003)', async ({ page }) => {
  await openApp(page);
  await openFile(page, 'data.csv', 'name;qty\napples;3\npears;4\n', 'text/csv');
  await expect(page.locator('td[data-r="2"][data-c="1"]')).toHaveText('4');
  const ods = await saveAs(page, 'OpenDocument spreadsheet (.ods)');
  expect(ods.name).toBe('data.ods');
  expect(ods.data.subarray(30, 38).toString()).toBe('mimetype');
});

test('sorts the table around the active cell by a column, keeping the header (SHEET-016)', async ({ page }) => {
  await openApp(page);
  await openFile(page, 'scores.csv', 'Name,Score\nChloé,12\nalice,17\nBob,9\n', 'text/csv');
  await page.locator('td[data-r="2"][data-c="1"]').click();
  await page.getByRole('button', { name: 'Sort…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Sort' });
  await expect(dialog.getByLabel('The first row is a header (it stays in place)')).toBeChecked();
  await expect(dialog.getByLabel('Sort by')).toHaveValue('1');
  await dialog.getByLabel('Descending (Z to A, 9 to 0)').check();
  await dialog.getByRole('button', { name: 'Sort', exact: true }).click();
  const col = (c: number) => page.locator(`td[data-c="${c}"]`).filter({ hasText: /./ }).allTextContents();
  await expect.poll(() => col(0)).toEqual(['Name', 'alice', 'Chloé', 'Bob']);
  expect(await col(1)).toEqual(['Score', '17', '12', '9']);
  // One undo step.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => col(0)).toEqual(['Name', 'Chloé', 'alice', 'Bob']);
});

test('freezes the first row and column, which stay in view while scrolling (SHEET-017)', async ({ page }) => {
  await openApp(page);
  const csv = ['Name,' + Array.from({ length: 30 }, (_, i) => `Q${i + 1}`).join(','), ...Array.from({ length: 200 }, (_, r) => `Row ${r + 1},` + Array.from({ length: 30 }, (_, c) => r * c).join(','))].join('\n');
  await openFile(page, 'big.csv', csv, 'text/csv');
  await page.locator('td[data-r="1"][data-c="1"]').click();
  await page.getByRole('button', { name: 'Freeze panes' }).click();
  await expect(page.getByRole('button', { name: 'Freeze panes' })).toHaveAttribute('aria-pressed', 'true');
  const viewport = page.locator('.grid-viewport');
  await viewport.evaluate((el) => el.scrollTo(2000, 3000));
  const vp = (await viewport.boundingBox())!;
  const header = page.locator('td[data-r="0"][data-c="0"]');
  await expect(header).toHaveText('Name');
  const box = (await header.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(vp.y);
  expect(box.y).toBeLessThan(vp.y + 60);
  expect(box.x).toBeLessThan(vp.x + 120);
  await expect(page.locator('td[data-r="150"][data-c="0"]')).toHaveText('Row 150');
  if (process.env.SCREENSHOTS) await page.screenshot({ path: 'test-results/freeze.png' });

  const { unzipSync, strFromU8 } = await import('fflate');
  const xlsx = unzipSync(new Uint8Array((await saveAs(page, 'Excel workbook (.xlsx)')).data));
  expect(strFromU8(xlsx['xl/worksheets/sheet1.xml']!)).toContain('<pane xSplit="1" ySplit="1" topLeftCell="B2" activePane="bottomRight" state="frozen"/>');
});

test('formats cells: bold, colours, alignment, borders, kept in the file (SHEET-014)', async ({ page }) => {
  await openApp(page);
  await openFile(page, 'scores.csv', 'Name,Score\nChloé,12\nalice,17\n', 'text/csv');
  await page.locator('td[data-r="0"][data-c="0"]').click();
  await page.locator('td[data-r="0"][data-c="1"]').click({ modifiers: ['Shift'] });
  await page.getByRole('button', { name: 'Bold' }).click();
  await page.getByLabel('Fill colour').fill('#ffff00');
  await page.getByRole('button', { name: 'Align center' }).click();
  await page.getByRole('button', { name: 'Borders' }).click();
  const header = page.locator('td[data-r="0"][data-c="0"]');
  await expect(header).toHaveCSS('font-weight', '700');
  await expect(header).toHaveCSS('text-align', 'center');
  await expect(page.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true');
  await page.locator('td[data-r="1"][data-c="1"]').click();
  await page.keyboard.press('Control+i');
  await expect(page.locator('td[data-r="1"][data-c="1"]')).toHaveCSS('font-style', 'italic');
  await expect(header).toHaveCSS('background-color', 'rgb(255, 255, 0)');

  const { unzipSync, strFromU8 } = await import('fflate');
  const xlsx = unzipSync(new Uint8Array((await saveAs(page, 'Excel workbook (.xlsx)')).data));
  const styles = strFromU8(xlsx['xl/styles.xml']!);
  expect(styles).toContain('<b/>');
  expect(styles).toContain('<fgColor rgb="FFFFFF00"/>');
  expect(styles).toContain('<alignment horizontal="center"/>');
});

test('filters the rows of a table by the values of a column (SHEET-018)', async ({ page }) => {
  const errors = await openApp(page);
  await openFile(page, 'class.csv', 'Name,Class,Score\nAlice,A,17\nBilal,B,9\nChloé,A,12\nDavid,,14\n', 'text/csv');
  await page.locator('td[data-r="1"][data-c="0"]').click();
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Filter', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Filter column B' }).click();
  const dialog = page.getByRole('dialog', { name: 'Show in “Class”' });
  await expect(dialog.getByRole('checkbox')).toHaveCount(4);
  await dialog.getByLabel('B', { exact: true }).uncheck();
  await dialog.getByLabel('(Empty)').uncheck();
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect(page.locator('td[data-r="2"]')).toHaveCount(0);
  await expect(page.locator('td[data-r="4"]')).toHaveCount(0);
  await expect(page.locator('th[data-row="3"]')).toBeVisible();
  // The arrows skip the hidden rows.
  await page.locator('td[data-r="1"][data-c="0"]').click();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.name-box')).toHaveText('A4');
  const xlsx = await saveAs(page, 'Excel workbook (.xlsx)');
  const { unzipSync } = await import('fflate');
  const sheet = new TextDecoder().decode(unzipSync(new Uint8Array(xlsx.data))['xl/worksheets/sheet1.xml']);
  expect(sheet).toContain('<autoFilter ref="A1:C5">');
  expect(sheet).toContain('<row r="3" hidden="1">');
  // Showing everything again.
  await page.getByRole('button', { name: 'Filter column B' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Show all' }).click();
  await expect(page.locator('td[data-r="2"][data-c="0"]')).toHaveText('Bilal');
  expect(errors).toEqual([]);
});
