import { expect, test } from '@playwright/test';
import { openApp } from './helpers';

// FILE-032: a document kept in the browser, opened by typing part of its name.

test('opens a document of the browser storage by its name (FILE-032)', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const docs = await root.getDirectoryHandle('Documents', { create: true });
    const put = async (dir: FileSystemDirectoryHandle, name: string, text: string) => {
      const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
      await w.write(text);
      await w.close();
    };
    await put(docs, 'Shopping list.md', '# Shopping list\n');
    const notes = await docs.getDirectoryHandle('notes', { create: true });
    await put(notes, 'Project Alpha.md', '# Project Alpha\n\nThe plan.\n');
    await put(notes, 'ignored.bin', 'x');
  });

  await page.keyboard.press('Control+Shift+O');
  const go = page.getByRole('dialog', { name: 'Go to file…' });
  await expect(go.getByRole('option')).toHaveCount(2);
  await go.getByRole('combobox').fill('alpha');
  await expect(go.getByRole('option')).toHaveCount(1);
  await expect(go.getByRole('option')).toContainText('notes');
  await go.getByRole('combobox').press('Enter');
  await expect(page.locator('.ProseMirror')).toContainText('The plan.');

  // From the command palette too.
  await page.keyboard.press('Control+Shift+P');
  await page.getByRole('combobox', { name: 'Commands' }).fill('go to file');
  await page.getByRole('combobox', { name: 'Commands' }).press('Enter');
  await page.getByRole('dialog', { name: 'Go to file…' }).getByRole('combobox').fill('shop');
  await expect(page.getByRole('dialog', { name: 'Go to file…' }).getByRole('option')).toHaveText([/Shopping list\.md/]);
  expect(errors).toEqual([]);
});
