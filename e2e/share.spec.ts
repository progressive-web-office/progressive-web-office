import { expect, test } from '@playwright/test';
import { openApp, openFile } from './helpers';

test.beforeEach(async ({ context }) => {
  // Never reach the real QRShare during tests.
  await context.route('https://s-celles.github.io/**', (route) => route.fulfill({ contentType: 'text/html', body: '<title>QRShare</title>' }));
});

test('sends a small text document to QRShare with the chosen policy (SHARE-002, SHARE-004)', async ({ page, context }) => {
  const errors = await openApp(page);
  await openFile(page, 'note.md', '# Hello\n');
  await page.getByRole('button', { name: 'Send to another device…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Send to another device' });
  await expect(dialog.getByRole('note')).toHaveText('The document will open in QRShare, ready to send.');
  await dialog.getByLabel('Transfer policy').selectOption('airgap');
  const popup = context.waitForEvent('page');
  await dialog.getByRole('button', { name: 'Send', exact: true }).click();
  const url = new URL((await popup).url());
  expect(url.origin + url.pathname).toBe('https://s-celles.github.io/QRShare/');
  const params = new URLSearchParams(url.hash.replace(/^#\/send\?/, ''));
  expect(url.hash.startsWith('#/send?')).toBe(true);
  expect(params.get('data')).toBe('# Hello\n');
  expect(params.get('policy')).toBe('airgap');

  // SHARE-005 remembers the policy for receiving too.
  await page.getByRole('button', { name: 'Close' }).click();
  const receive = context.waitForEvent('page');
  await page.getByRole('button', { name: 'Receive from another device…' }).click();
  expect((await receive).url()).toBe('https://s-celles.github.io/QRShare/#/receive/qr?policy=airgap');
  expect(errors).toEqual([]);
});

test('binary documents are downloaded and QRShare opens its transfer screen (SHARE-001)', async ({ page, context }) => {
  const errors = await openApp(page);
  await page.getByRole('button', { name: 'New spreadsheet' }).click();
  await page.getByRole('button', { name: 'Send to another device…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Send to another device' });
  // Desktop Chromium on Linux has no Web Share API: download fallback.
  await expect(dialog.getByRole('note')).toContainText('downloaded');
  const download = page.waitForEvent('download');
  const popup = context.waitForEvent('page');
  await dialog.getByRole('button', { name: 'Send', exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/\.xlsx$/);
  expect((await popup).url()).toBe('https://s-celles.github.io/QRShare/#/create/url');
  expect(errors).toEqual([]);
});

test('opens files shared to the app through the Web Share Target (SHARE-003)', async ({ page }) => {
  await openApp(page);
  await expect
    .poll(() => page.evaluate(async () => (await navigator.serviceWorker?.getRegistration())?.active?.state ?? 'none'), { timeout: 20_000 })
    .toBe('activated');
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker?.controller);
  // Simulate the OS share sheet: a multipart POST navigation to the share target
  // (from a blank page: the app's own CSP forbids form submissions).
  const target = new URL('share-target', page.url()).href;
  await page.goto('about:blank');
  await page.evaluate((action) => {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = action;
    form.enctype = 'multipart/form-data';
    const input = document.createElement('input');
    input.type = 'file';
    input.name = 'file';
    const dt = new DataTransfer();
    dt.items.add(new File(['# Received\n\nFrom QRShare.\n'], 'received.md', { type: 'text/markdown' }));
    input.files = dt.files;
    form.append(input);
    document.body.append(form);
    form.submit();
  }, target);
  await expect(page.locator('.doc-page h1')).toHaveText('Received');
  await expect(page.locator('.doc-name')).toHaveText('received.md');
  expect(new URL(page.url()).search).toBe('');
});

test('declares the share target in the manifest', async ({ request }) => {
  const manifest = await (await request.get('manifest.webmanifest')).json();
  expect(manifest.share_target).toMatchObject({ action: './share-target', method: 'POST', enctype: 'multipart/form-data' });
  expect(manifest.share_target.params.files[0].accept).toContain('.docx');
});
