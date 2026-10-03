import { expect, test, type Page } from '@playwright/test';

/** An in-memory folder behind window.showDirectoryPicker (FOLDER-001); files are exposed as window.__folder. */
async function fakeFolder(page: Page, files: Record<string, string>): Promise<void> {
  await page.addInitScript((initial: Record<string, string>) => {
    delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker;
    const store = new Map<string, string>(Object.entries(initial));
    (window as unknown as { __folder: Map<string, string> }).__folder = store;
    const fileHandle = (path: string) => ({
      kind: 'file',
      name: path.split('/').pop(),
      getFile: async () => new File([store.get(path) ?? ''], path.split('/').pop()!),
      createWritable: async () => {
        const parts: (Uint8Array | Blob)[] = [];
        return {
          write: async (d: Uint8Array | Blob) => void parts.push(d),
          close: async () => {
            const d = parts[0] ?? new Uint8Array();
            store.set(path, d instanceof Blob ? await d.text() : new TextDecoder().decode(d));
          },
        };
      },
    });
    const dirHandle = (prefix: string, name: string): unknown => ({
      kind: 'directory',
      name,
      async *values() {
        const seen = new Set<string>();
        for (const path of store.keys()) {
          if (!path.startsWith(prefix)) continue;
          const rest = path.slice(prefix.length);
          const head = rest.split('/')[0]!;
          if (seen.has(head)) continue;
          seen.add(head);
          yield rest.includes('/') ? dirHandle(`${prefix}${head}/`, head) : fileHandle(path);
        }
      },
      getDirectoryHandle: async (n: string, opts: { create?: boolean } = {}) => {
        if (!opts.create && ![...store.keys()].some((k) => k.startsWith(`${prefix}${n}/`))) throw Object.assign(new Error('NotFoundError'), { name: 'NotFoundError' });
        return dirHandle(`${prefix}${n}/`, n);
      },
      getFileHandle: async (n: string, opts: { create?: boolean } = {}) => {
        if (!opts.create && !store.has(`${prefix}${n}`)) throw Object.assign(new Error('NotFoundError'), { name: 'NotFoundError' });
        if (opts.create && !store.has(`${prefix}${n}`)) store.set(`${prefix}${n}`, '');
        return fileHandle(`${prefix}${n}`);
      },
      removeEntry: async (n: string) => {
        for (const k of [...store.keys()]) if (k === `${prefix}${n}` || k.startsWith(`${prefix}${n}/`)) store.delete(k);
      },
      queryPermission: async () => 'granted',
    });
    (window as unknown as { showDirectoryPicker: () => Promise<unknown> }).showDirectoryPicker = async () => dirHandle('', 'thesis');
  }, files);
  await page.goto('./');
}

async function openLocalFolder(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Open a folder' }).click();
  const dialog = page.getByRole('dialog', { name: 'Open a folder' });
  await dialog.getByLabel('A folder of this device').check();
  await dialog.getByRole('button', { name: 'Open' }).click();
}

