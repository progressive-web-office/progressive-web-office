import { expect, test } from '@playwright/test';
import { openApp, openFile, saveAs } from './helpers';

test('creates, formats and saves a new document (DOC-003, DOC-004, FILE-005)', async ({ page }) => {
  const errors = await openApp(page);
  await page.getByRole('button', { name: 'New document' }).click();
  const editor = page.getByRole('textbox', { name: 'Document' });
  await editor.click();
  await page.keyboard.type('Hello ');
  await page.keyboard.press('Control+B');
  await page.keyboard.type('world');
  await expect(editor.locator('b, strong')).toHaveText('world');
  await expect(page.locator('.modified')).toBeVisible();
  await expect(page.locator('.app-status')).toContainText('2 words');

  const md = await saveAs(page, 'Markdown (.md)');
  expect(md.name).toBe('Untitled document.md');
  expect(md.data.toString('utf8')).toBe('Hello **world**\n');
  expect(errors).toEqual([]);
});

test('opens a Markdown file and converts it to DOCX and ODT (FILE-006)', async ({ page }) => {
  const errors = await openApp(page);
  await openFile(page, 'notes.md', '# Notes\n\n- one\n- two\n\n| a | b |\n|---|---|\n| 1 | 2 |\n');
  await expect(page.locator('.doc-page h1')).toHaveText('Notes');
  await expect(page.locator('.doc-page .list-item')).toHaveCount(2);
  const docx = await saveAs(page, 'Word document (.docx)');
  expect(docx.name).toBe('notes.docx');
  expect(docx.data.subarray(0, 2).toString()).toBe('PK');
  await openFile(page, 'notes.docx', docx.data);
  await expect(page.locator('.doc-page th')).toHaveCount(2); // the GFM header row (DOC-025)
  await expect(page.locator('.doc-page td')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('rejects unsupported files with a message (FILE-004)', async ({ page }) => {
  await openApp(page);
  await openFile(page, 'image.bmp', Buffer.from([0x42, 0x4d, 0, 0]));
  await expect(page.getByRole('alert')).toContainText('not supported');
});

test('inserts an equation with MathLive and saves it as Markdown and DOCX (MATH-001..005)', async ({ page }) => {
  const errors = await openApp(page);
  await page.getByRole('button', { name: 'New document' }).click();
  await page.getByRole('textbox', { name: 'Document' }).click();
  await page.keyboard.type('Pythagoras: ');
  await page.getByRole('button', { name: 'Insert equation' }).click();
  const source = page.getByLabel('LaTeX source');
  await source.fill('a^2+b^2=c^2');
  await page.getByRole('button', { name: 'Insert', exact: true }).click();
  const eq = page.locator('.doc-page span.math');
  await expect(eq).toHaveAttribute('data-latex', 'a^2+b^2=c^2');
  await expect(eq).toHaveAttribute('data-rendered', 'a^2+b^2=c^2');
  const md = await saveAs(page, 'Markdown (.md)');
  expect(md.data.toString('utf8')).toBe('Pythagoras: $a^2+b^2=c^2$\n');
  const docx = await saveAs(page, 'Word document (.docx)');
  await openFile(page, 'eq.docx', docx.data);
  await expect(page.locator('.doc-page span.math')).toHaveAttribute('data-latex', /a\^\{?2\}?\+b\^\{?2\}?=c\^\{?2\}?/);
  expect(errors).toEqual([]);
});

test('opens templates and examples from the gallery (FILE-018)', async ({ page }) => {
  const errors = await openApp(page);
  await page.getByRole('button', { name: 'Templates and examples' }).click();
  const gallery = page.getByRole('dialog', { name: 'New from a template' });
  await expect(gallery.getByRole('region', { name: 'Spreadsheets' })).toBeVisible();
  await gallery.getByRole('button', { name: 'Report', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Document' });
  await expect(editor).toContainText('Table 1: Measurements of the three tests');
  await expect(page.locator('.doc-name, .file-name').first()).toContainText('Report');

  await page.locator('.header-actions').getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Templates and examples' }).click();
  await page.getByRole('dialog', { name: 'New from a template' }).getByRole('button', { name: 'Budget' }).click();
  await expect(page.locator('td[data-r="9"][data-c="4"]')).toHaveText('2,575.00');
  await expect(page.getByRole('figure', { name: /Expenses by month/ })).toBeVisible();

  await page.locator('.header-actions').getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Templates and examples' }).click();
  await page.getByRole('dialog', { name: 'New from a template' }).getByRole('button', { name: 'A tour of the word processor' }).click();
  await expect(editor).toContainText('A tour of Progressive Web Office');
  await expect(editor.locator('.diagram').first()).toBeVisible();
  if (process.env.SCREENSHOTS) await page.screenshot({ path: 'test-results/tour.png', fullPage: false });
  expect(errors).toEqual([]);
});

test('saves a document as a template of the browser and starts from it (FILE-019)', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'New document' }).click();
  await page.getByRole('textbox', { name: 'Document' }).click();
  await page.keyboard.type('Weekly report of the lab');
  page.once('dialog', (d) => void d.accept('Weekly report'));
  await page.getByLabel('Save as format').selectOption({ label: 'Save as template…' });
  await expect(page.getByRole('alert')).toContainText('Template “Weekly report” saved');

  page.once('dialog', (d) => void d.accept()); // discard the unsaved document
  await page.locator('.header-actions').getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Templates and examples' }).click();
  const gallery = page.getByRole('dialog', { name: 'New from a template' });
  const mine = gallery.getByRole('region', { name: 'My templates' });
  await mine.getByRole('button', { name: 'Weekly report', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Document' })).toContainText('Weekly report of the lab');

  await page.locator('.header-actions').getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Templates and examples' }).click();
  page.once('dialog', (d) => void d.accept());
  await gallery.getByRole('button', { name: 'Delete the template Weekly report' }).click();
  await expect(mine.getByRole('button', { name: 'Weekly report', exact: true })).toHaveCount(0);
});

test('opens a template file as a new document and saves template files (FILE-020)', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'New document' }).click();
  await page.getByRole('textbox', { name: 'Document' }).click();
  await page.keyboard.type('Letterhead of the lab');
  const download = page.waitForEvent('download');
  await page.getByLabel('Save as format').selectOption({ label: 'Save as template file (.ott)…' });
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.ott$/);
  const chunks: Buffer[] = [];
  for await (const c of await file.createReadStream()) chunks.push(c as Buffer);
  const ott = Buffer.concat(chunks);
  expect(ott.subarray(30, 38).toString()).toBe('mimetype');
  expect(ott.subarray(38, 86).toString()).toBe('application/vnd.oasis.opendocument.text-template');

  page.once('dialog', (d) => void d.accept());
  await openFile(page, 'letterhead.ott', ott);
  await expect(page.getByRole('textbox', { name: 'Document' })).toContainText('Letterhead of the lab');
  await expect(page.getByRole('alert')).toContainText('New document from a template');
  await expect(page.locator('header')).toContainText('letterhead.odt');
});

