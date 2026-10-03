import { expect, test } from '@playwright/test';
import { openApp, openFile, saveAs } from './helpers';

// DOC-048: typography after TeX.

test('hyphenates in the language of the document, breaks paragraphs as a whole, and sets small capitals (DOC-048)', async ({ page }) => {
  const errors = await openApp(page);
  await openFile(page, 'fr.md', '---\nlang: fr\n---\n\nLa typographie du [xix]{.smallcaps}e siècle était remarquable.\n\nTexte.\n');
  const doc = page.getByRole('textbox', { name: 'Document' });
  await expect(doc).toHaveAttribute('lang', 'fr');
  const p = doc.locator('p').first();
  await expect(p).toHaveCSS('hyphens', 'auto');
  await expect(p).toHaveCSS('text-wrap', /pretty/);
  await expect(doc.locator('.smallcaps')).toHaveText('xix');
  await expect(doc.locator('.smallcaps')).toHaveCSS('font-variant-caps', 'small-caps');
  // Small capitals from the toolbar (Ctrl+Shift+K).
  await doc.locator('p').nth(1).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Shift+Home');
  await page.keyboard.press('Control+Shift+K');
  await expect(doc.locator('p').nth(1).locator('.smallcaps')).toHaveText('Texte.');
  const md = (await saveAs(page, 'Markdown (.md)')).data.toString();
  expect(md).toContain('[Texte.]{.smallcaps}');
  // Hyphenation can be turned off.
  await page.getByLabel('View', { exact: true }).first().selectOption({ label: '✓ Hyphenation' });
  await expect(p).toHaveCSS('hyphens', 'manual');
  expect(errors).toEqual([]);
});
