import { expect, test, type Page } from '@playwright/test';
import { openApp, openFile } from './helpers';
import { newVault, openVault, saveVault, newEntry, setFields, entriesOf, fieldOf } from '../src/vault/kdbx';

// VAULT-001..VAULT-004: a vault of passwords in the KDBX format, opened, changed, saved.

async function saved(page: Page): Promise<Uint8Array> {
  const download = page.waitForEvent('download');
  await page.keyboard.press('Control+s');
  const d = await download;
  const chunks: Buffer[] = [];
  for await (const c of await d.createReadStream()) chunks.push(c as Buffer);
  return new Uint8Array(Buffer.concat(chunks));
}

test('opens a KDBX vault, shows codes and passwords when asked, changes it and saves it (VAULT-001..VAULT-004)', async ({ page, context }) => {
  test.setTimeout(90_000);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  // A vault made as another application would.
  const db = await newVault('Family', 'correct horse battery');
  const mail = newEntry(db, undefined, 'Mail');
  setFields(db, mail, { UserName: 'ada@example.org', Password: 's3cret!', URL: 'https://mail.example.org', otp: 'otpauth://totp/Mail?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ' });
  const bytes = await saveVault(db);
  // The check against breaches answers from here (k-anonymity: only a prefix of the hash asked).
  let asked = '';
  await page.route('https://api.pwnedpasswords.com/range/*', (route) => {
    asked = route.request().url();
    return route.fulfill({ body: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:0\n', headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  const errors = await openApp(page);
  page.on('dialog', (d) => void d.accept(d.type() === 'prompt' ? 'Bank' : undefined));
  await openFile(page, 'family.kdbx', Buffer.from(bytes));

  const view = page.getByRole('region', { name: 'family.kdbx' });
  await view.getByLabel('Master password').fill('wrong password');
  await view.getByLabel('Master password').press('Enter');
  await expect(view.getByRole('alert')).toHaveText('The master password (or the key file) does not open this vault.');
  await view.getByLabel('Master password').fill('correct horse battery');
  await view.getByRole('button', { name: 'Open the vault' }).click();
  const details = view.getByRole('form', { name: 'Mail' });
  await expect(details.getByRole('textbox', { name: 'User name' })).toHaveValue('ada@example.org');
  // The password hidden until shown; copied, it is in the clipboard.
  const password = details.getByLabel('Password', { exact: true });
  await expect(password).toHaveAttribute('type', 'password');
  await details.getByRole('button', { name: 'Show the password' }).click();
  await expect(password).toHaveAttribute('type', 'text');
  await details.getByRole('button', { name: 'Copy the password' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('s3cret!');
  // The one-time code of the entry.
  await expect(details.locator('.vault-code')).toHaveText(/^\d{3} \d{3} · \d+s$/);
  // Checked against breaches after consent, by a prefix of its hash only.
  await details.getByRole('button', { name: 'Check against known breaches' }).click();
  await expect(details).toContainText('Not found in known breaches.');
  expect(asked).toMatch(/\/range\/[0-9A-F]{5}$/);

  // Changed: a new password generated, a new entry.
  await details.getByRole('button', { name: 'Generate a password' }).click();
  const generated = await password.inputValue();
  expect(generated).toHaveLength(20);
  await details.getByRole('button', { name: 'Keep the changes' }).click();
  await view.getByRole('button', { name: 'New entry' }).click();
  await expect(view.getByRole('form', { name: 'Bank' })).toBeVisible();
  await page.screenshot({ path: 'test-results/vault.png' });

  // Saved as a KDBX file the other applications open with the same password.
  const back = await openVault(await saved(page), 'correct horse battery');
  const entries = entriesOf(back);
  expect(entries.map((e) => e.title)).toEqual(['Bank', 'Mail']);
  expect(fieldOf(back, entries[1]!.uuid, 'Password')).toBe(generated);
  expect(errors).toEqual([]);
});

test('makes a new vault from the command palette (VAULT-001)', async ({ page }) => {
  const errors = await openApp(page);
  await page.keyboard.press('Control+Shift+P');
  await page.getByRole('combobox', { name: 'Commands' }).fill('password vault');
  await page.getByRole('option', { name: /New password vault/ }).click();
  const dialog = page.getByRole('dialog', { name: 'A new password vault' });
  await dialog.getByLabel('Name').fill('Mine');
  await dialog.getByLabel('Master password', { exact: true }).fill('short');
  await dialog.getByLabel('Master password again').fill('short');
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(dialog.getByRole('alert')).toContainText('10 characters or more');
  await dialog.getByLabel('Master password', { exact: true }).fill('a long master phrase');
  await dialog.getByLabel('Master password again').fill('a long master phrase');
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('region', { name: 'Mine.kdbx' }).getByRole('button', { name: 'New entry' })).toBeVisible({ timeout: 20_000 });
  expect(errors).toEqual([]);
});
