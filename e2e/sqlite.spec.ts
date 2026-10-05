import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import initSqlJs from 'sql.js';
import { openApp, openFile, useRuntimePackages } from './helpers';
import { EXAMPLE_MODEL, parseModel, toLogical, toSql } from '../src/datamodel/model';

// DB-001, DB-005: a SQLite database opened as a document, changed, saved; its data model read back.

test.use({ viewport: { width: 1280, height: 900 } });

async function engine() {
  const wasm = readFileSync('node_modules/sql.js/dist/sql-wasm.wasm');
  return initSqlJs({ wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer });
}

test('opens a SQLite database, changes its rows and tables, and saves it (DB-001, DB-005)', async ({ page }) => {
  test.setTimeout(120_000);
  test.skip(!(await useRuntimePackages(page)), 'needs RUNTIME_PACKAGES or network access to the npm CDN');
  const SQL = await engine();
  const db = new SQL.Database();
  db.run(toSql(toLogical(parseModel(EXAMPLE_MODEL).model), 'sqlite'));
  db.run(`INSERT INTO Customer (name, email) VALUES ('Ada', 'ada@example.org'), ('Grace', NULL); INSERT INTO "Order" (date, customer_id) VALUES ('2026-10-05', 1);`);
  const errors = await openApp(page);
  page.on('dialog', (d) => void d.accept());
  await page.addLocatorHandler(page.getByRole('dialog').filter({ hasText: 'cdn.jsdelivr.net' }), async (d) => d.getByRole('button', { name: 'Allow' }).click());
  await openFile(page, 'shop.sqlite', Buffer.from(db.export()));

  const view = page.getByRole('region', { name: 'shop.sqlite' });
  const tables = view.getByRole('listbox', { name: 'Tables' });
  await expect(tables.getByRole('option')).toHaveText(['▦ Contains', '▦ Customer', '▦ Order', '▦ Product'], { timeout: 60_000 });
  await tables.getByRole('option', { name: 'Customer' }).click();
  const grid = view.getByRole('table', { name: 'Customer' });
  await expect(grid.locator('tbody tr')).toHaveCount(2);
  await expect(grid.locator('tbody tr').nth(1)).toContainText('NULL');

  // A cell changed, a row added then deleted.
  await grid.locator('tbody tr').nth(1).locator('td[data-column="email"]').dblclick();
  await view.getByRole('textbox', { name: 'Change email' }).fill('grace@example.org');
  await view.getByRole('textbox', { name: 'Change email' }).press('Enter');
  await expect(grid.locator('tbody tr').nth(1)).toContainText('grace@example.org');
  await view.getByRole('button', { name: 'New row' }).click();
  await expect(grid.locator('tbody tr')).toHaveCount(3);
  await grid.locator('tbody tr').nth(2).getByRole('button', { name: 'Delete the row' }).click();
  await expect(grid.locator('tbody tr')).toHaveCount(2);
  // A reference that does not hold is refused (the foreign keys are checked).
  await view.getByRole('tab', { name: 'SQL' }).click();
  const query = view.getByRole('textbox', { name: 'SQL to run' });
  await query.fill(`INSERT INTO "Order" (date, customer_id) VALUES ('2026-10-06', 99)`);
  await view.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(view.locator('.sqlite-results')).toContainText('FOREIGN KEY constraint failed');
  // A table made in SQL appears in the list; a query shows its rows.
  await query.fill(`CREATE TABLE Supplier (id INTEGER PRIMARY KEY, name TEXT NOT NULL);\nINSERT INTO Supplier (name) VALUES ('Babbage & Co');\nSELECT name FROM Customer ORDER BY name;`);
  await query.press('Control+Enter');
  await expect(view.getByRole('table', { name: 'Result 1' })).toContainText('Grace');
  await expect(tables.getByRole('option', { name: 'Supplier' })).toBeVisible();
  await tables.getByRole('option', { name: 'Supplier' }).click();
  await view.getByRole('tab', { name: 'Structure' }).click();
  await expect(view.getByRole('table', { name: 'Columns of Supplier' })).toContainText('TEXT');
  await page.screenshot({ path: 'test-results/sqlite.png' });

  // DB-005: the data model of the tables, read back.
  const model = page.waitForEvent('download');
  await view.getByRole('button', { name: 'Conceptual data model' }).click();
  const mcd = await model;
  expect(mcd.suggestedFilename()).toBe('shop.mcd');

  // Saved: a SQLite file with the changes.
  const download = page.waitForEvent('download');
  await page.keyboard.press('Control+s');
  const saved = await download;
  const chunks: Buffer[] = [];
  for await (const c of await saved.createReadStream()) chunks.push(c as Buffer);
  const back = new SQL.Database(new Uint8Array(Buffer.concat(chunks)));
  expect(back.exec('SELECT name, email FROM Customer ORDER BY name')[0]!.values).toEqual([
    ['Ada', 'ada@example.org'],
    ['Grace', 'grace@example.org'],
  ]);
  expect(back.exec('SELECT name FROM Supplier')[0]!.values).toEqual([['Babbage & Co']]);
  expect(errors.filter((e) => !/FOREIGN KEY/.test(e))).toEqual([]);
});
