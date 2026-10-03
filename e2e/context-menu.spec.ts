import { expect, test } from '@playwright/test';
import { openApp, openFile, saveAs } from './helpers';

// UI-021: what can be done where the pointer is, by a right click, a long press or the ⋮ button.

test('a right click offers editing, tables of a chosen size, their rows and columns, and code cells (UI-021)', async ({ page }) => {
  const errors = await openApp(page);
  await openFile(page, 'menu.md', '# Menu\n\nSome text here.\n');
  const text = page.locator('.doc-page p').first();
  await text.click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'Document menu' });
  await expect(menu.getByRole('menuitem', { name: 'Copy' })).toBeDisabled();
  await expect(menu.getByRole('menuitem', { name: 'Paste' })).toBeEnabled();
  // A table of 2 rows and 4 columns, picked in the grid.
  await menu.getByRole('button', { name: 'Table of 2 × 4' }).click();
  await expect(menu).toHaveCount(0);
  const table = page.locator('.doc-page table');
  await expect(table.locator('tr')).toHaveCount(2);
  await expect(table.locator('tr').first().locator('td, th')).toHaveCount(4);
  // In the table: rows and columns.
  await table.locator('td').first().click({ button: 'right' });
  await menu.getByRole('menuitem', { name: 'Insert a row below' }).click();
  await expect(table.locator('tr')).toHaveCount(3);
  await table.locator('td').first().click({ button: 'right' });
  await menu.getByRole('menuitem', { name: 'Delete the column' }).click();
  await expect(table.locator('tr').first().locator('td, th')).toHaveCount(3);
  // Escape closes the menu and gives the focus back to the document.
  await text.click({ button: 'right' });
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  // A code cell to run.
  await text.click({ button: 'right' });
  await menu.getByRole('menuitem', { name: 'Code cell to run…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Insert code cell' });
  await dialog.getByLabel('Language').selectOption('javascript');
  await dialog.locator('.cm-content').fill('console.log(6 * 7)');
  await dialog.getByRole('button', { name: 'Insert' }).click();
  const cell = page.locator('.doc-page .code-cell');
  await expect(cell).toHaveCount(1);
  // On the cell: its own actions.
  await cell.locator('.code-cell-source').click({ button: 'right' });
  await menu.getByRole('menuitem', { name: 'Run cell' }).click();
  await page.getByRole('dialog', { name: 'Run the code of this document?' }).getByRole('button', { name: 'Run' }).click();
  await expect(cell.locator('.code-cell-output')).toHaveText('42\n');
  await cell.locator('.code-cell-source').click({ button: 'right' });
  await menu.getByRole('menuitem', { name: 'Delete the cell' }).click();
  await expect(cell).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('``` and a language, then Enter, starts a code cell in that language (CODE-001)', async ({ page }) => {
  await openApp(page);
  await openFile(page, 'fence.md', 'Text\n');
  await page.locator('.doc-page p').first().click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('```lua');
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Insert code cell' });
  await expect(dialog.getByLabel('Language')).toHaveValue('lua');
  await dialog.locator('.cm-content').fill('print(1)');
  await dialog.getByRole('button', { name: 'Insert' }).click();
  await expect(page.locator('.doc-page .code-cell')).toHaveAttribute('data-lang', 'lua');
  await expect(page.locator('.doc-page')).not.toContainText('```');
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });

  test('a long press, or the ⋮ button, opens the menu as a sheet (UI-021)', async ({ page }) => {
    await openApp(page);
    await openFile(page, 'phone.md', '# Phone\n\nSome text here.\n');
    const text = page.locator('.doc-page p').first();
    const box = (await text.boundingBox())!;
    await text.evaluate(
      (el, { x, y }) => {
        const touch = new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
        el.dispatchEvent(new TouchEvent('touchstart', { touches: [touch], targetTouches: [touch], changedTouches: [touch], bubbles: true }));
      },
      { x: box.x + 10, y: box.y + 5 },
    );
    const menu = page.getByRole('menu', { name: 'Document menu' });
    await expect(menu).toBeVisible();
    await expect(menu).toHaveClass(/sheet/);
    const item = menu.getByRole('menuitem', { name: 'Paste' });
    expect((await item.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    // Tapping outside closes it.
    await page.locator('.context-menu-backdrop').click({ position: { x: 10, y: 10 } });
    await expect(menu).toHaveCount(0);
    await page.getByRole('button', { name: 'Actions', exact: true }).click();
    await expect(menu).toBeVisible();
  });
});

