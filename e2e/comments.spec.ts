import { expect, test } from '@playwright/test';
import { unzipSync } from 'fflate';
import { openApp, openFile, saveAs } from './helpers';

test('comments a word, replies, resolves and saves the comments in DOCX (REV-001, REV-002)', async ({ page }) => {
  const errors = await openApp(page);
  await page.getByRole('button', { name: 'New document' }).click();
  const editor = page.getByRole('textbox', { name: 'Document' });
  await editor.click();
  // The cursor at the end of a word: the word is commented.
  await page.keyboard.type('The answer is wrong');
  page.once('dialog', (d) => void d.accept('Ann Lee'));
  await page.keyboard.press('Control+Alt+m');
  const panel = page.getByRole('complementary', { name: 'Comments' });
  await panel.getByRole('textbox', { name: 'New comment' }).fill('Check the sign.');
  await panel.getByRole('button', { name: 'Post', exact: true }).click();
  const card = panel.getByRole('article', { name: 'Comment by Ann Lee' });
  await expect(card.locator('.comment-quote')).toHaveText('wrong');
  await expect(card).toContainText('Check the sign.');
  await expect(editor.locator('[data-comment]')).toHaveText('wrong');
  // Typing after the commented word does not extend the comment.
  await editor.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' here.');
  await expect(editor.locator('[data-comment]')).toHaveText('wrong');

  await card.getByRole('button', { name: 'Reply' }).click();
  await card.getByRole('textbox', { name: 'Reply' }).fill('Fixed.');
  await card.getByRole('textbox', { name: 'Reply' }).press('Control+Enter');
  await expect(card.locator('.comment-entry.reply')).toContainText('Fixed.');
  await card.getByRole('button', { name: 'Resolve' }).click();
  await expect(card).toHaveClass(/resolved/);

  const { name, data } = await saveAs(page, 'Word document (.docx)');
  expect(name).toMatch(/\.docx$/);
  const zip = unzipSync(new Uint8Array(data));
  const comments = new TextDecoder().decode(zip['word/comments.xml']);
  expect(comments).toContain('w:author="Ann Lee"');
  expect(comments).toContain('Check the sign.');
  expect(comments).toContain('Fixed.');
  expect(new TextDecoder().decode(zip['word/commentsExtended.xml'])).toContain('w15:done="1"');

  // Deleting removes the highlight; undo brings it back.
  await card.getByRole('button', { name: 'Delete' }).click();
  await expect(panel).toBeHidden();
  await page.keyboard.press('Control+z');
  await expect(panel.getByRole('article')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('shows the comments of an OpenDocument text (REV-003)', async ({ page }) => {
  await openApp(page);
  const content =
    '<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/" office:version="1.3"><office:body><office:text>' +
    '<text:p>See <office:annotation office:name="a1"><dc:creator>Prof</dc:creator><dc:date>2026-10-01T08:00:00</dc:date><text:p>Good point.</text:p></office:annotation>this part<office:annotation-end office:name="a1"/> please.</text:p>' +
    '</office:text></office:body></office:document-content>';
  const { zipSync, strToU8 } = await import('fflate');
  const odt = zipSync({ mimetype: [strToU8('application/vnd.oasis.opendocument.text'), { level: 0 }], 'content.xml': strToU8(content) });
  await openFile(page, 'essay.odt', Buffer.from(odt));
  const card = page.getByRole('complementary', { name: 'Comments' }).getByRole('article', { name: 'Comment by Prof' });
  await expect(card.locator('.comment-quote')).toHaveText('this part');
  await card.click();
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe('this part');
});

test('tracks changes, accepts and rejects them, and saves them in DOCX (REV-005)', async ({ page }) => {
  const errors = await openApp(page);
  await page.getByRole('button', { name: 'New document' }).click();
  const editor = page.getByRole('textbox', { name: 'Document' });
  await editor.click();
  await page.keyboard.type('The brown fox.');
  page.once('dialog', (d) => void d.accept('Ann'));
  await page.getByRole('button', { name: 'Track changes' }).click();
  await expect(page.getByRole('button', { name: 'Track changes' })).toHaveAttribute('aria-pressed', 'true');
  // Delete "brown" (5 characters before " fox.") and type "red".
  await page.keyboard.press('End');
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowLeft');
  for (let i = 0; i < 5; i++) await page.keyboard.press('Backspace');
  await page.keyboard.type('red');
  await expect(editor.locator('del.tracked')).toHaveText('brown');
  await expect(editor.locator('ins.tracked')).toHaveText('red');
  const changes = page.getByRole('region', { name: 'Changes' });
  await expect(changes.getByRole('article')).toHaveCount(2);
  await expect(changes.getByRole('article', { name: 'Deleted by Ann' })).toContainText('brown');

  const { data } = await saveAs(page, 'Word document (.docx)');
  const xml = new TextDecoder().decode(unzipSync(new Uint8Array(data))['word/document.xml']);
  expect(xml).toMatch(/<w:del [^>]*w:author="Ann"[^>]*><w:r><w:delText xml:space="preserve">brown<\/w:delText>/);
  expect(xml).toMatch(/<w:ins [^>]*w:author="Ann"[^>]*><w:r><w:t xml:space="preserve">red<\/w:t>/);

  // Accept the deletion, reject the insertion.
  await changes.getByRole('article', { name: 'Deleted by Ann' }).getByRole('button', { name: 'Accept' }).click();
  await changes.getByRole('article', { name: 'Inserted by Ann' }).getByRole('button', { name: 'Reject' }).click();
  await expect(editor.locator('p').first()).toHaveText('The  fox.');
  await expect(changes).toBeHidden();
  expect(errors).toEqual([]);
});