test('opens the examples with plots: a lab report with Python figures and a workbook of measurements (FILE-018, SHEET-024)', async ({ page }) => {
  const errors = await openApp(page);
  await page.getByRole('button', { name: 'Templates and examples' }).click();
  await page.getByRole('dialog', { name: 'New from a template' }).getByRole('button', { name: 'Lab report with Python plots' }).click();
  const editor = page.getByRole('textbox', { name: 'Document' });
  await expect(editor).toContainText('R = 47.0 Ω');
  const figures = editor.locator('.code-cell img');
  await expect(figures).toHaveCount(5);
  for (let i = 0; i < 5; i++) await expect.poll(() => figures.nth(i).evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(300);
  await expect(editor).toContainText('E - E*exp(-t/(C*R))');
  if (process.env.SCREENSHOTS) {
    await figures.nth(2).scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'test-results/lab.png', fullPage: false });
  }

  await page.locator('.header-actions').getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Templates and examples' }).click();
  await page.getByRole('dialog', { name: 'New from a template' }).getByRole('button', { name: 'Measurements and charts' }).click();
  await expect(page.getByRole('figure', { name: /Damped oscillations/ })).toBeVisible();
  await page.getByRole('tab', { name: 'Ohm’s law' }).click();
  await expect(page.getByRole('figure', { name: /U against I/ })).toBeVisible();
  await expect(page.locator('td[data-r="0"][data-c="5"]')).toHaveText('46.8');
  expect(errors).toEqual([]);
});

test('opens several dropped files at once in the folder panel (FILE-027)', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(['# Notes\n\nFirst note.\n'], 'notes.md', { type: 'text/markdown' }));
    dt.items.add(new File(['a,b\n1,2\n'], 'data.csv', { type: 'text/csv' }));
    dt.items.add(new File(['# Plan\n'], 'plan.md', { type: 'text/markdown' }));
    document.querySelector('.app')!.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  const panel = page.getByRole('complementary', { name: 'Folder' });
  await expect(panel.getByRole('heading', { name: '📁 Dropped files (3)' })).toBeVisible();
  for (const name of ['notes.md', 'data.csv', 'plan.md']) await expect(panel.getByRole('button', { name, exact: true })).toBeVisible();
  // The first document is open; the others are a click away.
  await expect(page.locator('.doc-page h1')).toHaveText('Notes');
  await panel.getByRole('button', { name: 'data.csv', exact: true }).click();
  await expect(page.locator('td[data-r="1"][data-c="1"]')).toHaveText('2');
  expect(errors).toEqual([]);
});
