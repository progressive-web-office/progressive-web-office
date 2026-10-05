import { expect, test } from '@playwright/test';
import { fakeFolder, openApp, openLocalFolder } from './helpers';
import { EXAMPLE_MODEL } from '../src/datamodel/model';

// DB-002..DB-004: a data model — conceptual, logical, physical — kept in step.

test.use({ viewport: { width: 1280, height: 900 } });

test('derives the logical model and the SQL from the conceptual one (DB-002..DB-004)', async ({ page }) => {
  await fakeFolder(page, { 'Shop.mcd': EXAMPLE_MODEL });
  await openLocalFolder(page);
  await page.getByRole('complementary', { name: 'Folder' }).getByRole('button', { name: 'Shop.mcd', exact: true }).click();
  const view = page.getByRole('region', { name: 'Shop.mcd' });
  // The diagram: entities and associations, cardinalities by the links.
  const diagram = view.getByRole('img', { name: 'Diagram of Shop.mcd' });
  await expect(diagram.locator('.dm-entity')).toHaveCount(3);
  await expect(diagram.locator('.dm-association')).toHaveCount(2);
  await expect(diagram.locator('.dm-card')).toHaveText(['0,n', '1,1', '1,n', '0,n']);
  await expect(diagram.locator('.dm-entity[data-name="Customer"] .dm-id')).toHaveText('customer_id');
  await page.screenshot({ path: 'test-results/datamodel-conceptual.png' });

  // The logical model.
  await view.getByRole('tab', { name: 'Logical model' }).click();
  const relations = view.locator('.datamodel-relation');
  await expect(relations).toHaveText(['Order (order_id, date, #customer_id)', 'Customer (customer_id, name, email)', 'Product (product_id, label, price)', 'Contains (#order_id, #product_id, quantity)'].sort((a, b) => ['Customer', 'Order', 'Product', 'Contains'].indexOf(a.split(' ')[0]!) - ['Customer', 'Order', 'Product', 'Contains'].indexOf(b.split(' ')[0]!)));
  await expect(relations.nth(1).locator('u')).toHaveText('order_id');

  // The SQL, for the database chosen, saved beside the model.
  await view.getByRole('tab', { name: 'Physical model (SQL)' }).click();
  const sql = view.getByLabel('SQL of the tables');
  await expect(sql).toContainText('"customer_id" INTEGER PRIMARY KEY AUTOINCREMENT');
  await view.getByLabel('Database').selectOption('postgresql');
  await expect(sql).toContainText('FOREIGN KEY ("customer_id") REFERENCES "Customer" ("customer_id")');
  await view.getByRole('button', { name: 'Save as a .sql file' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __folder: Map<string, string> }).__folder.get('Shop.postgresql.sql'))).toContain('CREATE TABLE "Contains"');

  // A change of the text: the three levels follow; a mistake is told with its line.
  await view.getByRole('tab', { name: 'Conceptual model' }).click();
  const source = view.getByRole('textbox', { name: 'The conceptual model, as text' });
  await source.press('Control+End');
  // Lines under an association are indented as they are typed.
  await source.pressSequentially('\nassociation Reviews\nCustomer 0,n\nProduct 0,n\nstars: integer\nSupplier 1,n');
  await expect(view.getByRole('list', { name: 'Problems of the model' })).toHaveText('Line 29: there is no entity named Supplier.');
  await source.press('Shift+Home');
  await source.press('Backspace');
  await source.press('Backspace');
  await expect(view.getByRole('list', { name: 'Problems of the model' })).toBeHidden();
  await expect(diagram.locator('.dm-association')).toHaveCount(3);
  await view.getByRole('tab', { name: 'Logical model' }).click();
  await expect(relations.last()).toHaveText('Reviews (#customer_id, #product_id, stars)');
  await page.keyboard.press('Control+s');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __folder: Map<string, string> }).__folder.get('Shop.mcd'))).toContain('association Reviews');
});

test('makes a new data model from the command palette (DB-002)', async ({ page }) => {
  const errors = await openApp(page);
  await page.keyboard.press('Control+Shift+P');
  await page.getByRole('combobox', { name: 'Commands' }).fill('data model');
  page.once('dialog', (d) => void d.accept('School'));
  await page.getByRole('option', { name: /New data model/ }).click();
  const view = page.getByRole('region', { name: 'School.mcd' });
  await expect(view.locator('.dm-entity')).toHaveCount(3);
  expect(errors).toEqual([]);
});
