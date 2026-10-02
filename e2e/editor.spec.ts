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
  // UI-016: any size can be typed, beyond the suggested ones.
  await page.getByLabel('Font size').fill('150');
  await page.getByLabel('Font size').press('Enter');
  await page.getByRole('button', { name: 'Text colour' }).click(); // applies the default red
  await page.getByRole('button', { name: 'Highlight colour' }).click();
  const span = editor.locator('span[data-font="Georgia"]');
  await expect(span).toHaveText('Titre rouge');
  await expect(editor.locator('[data-size="150"]')).toHaveText('Titre rouge');
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
  expect(content).toContain('fo:font-size="150pt"');
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

test('adds, numbers and edits footnotes (DOC-022)', async ({ page }) => {
  const editor = await newDocument(page);
  await page.keyboard.type('Claim');
  await page.keyboard.press('Control+Alt+f');
  const dialog = page.getByRole('dialog', { name: 'Insert a footnote' });
  await dialog.getByLabel('Footnote text').fill('A *source*.');
  await dialog.getByRole('button', { name: 'Insert' }).click();
  await page.keyboard.type(' and another');
  await page.getByRole('button', { name: 'Footnote', exact: true }).click();
  await page.getByRole('dialog', { name: 'Insert a footnote' }).getByLabel('Footnote text').fill('Second note');
  await page.getByRole('dialog', { name: 'Insert a footnote' }).getByRole('button', { name: 'Insert' }).click();
  const notes = page.getByRole('complementary', { name: 'Notes' });
  await expect(notes.locator('li')).toHaveText(['A source.', 'Second note']);
  await expect(notes.locator('li em')).toHaveText('source');
  // Edit the first note from its reference.
  await editor.locator('.pm-footnote').first().click();
  const edit = page.getByRole('dialog', { name: 'Edit the footnote' });
  await expect(edit.getByLabel('Footnote text')).toHaveValue('A *source*.');
  await edit.getByLabel('Footnote text').fill('A better source.');
  await edit.getByRole('button', { name: 'OK' }).click();
  await expect(notes.locator('li').first()).toHaveText('A better source.');
  const md = (await saveAs(page, 'Markdown (.md)')).data.toString();
  expect(md).toBe('Claim[^1] and another[^2]\n\n[^1]: A better source.\n\n[^2]: Second note\n');
});

