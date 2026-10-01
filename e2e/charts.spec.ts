import { expect, test } from '@playwright/test';
import { unzipSync, strFromU8 } from 'fflate';
import { openApp, openFile, saveAs } from './helpers';

const CSV = 'Mois,Ventes,Coûts\nJan,120,80\nFév,150,90\nMar,90,95\n';

test('inserts, edits, saves and reopens a chart (SHEET-020..SHEET-023)', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const errors = await openApp(page);
  await openFile(page, 'ventes.csv', CSV, 'text/csv');
  await page.locator('td[data-r="1"][data-c="1"]').click();

  // The data block around the active cell is proposed, with the header row detected.
  await page.getByRole('button', { name: 'Insert chart' }).click();
  const dialog = page.getByRole('dialog', { name: 'Insert chart' });
  await expect(dialog.getByLabel('Data range')).toHaveValue('A1:C4');
  await expect(dialog.getByLabel('First row contains series names')).toBeChecked();
  await expect(dialog.locator('.chart-preview rect.bar')).toHaveCount(6);
  await dialog.getByLabel('Title').fill('Bilan du trimestre');
  await dialog.getByRole('button', { name: 'Insert' }).click();

  const chart = page.locator('.sheet-chart');
  await expect(chart).toHaveCount(1);
  await expect(chart).toHaveAttribute('aria-label', 'Chart: Bilan du trimestre');
  await expect(chart.locator('rect.bar')).toHaveCount(6);
  await expect(page.locator('.modified')).toBeVisible();

  // Charts follow the data.
  const heightOf = async () => Number(await chart.locator('rect.bar').first().getAttribute('height'));
  const before = await heightOf();
  await page.locator('td[data-r="1"][data-c="1"]').click();
  await page.keyboard.type('240');
  await page.keyboard.press('Enter');
  await expect.poll(heightOf).toBeGreaterThan(before);

  // Edit: switch to lines.
  await chart.focus();
  await chart.getByRole('button', { name: 'Edit chart' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit chart' });
  await edit.getByLabel('Chart type').selectOption('line');
  await edit.getByRole('button', { name: 'Update' }).click();
  await expect(chart.locator('polyline.series')).toHaveCount(2);

  // Copy as image.
  await chart.focus();
  await chart.getByRole('button', { name: 'Copy as image' }).click();
  await expect(chart.getByRole('button', { name: 'Copy as image' })).toHaveText('✓');

  // Saved as a real Excel chart, and read back.
  const xlsx = await saveAs(page, 'Excel workbook (.xlsx)');
  const zip = unzipSync(new Uint8Array(xlsx.data));
  expect(strFromU8(zip['xl/charts/chart1.xml']!)).toContain('<c:lineChart>');
  await openFile(page, 'ventes.xlsx', xlsx.data);
  await expect(page.locator('.sheet-chart polyline.series')).toHaveCount(2);
  await expect(page.locator('.sheet-chart')).toHaveAttribute('aria-label', 'Chart: Bilan du trimestre');

  // And as an OpenDocument chart.
  const ods = await saveAs(page, 'OpenDocument spreadsheet (.ods)');
  expect(strFromU8(unzipSync(new Uint8Array(ods.data))['Object 1/content.xml']!)).toContain('chart:class="chart:line"');

  // Delete from the keyboard.
  await page.locator('.sheet-chart').focus();
  await page.keyboard.press('Delete');
  await expect(page.locator('.sheet-chart')).toHaveCount(0);
  expect(errors).toEqual([]);
});
