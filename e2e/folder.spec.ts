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
  await panel.getByRole('button', { name: 'notes' }).click();
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
