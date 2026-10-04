import { expect, test } from '@playwright/test';
import { openApp } from './helpers';

// DEVSYNC-001..DEVSYNC-006: one's own devices, peer to peer.

test('warns before synchronising devices, then pairs this one and shows invitations (DEVSYNC-001, DEVSYNC-005, DEVSYNC-006)', async ({ page }) => {
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
  // A wrong link is refused.
  await dialog.getByLabel('Invitation link').fill('hello');
  await dialog.getByRole('button', { name: 'Pair', exact: true }).click();
  await expect(dialog.getByText(/This is not an invitation link/)).toBeVisible();
  // The first device creates the pairing, then shows one-time invitations: no key in sight.
  await dialog.getByLabel('Name of this device').fill('Test laptop');
  await dialog.getByRole('button', { name: 'Create a pairing' }).click();
  await expect(dialog.getByText('No other device yet.')).toBeVisible();
  // What is synchronised is said, with the documents to open.
  await expect(dialog.getByText(/^Synchronised documents: \d+\./)).toBeVisible();
  await expect(dialog.getByText(/The recent files of a device are files of its own disk/)).toBeVisible();
  await expect(dialog.locator('img.devsync-qr')).toHaveCount(0);
  // Turning while it looks for the other devices.
  await expect(dialog.getByText('Looking for your other devices…')).toBeVisible();
  await dialog.getByRole('button', { name: 'Show an invitation QR code' }).click();
  await expect(dialog.locator('img.devsync-qr')).toBeVisible();
  await expect(dialog.getByText('Waiting for the new device…')).toBeVisible();
  await expect(dialog.getByText(/Valid until .*, for one device\./)).toBeVisible();
  await dialog.getByRole('button', { name: 'Sync now' }).click();
  await expect(dialog.getByText(/No other device is online/)).toBeVisible();
  const key = async (): Promise<string> => page.evaluate(() => JSON.parse(localStorage.getItem('pwo.devsync') ?? '{}').pairing?.secret);
  const first = await key();
  // A new key unpairs the other devices.
  page.once('dialog', (d) => void d.accept());
  await dialog.getByRole('button', { name: /New key/ }).click();
  await expect.poll(key).not.toBe(first);
  // Stopping keeps the documents, and forgets the pairing.
  page.once('dialog', (d) => void d.accept());
  await dialog.getByRole('button', { name: 'Stop synchronising this device' }).click();
  await expect(dialog.getByRole('button', { name: 'Create a pairing' })).toBeVisible();
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('pwo.devsync') ?? '{}'));
  expect(state.name).toBe('Test laptop');
  expect(state.pairing).toBeUndefined();
  expect(errors).toEqual([]);
});

test('a new device joins by an invitation link, accepted on the paired device after comparing the emojis (DEVSYNC-006)', async ({ browser }) => {
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  await context.addInitScript(() => {
    localStorage.setItem('pwo.collab.transport', 'local');
    localStorage.setItem('pwo.toolbar', 'full');
  });
  // The paired device shows an invitation.
  const laptop = await context.newPage();
  await openApp(laptop);
  await laptop.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('pwo.devsync') ?? '{}');
    localStorage.setItem('pwo.devsync', JSON.stringify({ ...s, name: 'Laptop', understood: true, pairing: { room: 'room-of-the-test', secret: 'the-key-of-the-documents-in-test', since: 1 } }));
  });
  await laptop.getByRole('button', { name: 'Sync my devices' }).click();
  const host = laptop.getByRole('dialog', { name: 'Sync my devices' });
  await host.getByRole('button', { name: 'Show an invitation QR code' }).click();
  // What to do on the new device is said here.
  await expect(host.getByText(/Scan this QR code/)).toBeVisible();
  await host.getByRole('button', { name: 'Copy the link' }).click();
  const link = await laptop.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(/#pwo-pair=/);
  expect(link).not.toContain('the-key-of-the-documents-in-test');
  // The new device opens the link: the invitation leaves its address at once.
  const phone = await context.newPage();
  // Another device: its own synchronisation state (the pages of one browser share their storage).
  await phone.addInitScript(() => {
    const own = (k: string): string => (k === 'pwo.devsync' ? 'pwo.devsync.phone' : k);
    const { getItem, setItem } = Storage.prototype;
    Storage.prototype.getItem = function (k: string) { return getItem.call(this, own(k)); };
    Storage.prototype.setItem = function (k: string, v: string) { setItem.call(this, own(k), v); };
  });
  await phone.goto(link);
  const join = phone.getByRole('dialog', { name: 'Sync my devices' });
  await expect(phone).not.toHaveURL(/pwo-pair/);
  await join.getByLabel(/I understand/).check();
  await join.getByRole('button', { name: 'Continue' }).click();
  // The link is in place; the device is named, then paired.
  await expect(join.getByText(/Invitation received/)).toBeVisible();
  await join.getByLabel('Name of this device').fill('Phone');
  await join.getByLabel('Name of this device').press('Tab');
  await join.getByRole('button', { name: 'Pair', exact: true }).click();
  const emojis = join.locator('.devsync-emojis');
  await expect(emojis).toBeVisible();
  // The same emojis on the paired device, where the user accepts.
  await expect(host.getByText('Phone asks to join', { exact: false })).toBeVisible();
  // At the top of the window, in sight without scrolling, Accept focused.
  await expect(host.getByRole('alertdialog')).toBeInViewport();
  await expect(host.getByRole('button', { name: 'Accept' })).toBeFocused();
  await expect(host.locator('.devsync-emojis')).toHaveText((await emojis.textContent())!);
  await host.getByRole('button', { name: 'Accept' }).click();
  await expect(host.getByText(/is paired\./)).toBeVisible();
  await expect(join.getByText('No other device yet.').or(join.getByText(/Laptop/))).toBeVisible();
  const secret = await phone.evaluate(() => JSON.parse(localStorage.getItem('pwo.devsync') ?? '{}').pairing?.secret);
  expect(await phone.evaluate(() => JSON.parse(localStorage.getItem('pwo.devsync') ?? '{}').name)).toBe('Phone');
  expect(secret).toBe('the-key-of-the-documents-in-test');
  // Both devices show the same fingerprint of the pairing.
  const print = (d: typeof host): Promise<string | null> => d.getByText(/Fingerprint of the pairing/).textContent();
  await expect(join.getByText(/Fingerprint of the pairing/)).toBeVisible();
  expect(await print(join)).toBe(await print(host));
  // Sync now says what it does, under the button.
  await join.getByRole('button', { name: 'Sync now' }).click();
  await expect(join.locator('.devsync-now')).not.toBeEmpty();
  await context.close();
});

