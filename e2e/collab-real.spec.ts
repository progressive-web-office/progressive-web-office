import { expect, test, type Page } from '@playwright/test';
import { openApp, openFile } from './helpers';
import { startRelay, type TestRelay } from './nostr-relay';

let relay: TestRelay;
test.beforeAll(async () => {
  relay = await startRelay();
});
test.afterAll(async () => relay.close());

/** The real network stack (trystero, WebRTC), with a relay of this machine. */
async function useRelay(page: Page): Promise<void> {
  await page.addInitScript((url) => localStorage.setItem('pwo.collab.network', JSON.stringify({ relays: [url] })), relay.url);
}

test('two browsers find each other through a relay and edit together (COLLAB-001, COLLAB-002)', async ({ browser }) => {
  test.setTimeout(90_000);
  const alice = await (await browser.newContext()).newPage();
  await useRelay(alice);
  await openApp(alice);
  await openFile(alice, 'notes.csv', 'Item,Qty\nPens,3\n', 'text/csv');
  await alice.getByRole('button', { name: 'Collaborate' }).click();
  const invite = alice.getByRole('dialog', { name: 'Invite people' });
  const url = await invite.getByLabel('Invitation link').inputValue();
  await invite.getByRole('button', { name: 'Close' }).click();

  const bob = await (await browser.newContext()).newPage();
  await useRelay(bob);
  await bob.goto(url);
  try {
    await expect(bob.locator('td[data-r="1"][data-c="0"]')).toHaveText('Pens', { timeout: 60_000 });
  } catch (err) {
    // What each side says, to tell a discovery problem from a sync problem.
    const state = async (p: Page) => p.locator('.collab-bar').textContent().catch(() => '(no bar)');
    console.log('DIAG alice:', await state(alice), '| bob:', await state(bob), '| relay events:', relay.events, '| bob url:', bob.url());
    throw err;
  }
  await expect(alice.locator('.collab-bar')).toContainText('Connected · 1 other(s)');
  // Renaming oneself keeps the connection, and the others see the new name.
  await alice.locator('.collab-person.self').click();
  const rename = alice.getByRole('dialog', { name: 'Change how others see you' });
  await rename.getByRole('textbox').fill('Ann Lee');
  await rename.getByRole('button', { name: 'OK' }).click();
  await expect(bob.locator('.collab-person:not(.self)')).toHaveText('Ann Lee', { timeout: 15_000 });
  await expect(bob.locator('.collab-bar')).toContainText('Connected · 1 other(s)');
  await expect(alice.locator('.collab-bar')).toContainText('Connected · 1 other(s)');
});

test('goes through the relays when the browsers cannot connect directly (COLLAB-011)', async ({ browser }) => {
  test.setTimeout(120_000);
  // A network that blocks direct connections: WebRTC may only use TURN servers, and there is none.
  const blocked = async (page: Page): Promise<void> => {
    await useRelay(page);
    await page.addInitScript(() => {
      const Real = window.RTCPeerConnection;
      const Blocked = function (config?: RTCConfiguration) {
        return new Real({ ...config, iceTransportPolicy: 'relay' });
      } as unknown as typeof RTCPeerConnection;
      Blocked.prototype = Real.prototype;
      Object.assign(Blocked, Real);
      window.RTCPeerConnection = Blocked;
    });
  };
  const alice = await (await browser.newContext()).newPage();
  await blocked(alice);
  await openApp(alice);
  await openFile(alice, 'notes.csv', 'Item,Qty\nPens,3\n', 'text/csv');
  await alice.getByRole('button', { name: 'Collaborate' }).click();
  const invite = alice.getByRole('dialog', { name: 'Invite people' });
  const url = await invite.getByLabel('Invitation link').inputValue();
  await invite.getByRole('button', { name: 'Close' }).click();
  const bob = await (await browser.newContext()).newPage();
  await blocked(bob);
  await bob.goto(url);
  await expect(bob.locator('td[data-r="1"][data-c="0"]')).toHaveText('Pens', { timeout: 60_000 });
  await expect(bob.locator('.collab-bar')).toContainText('Connected through the relays');
  // An edit reaches the other side.
  await bob.locator('td[data-r="1"][data-c="1"]').click();
  await bob.keyboard.type('7');
  await bob.keyboard.press('Enter');
  await expect(alice.locator('td[data-r="1"][data-c="1"]')).toHaveText('7', { timeout: 20_000 });
});
