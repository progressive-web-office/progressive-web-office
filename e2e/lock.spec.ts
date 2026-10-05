import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

// LOCK-001..LOCK-004: the application locked by a passkey, what the browser keeps encrypted.

/** A file of the browser's storage as it is kept (not opened). */
const raw = (page: Page, path: string) =>
  page.evaluate(async (p) => {
    let dir = await navigator.storage.getDirectory();
    const parts = p.split('/');
    for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part);
    return (await (await dir.getFileHandle(parts.at(-1)!)).getFile()).text();
  }, path);

async function openSecurity(page: Page) {
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await dialog.getByRole('tab', { name: 'Security' }).click();
  return dialog;
}

test('locks the application with a passkey, encrypts what it keeps, and opens it again (LOCK-001..LOCK-004)', async ({ page, context }) => {
  test.setTimeout(90_000);
  // A passkey of the device, which gives a secret (PRF), as recent devices do.
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, hasPrf: true, automaticPresenceSimulation: true },
  });
  const errors = await openApp(page);
  await page.evaluate(async () => {
    const docs = await (await navigator.storage.getDirectory()).getDirectoryHandle('Documents', { create: true });
    const w = await (await docs.getFileHandle('Diary.md', { create: true })).createWritable();
    await w.write('# Dear diary\n\nA secret.\n');
    await w.close();
    localStorage.setItem('pwo.webdav.accounts', JSON.stringify([{ id: 'a', label: 'Cloud', url: 'https://cloud.example.org/remote.php/dav/files/ada/', user: 'ada', password: 'app-password' }]));
  });

  // Set: a recovery key shown once, kept before going on.
  page.on('dialog', (d) => void d.accept());
  let settings = await openSecurity(page);
  await settings.getByRole('button', { name: 'Lock with a passkey…' }).click();
  const recovery = page.getByRole('dialog', { name: 'Your recovery key' });
  const key = (await recovery.getByLabel('Recovery key', { exact: true }).textContent())!;
  expect(key).toMatch(/^([A-Z2-9]{4}-){7}[A-Z2-9]{4}$/);
  await expect(recovery.getByRole('button', { name: 'Continue' })).toBeDisabled();
  await recovery.getByLabel('I have kept my recovery key').check();
  await recovery.getByRole('button', { name: 'Continue' }).click();
  await expect(settings).toContainText('The application is locked by 1 passkeys, and by the recovery key.');
  // Encrypted as kept: the document, the account with its password.
  expect(await raw(page, 'Documents/Diary.md')).toMatch(/^PWOENC1/);
  expect(await raw(page, 'Documents/Diary.md')).not.toContain('secret');
  expect(await page.evaluate(() => localStorage.getItem('pwo.webdav.accounts'))).toMatch(/^pwoenc1:/);
  await settings.getByRole('button', { name: 'Close' }).click();

  // Started again: locked, nothing shown before the passkey.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Progressive Web Office is locked' })).toBeVisible();
  await expect(page.locator('#app')).toBeHidden();
  await page.getByRole('button', { name: 'Unlock with a passkey' }).click();
  await expect(page.getByRole('heading', { name: 'Progressive Web Office', exact: false }).first()).toBeVisible();
  await page.keyboard.press('Control+Shift+O');
  await page.getByRole('dialog', { name: 'Go to file…' }).getByRole('option', { name: /Diary\.md/ }).click();
  await expect(page.locator('.ProseMirror')).toContainText('A secret.');
  // A document written while locked is encrypted too.
  await page.locator('.ProseMirror p').last().click();
  await page.keyboard.type(' More.');
  await page.keyboard.press('Control+s');
  await expect.poll(() => raw(page, 'Documents/Diary.md')).toMatch(/^PWOENC1/);

  // The recovery key opens it too, a wrong one is refused.
  await page.reload();
  await page.getByText('Use the recovery key').click();
  const field = page.getByRole('textbox', { name: 'Recovery key' });
  await field.fill('AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA');
  await field.press('Enter');
  await expect(page.getByRole('alert').filter({ hasText: 'This is not the recovery key.' })).toBeVisible();
  await field.fill(key.toLowerCase());
  await field.press('Enter');
  await expect(page.locator('#app')).toBeVisible();

  // Removed: everything readable again without any key.
  settings = await openSecurity(page);
  await settings.getByRole('button', { name: 'Remove the lock…' }).click();
  await expect(settings.getByRole('button', { name: 'Lock with a passkey…' })).toBeVisible({ timeout: 20_000 });
  expect(await raw(page, 'Documents/Diary.md')).toContain('A secret. More.');
  expect(await page.evaluate(() => localStorage.getItem('pwo.webdav.accounts'))).toContain('app-password');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Progressive Web Office is locked' })).toHaveCount(0);
  expect(errors).toEqual([]);
});
