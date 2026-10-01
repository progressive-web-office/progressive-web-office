/**
 * Integration with a real QRShare instance (SHARE-001, SHARE-002, SHARE-004,
 * SHARE-005). Runs only when QRSHARE_URL points to a served QRShare build,
 * e.g. QRSHARE_URL=http://localhost:3000/ (see docs/development.md).
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import { openApp, openFile } from './helpers';

const QRSHARE_URL = process.env.QRSHARE_URL;
test.skip(!QRSHARE_URL, 'set QRSHARE_URL to a running QRShare build');

const jsQR = readFileSync(createRequire(import.meta.url).resolve('jsqr/dist/jsQR.js'), 'utf8');

/** Decode the QR code shown by an <img> in the page. */
async function decodeQr(page: Page, selector: string): Promise<string | null> {
  await page.addScriptTag({ content: jsQR });
  return page.locator(selector).evaluate(async (img: HTMLImageElement) => {
    await img.decode();
    // Quiet zone: draw on a white canvas with a margin.
    const pad = 32;
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth + 2 * pad;
    canvas.height = img.naturalHeight + 2 * pad;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, pad, pad);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const decode = (window as unknown as { jsQR: (d: Uint8ClampedArray, w: number, h: number) => { data: string } | null }).jsQR;
    return decode(data.data, data.width, data.height)?.data ?? null;
  });
}

async function setQrShareAddress(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog', { name: 'Send to another device' });
  await dialog.getByText('Advanced').click();
  await dialog.getByLabel('QRShare address').fill(QRSHARE_URL!);
}

test('a text document reaches QRShare intact and is encoded as a QR code', async ({ page, context }) => {
  const text = '# Café & thé\n\nÉnergie : $E=mc^2$ — 100 % 😀\n';
  const errors = await openApp(page);
  await openFile(page, 'note.md', text);
  await expect(page.locator('.doc-page h1')).toHaveText('Café & thé');

  await page.getByRole('button', { name: 'Send to another device…' }).click();
  await setQrShareAddress(page);
  await page.getByRole('dialog', { name: 'Send to another device' }).getByLabel('Transfer policy').selectOption('airgap');
  const popup = context.waitForEvent('page');
  await page.getByRole('dialog', { name: 'Send to another device' }).getByRole('button', { name: 'Send', exact: true }).click();
  const qr = await popup;
  await qr.waitForLoadState();

  // QRShare's transfer chooser received the exact document (byte count) and the policy.
  const sent = text;
  await expect(qr.getByRole('heading', { name: 'Choose how to send' })).toBeVisible();
  await expect(qr.getByText(`Payload: ${Buffer.byteLength(sent, 'utf8')} UTF-8 bytes`)).toBeVisible();
  await expect(qr.getByText('Air-gapped policy: only optical transfer modes are available.')).toBeVisible();
  await expect(qr.getByRole('button', { name: 'WebRTC' })).toHaveCount(0);

  // Static QR code: the text is handed to the creator and encoded; decode it back.
  await qr.getByRole('button', { name: 'Static QR code' }).click();
  await expect(qr.locator('#qr-text')).toHaveValue(sent);
  await expect(qr.locator('img.qr-image')).toBeVisible();
  expect(await decodeQr(qr, 'img.qr-image')).toBe(sent);
  expect(errors).toEqual([]);
});

test('binary documents open QRShare\'s "Prepare a transfer" screen and receiving opens its QR receiver', async ({ page, context }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'New spreadsheet' }).click();
  await page.getByRole('button', { name: 'Send to another device…' }).click();
  await setQrShareAddress(page);
  const download = page.waitForEvent('download');
  const popup = context.waitForEvent('page');
  await page.getByRole('dialog', { name: 'Send to another device' }).getByRole('button', { name: 'Send', exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/\.xlsx$/);
  const prepare = await popup;
  await expect(prepare.getByRole('heading', { name: 'Prepare a transfer' })).toBeVisible();

  await page.getByRole('button', { name: 'Close' }).click();
  const receive = context.waitForEvent('page');
  await page.getByRole('button', { name: 'Receive from another device…' }).click();
  const receiver = await receive;
  await expect(receiver.getByRole('heading', { name: 'Receive via QR' })).toBeVisible();
  expect(new URL(receiver.url()).origin).toBe(new URL(QRSHARE_URL!).origin);
});
