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
