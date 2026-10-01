import { expect, test, type Page } from '@playwright/test';
import { openApp, saveAs } from './helpers';

async function newDocument(page: Page) {
  await openApp(page);
  await page.getByRole('button', { name: 'New document' }).click();
  const editor = page.getByRole('textbox', { name: 'Document' });
  await editor.click();
  return editor;
}

test('Markdown-style typing, lists, indentation and undo (DOC-018)', async ({ page }) => {
  const editor = await newDocument(page);
  await page.keyboard.type('# Plan');
  await page.keyboard.press('Enter');
  // After a heading, Enter continues in normal text.
  await page.keyboard.type('Intro with **no** magic');
  await page.keyboard.press('Enter');
  await page.keyboard.type('- apples');
  await page.keyboard.press('Enter');
  await page.keyboard.type('pears');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('green');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Enter'); // empty item: leaves the list
  await page.keyboard.type('1. first');
  await page.keyboard.press('Enter');
  await page.keyboard.type('> wise words');
  await expect(editor.locator('h1')).toHaveText('Plan');
  await expect(editor.locator('.list-item[data-list="ul"]')).toHaveCount(3);
  await expect(editor.locator('.list-item[data-level="1"]')).toHaveText('green');
  await expect(editor.locator('.list-item[data-list="ol"]')).toHaveCount(1);
  await expect(editor.locator('.list-item[data-list="ol"]')).toHaveText('first');
  // "1. first" then "> " on the next item: the quote is not a list item.
  await expect(editor.locator('blockquote')).toHaveText('wise words');

  const md = (await saveAs(page, 'Markdown (.md)')).data.toString();
  expect(md).toContain('# Plan');
  expect(md).toMatch(/- apples\n- pears\n {2,4}- green/);
  expect(md).toContain('1. first');
  expect(md).toContain('> wise words');

  // Undo / redo through the history (not the browser).
  await editor.click();
  await page.keyboard.press('Control+End');
  // Typing pauses separate undo steps.
  await page.waitForTimeout(700);
  await page.keyboard.type(' again');
  await expect(editor.locator('blockquote')).toHaveText('wise words again');
  await page.keyboard.press('Control+z');
  await expect(editor.locator('blockquote')).toHaveText('wise words');
  await page.keyboard.press('Control+y');
  await expect(editor.locator('blockquote')).toHaveText('wise words again');
});

test('formatting buttons reflect and change the selection (DOC-004)', async ({ page }) => {
  const editor = await newDocument(page);
  await page.keyboard.type('Make this bold');
  await page.keyboard.press('Shift+Control+ArrowLeft');
  const bold = page.getByRole('button', { name: 'Bold', exact: true });
  await bold.click();
  await expect(editor.locator('strong')).toHaveText('bold');
  await expect(bold).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Align center' }).click();
  await expect(editor.locator('p').first()).toHaveAttribute('data-align', 'center');
  await page.getByLabel('Paragraph style').selectOption('h2');
  await expect(editor.locator('h2')).toHaveText('Make this bold');
});

test('pastes formatted text from another application (DOC-009)', async ({ page }) => {
  const editor = await newDocument(page);
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.setData('text/html', '<meta charset="utf-8"><h2 style="color:red">Pasted</h2><ul><li>one <b>bold</b></li><li>two</li></ul><script>alert(1)</script>');
    data.setData('text/plain', 'Pasted one bold two');
    document.querySelector('.doc-page')!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect(editor.locator('h2')).toHaveText('Pasted');
  await expect(editor.locator('.list-item')).toHaveCount(2);
  await expect(editor.locator('.list-item strong')).toHaveText('bold');
  await expect(editor.locator('script')).toHaveCount(0);
});
