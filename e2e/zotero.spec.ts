import { expect, test, type Route } from '@playwright/test';
import { openApp, openFile, saveAs } from './helpers';

// BIB-010: citing from the Zotero library.

const BIB = '@book{knuth1984,\n  title = {The {TeX}book},\n  author = {Knuth, Donald E.},\n  year = {1984},\n  publisher = {Addison-Wesley}\n}\n';

test('connects a Zotero key, searches the library and cites a source (BIB-010)', async ({ page }) => {
  const errors = await openApp(page);
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Zotero-API-Key, Zotero-API-Version' };
  await page.route('https://api.zotero.org/**', async (route: Route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (req.headers()['zotero-api-key'] !== 'zk-1') return route.fulfill({ status: 403, headers: cors, body: 'Forbidden' });
    const u = new URL(req.url());
    if (u.pathname === '/keys/current') return route.fulfill({ headers: cors, json: { userID: 42, username: 'ada' } });
    if (u.pathname === '/users/42/items/top') return route.fulfill({ headers: cors, body: /knuth/i.test(u.searchParams.get('q') ?? '') ? BIB : '' });
    return route.fulfill({ status: 404, headers: cors, body: 'Not found' });
  });
  await openFile(page, 'paper.md', '# Paper\n\nAs shown in\n');
  await page.getByRole('textbox', { name: 'Document' }).locator('p').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' ');
  await page.getByRole('button', { name: 'Cite', exact: true }).click();
  await page.getByRole('dialog', { name: 'Cite' }).getByRole('button', { name: 'Zotero…' }).click();
  const connect = page.getByRole('dialog', { name: 'Connect your Zotero library' });
  await expect(connect.getByRole('link', { name: 'https://www.zotero.org/settings/keys/new' })).toBeVisible();
  await connect.getByLabel('Zotero API key').fill('wrong');
  await connect.getByRole('button', { name: 'Connect' }).click();
  await expect(connect.getByRole('alert')).toContainText('Zotero refused this key');
  await connect.getByLabel('Zotero API key').fill('zk-1');
  await connect.getByRole('button', { name: 'Connect' }).click();
  const zotero = page.getByRole('dialog', { name: 'Cite from Zotero' });
  await expect(zotero).toContainText('Zotero library of ada');
  await zotero.getByLabel('Search the Zotero library').fill('knuth');
  await zotero.getByLabel(/Knuth \(1984\) — The TeXbook/).check();
  await zotero.getByRole('button', { name: 'Add and cite' }).click();
  await expect(page.getByRole('textbox', { name: 'Document' }).locator('p')).toHaveText('As shown in [1]');
  const md = (await saveAs(page, 'Markdown (.md)')).data.toString();
  expect(md).toContain('[@knuth1984]');
  expect(md).toMatch(/references:\n- \{"id":"knuth1984"/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pwo.zotero') ?? '{}').userId)).toBe(42);
  expect(errors.filter((e) => !e.includes('403'))).toEqual([]);
});