test('an invitation opened on a device already paired offers to join it instead (DEVSYNC-006)', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pwo.collab.transport', 'local'));
  await openApp(page);
  await page.evaluate(() => localStorage.setItem('pwo.devsync', JSON.stringify({ device: 'd1', name: 'Tablet', understood: true, auto: false, peers: {}, base: {}, known: {}, deleted: {}, pairing: { room: 'an-old-pairing-room', secret: 'an-old-key-of-older-documents', since: 1 } })));
  const expires = Math.floor(Date.now() / 1000 + 300).toString(36);
  await page.goto(`./#pwo-pair=room-of-an-invite.secret-of-an-invitation-xyz.${expires}`);
  const dialog = page.getByRole('dialog', { name: 'Sync my devices' });
  await expect(dialog.getByText(/already paired with other devices/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Join this invitation' }).click();
  await expect(dialog.locator('.devsync-emojis')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pwo.devsync') ?? '{}').pairing)).toBeUndefined();
});

test('the command palette syncs the devices, shows an invitation or scans one (DEVSYNC-006)', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pwo.collab.transport', 'local'));
  await openApp(page);
  await page.evaluate(() => localStorage.setItem('pwo.devsync', JSON.stringify({ device: 'd1', name: 'Laptop', understood: true, auto: false, peers: {}, base: {}, known: {}, deleted: {}, pairing: { room: 'room-of-the-palette', secret: 'the-key-of-the-documents-palette', since: 1 } })));
  const palette = page.getByRole('dialog', { name: 'Commands' });
  await page.keyboard.press('Control+Shift+P');
  await palette.getByRole('combobox').fill('scan an invitation');
  await expect(palette.getByRole('option').first()).toContainText('Pair this device: scan an invitation QR code');
  await palette.getByRole('combobox').fill('sync my devices now');
  await expect(palette.getByRole('option').first()).toContainText('Sync my devices now');
  await page.keyboard.press('Enter');
  await expect(page.getByText(/No other device is online/)).toBeVisible();
  await page.keyboard.press('Control+Shift+P');
  await palette.getByRole('combobox').fill('show an invitation');
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Sync my devices' });
  await expect(dialog.locator('img.devsync-qr')).toBeVisible();
});

test('a paired device saves a document in the browser, synchronised; recent documents can be added (DEVSYNC-007)', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pwo.collab.transport', 'local'));
  const errors = await openApp(page);
  await page.evaluate(() => localStorage.setItem('pwo.devsync', JSON.stringify({ device: 'd1', name: 'Laptop', understood: true, auto: false, peers: {}, base: {}, known: {}, deleted: {}, pairing: { room: 'room-of-the-save', secret: 'the-key-of-the-documents-save', since: 1 } })));
  await page.getByRole('button', { name: 'New document' }).click();
  await page.locator('.ProseMirror').click();
  await page.keyboard.type('An article');
  await page.locator('.header-actions').getByRole('button', { name: 'Save', exact: true }).click();
  const where = page.getByRole('dialog', { name: 'Save where?' });
  await where.getByLabel('In the browser — synchronised with my devices').check();
  await where.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(/saved in the browser: it reaches your other devices/)).toBeVisible();
  // In Browser storage › Documents, the folder now open.
  const names = await page.evaluate(async () => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('Documents');
    const out: string[] = [];
    for await (const [name] of (dir as unknown as { entries(): AsyncIterable<[string, unknown]> }).entries()) out.push(name);
    return out;
  });
  expect(names.some((n) => /\.(odt|docx)$/.test(n))).toBe(true);
  // The sync window counts it.
  await page.keyboard.press('Control+Shift+P');
  await page.getByRole('combobox', { name: 'Commands' }).fill('show an invitation');
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Sync my devices' });
  await expect(dialog.getByText('Synchronised documents: 1.')).toBeVisible();
  expect(errors).toEqual([]);
});
