import { expect, test, type Page } from '@playwright/test';
import { PDFDocument, StandardFonts } from '@pdfme/pdf-lib';
import { openApp, openFile, saveAs } from './helpers';

// FORM-001, FORM-002: designing a PDF form, then compiling the answers of filled copies.

async function blankPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  page.drawText('Registration', { x: 72, y: 760, size: 24, font });
  return Buffer.from(await doc.save());
}

async function download(page: Page): Promise<Buffer> {
  const d = page.waitForEvent('download');
  await page.locator('.header-actions').getByRole('button', { name: 'Save', exact: true }).click();
  const chunks: Buffer[] = [];
  for await (const c of await (await d).createReadStream()) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

test('draws fields on a PDF, which become real form fields (FORM-001)', async ({ page }) => {
  const errors = await openApp(page);
  await openFile(page, 'registration.pdf', await blankPdf(), 'application/pdf');
  await page.getByRole('button', { name: 'Design the form' }).click();
  const bar = page.getByRole('toolbar', { name: 'Design the form' });
  await expect(bar).toBeVisible();
  // A text field, drawn.
  const pdfPage = page.locator('.pdf-page').first();
  await expect(pdfPage.locator('canvas')).toBeVisible();
  const box = (await pdfPage.boundingBox())!;
  await page.mouse.move(box.x + 100, box.y + 150);
  await page.mouse.down();
  await page.mouse.move(box.x + 300, box.y + 175, { steps: 4 });
  await page.mouse.up();
  const dialog = page.getByRole('dialog', { name: 'Text' });
  await dialog.getByLabel(/Name of the field/).fill('Name');
  await dialog.getByLabel('Required').check();
  await dialog.getByRole('button', { name: 'Add' }).click();
  await expect(page.locator('.pdf-design-field.new')).toHaveCount(1);
  // A check box and a drop-down list, placed by a click.
  await bar.getByRole('button', { name: 'Check box' }).click();
  await page.mouse.click(box.x + 100, box.y + 220);
  await page.getByRole('dialog', { name: 'Check box' }).getByLabel(/Name of the field/).fill('Newsletter');
  await page.getByRole('dialog', { name: 'Check box' }).getByRole('button', { name: 'Add' }).click();
  await bar.getByRole('button', { name: 'Drop-down list' }).click();
  await page.mouse.click(box.x + 100, box.y + 270);
  const list = page.getByRole('dialog', { name: 'Drop-down list' });
  await list.getByLabel(/Name of the field/).fill('Level');
  await list.getByLabel('Choices, one per line').fill('Beginner\nExpert');
  await list.getByRole('button', { name: 'Add' }).click();
  await expect(page.locator('.pdf-design-field.new')).toHaveCount(3);
  // A name already taken is refused.
  await bar.getByRole('button', { name: 'Text', exact: true }).click();
  await page.mouse.click(box.x + 100, box.y + 320);
  await page.getByRole('dialog', { name: 'Text' }).getByLabel(/Name of the field/).fill('Level');
  await page.getByRole('dialog', { name: 'Text' }).getByRole('button', { name: 'Add' }).click();
  await expect(page.getByRole('dialog', { name: 'Text' }).getByRole('alert')).toHaveText('A field has this name already.');
  await page.getByRole('dialog', { name: 'Text' }).getByRole('button', { name: 'Cancel' }).click();
  await bar.getByRole('button', { name: 'Done' }).click();

  // Saved, they are fields of the file: reopened, they can be filled.
  const saved = await download(page);
  const fields = (await PDFDocument.load(saved)).getForm().getFields().map((f) => f.getName());
  expect(fields).toEqual(['Name', 'Newsletter', 'Level']);
  await page.locator('.header-actions').getByRole('button', { name: 'Close' }).click();
  await openFile(page, 'registration.pdf', saved, 'application/pdf');
  await expect(page.locator('.pdf-form-layer input[type=text]')).toHaveCount(1);
  await expect(page.locator('.pdf-form-layer select')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('a field has its properties: tooltip, maximum length, format checked while filling, kept in the file (FORM-005)', async ({ page }) => {
  const errors = await openApp(page);
  await openFile(page, 'order.pdf', await blankPdf(), 'application/pdf');
  await page.getByRole('button', { name: 'Design the form' }).click();
  const pdfPage = page.locator('.pdf-page').first();
  await expect(pdfPage.locator('canvas')).toBeVisible();
  const box = (await pdfPage.boundingBox())!;
  await page.mouse.click(box.x + 100, box.y + 150);
  const dialog = page.getByRole('dialog', { name: 'Text' });
  await dialog.getByLabel(/Name of the field/).fill('Code');
  await dialog.getByLabel(/^Tooltip/).fill('Your client code');
  await dialog.getByLabel('Maximum number of characters').fill('5');
  await dialog.getByLabel('What may be typed').selectOption('regex');
  await dialog.getByLabel(/^Pattern/).fill('[A-Z]{2}\\d{3}');
  await dialog.getByLabel(/^Message when/).fill('Two letters, then three digits');
  // The pattern is tried in the window.
  await dialog.getByPlaceholder('Type a value to check it').fill('AB12');
  await expect(dialog.locator('.form-try-verdict')).toHaveText(/Two letters, then three digits/);
  await dialog.getByPlaceholder('Type a value to check it').fill('AB123');
  await expect(dialog.locator('.form-try-verdict')).toHaveText('✓');
  // A value by default that does not match is refused.
  await dialog.getByLabel('Value by default').fill('abc');
  await dialog.getByRole('button', { name: 'Add' }).click();
  await expect(dialog.getByRole('alert')).toHaveText(/does not have the expected format/);
  await dialog.getByLabel('Value by default').fill('');
  await dialog.getByRole('button', { name: 'Add' }).click();
  // Its properties again, from its menu.
  await page.locator('.pdf-design-field.new').click();
  await page.getByRole('menuitem', { name: /Field properties/ }).click();
  const again = page.getByRole('dialog', { name: 'Text' });
  await expect(again.getByLabel('Maximum number of characters')).toHaveValue('5');
  await again.getByLabel('Required').check();
  await again.getByRole('button', { name: 'OK' }).click();
  await page.getByRole('toolbar', { name: 'Design the form' }).getByRole('button', { name: 'Done' }).click();

  // Kept in the file, and checked while filling it in.
  const saved = await download(page);
  const field = (await PDFDocument.load(saved)).getForm().getTextField('Code');
  expect(field.getMaxLength()).toBe(5);
  expect(field.isRequired()).toBe(true);
  await page.locator('.header-actions').getByRole('button', { name: 'Close' }).click();
  await openFile(page, 'order.pdf', saved, 'application/pdf');
  const input = page.locator('.pdf-form-layer input[data-field="Code"]');
  await expect(input).toHaveAttribute('maxlength', '5');
  await expect(input).toHaveAttribute('title', 'Your client code');
  await input.fill('ab1');
  await input.blur();
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await input.fill('AB123');
  await input.blur();
  await expect(input).toHaveAttribute('aria-invalid', 'false');
  expect(errors).toEqual([]);
});

test('compiles the answers of filled forms into a spreadsheet (FORM-002)', async ({ page }) => {
  const errors = await openApp(page);
  const filled = async (name: string, newsletter: boolean, level: string): Promise<Buffer> => {
    const doc = await PDFDocument.create();
    const p = doc.addPage([595, 842]);
    const form = doc.getForm();
    form.createTextField('Name').addToPage(p, { x: 72, y: 700, width: 200, height: 20 });
    form.createCheckBox('Newsletter').addToPage(p, { x: 72, y: 660, width: 14, height: 14 });
    const dd = form.createDropdown('Level');
    dd.setOptions(['Beginner', 'Expert']);
    dd.addToPage(p, { x: 72, y: 620, width: 120, height: 20 });
    form.getTextField('Name').setText(name);
    if (newsletter) form.getCheckBox('Newsletter').check();
    dd.select(level);
    return Buffer.from(await doc.save());
  };
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Compile form answers…' }).click({ force: true }).catch(async () => {
    await page.keyboard.press('Control+Shift+P');
    await page.getByRole('dialog', { name: 'Commands' }).getByRole('combobox').fill('compile form');
    await page.keyboard.press('Enter');
  });
  await (await chooser).setFiles([
    { name: 'ada.pdf', mimeType: 'application/pdf', buffer: await filled('Ada', true, 'Expert') },
    { name: 'alan.pdf', mimeType: 'application/pdf', buffer: await filled('Alan', false, 'Beginner') },
  ]);
  const where = page.getByRole('dialog', { name: 'Compile form answers…' });
  await expect(where.getByLabel('A new spreadsheet')).toBeChecked();
  await where.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('.file-name, .doc-name').first()).toContainText('Answers');
  const cell = (r: number, c: number) => page.locator(`td[data-r="${r}"][data-c="${c}"]`);
  await expect(cell(0, 0)).toHaveText('File');
  await expect(cell(0, 1)).toHaveText('Name');
  await expect(cell(1, 0)).toHaveText('ada.pdf');
  await expect(cell(1, 1)).toHaveText('Ada');
  await expect(cell(1, 2)).toHaveText('TRUE');
  await expect(cell(2, 3)).toHaveText('Beginner');
  expect(errors).toEqual([]);
});

test('form fields in a text document: inserted, filled, saved and compiled (FORM-003, FORM-004)', async ({ page }) => {
  const errors = await openApp(page);
  await openFile(page, 'registration.md', 'Name: \n\nPhotos: \n');
  const editor = page.locator('.doc-page');
  // A text zone, from the Insert group.
  await editor.locator('p').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' ');
  await page.getByRole('button', { name: 'Form field', exact: true }).click();
  await page.getByRole('menu', { name: 'Form fields' }).getByRole('menuitem', { name: 'Text' }).click();
  const textDialog = page.getByRole('dialog', { name: 'Text' });
  await textDialog.getByLabel('Name of the field').fill('Name');
  await textDialog.getByRole('button', { name: 'Add' }).click();
  // A check box, from the context menu.
  await editor.locator('p').nth(1).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' ');
  await editor.locator('p').nth(1).click({ button: 'right' });
  await page.getByRole('menu').getByRole('menuitem', { name: 'Check box' }).click();
  await page.getByRole('dialog', { name: 'Check box' }).getByLabel('Name of the field').fill('Photos');
  await page.getByRole('dialog', { name: 'Check box' }).getByRole('button', { name: 'Add' }).click();

  // Filled in where they stand.
  await editor.getByRole('textbox', { name: 'Name' }).fill('Ada LOVELACE');
  await editor.getByRole('checkbox', { name: 'Photos' }).check();
  // The properties of a field, from its context menu.
  await editor.locator('.form-input').first().click({ button: 'right' });
  await expect(page.getByRole('menu').getByRole('menuitem', { name: 'Field properties…' })).toBeVisible();
  await page.keyboard.press('Escape');

  const md = (await saveAs(page, 'Markdown (.md)')).data.toString();
  expect(md).toContain('Name: [Ada LOVELACE]{.input name="Name"}');
  expect(md).toContain('Photos: [x]{.checkbox name="Photos"}');

  // Two filled copies, compiled.
  const chooser = page.waitForEvent('filechooser');
  await page.keyboard.press('Control+Shift+P');
  await page.getByRole('dialog', { name: 'Commands' }).getByRole('combobox').fill('compile form');
  await page.keyboard.press('Enter');
  await (await chooser).setFiles([
    { name: 'ada.md', mimeType: 'text/markdown', buffer: Buffer.from(md) },
    { name: 'alan.md', mimeType: 'text/markdown', buffer: Buffer.from(md.replace('Ada LOVELACE', 'Alan TURING').replace('[x]', '[ ]')) },
  ]);
  await page.getByRole('dialog', { name: 'Compile form answers…' }).getByRole('button', { name: 'Continue' }).click();
  const cell = (r: number, c: number) => page.locator(`td[data-r="${r}"][data-c="${c}"]`);
  await expect(cell(0, 1)).toHaveText('Name');
  await expect(cell(2, 0)).toHaveText('alan.md');
  await expect(cell(2, 1)).toHaveText('Alan TURING');
  await expect(cell(1, 2)).toHaveText('TRUE');
  await expect(cell(2, 2)).toHaveText('FALSE');
  expect(errors).toEqual([]);
});
