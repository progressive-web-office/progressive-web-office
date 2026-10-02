import { expect, test, type Page } from '@playwright/test';
import { openApp, openFile } from './helpers';

/** Use the same-browser transport (BroadcastChannel) instead of the Internet. */
async function localTransport(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('pwo.collab.transport', 'local'));
}

const cell = (page: Page, r: number, c: number) => page.locator(`td[data-r="${r}"][data-c="${c}"]`);

async function start(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Collaborate' }).click();
  const invite = page.getByRole('dialog', { name: 'Invite people' });
  const url = await invite.getByLabel('Invitation link').inputValue();
  await invite.getByRole('button', { name: 'Close' }).click();
  return url;
}

test('edits a spreadsheet together, with presence and versions (COLLAB-001..COLLAB-005)', async ({ context }) => {
  const alice = await context.newPage();
  await localTransport(alice);
  const aliceErrors = await openApp(alice);
  await openFile(alice, 'notes.csv', 'Item,Qty\nPens,3\n', 'text/csv');
  const url = await start(alice);
  expect(url).toMatch(/#collab=s\.[\w-]+\.[\w-]+$/);
  await expect(alice.locator('.collab-bar')).toContainText('Nobody else yet');

  const bob = await context.newPage();
  await localTransport(bob);
  const bobErrors: string[] = [];
  bob.on('pageerror', (e) => bobErrors.push(e.message));
  await bob.goto(url);
  // Bob receives the shared spreadsheet.
  await expect(cell(bob, 1, 0)).toHaveText('Pens');
  await expect(bob.locator('.collab-person')).toHaveCount(2);
  await expect(alice.locator('.collab-bar')).toContainText('Connected · 1 other(s)');

  // Concurrent edits of different cells merge.
  await cell(alice, 1, 1).click();
  await alice.keyboard.type('5');
  await alice.keyboard.press('Enter');
  await cell(bob, 2, 0).click();
  await bob.keyboard.type('Paper');
  await bob.keyboard.press('Enter');
  for (const page of [alice, bob]) {
    await expect(cell(page, 1, 1)).toHaveText('5');
    await expect(cell(page, 2, 0)).toHaveText('Paper');
  }

  // Alice sees where Bob is.
  await cell(bob, 3, 1).click();
  await expect(cell(alice, 3, 1)).toHaveClass(/peer/);
  const bobName = (await bob.locator('.collab-person.self').textContent())!.replace(' (you)', '');
  await expect(cell(alice, 3, 1)).toHaveAttribute('data-peer', bobName);

  // A version saved by Alice reaches Bob, who restores it for everyone.
  await alice.getByRole('button', { name: 'Versions' }).click();
  const versions = alice.getByRole('dialog', { name: 'Saved versions' });
  await versions.getByLabel('Version name').fill('Before stock-take');
  await versions.getByRole('button', { name: 'Save version' }).click();
  await expect(versions.locator('.collab-versions li')).toHaveCount(1);
  await versions.getByRole('button', { name: 'Close' }).click();

  await cell(alice, 1, 1).click();
  await alice.keyboard.type('99');
  await alice.keyboard.press('Enter');
  await expect(cell(bob, 1, 1)).toHaveText('99');

  await bob.getByRole('button', { name: 'Versions' }).click();
  const bobVersions = bob.getByRole('dialog', { name: 'Saved versions' });
  await expect(bobVersions.locator('.collab-versions li').first()).toContainText('Before stock-take');
  await bobVersions.getByRole('button', { name: 'Restore' }).first().click();
  await bob.getByRole('dialog', { name: 'Restore' }).getByRole('button', { name: 'Restore' }).click();
  await expect(cell(alice, 1, 1)).toHaveText('5');
  await expect(cell(bob, 1, 1)).toHaveText('5');
  await expect(bobVersions.locator('.collab-versions li')).toHaveCount(2);
  await bobVersions.getByRole('button', { name: 'Close' }).click();

  // Bob leaves: Alice is alone again.
  await bob.getByRole('button', { name: 'Leave', exact: true }).click();
  await expect(alice.locator('.collab-person')).toHaveCount(1);
  expect(aliceErrors).toEqual([]);
  expect(bobErrors).toEqual([]);
});

test('writes a text document together (COLLAB-002)', async ({ context }) => {
  const alice = await context.newPage();
  await localTransport(alice);
  await openApp(alice);
  await alice.getByRole('button', { name: 'New document' }).click();
  await alice.getByRole('textbox', { name: 'Document' }).click();
  await alice.keyboard.type('Hello from Alice');
  const url = await start(alice);

  const bob = await context.newPage();
  await localTransport(bob);
  await bob.goto(url);
  const bobPage = bob.getByRole('textbox', { name: 'Document' });
  await expect(bobPage).toContainText('Hello from Alice');
  // Alice goes back to the end of her sentence.
  await alice.getByRole('textbox', { name: 'Document' }).click();
  await alice.keyboard.press('Control+End');
  await bobPage.click();
  await bob.keyboard.press('Control+End');
  await bob.keyboard.press('Enter');
  await bob.keyboard.type('And Bob');
  await expect(alice.getByRole('textbox', { name: 'Document' })).toContainText('And Bob');
  // Alice's caret stayed where it was while Bob's paragraph arrived.
  await alice.keyboard.type('!');
  await expect(bobPage.locator('p').first()).toHaveText('Hello from Alice!');
  await expect(bobPage.locator('p').nth(1)).toHaveText('And Bob');
});

test('offers several ways to send the invitation (COLLAB-001)', async ({ context, page }) => {
  await localTransport(page);
  await openApp(page);
  await page.getByRole('button', { name: 'New spreadsheet' }).click();
  await page.getByRole('button', { name: 'Collaborate' }).click();
  const invite = page.getByRole('dialog', { name: 'Invite people' });
  const url = await invite.getByLabel('Invitation link').inputValue();
  await expect(invite.getByRole('img', { name: 'QR code of the invitation link' })).toBeVisible();
  const mail = await invite.getByRole('link', { name: 'Email' }).getAttribute('href');
  expect(decodeURIComponent(mail!)).toContain(url);
  await expect(invite.getByText('Anyone with the link can edit')).toBeVisible();

  // QRShare receives the link as text to transfer.
  await context.route('https://s-celles.github.io/QRShare/**', (route) => route.fulfill({ contentType: 'text/html', body: '<title>QRShare</title>' }));
  const popup = context.waitForEvent('page');
  await invite.getByRole('button', { name: 'Send with QRShare' }).click();
  const qrshare = await popup;
  expect(qrshare.url()).toContain('https://s-celles.github.io/QRShare/#/send?');
  expect(new URLSearchParams(qrshare.url().split('#/send?')[1]).get('data')).toBe(url);
  await qrshare.close();

  // Full screen, for a projector.
  await invite.getByRole('button', { name: 'Show full screen' }).click();
  const big = page.getByRole('dialog', { name: 'QR code, full screen' });
  await expect(big.getByRole('img', { name: 'QR code of the invitation link' })).toBeVisible();
  await expect(big).toContainText(url);
  await page.keyboard.press('Escape');
  await expect(big).toBeHidden();
  await expect(invite).toBeVisible();
});

test('says what it is waiting for, explains what to check, and spots another app in the room (COLLAB-009, COLLAB-010)', async ({ context }) => {
  const bob = await context.newPage();
  await localTransport(bob);
  await bob.clock.install();
  const errors = await openApp(bob);
  const base = new URL('./', bob.url()).href;
  await bob.goto(`${base}#collab=d.room12345678.secretsecretsecret1234`);
  const bar = bob.locator('.collab-bar');
  await expect(bar).toContainText('Looking for the others…');
  // UI-019: a spinner while waiting.
  await expect(bar.locator('.spinner')).toBeVisible();
  await bob.clock.fastForward(25_000);
  await expect(bar.locator('.collab-help')).toContainText('Nobody found yet');

  // Something else in the room, introducing itself as another app.
  const other = await context.newPage();
  await other.goto(base);
  await other.evaluate(() => {
    const channel = new BroadcastChannel('pwo-collab-room12345678');
    const from = 'stranger';
    channel.onmessage = (e) => {
      if (e.data.type === 'hello') channel.postMessage({ from, type: 'here', to: e.data.from });
    };
    channel.postMessage({ from, type: 'hello' });
    setTimeout(() => channel.postMessage({ from, type: 'action', ns: 'pwo-hello', data: JSON.stringify({ app: 'something-else', protocol: 1, kind: 'document' }) }), 300);
  });
  await bob.clock.fastForward(3_000);
  await expect(bar).toContainText('Someone joined with another app or another version');
  await expect(bar.locator('.collab-help')).toContainText('does not speak the same protocol');
  expect(errors).toEqual([]);
});

test('keeps the relays and the TURN server of the collaboration (COLLAB-009)', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await dialog.getByRole('tab', { name: 'Collaboration' }).click();
  await dialog.getByLabel('Relays (Nostr)').fill('relay.example.org\nwss://nos.lol');
  await dialog.getByLabel('TURN server', { exact: true }).fill('turn:turn.example.org:3478');
  await dialog.getByLabel('TURN user name').fill('ann');
  await dialog.getByLabel('TURN password').fill('secret');
  await dialog.getByLabel('TURN password').press('Tab');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('pwo.collab.network') ?? '{}'));
  expect(stored).toEqual({ relays: ['wss://relay.example.org', 'wss://nos.lol'], turn: { urls: 'turn:turn.example.org:3478', username: 'ann', credential: 'secret' } });
});
