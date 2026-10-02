import { expect, test, type Browser, type Page } from '@playwright/test';
import { openApp, openFile } from './helpers';

const ID = '0f8c2b1e-5d4a-4c3b-9a21-7e6f5d4c3b2a';
const NOTE = `---\ntitle: Plan\nidentifier: ${ID}\n---\n\n# Plan\n\nHello world\n\nSecond\n`;

/** A device: its own browser context (storage), QRShare's manifest without handoff v2. */
async function device(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  await context.route('https://s-celles.github.io/**', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ qrshare_handoff: { versions: [1] } }) }));
  const page = await context.newPage();
  await openApp(page);
  await openFile(page, 'plan.md', NOTE, 'text/markdown');
  await expect(page.getByRole('textbox', { name: 'Document' })).toContainText('Hello world');
  return page;
}

const dialogOf = (page: Page) => page.getByRole('dialog', { name: 'Synchronise without a network' });

async function openSync(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Sync by QR' }).click();
  await expect(dialogOf(page)).toBeVisible();
}

/** Save the codes shown by `page` as a file. */
async function codes(page: Page): Promise<Buffer> {
  const download = page.waitForEvent('download');
  await dialogOf(page).getByRole('button', { name: 'Save the codes as a file' }).click();
  const stream = await (await download).createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

/** Import codes into `page`, trusting the device and applying its changes. */
async function scan(page: Page, data: Buffer, opts: { trust?: boolean } = {}): Promise<void> {
  const chooser = page.waitForEvent('filechooser');
  await dialogOf(page).getByRole('button', { name: 'Import a file of codes…' }).click();
  await (await chooser).setFiles({ name: 'plan.qsyn', mimeType: 'application/octet-stream', buffer: data });
  if (opts.trust) await page.getByRole('dialog', { name: 'A device introduces itself' }).getByRole('button', { name: 'Trust' }).click();
}

async function apply(page: Page): Promise<void> {
  const review = page.getByRole('dialog', { name: 'Changes received' });
  await expect(review).toContainText('additions');
  await review.getByRole('button', { name: 'Apply' }).click();
}

async function edit(page: Page, from: string, to: string): Promise<void> {
  const editor = page.getByRole('textbox', { name: 'Document' });
  await editor.getByText(from, { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(to);
}

test('two devices merge their edits through passes of codes (COLLAB-008)', async ({ browser }) => {
  const ana = await device(browser);
  const bob = await device(browser);

  // Nobody has the history of this file yet: Ana starts it, then sends the whole document.
  await openSync(ana);
  await expect(dialogOf(ana)).toContainText('does not have the synchronisation history');
  await dialogOf(ana).getByRole('button', { name: 'Start the history from this copy' }).click();
  await dialogOf(ana).getByRole('button', { name: 'Send the whole document (one way)' }).click();
  const all = await codes(ana);
  await dialogOf(ana).getByRole('button', { name: 'Close' }).first().click();

  // Bob joins with it: his copy is replaced by Ana's history.
  await openSync(bob);
  await scan(bob, all, { trust: true });
  await apply(bob);
  await expect(dialogOf(bob)).toContainText('the changes of the other device were merged');
  await dialogOf(bob).getByRole('button', { name: 'Close' }).first().click();

  // Both edit the same paragraph.
  await edit(ana, 'Hello world', ', brave');
  await edit(bob, 'Second', ' line');

  // Pass 1: Ana shows her state; pass 2: Bob answers; pass 3: Ana answers.
  await openSync(ana);
  await dialogOf(ana).getByRole('button', { name: 'Start: show my state' }).click();
  const pass1 = await codes(ana);
  await openSync(bob);
  await scan(bob, pass1);
  await expect(dialogOf(bob)).toContainText('Ready to show');
  const pass2 = await codes(bob);
  await scan(ana, pass2, { trust: true });
  await apply(ana);
  await expect(dialogOf(ana)).toContainText('Changes merged');
  const pass3 = await codes(ana);
  await scan(bob, pass3);
  await apply(bob);
  await expect(dialogOf(bob)).toContainText('the changes of the other device were merged');

  for (const page of [ana, bob]) {
    const editor = page.getByRole('textbox', { name: 'Document' });
    await expect(editor).toContainText('Hello world, brave');
    await expect(editor).toContainText('Second line');
  }
});

test('refuses codes of another document (COLLAB-008)', async ({ browser }) => {
  const ana = await device(browser);
  await openSync(ana);
  await dialogOf(ana).getByRole('button', { name: 'Start the history from this copy' }).click();
  await dialogOf(ana).getByRole('button', { name: 'Send the whole document (one way)' }).click();
  const all = await codes(ana);

  const other = await browser.newContext();
  await other.route('https://s-celles.github.io/**', (route) => route.fulfill({ contentType: 'application/json', body: '{}' }));
  const page = await other.newPage();
  await openApp(page);
  await page.getByRole('button', { name: 'New document' }).click();
  await openSync(page);
  await scan(page, all);
  await expect(dialogOf(page)).toContainText('These codes are for another document.');
  await scan(page, Buffer.from('not codes'));
  await expect(dialogOf(page)).toContainText('These codes could not be used');
});
