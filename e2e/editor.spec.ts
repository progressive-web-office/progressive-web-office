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

test('finds and replaces text (DOC-019)', async ({ page }) => {
  const editor = await newDocument(page);
  await page.keyboard.type('Le chat et le chaton. Un CHAT.');
  await page.keyboard.press('Control+f');
  const bar = page.getByRole('search', { name: 'Find and replace' });
  await bar.getByLabel('Find', { exact: true }).fill('chat');
  await expect(bar.getByRole('status')).toHaveText('1 of 3');
  await expect(editor.locator('.search-match')).toHaveCount(3);
  await bar.getByLabel('Whole words').check();
  await expect(bar.getByRole('status')).toHaveText('1 of 2');
  await page.keyboard.press('Escape');
  await expect(bar).toBeHidden();
  await expect(editor.locator('.search-match')).toHaveCount(0);

  await page.keyboard.press('Control+h');
  await bar.getByLabel('Find', { exact: true }).fill('chat');
  await bar.getByLabel('Replace with').fill('chien');
  await bar.getByRole('button', { name: 'Replace all' }).click();
  await expect(bar.getByRole('status')).toHaveText('2 replaced');
  await expect(editor).toHaveText('Le chien et le chaton. Un chien.');
  // One undo step.
  await editor.click();
  await page.keyboard.press('Control+z');
  await expect(editor).toHaveText('Le chat et le chaton. Un CHAT.');
});

test('character formatting and paragraph spacing reach the file (DOC-020)', async ({ page }) => {
  const editor = await newDocument(page);
  await page.keyboard.type('Titre rouge');
  await page.keyboard.press('Shift+Home');
  await page.getByLabel('Font', { exact: true }).selectOption('Georgia');
  await page.getByLabel('Font size').selectOption('18');
  await page.getByRole('button', { name: 'Text colour' }).click(); // applies the default red
  await page.getByRole('button', { name: 'Highlight colour' }).click();
  const span = editor.locator('span[data-font="Georgia"]');
  await expect(span).toHaveText('Titre rouge');
  await expect(editor.locator('[data-size="18"]')).toHaveText('Titre rouge');
  await expect(editor.locator('mark[data-highlight="#ffff00"]')).toHaveCount(1);
  // The toolbar shows the formatting at the cursor.
  await expect(page.getByLabel('Font', { exact: true })).toHaveValue('Georgia');

  await page.getByRole('button', { name: 'Paragraph spacing…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Paragraph' });
  await dialog.getByLabel('Left indent (cm)').fill('1');
  await dialog.getByLabel('After (pt)').fill('18');
  await dialog.getByLabel('Line spacing').selectOption('1.5');
  await dialog.getByRole('button', { name: 'OK' }).click();
  await expect(editor.locator('p').first()).toHaveAttribute('data-indent', '28.3');
  await expect(page.getByLabel('Line spacing')).toHaveValue('1.5');

  const { unzipSync, strFromU8 } = await import('fflate');
  const odt = await saveAs(page, 'OpenDocument text (.odt)');
  const content = strFromU8(unzipSync(new Uint8Array(odt.data))['content.xml']!);
  expect(content).toContain('fo:font-family="Georgia"');
  expect(content).toContain('fo:font-size="18pt"');
  expect(content).toContain('fo:color="#c00000"');
  expect(content).toContain('fo:background-color="#ffff00"');
  expect(content).toContain('fo:margin-left="28.3pt"');
  expect(content).toContain('fo:line-height="150%"');

  // Clear formatting removes it all.
  await editor.click();
  await page.keyboard.press('Control+a');
  await page.getByRole('button', { name: 'Clear formatting' }).click();
  await expect(editor.locator('span[data-font], [data-size], mark')).toHaveCount(0);
});

test('inserts page breaks (DOC-021)', async ({ page }) => {
  const editor = await newDocument(page);
  await page.keyboard.type('Page one');
  await page.keyboard.press('Control+Enter');
  await page.keyboard.type('Page two');
  await expect(editor.locator('hr.page-break')).toHaveAttribute('data-label', 'Page break');
  await expect(editor.locator('p')).toHaveText(['Page one', 'Page two']);
  const md = (await saveAs(page, 'Markdown (.md)')).data.toString();
  expect(md).toBe('Page one\n\n\\newpage\n\nPage two\n');
});
