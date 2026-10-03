import { expect, test } from '@playwright/test';
import { openApp, openFile, saveAs } from './helpers';

// DOC-049: text in columns, as in a newspaper.

test('sets paragraphs in columns, breaks a column, changes the columns again and keeps them in files (DOC-049)', async ({ page }) => {
  const errors = await openApp(page);
  await openFile(page, 'gazette.md', '# Gazette\n\nFirst story, long enough to fill a line or two of a narrow column in the page.\n\nSecond story.\n\nThe end.\n');
  const editor = page.locator('.doc-page');
  // Select the two stories, then Columns… from the context menu.
  await editor.locator('p').first().click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+ArrowDown');
  await editor.locator('p').first().click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'Document menu' });
  await menu.getByRole('menuitem', { name: 'Columns…' }).click();
  let dialog = page.getByRole('dialog', { name: 'Columns' });
  await dialog.getByLabel('Number of columns').selectOption('3');
  await dialog.getByLabel('Line between the columns').check();
  await dialog.getByRole('button', { name: 'OK' }).click();
  const cols = editor.locator('div.columns');
  await expect(cols).toHaveCount(1);
  await expect(cols).toHaveCSS('column-count', '3');
  await expect(cols).toHaveCSS('column-rule-style', 'solid');
  await expect(cols.locator('p')).toHaveCount(2);
  // The heading and the last paragraph stay outside.
  await expect(cols.locator('h1')).toHaveCount(0);
  // A column break after the first story (Ctrl+Shift+Enter).
  await cols.locator('p').first().click();
  await page.keyboard.press('End');
  await page.keyboard.press('Control+Shift+Enter');
  await expect(cols.locator('hr.column-break')).toHaveCount(1);
  await expect(cols.locator('hr.column-break')).toHaveAttribute('data-label', 'Column break');
  const md = (await saveAs(page, 'Markdown (.md)')).data.toString('utf8');
  expect(md).toContain('::: {.columns count=3 rule}');
  expect(md).toContain('\\columnbreak');
  // Changed again from the context menu: two columns, then back to one.
  await cols.locator('p').last().click({ button: 'right' });
  await menu.getByRole('menuitem', { name: 'Change the columns…' }).click();
  dialog = page.getByRole('dialog', { name: 'Columns' });
  await expect(dialog.getByLabel('Number of columns')).toHaveValue('3');
  await dialog.getByLabel('Number of columns').selectOption('2');
  await dialog.getByRole('button', { name: 'OK' }).click();
  await expect(cols).toHaveCSS('column-count', '2');
  // Kept in OpenDocument.
  const odt = await saveAs(page, 'OpenDocument text (.odt)');
  await page.locator('.header-actions').getByRole('button', { name: 'Close' }).click();
  await openFile(page, 'gazette.odt', odt.data);
  await expect(page.locator('.doc-page div.columns')).toHaveCSS('column-count', '2');
  await page.locator('.doc-page div.columns p').first().click({ button: 'right' });
  await page.getByRole('menu', { name: 'Document menu' }).getByRole('menuitem', { name: 'Back to one column' }).click();
  await expect(page.locator('.doc-page div.columns')).toHaveCount(0);
  expect(errors).toEqual([]);
});
