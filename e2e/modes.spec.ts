import { expect, test } from '@playwright/test';
import { openApp, openFile, saveAs } from './helpers';

// DOC-044: visual editing, the source beside a live preview, and reading.

test('edits the Markdown source beside a preview, then reads, then edits visually again (DOC-044)', async ({ page }) => {
  const errors = await openApp(page);
  await openFile(page, 'notes.md', '# Notes\n\nSome **bold** text.\n');
  const view = page.getByLabel('View', { exact: true }).first();
  await view.selectOption({ label: 'Source' });
  const source = page.getByRole('textbox', { name: 'Markdown source' });
  await expect(source).toContainText('# Notes');
  const preview = page.getByRole('region', { name: 'Preview' });
  await expect(preview.locator('h1')).toHaveText('Notes');
  await expect(page.getByRole('toolbar', { name: 'Formatting' })).toBeHidden();

  // Typed in the source, shown in the preview.
  await source.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\n## Plan\n\nA *new* line.');
  await expect(preview.locator('h2')).toHaveText('Plan');
  await expect(preview.locator('em')).toHaveText('new');

  // Saved from the source.
  const md = (await saveAs(page, 'Markdown (.md)')).data.toString();
  expect(md).toContain('## Plan\n\nA *new* line.');

  // Reading: nothing can be typed.
  await page.locator('.doc-mode-bar').getByRole('button', { name: 'Reading' }).click();
  const doc = page.getByRole('textbox', { name: 'Document' });
  await expect(doc.locator('h2')).toHaveText('Plan');
  await expect(doc).toHaveAttribute('contenteditable', 'false');

  // Back to visual editing, with what was typed in the source.
  await page.locator('.doc-mode-bar').getByRole('button', { name: 'Visual editing' }).click();
  await expect(doc).toHaveAttribute('contenteditable', 'true');
  await expect(page.getByRole('toolbar', { name: 'Formatting' })).toBeVisible();
  await doc.locator('h2').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' B');
  await expect(doc.locator('h2')).toHaveText('Plan B');
  expect(errors).toEqual([]);
});

test('remembers the mode of a kind of document (DOC-044)', async ({ page }) => {
  await openApp(page);
  await openFile(page, 'a.md', '# A\n');
  await page.getByLabel('View', { exact: true }).first().selectOption({ label: 'Source' });
  await expect(page.getByRole('textbox', { name: 'Markdown source' })).toBeVisible();
  await page.locator('.header-actions').getByRole('button', { name: 'Close' }).click();
  await openFile(page, 'b.md', '# B\n');
  await expect(page.getByRole('textbox', { name: 'Markdown source' })).toContainText('# B');
  // A Word document has no source: it opens for visual editing.
  await page.locator('.header-actions').getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'New document' }).first().click();
  await expect(page.getByRole('toolbar', { name: 'Formatting' })).toBeVisible();
});
