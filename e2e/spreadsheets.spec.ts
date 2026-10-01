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
