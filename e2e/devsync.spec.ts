import { expect, test } from '@playwright/test';
import { openApp } from './helpers';

// DEVSYNC-001..DEVSYNC-005: one's own devices, peer to peer.

test('warns before synchronising devices, then pairs this one with a secret code (DEVSYNC-001, DEVSYNC-005)', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pwo.collab.transport', 'local'));
  const errors = await openApp(page);
  await page.getByRole('button', { name: 'Sync my devices' }).click();
  const dialog = page.getByRole('dialog', { name: 'Sync my devices' });
  // The warnings come first, and must be acknowledged.
  await expect(dialog.getByText(/Synchronisation is not a backup/)).toBeVisible();
  await expect(dialog.getByText(/deleted on all the others\. It is kept in the trash of each device for 30 days/)).toBeVisible();
  await expect(dialog.getByText(/not for working with others/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await expect(dialog.getByText('Tick the box to say you understand the warnings.')).toBeVisible();
  await dialog.getByLabel(/I understand/).check();
  await dialog.getByRole('button', { name: 'Continue' }).click();
  // A wrong code is refused.
  await dialog.getByLabel('Pairing code').fill('hello');
  await dialog.getByRole('button', { name: 'Pair', exact: true }).click();
  await expect(dialog.getByText(/This is not a pairing code/)).toBeVisible();
  // The first device creates the pairing: a code and a QR code for the others.
  await dialog.getByLabel('Name of this device').fill('Test laptop');
  await dialog.getByRole('button', { name: 'Create a pairing' }).click();
  const code = dialog.locator('.devsync-code-text');
  await expect(code).toHaveText(/^pwo-sync:[\w-]{8,}\.[\w-]{24,}$/);
  await expect(dialog.locator('img.devsync-qr')).toBeVisible();
  await expect(dialog.getByText('No other device yet.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Sync now' }).click();
  await expect(dialog.getByText(/No other device is online/)).toBeVisible();
  const first = await code.textContent();
  // A new code revokes the old one.
  page.once('dialog', (d) => void d.accept());
  await dialog.getByRole('button', { name: /New code/ }).click();
  await expect(code).not.toHaveText(first!);
  // Stopping keeps the documents, and forgets the pairing.
  page.once('dialog', (d) => void d.accept());
  await dialog.getByRole('button', { name: 'Stop synchronising this device' }).click();
  await expect(dialog.getByRole('button', { name: 'Create a pairing' })).toBeVisible();
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('pwo.devsync') ?? '{}'));
  expect(state.name).toBe('Test laptop');
  expect(state.pairing).toBeUndefined();
  expect(errors).toEqual([]);
});