test('works on a folder: tree, search, links, saving in place and master documents (FOLDER-001..003, DOC-028)', async ({ page }) => {
  await fakeFolder(page, {
    'main.md': '# Thesis\n\nSee [the first chapter](chapters/one.md).\n\n{{#include chapters/one.md}}\n\n{{#include chapters/two.md}}\n',
    'chapters/one.md': '# Control\n\nA PID regulator.\n',
    'chapters/two.md': '# Results\n\nThe regulator is stable.\n',
    'notes.txt': 'not shown in the tree',
  });
  await openLocalFolder(page);
  const panel = page.getByRole('complementary', { name: 'Folder' });
  await expect(panel.getByRole('heading', { name: '📁 thesis' })).toBeVisible();
  await expect(panel.getByRole('button', { name: /\.md$|chapters/ })).toHaveText(['chapters', 'main.md']);
  await panel.getByRole('button', { name: 'chapters' }).click();
  await expect(panel.getByRole('button', { name: /\.md$/ })).toHaveText(['one.md', 'two.md', 'main.md']);

  // Search across the folder, then open a result at its match.
  await panel.getByLabel('Search the folder').fill('régulator');
  await expect(panel.getByText('2 matches in 2 documents')).toBeVisible();
  await panel.getByRole('button', { name: 'chapters/two.md' }).click();
  await expect(page.locator('.doc-page h1')).toHaveText('Results');
  await expect(page.getByLabel('Find', { exact: true })).toHaveValue('régulator');
  await panel.getByLabel('Search the folder').fill('');

  // The master document: sub-documents, and Ctrl+click on a relative link.
  await panel.getByRole('navigation', { name: 'Documents of the folder' }).getByRole('button', { name: 'main.md' }).click();
  const editor = page.getByRole('textbox', { name: 'Document' });
  await expect(editor.locator('div.include')).toHaveCount(2);
  await editor.getByRole('link', { name: 'the first chapter' }).click({ modifiers: ['Control'] });
  await expect(page.locator('.doc-page h1')).toHaveText('Control');
  await expect(panel.locator('[aria-current=page]')).toHaveText('one.md');

  // Saving writes the file back into the folder.
  await editor.locator('p').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Tuned.');
  await page.locator('.header-actions').getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __folder: Map<string, string> }).__folder.get('chapters/one.md'))).toContain('A PID regulator. Tuned.');

  // Assembling the master document gives one file with its chapters.
  await panel.getByRole('navigation', { name: 'Documents of the folder' }).getByRole('button', { name: 'main.md' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Assemble…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Assemble…' });
  await dialog.getByLabel('Markdown (.md)').check();
  await dialog.getByRole('button', { name: 'Save' }).click();
  const d = await download;
  expect(d.suggestedFilename()).toBe('main-assembled.md');
  const chunks: Buffer[] = [];
  for await (const c of await d.createReadStream()) chunks.push(c as Buffer);
  const md = Buffer.concat(chunks).toString();
  expect(md).toContain('# Control\n\nA PID regulator. Tuned.');
  expect(md).toContain('# Results');
  expect(md).not.toContain('{{#include');
});

test('creates, renames and deletes documents in the folder (FOLDER-004)', async ({ page }) => {
  await fakeFolder(page, { 'notes/a.md': '# A\n' });
  await openLocalFolder(page);
  const panel = page.getByRole('complementary', { name: 'Folder' });
  const files = () => page.evaluate(() => [...(window as unknown as { __folder: Map<string, string> }).__folder.keys()].sort());
  await panel.getByRole('button', { name: 'notes', exact: true }).click();
  page.once('dialog', (d) => void d.accept('Plan.md'));
  await panel.getByRole('button', { name: 'New document' }).click();
  await expect(page.locator('.doc-page h1')).toHaveText('Untitled');
  await expect.poll(files).toEqual(['notes/Plan.md', 'notes/a.md']);
  // Renaming the open document follows it.
  page.once('dialog', (d) => void d.accept('Outline.md'));
  await panel.getByRole('button', { name: 'Rename (F2)' }).click();
  await expect.poll(files).toEqual(['notes/Outline.md', 'notes/a.md']);
  await expect(page.locator('.doc-name')).toHaveText('Outline.md');
  await expect(panel.locator('[aria-current=page]')).toHaveText('Outline.md');
  await panel.getByRole('button', { name: 'a.md' }).click();
  page.once('dialog', (d) => void d.accept());
  await panel.getByRole('button', { name: 'Delete (Del)' }).click();
  await expect.poll(files).toEqual(['notes/Outline.md']);
});

