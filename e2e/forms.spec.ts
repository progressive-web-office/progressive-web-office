import { expect, test, type Page } from '@playwright/test';
import { PDFDocument, StandardFonts } from '@pdfme/pdf-lib';
import { openApp, openFile } from './helpers';

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
