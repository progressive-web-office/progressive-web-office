import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

const ROOT = 'https://cloud.example.org/remote.php/dav/files/ada/';

/** An in-memory WebDAV server (Nextcloud layout) with ETags. */
function mockDav(page: Page) {
  const files = new Map<string, { body: Buffer; etag: string }>([['Cours/notes.md', { body: Buffer.from('# Notes\n\nPremière version.\n'), etag: '"v1"' }]]);
  const folders = new Set(['', 'Cours']);
  const puts: { path: string; ifMatch?: string; ifNoneMatch?: string }[] = [];
  let version = 1;
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'ETag' };
  void page.route(`${ROOT}**`, async (route) => {
    const req = route.request();
    if (req.headers()['authorization'] !== `Basic ${Buffer.from('ada:app-pass').toString('base64')}`) return route.fulfill({ status: 401, headers: cors });
    const path = decodeURIComponent(new URL(req.url()).pathname.slice(new URL(ROOT).pathname.length)).replace(/\/$/, '');
    if (req.method() === 'PROPFIND') {
      const href = (p: string, dir: boolean) => `/remote.php/dav/files/ada/${p.split('/').filter(Boolean).map(encodeURIComponent).join('/')}${dir && p ? '/' : ''}`;
      const entry = (p: string) =>
        folders.has(p)
          ? `<d:response><d:href>${href(p, true)}</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`
          : `<d:response><d:href>${href(p, false)}</d:href><d:propstat><d:prop><d:resourcetype/><d:getetag>${files.get(p)!.etag}</d:getetag><d:getcontentlength>${files.get(p)!.body.length}</d:getcontentlength></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`;
      const children = [...folders, ...files.keys()].filter((p) => p !== path && p.slice(0, p.lastIndexOf('/') < 0 ? 0 : p.lastIndexOf('/')) === path);
      const body = `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">${[path, ...(req.headers()['depth'] === '1' ? children : [])].map(entry).join('')}</d:multistatus>`;
      return route.fulfill({ status: 207, headers: { ...cors, 'Content-Type': 'application/xml' }, body });
    }
    if (req.method() === 'GET') {
      const file = files.get(path);
      return file ? route.fulfill({ headers: { ...cors, ETag: file.etag }, body: file.body }) : route.fulfill({ status: 404, headers: cors });
    }
    if (req.method() === 'PUT') {
      const headers = req.headers();
      puts.push({ path, ifMatch: headers['if-match'], ifNoneMatch: headers['if-none-match'] });
      const existing = files.get(path);
      if ((headers['if-match'] && existing?.etag !== headers['if-match']) || (headers['if-none-match'] === '*' && existing)) return route.fulfill({ status: 412, headers: cors });
      const etag = `"v${++version}"`;
      files.set(path, { body: req.postDataBuffer() ?? Buffer.alloc(0), etag });
      return route.fulfill({ status: existing ? 204 : 201, headers: { ...cors, ETag: etag } });
    }
    return route.fulfill({ status: 405, headers: cors });
  });
  return { files, puts, bump: (path: string) => (files.get(path)!.etag = `"v${++version}"`) };
}

test('opens, saves and resolves conflicts with a Nextcloud / WebDAV server (DAV-001..DAV-004)', async ({ page }) => {
  const errors = await openApp(page);
  const dav = mockDav(page);
  await page.getByRole('button', { name: 'Open from Nextcloud / WebDAV' }).click();
  const dialog = page.getByRole('dialog', { name: 'Open from the cloud' });
  await dialog.getByLabel('Server address').fill('https://cloud.example.org');
  await dialog.getByLabel('User name').fill('ada');
  await dialog.getByLabel('App password').fill('app-pass');
  await dialog.getByRole('button', { name: 'Connect' }).click();
  await dialog.getByRole('button', { name: '📁 Cours' }).click();
  await dialog.getByRole('button', { name: '📄 notes.md' }).click();

  await expect(page.locator('.doc-name')).toHaveText('notes.md');
  await expect(page.locator('.doc-source')).toHaveText('☁ cloud.example.org');
  await expect(page.locator('.doc-page')).toContainText('Première version.');

  // Save back over the version that was read.
  await page.locator('.doc-page p').last().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Modifiée.');
  await page.locator('.header-actions').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.app-alert')).toContainText('Saved to the cloud: Cours/notes.md');
  expect(dav.puts.at(-1)).toMatchObject({ path: 'Cours/notes.md', ifMatch: '"v1"' });
  expect(dav.files.get('Cours/notes.md')!.body.toString()).toContain('Modifiée.');

  // Someone else changes the file: saving offers a copy instead of overwriting.
  dav.bump('Cours/notes.md');
  await page.keyboard.type(' Encore.');
  await page.locator('.header-actions').getByRole('button', { name: 'Save', exact: true }).click();
  const conflict = page.getByRole('dialog', { name: 'The file changed in the cloud' });
  await expect(conflict).toContainText('was modified on the server');
  await conflict.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('.app-alert')).toContainText(/Saved to the cloud: Cours\/notes-copy-\d{8}-\d{6}\.md/);
  expect([...dav.files.keys()].filter((p) => p.startsWith('Cours/notes-copy-'))).toHaveLength(1);
  await expect(page.locator('.doc-name')).toHaveText(/^notes-copy-/);

  // A new document saved to the cloud, without overwriting existing files.
  page.once('dialog', (d) => void d.accept());
  await page.locator('.header-actions').getByRole('button', { name: 'Close' }).click().catch(() => undefined);
  await page.getByRole('button', { name: 'New document' }).click();
  await page.locator('.doc-page').click();
  await page.keyboard.type('Bonjour');
  await page.getByRole('button', { name: 'Save to the cloud' }).click();
  const save = page.getByRole('dialog', { name: 'Save to the cloud' });
  await save.getByRole('button', { name: '📁 Cours' }).click();
  await save.getByLabel('File name').fill('nouveau.odt');
  await save.getByRole('button', { name: 'Save here' }).click();
  await expect(page.locator('.app-alert')).toContainText('Saved to the cloud: Cours/nouveau.odt');
  expect(dav.puts.at(-1)).toMatchObject({ path: 'Cours/nouveau.odt', ifNoneMatch: '*' });
  expect(dav.files.get('Cours/nouveau.odt')!.body.subarray(30, 38).toString()).toBe('mimetype');
  await expect(page.locator('.doc-name')).toHaveText('nouveau.odt');
  // The only console error is the expected 412 of the simulated conflict.
  expect(errors.filter((e) => !e.includes('412'))).toEqual([]);
});