test('imports files, moves with the keyboard, sorts, filters names and undoes a deletion (FOLDER-008..011)', async ({ page }) => {
  await fakeFolder(page, { 'notes/a.md': '# A\n', 'notes/b.md': '# B\n', 'z.md': '# Z\n' });
  await openLocalFolder(page);
  const panel = page.getByRole('complementary', { name: 'Folder' });
  const files = () => page.evaluate(() => [...(window as unknown as { __folder: Map<string, string> }).__folder.keys()].sort());
  // Keyboard: open the folder with the right arrow, go down into it.
  await panel.getByRole('button', { name: 'notes', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(panel.getByRole('button', { name: 'a.md' })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(panel.getByRole('button', { name: 'a.md' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(panel.getByRole('button', { name: 'b.md' })).toBeFocused();
  // Import into the selected file's folder; a taken name gets a number.
  await panel.locator('.fs-explorer input[type=file]').setInputFiles([{ name: 'a.md', mimeType: 'text/markdown', buffer: Buffer.from('# New\n') }]);
  await expect.poll(files).toEqual(['notes/a 2.md', 'notes/a.md', 'notes/b.md', 'z.md']);
  await expect(panel.locator('[data-path="notes/a 2.md"]')).toHaveAttribute('data-meta', /6 B/);
  // Sort by type keeps folders first.
  await panel.getByLabel('Sort by').selectOption('size');
  await expect(panel.locator('.fs-tree > .fs-list > li > .fs-entry')).toHaveText(['notes', 'z.md']);
  // Select two files, delete them, then undo.
  await panel.getByRole('button', { name: 'a.md', exact: true }).click();
  await panel.getByRole('button', { name: 'b.md' }).click({ modifiers: ['ControlOrMeta'] });
  page.once('dialog', (d) => void d.accept());
  await panel.getByRole('button', { name: 'Delete (Del)' }).click();
  await expect.poll(files).toEqual(['notes/a 2.md', 'z.md']);
  await panel.getByRole('button', { name: 'Undo (Ctrl+Z)' }).click();
  await expect.poll(files).toEqual(['notes/a 2.md', 'notes/a.md', 'notes/b.md', 'z.md']);
  // Names are found at once in the search box.
  await panel.getByLabel('Search the folder').fill('a 2');
  await expect(panel.locator('.folder-names').getByRole('button', { name: 'notes/a 2.md' })).toBeVisible();
});

test('keeps documents in the browser storage (FOLDER-006)', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Open a folder' }).click();
  const dialog = page.getByRole('dialog', { name: 'Open a folder' });
  await dialog.getByLabel('Browser storage').check();
  await dialog.getByRole('button', { name: 'Open' }).click();
  const panel = page.getByRole('complementary', { name: 'Folder' });
  await expect(panel.getByRole('heading', { name: '📁 Browser storage' })).toBeVisible();
  page.once('dialog', (d) => void d.accept('Draft.md'));
  await panel.getByRole('button', { name: 'New document' }).click();
  await expect(page.locator('.doc-page h1')).toHaveText('Untitled');
  // Still there after a reload.
  await page.reload();
  await page.getByRole('button', { name: 'Open a folder' }).click();
  await dialog.getByLabel('Browser storage').check();
  await dialog.getByRole('button', { name: 'Open' }).click();
  await expect(panel.getByRole('button', { name: 'Draft.md' })).toBeVisible();
});

test('follows links between Markdown notes, shows backlinks and keeps links on rename (FOLDER-005)', async ({ page }) => {
  await fakeFolder(page, {
    'index.md': '# Index\n\nSee [[Control]] and [[Missing note]].\n',
    'notes/Control.md': '# Control\n\nA PID regulator.\n',
  });
  await openLocalFolder(page);
  const panel = page.getByRole('complementary', { name: 'Folder' });
  await panel.getByRole('button', { name: 'index.md' }).click();
  const editor = page.getByRole('textbox', { name: 'Document' });
  await editor.getByRole('link', { name: 'Control' }).click({ modifiers: ['Control'] });
  await expect(page.locator('.doc-page h1')).toHaveText('Control');
  await expect(panel.getByRole('heading', { name: 'Linked from (1)' })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'index.md' }).last()).toBeVisible();
  // Renaming the note updates the link in index.md.
  page.once('dialog', (d) => void d.accept('Regulation.md'));
  await panel.getByRole('button', { name: 'Rename (F2)' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __folder: Map<string, string> }).__folder.get('index.md'))).toContain('[[Regulation]]');
  // A link to a missing note creates it.
  await panel.getByRole('button', { name: 'index.md' }).first().click();
  page.once('dialog', (d) => void d.accept());
  await editor.getByRole('link', { name: 'Missing note' }).click({ modifiers: ['Control'] });
  await expect(page.locator('.doc-page h1')).toHaveText('Missing note');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __folder: Map<string, string> }).__folder.has('Missing note.md'))).toBe(true);
});

