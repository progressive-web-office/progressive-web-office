import { expect, test } from '@playwright/test';
import { PDFDocument, StandardFonts } from '@pdfme/pdf-lib';
import { openApp, openFile } from './helpers';

async function pdf(pages: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i++) doc.addPage([595, 842]).drawText(`Hello page ${i}`, { x: 72, y: 760, size: 24, font });
  return Buffer.from(await doc.save());
}

test('turns the pages of a PDF file one spread at a time with the keyboard (REVIEW-001, REVIEW-002)', async ({ page }) => {
  const errors = await openApp(page);
  await openFile(page, 'long.pdf', await pdf(6), 'application/pdf');
  const pages = page.locator('.pdf-page');
  await expect(pages).toHaveCount(6);
  const pageInput = page.getByRole('spinbutton', { name: 'Page number' });
  await page.getByRole('region', { name: 'Page 1' }).click();
  await page.getByRole('button', { name: 'Page layout' }).click();
  await expect(page.locator('.pdf-page:visible')).toHaveCount(1);
  await page.keyboard.press('k');
  await expect(pageInput).toHaveValue('2');
  await expect(page.getByRole('region', { name: 'Page 2' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Page 1' })).toBeHidden();
  // Two pages side by side: a spread is 1–2, 3–4…
  await page.keyboard.press('2');
  await expect(page.locator('.pdf-page:visible')).toHaveCount(2);
  await page.keyboard.press('k');
  await expect(pageInput).toHaveValue('3');
  await expect(page.locator('.pdf-page:visible')).toHaveText([/Hello page 3/, /Hello page 4/]);
  await page.keyboard.press('End');
  await expect(pageInput).toHaveValue('6');
  await page.keyboard.press('j');
  await expect(pageInput).toHaveValue('3');
  await page.keyboard.press('g');
  await expect(pageInput).toHaveValue('1');
  // The help lists the shortcuts.
  await page.keyboard.press('?');
  const help = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(help.getByRole('row', { name: /Next page/ })).toContainText('k');
  await help.getByRole('button', { name: 'Close' }).click();
  // Full screen without distractions.
  await page.keyboard.press('f');
  await expect(page.locator('.app-header')).toBeHidden();
  await page.keyboard.press('f');
  await expect(page.locator('.app-header')).toBeVisible();
  await page.keyboard.press('s');
  await expect(page.locator('.pdf-page:visible')).toHaveCount(6);
  expect(errors).toEqual([]);
});

test('reviews a text document page by page and comments it (REVIEW-001..REVIEW-004)', async ({ page }) => {
  const errors = await openApp(page);
  const paragraphs = Array.from({ length: 60 }, (_, i) => `Paragraph ${i + 1}. ${'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(4)}`);
  await openFile(page, 'long.md', `# Report\n\n${paragraphs.join('\n\n')}\n`, 'text/markdown');
  const editor = page.getByRole('textbox', { name: 'Document' });
  await expect(editor).toContainText('Paragraph 60.');
  const bar = page.getByRole('toolbar', { name: 'Review' });
  await expect(bar).toBeHidden();
  await page.getByRole('button', { name: 'Review mode', exact: true }).click();
  await expect(bar).toBeVisible();
  await expect(page.getByRole('toolbar', { name: 'Formatting' })).toBeHidden();
  await expect(editor).toHaveAttribute('contenteditable', 'false');
  if ((await bar.getByRole('button', { name: 'Page layout' }).getAttribute('aria-pressed')) !== 'true') await page.keyboard.press('s');
  const total = Number((await bar.locator('.page-total').textContent())!.replace(/\D/g, ''));
  expect(total).toBeGreaterThan(3);
  const pageInput = bar.getByRole('spinbutton', { name: 'Page number' });
  await expect(pageInput).toHaveValue('1');
  const inView = async (text: string): Promise<boolean> =>
    editor.getByText(text, { exact: false }).first().evaluate((el) => {
      // Shown when a click on it reaches it (the other pages are clipped).
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + 5, r.top + r.height / 2);
      return !!hit && el.contains(hit);
    });
  expect(await inView('Paragraph 1.')).toBe(true);
  expect(await inView('Paragraph 60.')).toBe(false);
  await page.keyboard.press('k');
  await expect(pageInput).toHaveValue('2');
  expect(await inView('Paragraph 1.')).toBe(false);
  await page.keyboard.press('End');
  await expect(pageInput).toHaveValue(String(total));
  expect(await inView('Paragraph 60.')).toBe(true);

  // Typing does not change the text; a comment can be added on a selection.
  await editor.getByText('Paragraph 60.').dblclick();
  await page.keyboard.type('x');
  await expect(editor).toContainText('Paragraph 60.');
  page.once('dialog', (d) => void d.accept('Prof'));
  await page.keyboard.press('c');
  const panel = page.getByRole('complementary', { name: 'Comments' });
  await panel.getByRole('textbox', { name: 'New comment' }).fill('Too long.');
  await panel.getByRole('button', { name: 'Post', exact: true }).click();
  await expect(editor.locator('[data-comment]')).toHaveCount(1);
  // ] and [ go from comment to comment, turning the pages.
  await page.locator('.doc-scroll').focus();
  await page.keyboard.press('g');
  await expect(pageInput).toHaveValue('1');
  await page.keyboard.press(']');
  await expect(pageInput).toHaveValue(String(total));

  await bar.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('toolbar', { name: 'Formatting' })).toBeVisible();
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  await expect(bar).toBeHidden();
  expect(errors).toEqual([]);
});

test('finds the review mode and its shortcuts in the command palette, also read-only (REVIEW-001, UI-018)', async ({ page }) => {
  const errors = await openApp(page);
  await openFile(page, 'notes.md', `# Notes\n\n${'Some text. '.repeat(50)}\n`, 'text/markdown');
  await page.getByRole('button', { name: 'Read-only' }).click();
  const palette = page.getByRole('dialog', { name: 'Commands' });
  await page.keyboard.press('Control+Shift+P');
  await palette.getByRole('combobox').fill('review');
  const option = palette.getByRole('option', { name: /Review mode/ });
  await expect(option.locator('kbd')).toHaveText('Ctrl+Alt+R');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('toolbar', { name: 'Review' })).toBeVisible();
  await page.keyboard.press('Control+Shift+P');
  await palette.getByRole('combobox').fill('next comment');
  await expect(palette.getByRole('option').first().locator('kbd')).toHaveText(']');
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});