test('table of contents follows the headings (DOC-023)', async ({ page }) => {
  const editor = await newDocument(page);
  await page.keyboard.type('# Introduction');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Some text');
  await page.keyboard.press('Enter');
  await page.keyboard.type('## Method');
  await page.keyboard.press('Control+Home');
  await page.getByRole('button', { name: 'Table of contents' }).click();
  const toc = editor.getByRole('navigation', { name: 'Contents' });
  await expect(toc.locator('li')).toHaveText(['Introduction', 'Method']);
  // It updates as headings are added.
  await editor.locator('p', { hasText: 'Some text' }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('# Results');
  await expect(toc.locator('li')).toHaveText(['Introduction', 'Results', 'Method']); // in document order
  await expect(toc.locator('li.toc-2')).toHaveText('Method');
  // Entries jump to their heading.
  await toc.getByRole('link', { name: 'Method' }).click();
  await page.keyboard.type('!');
  await expect(editor.locator('h2')).toHaveText('!Method');
});

test('header and footer with page numbers (DOC-024)', async ({ page }) => {
  await newDocument(page);
  await page.getByRole('button', { name: 'Header and footer' }).click();
  const dialog = page.getByRole('dialog', { name: 'Header and footer' });
  await dialog.getByLabel('Header — Left').fill('TP 3');
  await dialog.getByRole('button', { name: 'Page 1 of 10', exact: true }).click();
  await expect(dialog.getByLabel('Footer — Centre')).toHaveValue('Page {page} of {pages}');
  await dialog.getByLabel('Footer — Right').click();
  await dialog.getByRole('button', { name: 'Date' }).click();
  await dialog.getByRole('button', { name: 'OK' }).click();
  await expect(page.getByRole('button', { name: 'Header', exact: true })).toContainText('TP 3');
  await expect(page.getByRole('button', { name: 'Footer', exact: true })).toContainText('Page 1 of 1');

  const { unzipSync, strFromU8 } = await import('fflate');
  const docx = unzipSync(new Uint8Array((await saveAs(page, 'Word document (.docx)')).data));
  expect(strFromU8(docx['word/header1.xml']!)).toContain('TP 3');
  expect(strFromU8(docx['word/footer1.xml']!)).toContain('w:instr=" NUMPAGES "');
});

test('page numbering styles: roman numerals from iii, no number on the title page (DOC-029)', async ({ page }) => {
  await newDocument(page);
  await page.getByRole('button', { name: 'Header and footer' }).click();
  const dialog = page.getByRole('dialog', { name: 'Header and footer' });
  await dialog.getByRole('button', { name: '- 1 -', exact: true }).click();
  await expect(dialog.getByLabel('Footer — Centre')).toHaveValue('- {page} -');
  await dialog.getByLabel('Style').selectOption({ label: 'i, ii, iii' });
  await dialog.getByLabel('First page number').fill('3');
  await dialog.getByLabel('No header and footer on the first page (title page)').check();
  await dialog.getByRole('button', { name: 'OK' }).click();
  await expect(page.getByRole('button', { name: 'Footer', exact: true })).toContainText('- iii -');

  const { unzipSync, strFromU8 } = await import('fflate');
  const docx = unzipSync(new Uint8Array((await saveAs(page, 'Word document (.docx)')).data));
  const main = strFromU8(docx['word/document.xml']!);
  expect(main).toContain('<w:pgNumType w:fmt="lowerRoman" w:start="3"/>');
  expect(main).toContain('<w:titlePg/>');
});

test('edits tables: rows, columns, merged cells and header row (DOC-025)', async ({ page }) => {
  const editor = await newDocument(page);
  const bar = page.getByRole('toolbar', { name: 'Table' });
  await expect(bar).toBeHidden();
  await page.getByRole('button', { name: 'Insert table' }).click();
  await expect(bar).toBeVisible();
  await page.keyboard.type('Name');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Unit');
  await bar.getByRole('button', { name: 'Insert a column on the right' }).click();
  await bar.getByRole('button', { name: 'Insert a row below' }).click();
  await expect(editor.locator('tr')).toHaveCount(4);
  await expect(editor.locator('tr').first().locator('td, th')).toHaveCount(4);
  await bar.getByRole('button', { name: 'Delete the column' }).click();
  await expect(editor.locator('tr').first().locator('td, th')).toHaveCount(3);
  // Merge the first two cells of the first row (shift-click makes a cell selection).
  const first = editor.locator('tr').first().locator('td, th');
  await first.nth(0).click();
  await first.nth(1).click({ modifiers: ['Shift'] });
  await bar.getByRole('button', { name: 'Merge the selected cells' }).click();
  await expect(editor.locator('tr').first().locator('td, th').first()).toHaveAttribute('colspan', '2');
  await bar.getByRole('button', { name: 'Header row (repeated on each page)' }).click();
  await expect(editor.locator('th')).toHaveCount(2);
  // Leaving the table hides the bar.
  await editor.locator('p').last().click();
  await expect(bar).toBeHidden();

  const { unzipSync, strFromU8 } = await import('fflate');
  const xml = strFromU8(unzipSync(new Uint8Array((await saveAs(page, 'Word document (.docx)')).data))['word/document.xml']!);
  expect(xml).toContain('<w:gridSpan w:val="2"/>');
  expect(xml).toContain('<w:tblHeader/>');
});

test('captions number figures and cross-references follow them (DOC-026)', async ({ page }) => {
  const editor = await newDocument(page);
  await page.keyboard.type('# Results');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Some text');
  const caption = async (text: string) => {
    await page.getByRole('button', { name: 'Caption', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Caption' });
    await expect(dialog.getByLabel('Figure')).toBeChecked();
    await dialog.getByLabel('Caption text').fill(text);
    await dialog.getByRole('button', { name: 'OK' }).click();
  };
  await caption('Setup');
  await expect(editor.locator('p.caption')).toHaveText(['Figure 1: Setup']);
  // A caption inserted earlier renumbers the next one.
  await editor.locator('h1').click();
  await caption('Overview');
  await expect(editor.locator('p.caption')).toHaveText(['Figure 1: Overview', 'Figure 2: Setup']);

  await editor.locator('p', { hasText: 'Some text' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(', see ');
  await page.getByRole('button', { name: 'Cross-reference' }).click();
  const picker = page.getByRole('dialog', { name: 'Insert a cross-reference' });
  await expect(picker.getByRole('button', { name: 'Results' })).toBeVisible(); // headings too
  await picker.getByRole('button', { name: 'Figure 2: Setup' }).click();
  await page.keyboard.type('.');
  await expect(editor.locator('p', { hasText: 'Some text' })).toHaveText('Some text, see Figure 2.');
  // Deleting the first caption renumbers the figure and its reference.
  await editor.locator('p.caption').first().click();
  await page.keyboard.press('End');
  await page.keyboard.press('Shift+Home');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await expect(editor.locator('p.caption')).toHaveText(['Figure 1: Setup']);
  await expect(editor.locator('p', { hasText: 'Some text' })).toHaveText('Some text, see Figure 1.');

  const { unzipSync, strFromU8 } = await import('fflate');
  const xml = strFromU8(unzipSync(new Uint8Array((await saveAs(page, 'Word document (.docx)')).data))['word/document.xml']!);
  expect(xml).toContain('SEQ Figure');
  expect(xml).toMatch(/REF _Ref_fig_\w+ \\h/);
});

test('cites BibTeX sources and lists the references (DOC-027)', async ({ page }) => {
  const editor = await newDocument(page);
  await page.keyboard.type('As shown by ');
  await page.getByRole('button', { name: 'Bibliography' }).click();
  const sources = page.getByRole('dialog', { name: 'Bibliography' });
  await sources.getByLabel('Paste BibTeX entries').fill('@book{knuth1984, author = {Knuth, Donald E.}, title = {The TeXbook}, year = 1984, publisher = {Addison-Wesley}}\n@article{lamport1994, author = {Leslie Lamport}, title = {LaTeX}, journal = {J. Tests}, year = {1994}}');
  await sources.getByRole('button', { name: 'Add the pasted entries' }).click();
  await expect(sources.getByText('2 sources')).toBeVisible();
  await sources.getByRole('button', { name: 'OK' }).click();

  await page.getByRole('button', { name: 'Cite', exact: true }).click();
  const cite = page.getByRole('dialog', { name: 'Cite' });
  await cite.getByLabel('Search the sources').fill('lamport');
  await cite.getByLabel(/Lamport \(1994\)/).check();
  await cite.getByLabel('Page or section').fill('p. 3');
  await cite.getByRole('button', { name: 'OK' }).click();
  await page.keyboard.type(' and ');
  await page.getByRole('button', { name: 'Cite', exact: true }).click();
  await cite.getByLabel(/Knuth \(1984\)/).check();
  await cite.getByRole('button', { name: 'OK' }).click();
  await expect(editor.locator('p').first()).toHaveText('As shown by [1, p. 3] and [2]');

  await page.getByRole('button', { name: 'Bibliography' }).click();
  await sources.getByLabel('Citations').selectOption('author-year');
  await sources.getByRole('button', { name: 'Insert the list of references here' }).click();
  await expect(editor.locator('p').first()).toHaveText('As shown by (Lamport, 1994, p. 3) and (Knuth, 1984)');
  await expect(editor.locator('section.bibliography li')).toHaveText(['Knuth, D. E. (1984). The TeXbook. Addison-Wesley.', 'Lamport, L. (1994). LaTeX. J. Tests.']);

  const md = (await saveAs(page, 'Markdown (.md)')).data.toString();
  expect(md).toContain('As shown by [@lamport1994, p. 3] and [@knuth1984]');
  expect(md).toContain('<div id="refs"></div>');
  expect(md).toContain('references:');
});

test('marks solutions, hides them and saves the exercise sheet without them (TEACH-001)', async ({ page }) => {
  const editor = await newDocument(page);
  await page.keyboard.type('Compute 2 + 3.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('2 + 3 = 5');
  await page.getByRole('button', { name: 'Solution', exact: true }).click();
  await expect(editor.locator('[data-solution]')).toHaveText('2 + 3 = 5');
  await expect(page.getByRole('button', { name: 'Solution', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Hide the solutions' }).click();
  await expect(editor.locator('[data-solution]')).toBeHidden();
  const sheet = await saveAs(page, 'Exercise sheet without solutions (.md)');
  expect(sheet.name).toBe('Untitled document-sheet.md');
  expect(sheet.data.toString()).toBe('Compute 2 + 3.\n');
  const key = await saveAs(page, 'Markdown (.md)');
  expect(key.data.toString()).toContain('::: solution\n\n2 + 3 = 5\n\n:::');
});

test('describes and captions an inserted picture, then checks accessibility (IMG-003, DOC-030)', async ({ page }) => {
  const editor = await newDocument(page);
  await page.keyboard.type('Results');
  await page.keyboard.press('Enter');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Insert image' }).click();
  await (await chooser).setFiles({ name: 'IMG_2041.png', mimeType: 'image/png', buffer: png });
  const dialog = page.getByRole('dialog', { name: 'Picture' });
  await dialog.getByLabel(/^Alternative text/).fill('The voltage across the capacitor');
  await dialog.getByLabel(/^Caption/).fill('Charge of a capacitor');
  await dialog.getByRole('button', { name: 'OK' }).click();
  await expect(editor.locator('img[data-resource]')).toHaveAttribute('alt', 'The voltage across the capacitor');
  await expect(editor.locator('p.caption')).toContainText('Figure 1: Charge of a capacitor');

  await page.keyboard.press('Enter');
  await page.keyboard.type('See here.');
  await page.getByRole('button', { name: 'Check accessibility' }).click();
  const check = page.getByRole('dialog', { name: 'Accessibility check' });
  await expect(check.getByRole('listitem')).toHaveText([/no title/, /language is not set/]);
  await check.getByRole('button', { name: 'Close' }).click();

  // A double click edits the alternative text; a decorative picture needs none.
  await editor.locator('img[data-resource]').dispatchEvent('dblclick');
  await page.getByLabel(/Decorative picture/).check();
  await page.getByRole('button', { name: 'OK' }).click();
  await expect(editor.locator('img[data-resource]')).toHaveAttribute('alt', '');
});

test('generates random variants of a sheet with their answer keys (TEACH-002)', async ({ page }) => {
  await newDocument(page);
  await page.keyboard.type('A resistor of {{R=rand(10..20)}} ohms carries 2 A. Find U.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('U = {{R}} x 2 = {{=R*2}} V');
  await page.getByRole('button', { name: 'Solution', exact: true }).click();
  await page.getByRole('button', { name: 'Random variants' }).click();
  const dialog = page.getByRole('dialog', { name: 'Random variants' });
  await expect(dialog).toContainText('R = rand(10..20)');
  await dialog.getByLabel('Number of variants').fill('3');
  await dialog.getByLabel('Format').selectOption('md');
  await dialog.getByLabel('Seed').fill('7');
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Generate' }).click();
  const d = await download;
  expect(d.suggestedFilename()).toBe('sheet-variants.zip');
  const chunks: Buffer[] = [];
  for await (const c of await d.createReadStream()) chunks.push(c as Buffer);
  const { unzipSync } = await import('fflate');
  const files = unzipSync(new Uint8Array(Buffer.concat(chunks)));
  expect(Object.keys(files).sort()).toEqual(['sheet-1-key.md', 'sheet-1.md', 'sheet-2-key.md', 'sheet-2.md', 'sheet-3-key.md', 'sheet-3.md', 'sheet-values.csv']);
  const text = (name: string): string => new TextDecoder().decode(files[name]);
  const r = /resistor of (\d+) ohms/.exec(text('sheet-1.md'))![1]!;
  expect(Number(r)).toBeGreaterThanOrEqual(10);
  expect(text('sheet-1.md')).not.toContain('U =');
  expect(text('sheet-1-key.md')).toContain(`U = ${r} x 2 = ${Number(r) * 2} V`);
  expect(text('sheet-values.csv').split('\n')[0]).toBe('variant,R');
});

test('runs an action found by name in the command palette (UI-018)', async ({ page }) => {
  const editor = await newDocument(page);
  await page.keyboard.type('Plan');
  await page.keyboard.press('Control+Shift+P');
  const palette = page.getByRole('dialog', { name: 'Commands' });
  await palette.getByRole('combobox').fill('table conten');
  await expect(palette.getByRole('option').first()).toContainText('Table of contents');
  await page.keyboard.press('Enter');
  await expect(palette).toBeHidden();
  await expect(editor.locator('.toc')).toHaveCount(1);
});