test('copies, pastes, duplicates and downloads from the context menu and the keyboard (FOLDER-012..014)', async ({ page }) => {
  await fakeFolder(page, { 'notes/a.md': '# A\n', 'notes/b.md': '# B\n', 'z.md': '# Z\n' });
  await openLocalFolder(page);
  const panel = page.getByRole('complementary', { name: 'Folder' });
  const files = () => page.evaluate(() => [...(window as unknown as { __folder: Map<string, string> }).__folder.keys()].sort());
  // Duplicate from the context menu.
  await panel.getByRole('button', { name: 'z.md' }).click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'Actions on the files' });
  await expect(menu.getByRole('menuitem')).toContainText(['Open', 'Rename (F2)', 'Duplicate', 'Copy (Ctrl+C)', 'Cut (Ctrl+X)', 'Download', 'Copy the path', 'Delete (Del)']);
  await menu.getByRole('menuitem', { name: 'Duplicate' }).click();
  await expect.poll(files).toEqual(['notes/a.md', 'notes/b.md', 'z 2.md', 'z.md']);
  // Copy with the keyboard, paste into the folder.
  await panel.getByRole('button', { name: 'z.md', exact: true }).focus();
  await page.keyboard.press('ControlOrMeta+c');
  await panel.getByRole('button', { name: 'notes', exact: true }).click();
  await page.keyboard.press('ControlOrMeta+v');
  await expect.poll(files).toEqual(['notes/a.md', 'notes/b.md', 'notes/z.md', 'z 2.md', 'z.md']);
  // Download the folder as an archive.
  await panel.getByRole('button', { name: 'notes', exact: true }).click({ button: 'right' });
  const download = page.waitForEvent('download');
  await menu.getByRole('menuitem', { name: 'Download' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('notes.zip');
  const { readFileSync } = await import('node:fs');
  const zip = readFileSync((await file.path())!);
  expect(zip.subarray(0, 2).toString()).toBe('PK');
  expect(zip.toString('latin1')).toContain('notes/z.md');
});

test('lists the tags of the notes, renames one everywhere and draws the graph of the notes (FOLDER-017, FOLDER-018)', async ({ page }) => {
  await fakeFolder(page, {
    'a.md': '---\ntags: [physics]\n---\n# A\n\nSee [[b]]. #todo\n',
    'b.md': '# B\n\nBack to [[a]]. #todo\n',
    'c.md': '# C\n',
  });
  await openLocalFolder(page);
  const panel = page.getByRole('complementary', { name: 'Folder' });
  await panel.getByText('Tags', { exact: true }).click();
  await expect(panel.locator('.folder-tag .link')).toHaveText(['#todo', '#physics']);
  await panel.getByRole('button', { name: '#todo' }).click();
  await expect(panel.getByLabel('Search the folder')).toHaveValue('#todo');
  await expect(panel.locator('.folder-results .folder-file')).toHaveText(['a.md', 'b.md']);
  // Renaming a tag rewrites every note using it.
  page.once('dialog', (d) => void d.accept('next'));
  await panel.getByRole('button', { name: 'Rename the tag todo' }).click();
  await expect(panel.locator('.folder-tag .link')).toHaveText(['#next', '#physics']);
  const files = () => page.evaluate(() => Object.fromEntries((window as unknown as { __folder: Map<string, string> }).__folder));
  await expect.poll(async () => (await files())['b.md']).toBe('# B\n\nBack to [[a]]. #next\n');
  // The graph of the notes; a click opens one.
  await panel.getByRole('button', { name: 'Graph of the notes' }).click();
  const graph = page.getByRole('dialog', { name: 'Graph of the notes' });
  await expect(graph).toContainText('3 notes, 2 links, 1 notes without links');
  await expect(graph.locator('svg g.node')).toHaveCount(3, { timeout: 30_000 });
  await graph.locator('svg g.node[data-note="b.md"]').click();
  await expect(graph).toBeHidden();
  await expect(page.locator('.doc-page h1')).toHaveText('B');
  // FOLDER-019: beside the open note, the notes sharing its tags or linked with it.
  await expect(panel.locator('.folder-related li')).toHaveText(['a.md#next · linked']);
});