test('inserts fields that show their value, and freezes one into text (DOC-041)', async ({ page }) => {
  const errors = await openApp(page);
  await openFile(page, 'fields.md', '---\ntitle: My report\n---\n\nTitle: \n');
  const text = page.locator('.doc-page p').first();
  await text.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' ');
  // The ⋮ button: the menu at the cursor.
  await page.getByRole('button', { name: 'Actions', exact: true }).click();
  const menu = page.getByRole('menu', { name: 'Document menu' });
  await menu.getByRole('menuitem', { name: 'Title of the document' }).click();
  await expect(text.locator('.pm-field')).toHaveText('My report');
  await page.keyboard.type(', page ');
  await page.getByRole('button', { name: 'Actions', exact: true }).click();
  await menu.getByRole('menuitem', { name: 'Page number' }).click();
  await expect(text.locator('.pm-field').nth(1)).toHaveText('1');
  // Saved as Markdown, they stay fields.
  const md = (await saveAs(page, 'Markdown (.md)')).data.toString('utf8');
  expect(md).toContain('Title: {title}, page {page}');
  // Frozen, the title becomes text.
  await text.locator('.pm-field').first().click({ button: 'right' });
  await menu.getByRole('menuitem', { name: 'Replace by its value now' }).click();
  await expect(text.locator('.pm-field')).toHaveCount(1);
  await expect(text).toContainText('Title: My report, page 1');
  expect(errors).toEqual([]);
});

test('what templates use can be changed again: fields, table of contents, paragraph spacing (DOC-041, DOC-023, DOC-020)', async ({ page }) => {
  const errors = await openApp(page);
  await openFile(page, 'tpl.md', '[TOC]\n\n# One\n\n## Two\n\n### Three\n\nParis, {date}.\n');
  const doc = page.getByRole('textbox', { name: 'Document' });
  // The field shows something else.
  await doc.locator('.pm-field').click({ button: 'right' });
  await page.getByRole('menu').getByRole('menuitem', { name: /Show instead: .*time/i }).click();
  await expect(doc.locator('.pm-field')).toHaveAttribute('data-field', 'time');
  // The table of contents goes one level deeper or shallower.
  const toc = doc.locator('nav.toc');
  await expect(toc.locator('li')).toHaveCount(3);
  await toc.click({ button: 'right' });
  await page.getByRole('menu').getByRole('menuitem', { name: 'Headings of levels 1 to 2' }).click();
  await expect(toc.locator('li')).toHaveCount(2);
  // The spacing of a paragraph.
  await doc.locator('p', { hasText: 'Paris' }).click({ button: 'right' });
  await page.getByRole('menu').getByRole('menuitem', { name: 'Paragraph spacing…' }).click();
  await expect(page.getByRole('dialog', { name: 'Paragraph' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a number format not in the list is shown and can be changed (SHEET-014)', async ({ page }) => {
  const errors = await openApp(page);
  await openFile(page, 'm.csv', 'x\n1.5\n');
  const format = page.getByLabel('Number format');
  await page.locator('td[data-r="1"][data-c="0"]').click();
  page.once('dialog', (d) => void d.accept('0.000'));
  await format.selectOption({ label: 'Other format…' });
  await expect(page.locator('td[data-r="1"][data-c="0"]')).toHaveText('1.500');
  await expect(format.locator('option:checked')).toHaveText('0.000');
  expect(errors).toEqual([]);
});
