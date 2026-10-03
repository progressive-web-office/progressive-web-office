import { expect, test } from '@playwright/test';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openApp } from './helpers';

test('shows a document read-only, then allows edits again (FILE-017)', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'New document' }).click();
  const editor = page.getByRole('textbox', { name: 'Document' });
  await editor.click();
  await page.keyboard.type('Draft');
  await page.getByRole('button', { name: 'Read-only' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Read-only: changes are not allowed.' })).toBeVisible();
  await expect(page.getByRole('toolbar', { name: 'Formatting' })).toBeHidden();
  await editor.click();
  await page.keyboard.type(' more');
  await expect(editor).toHaveText('Draft');
  await page.locator('.header-actions').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('This document is read-only');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await editor.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' more');
  await expect(editor).toHaveText('Draft more');
});

test('opens documents of a read-only folder read-only, editable as a copy (FILE-017)', async ({ page }) => {
  const dir = mkdtempSync(join(tmpdir(), 'pwo-ro-'));
  mkdirSync(join(dir, 'notes'));
  writeFileSync(join(dir, 'notes', 'plan.md'), '# Plan\n\nKeep this.\n');
  await page.addInitScript(() => {
    delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
  });
  await openApp(page);
  await page.getByRole('button', { name: 'Open a folder' }).click();
  const dialog = page.getByRole('dialog', { name: 'Open a folder' });
  await dialog.getByLabel('A folder of this device (read-only in this browser)').check();
  const chooser = page.waitForEvent('filechooser');
  await dialog.getByRole('button', { name: 'Open' }).click();
  await (await chooser).setFiles(dir);
  const panel = page.getByRole('complementary', { name: 'Folder' });
  await panel.getByRole('button', { name: 'notes', exact: true }).click();
  await panel.getByRole('button', { name: 'plan.md' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'comes from a place that cannot be written' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit a copy' }).click();
  await expect(page.locator('.doc-name')).toHaveText('plan (copy).md');
  const editor = page.getByRole('textbox', { name: 'Document' });
  await editor.locator('p').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Edited.');
  await expect(editor.locator('p')).toHaveText('Keep this. Edited.');
});