test('offers the templates of the folder and keeps new ones there (FOLDER-020)', async ({ page }) => {
  await fakeFolder(page, { 'Templates/Lab note.md': '# Lab note\n\nDate:\n', 'a.md': '# A\n' });
  await openLocalFolder(page);
  await page.getByRole('button', { name: 'Templates and examples' }).click();
  const gallery = page.getByRole('dialog', { name: 'New from a template' });
  await gallery.getByRole('region', { name: 'Templates of thesis' }).getByRole('button', { name: 'Lab note' }).click();
  const editor = page.getByRole('textbox', { name: 'Document' });
  await expect(editor.locator('h1')).toHaveText('Lab note');
  // Saving as template offers the folder's templates folder.
  await editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' today');
  page.once('dialog', (d) => void d.accept('Daily'));
  await page.getByLabel('Save as format').selectOption({ label: 'Save as template…' });
  const where = page.getByRole('dialog', { name: 'Save as template…' });
  await where.getByLabel('In the folder Templates').check();
  await where.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Templates/Daily.md');
  const files = () => page.evaluate(() => Object.fromEntries((window as unknown as { __folder: Map<string, string> }).__folder));
  await expect.poll(async () => (await files())['Templates/Daily.md']).toContain('Date: today');
});

test('completes links to notes after [[ and tags after # while typing (FOLDER-021)', async ({ page }) => {
  await fakeFolder(page, {
    'index.md': '# Index\n\nStart.\n',
    'notes/Project plan.md': '# Plan\n\n#physics\n',
    'notes/Meeting.md': '# Meeting\n',
  });
  await openLocalFolder(page);
  const panel = page.getByRole('complementary', { name: 'Folder' });
  await panel.getByRole('button', { name: 'index.md' }).click();
  const editor = page.getByRole('textbox', { name: 'Document' });
  await editor.getByText('Start.').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' See [[pro');
  const list = page.getByRole('listbox', { name: 'Notes to link to' });
  await expect(list.getByRole('option')).toHaveText(['Project plan']);
  await page.keyboard.press('Enter');
  await expect(editor.getByRole('link', { name: 'Project plan' })).toBeVisible();
  await page.keyboard.type('about #ph');
  await expect(page.getByRole('listbox', { name: 'Tags' }).getByRole('option')).toHaveText(['#physics']);
  await page.keyboard.press('Tab');
  // Escape closes the list; typing goes on as usual.
  await page.keyboard.type('and [[');
  await expect(list.getByRole('option')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(list).toBeHidden();
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Control+s');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __folder: Map<string, string> }).__folder.get('index.md'))).toContain('Start. See [[Project plan]] about #physics and');
});

test('shows the #tags of a note as tags, in the colours given to them (FOLDER-023)', async ({ page }) => {
  await fakeFolder(page, { 'a.md': '# A\n\nTo do: #todo and `#code`, see #physics.\n', 'b.md': '# B #todo\n' });
  await openLocalFolder(page);
  const panel = page.getByRole('complementary', { name: 'Folder' });
  await panel.getByRole('button', { name: 'a.md' }).click();
  const editor = page.getByRole('textbox', { name: 'Document' });
  await expect(editor.locator('.note-tag')).toHaveText(['#todo', '#physics']);
  await panel.getByText('Tags', { exact: true }).click();
  await panel.getByLabel('Colour of the tag todo').selectOption('red');
  await expect(editor.locator('.note-tag').first()).toHaveAttribute('style', /--tag-colour: #d1453b/);
  await expect(editor.locator('.note-tag').nth(1)).not.toHaveAttribute('style', /.+/);
  if (process.env.SCREENSHOTS) await page.screenshot({ path: 'test-results/tags.png' });
  // Kept for the folder: reopening the page shows it again.
  await page.reload();
  await openLocalFolder(page);
  await panel.getByText('Tags', { exact: true }).click();
  await expect(panel.getByLabel('Colour of the tag todo')).toHaveValue('red');
});
