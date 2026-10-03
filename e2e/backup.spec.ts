import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openApp } from './helpers';

// BACKUP-001..BACKUP-005: backups of the documents kept in the browser.

test('backs up the browser’s documents encrypted, and restores them file by file (BACKUP-001, BACKUP-003)', async ({ page }) => {
  const errors = await openApp(page);
  // A document in the browser's storage.
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('Documents', { create: true });
    const file = await dir.getFileHandle('letter.md', { create: true });
    const w = await file.createWritable();
    await w.write('# Dear friend');
    await w.close();
  });
  const header = page.locator('.header-actions');
  await expect(header.getByRole('button', { name: 'Backup' })).toHaveText('💾 !');
  await header.getByRole('button', { name: 'Backup' }).click();
  const dialog = page.getByRole('dialog', { name: 'Backup' });
  await expect(dialog.getByText('No backup yet')).toBeVisible();
  await dialog.getByText('Why back up?').click();
  await expect(dialog.getByText(/Synchronisation is not a backup/)).toBeVisible();
  await expect(dialog.getByText(/The 3-2-1 rule/)).toBeVisible();
  await dialog.getByLabel('Password', { exact: true }).fill('short');
  await dialog.getByRole('button', { name: 'Back up now' }).click();
  await expect(dialog.getByText('The password needs at least 8 characters.')).toBeVisible();
  await dialog.getByLabel('Password', { exact: true }).fill('correct horse');
  await dialog.getByLabel('Again').fill('correct horse');
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Back up now' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^pwo-backup-\d{4}-\d{2}-\d{2}-\d{4}\.pwobackup$/);
  const path = await file.path();
  const bytes = readFileSync(path);
  expect(bytes.subarray(0, 8).toString()).toBe('PWOBAK1\n');
  expect(bytes.toString('latin1')).not.toContain('Dear friend');
  await expect(dialog.getByText(/Last backup: today/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(header.getByRole('button', { name: 'Backup' })).toHaveText('💾 today');

  // The document is changed; the backup is restored next to it.
  await page.evaluate(async () => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('Documents');
    const w = await (await dir.getFileHandle('letter.md')).createWritable();
    await w.write('# Changed');
    await w.close();
  });
  await header.getByRole('button', { name: 'Backup' }).click();
  await page.getByRole('dialog', { name: 'Backup' }).getByRole('button', { name: 'Restore…' }).click();
  const restore = page.getByRole('dialog', { name: 'Restore a backup' });
  const chooser = page.waitForEvent('filechooser');
  await restore.getByRole('button', { name: 'From a backup file…' }).click();
  await (await chooser).setFiles(path);
  await restore.getByLabel('Password', { exact: true }).fill('wrong password');
  await restore.getByRole('button', { name: 'Open' }).click();
  await expect(restore.getByText('Wrong password.')).toBeVisible();
  await restore.getByLabel('Password', { exact: true }).fill('correct horse');
  await restore.getByRole('button', { name: 'Open' }).click();
  await expect(restore.getByText(/: 1 files\./)).toBeVisible();
  await expect(restore.getByLabel(/Documents\/letter\.md/)).toBeChecked();
  await restore.getByRole('button', { name: 'Restore the selected files' }).click();
  await expect(restore.getByText(/0 restored, 1 restored next to a newer file/)).toBeVisible();
  const names = await page.evaluate(async () => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('Documents');
    const out: string[] = [];
    for await (const name of (dir as unknown as { keys(): AsyncIterable<string> }).keys()) out.push(name);
    return out.sort();
  });
  expect(names).toHaveLength(2);
  expect(names[0]).toMatch(/^letter \(restored \d{4}-\d{2}-\d{2}\)\.md$/);
  expect(errors).toEqual([]);
});
