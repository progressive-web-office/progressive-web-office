import { expect, test } from '@playwright/test';
import { openApp, openFile, saveAs } from './helpers';

// COLOR-001, COLOR-002: colours by their values, and as printed.

test('chooses a colour by its CMYK values, warns of colours a printer cannot print and shows them as printed (COLOR-001, COLOR-002)', async ({ page }) => {
  const errors = await openApp(page);
  await openFile(page, 'colours.md', 'Coloured words here.\n');
  const doc = page.locator('.doc-page');
  await doc.locator('p').first().click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.getByRole('button', { name: 'Text colour: Colour (RGB, CMYK)…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Text colour' });
  // CMYK values give the screen colour.
  await dialog.getByLabel('Cyan').fill('100');
  await dialog.getByLabel('Magenta').fill('28.6');
  await dialog.getByLabel('Yellow').fill('0');
  await dialog.getByLabel('Black').fill('12.2');
  await expect(dialog.getByLabel('Hexadecimal')).toHaveValue('#00a0e0');
  await expect(dialog.getByLabel('Red', { exact: true })).toHaveValue('0');
  await expect(dialog.getByText('Total ink: 140.8 %.')).toBeVisible();
  // A screen blue a printer cannot print.
  await dialog.getByLabel('Hexadecimal').fill('#0000ff');
  await expect(dialog.getByText(/Brighter than a printer can print/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Use the printable colour' })).toBeVisible();
  // Too much ink.
  await dialog.getByLabel('Cyan').fill('100');
  await dialog.getByLabel('Magenta').fill('100');
  await dialog.getByLabel('Yellow').fill('100');
  await dialog.getByLabel('Black').fill('100');
  await expect(dialog.getByText(/More than 300 %/)).toBeVisible();
  await dialog.getByLabel('Hexadecimal').fill('#0000ff');
  await dialog.getByRole('button', { name: 'OK' }).click();
  const coloured = doc.locator('span[data-color]');
  await expect(coloured).toHaveAttribute('data-color', '#0000ff');
  await expect(coloured).toHaveCSS('color', 'rgb(0, 0, 255)');
  // View › Print colours: shown duller, as printed; the document keeps its colour.
  await page.getByLabel('View', { exact: true }).first().selectOption({ label: 'Print colours (CMYK preview)' });
  await expect(coloured).not.toHaveCSS('color', 'rgb(0, 0, 255)');
  const md = (await saveAs(page, 'LaTeX (.tex)')).data.toString('utf8');
  expect(md).toContain('\\textcolor[HTML]{0000FF}{Coloured words here.}');
  // The colour is among the recent ones.
  await page.getByRole('button', { name: 'Highlight colour: Colour (RGB, CMYK)…' }).click();
  await expect(page.getByRole('dialog', { name: 'Highlight colour' }).getByRole('group', { name: 'Recent' }).getByRole('button', { name: '#0000ff' })).toBeVisible();
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});
