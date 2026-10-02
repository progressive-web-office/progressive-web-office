import { expect, test, type BrowserContext } from '@playwright/test';
import { openApp, openFile } from './helpers';

/**
 * Stand-in for QRShare (never reach the real one during these tests). With
 * `#/send?handoff=1` it plays the receiving side of the handoff protocol and
 * shows what it got in its title.
 */
const FAKE_QRSHARE = `<!doctype html><title>QRShare</title><script>
if (location.hash.includes('handoff=1') && window.opener) {
  addEventListener('message', (e) => {
    if (e.source !== window.opener || !e.data || e.data.type !== 'qrshare-handoff' || e.data.action !== 'file') return;
    document.title = 'got ' + e.data.name + ' ' + e.data.data.byteLength + ' from ' + e.origin;
    e.source.postMessage({ type: 'qrshare-handoff', version: 1, action: 'received' }, e.origin);
  });
  window.opener.postMessage({ type: 'qrshare-handoff', version: 1, action: 'ready' }, '*');
}
</script>`;

/** Serve a stand-in QRShare whose manifest declares (or not) the handoff protocol. */
async function fakeQrShare(context: BrowserContext, opts: { page?: string; manifest?: object | null } = {}): Promise<void> {
  await context.route('https://s-celles.github.io/**', (route) => {
    if (route.request().url().endsWith('/manifest.webmanifest')) {
      // GitHub Pages serves everything with permissive CORS.
      if (opts.manifest === null) return route.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' } });
      return route.fulfill({ contentType: 'application/manifest+json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(opts.manifest ?? { name: 'QRShare', qrshare_handoff: { versions: [1] } }) });
    }
    return route.fulfill({ contentType: 'text/html', body: opts.page ?? FAKE_QRSHARE });
  });
}

test.beforeEach(async ({ context }) => {
  await fakeQrShare(context);
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
  const receiveUrl = new URL((await receive).url());
  expect(receiveUrl.origin + receiveUrl.pathname).toBe('https://s-celles.github.io/QRShare/');
  // SHARE-005: QRShare's scanner recognises a static code (a link) as well as animated ones.
  expect(receiveUrl.hash.startsWith('#/scan/auto?')).toBe(true);
  const receiveParams = new URLSearchParams(receiveUrl.hash.replace(/^#\/scan\/auto\?/, ''));
  expect(receiveParams.get('policy')).toBe('airgap');
  // SHARE-008: QRShare is told where to hand the received file back.
  expect(receiveParams.get('return')).toBe(new URL('./?handoff=qrshare', page.url()).href);
  expect(errors).toEqual([]);
});

test('binary documents are handed to QRShare without a download (SHARE-007)', async ({ page, context }) => {
  const errors = await openApp(page);
  await page.getByRole('button', { name: 'New spreadsheet' }).click();
  await page.getByRole('button', { name: 'Send to another device…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Send to another device' });
  await expect(dialog.getByRole('note')).toHaveText('The document will open in QRShare, ready to send.');
  let downloaded = false;
  page.on('download', () => (downloaded = true));
  const popup = context.waitForEvent('page');
  await dialog.getByRole('button', { name: 'Send', exact: true }).click();
  const qrshare = await popup;
  expect(qrshare.url()).toBe('https://s-celles.github.io/QRShare/#/send?handoff=1&policy=prefer-airgap');
  // The stand-in QRShare received the workbook from PWO's origin.
  await expect(qrshare).toHaveTitle(new RegExp(`^got Untitled spreadsheet\\.ods \\d+ from ${new URL(page.url()).origin}$`));
  expect(downloaded).toBe(false);
  expect(errors).toEqual([]);
});

test('an older QRShare gets the file downloaded and "Prepare a transfer" right away (SHARE-001)', async ({ page, context }) => {
  // Its manifest does not declare the handoff protocol.
  await context.unrouteAll();
  await fakeQrShare(context, { page: '<title>QRShare</title>', manifest: { name: 'QRShare' } });
  await openApp(page);
  await page.getByRole('button', { name: 'New spreadsheet' }).click();
  await page.getByRole('button', { name: 'Send to another device…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Send to another device' });
  // Let the support check complete.
  await page.waitForResponse((r) => r.url().endsWith('/manifest.webmanifest'));
  const download = page.waitForEvent('download');
  const popup = context.waitForEvent('page');
  const start = Date.now();
  await dialog.getByRole('button', { name: 'Send', exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/\.ods$/);
  expect((await popup).url()).toBe('https://s-celles.github.io/QRShare/#/create/url');
  expect(Date.now() - start).toBeLessThan(5000);
  await expect(page.getByRole('alert')).toContainText('This QRShare cannot receive files from apps yet');
});

test('falls back after a delay when QRShare cannot be checked and does not answer (SHARE-001)', async ({ page, context }) => {
  test.setTimeout(60_000);
  await context.unrouteAll();
  await fakeQrShare(context, { page: '<title>QRShare</title>', manifest: null });
  await openApp(page);
  await page.getByRole('button', { name: 'New spreadsheet' }).click();
  await page.getByRole('button', { name: 'Send to another device…' }).click();
  const download = page.waitForEvent('download', { timeout: 30_000 });
  const popup = context.waitForEvent('page');
  await page.getByRole('dialog', { name: 'Send to another device' }).getByRole('button', { name: 'Send', exact: true }).click();
  const qrshare = await popup;
  expect((await download).suggestedFilename()).toMatch(/\.ods$/);
  await expect(qrshare).toHaveURL('https://s-celles.github.io/QRShare/#/create/url');
  await expect(page.getByRole('alert')).toContainText('QRShare did not answer');
});

test('opens a file handed back by QRShare, only from QRShare and only a real document (SHARE-008, SHARE-013)', async ({ page, context }) => {
  const errors = await openApp(page);
  const pwo = new URL('./?handoff=qrshare', page.url()).href;
  // Play QRShare's "Open in …" button from its origin.
  const handBack = async (origin: string, file = { name: 'received.md', text: '# Received\n\nFrom QRShare.\n' }): Promise<string> => {
    const qrshare = await context.newPage();
    await context.route(`${origin}/**`, (route) => route.fulfill({ contentType: 'text/html', body: '<title>sender</title>' }));
    await qrshare.goto(`${origin}/QRShare/`);
    const popup = context.waitForEvent('page');
    const result = qrshare.evaluate(async ({ url, file }) => {
      const win = window.open(url, '_blank')!;
      const origin = new URL(url).origin;
      return new Promise<string>((resolve) => {
        setTimeout(() => resolve('timeout'), 8000);
        addEventListener('message', (e) => {
          if (e.source !== win || e.origin !== origin || e.data?.type !== 'qrshare-handoff') return;
          if (e.data.action === 'ready') {
            const data = new TextEncoder().encode(file.text).buffer;
            win.postMessage({ type: 'qrshare-handoff', version: 1, action: 'file', name: file.name, mimeType: 'application/octet-stream', data }, origin, [data]);
          } else if (e.data.action === 'received') {
            resolve('sent');
          }
        });
      });
    }, { url: pwo, file });
    const opened = await popup;
    const outcome = await result;
    if (outcome === 'sent' && file.name === 'received.md') {
      // SHARE-013: where it comes from and what it is, before it opens.
      const confirm = opened.getByRole('dialog', { name: 'A file received through QRShare' });
      await expect(confirm).toContainText('QRShare (https://s-celles.github.io) hands over “received.md”');
      await confirm.getByRole('button', { name: 'Open' }).click();
      await expect(opened.locator('.doc-page h1')).toHaveText('Received');
      await expect(opened.locator('.doc-name')).toHaveText('received.md');
      expect(new URL(opened.url()).search).toBe('');
    }
    return outcome;
  };
  expect(await handBack('https://s-celles.github.io')).toBe('sent');
  // SHARE-013: a file whose content is not what its name says is not opened, even from QRShare.
  expect(await handBack('https://s-celles.github.io', { name: 'report.docx', text: '%PDF-1.7\n1 0 obj\n<<>>\nendobj\n' })).toBe('sent');
  const last = context.pages().at(-1)!;
  await expect(last.getByRole('alert')).toContainText('“report.docx” is not what its name says');
  // Any other origin is ignored.
  expect(await handBack('https://evil.example')).toBe('timeout');
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
