import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

const SERVER = 'https://grist.example.org';

/** An in-memory Grist server answering the REST API used by the connector. */
function mockGrist(page: Page) {
  const records = [
    { id: 1, fields: { Name: 'Ada', Grade: 15, Double: 30 } },
    { id: 2, fields: { Name: 'Alan', Grade: 9.5, Double: 19 } },
  ];
  const requests: { method: string; path: string; body: unknown }[] = [];
  let nextId = 3;
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, PATCH' };
  void page.route(`${SERVER}/api/**`, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (req.headers()['authorization'] !== 'Bearer key-123') return route.fulfill({ status: 401, headers: cors, json: { error: 'Unauthorized' } });
    const path = new URL(req.url()).pathname.replace('/api', '');
    const body = req.postData() ? JSON.parse(req.postData()!) : undefined;
    if (req.method() !== 'GET') requests.push({ method: req.method(), path, body });
    const json = (data: unknown) => route.fulfill({ headers: cors, json: data });
    if (path === '/orgs') return json([{ id: 7, name: 'Lycée' }]);
    if (path === '/orgs/7/workspaces') return json([{ id: 1, name: 'Classes', docs: [{ id: 'abc', name: 'Notes 2nde' }] }]);
    if (path === '/docs/abc/tables') return json({ tables: [{ id: 'Eleves' }] });
    if (path === '/docs/abc/tables/Eleves/columns')
      return json({
        columns: [
          { id: 'Name', fields: { label: 'Name', type: 'Text', isFormula: false } },
          { id: 'Grade', fields: { label: 'Grade', type: 'Numeric', isFormula: false } },
          { id: 'Double', fields: { label: 'Double', type: 'Numeric', isFormula: true } },
        ],
      });
    if (path === '/docs/abc/tables/Eleves/records') {
      if (req.method() === 'GET') return json({ records });
      if (req.method() === 'PATCH') {
        for (const r of body.records) Object.assign(records.find((x) => x.id === r.id)!.fields, r.fields, { Double: (r.fields.Grade ?? 0) * 2 });
        return json(null);
      }
      const added = body.records.map((r: { fields: Record<string, unknown> }) => {
        const rec = { id: nextId++, fields: { Name: '', Grade: 0, ...r.fields, Double: Number(r.fields.Grade ?? 0) * 2 } };
        records.push(rec as (typeof records)[number]);
        return { id: rec.id };
      });
      return json({ records: added });
    }
    return route.fulfill({ status: 404, headers: cors, json: { error: 'not found' } });
  });
  return { records, requests };
}

test('opens a Grist document as a spreadsheet and sends the changes back (GRIST-001..GRIST-003)', async ({ page }) => {
  const errors = await openApp(page);
  const grist = mockGrist(page);
  await page.getByRole('button', { name: 'Open from Grist' }).click();
  const dialog = page.getByRole('dialog', { name: 'Open a Grist document' });
  await dialog.getByLabel('Grist server address').fill(SERVER);
  await dialog.getByLabel('API key').fill('wrong');
  await dialog.getByRole('button', { name: 'Add account' }).click();
  await expect(dialog.locator('.grist-status')).toContainText('check the API key');
  await dialog.getByLabel('API key').fill('key-123');
  await dialog.getByRole('button', { name: 'Add account' }).click();
  await dialog.getByRole('button', { name: 'Notes 2nde' }).click();

  await expect(page.locator('.doc-name')).toHaveText('Notes 2nde.xlsx');
  await expect(page.locator('.doc-source')).toHaveText('Grist · grist.example.org');
  const cell = (ref: string) => page.locator(`td[data-r="${Number(ref.slice(1)) - 1}"][data-c="${ref.charCodeAt(0) - 65}"]`);
  await expect(cell('B2')).toHaveText('Ada');
  await expect(cell('D3')).toHaveText('19');

  // Edit a grade and add a row, then save to Grist.
  await cell('C3').click();
  await page.keyboard.type('12');
  await page.keyboard.press('Enter');
  await cell('B4').click();
  await page.keyboard.type('Grace');
  await page.keyboard.press('Tab');
  await page.keyboard.type('18');
  await page.keyboard.press('Enter');
  await page.locator('.header-actions').getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.app-alert')).toContainText('2 row(s) updated in Grist “Notes 2nde”');
  expect(grist.requests).toEqual([
    { method: 'PATCH', path: '/docs/abc/tables/Eleves/records', body: { records: [{ id: 2, fields: { Grade: 12 } }] } },
    { method: 'POST', path: '/docs/abc/tables/Eleves/records', body: { records: [{ fields: { Name: 'Grace', Grade: 18 } }] } },
  ]);
  // Reloaded from Grist: the new row has its id and its formula value.
  await expect(cell('A4')).toHaveText('3');
  await expect(cell('D4')).toHaveText('36');
  await expect(cell('D3')).toHaveText('24');
  await expect(page.locator('.modified')).toHaveCount(0);
  // The only console error is the expected 401 of the wrong API key.
  expect(errors.filter((e) => !e.includes('401'))).toEqual([]);
});
