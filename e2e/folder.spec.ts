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
        const parts: Uint8Array[] = [];
        return {
          write: async (d: Uint8Array) => void parts.push(d),
          close: async () => void store.set(path, new TextDecoder().decode(parts[0] ?? new Uint8Array())),
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
      getDirectoryHandle: async (n: string) => dirHandle(`${prefix}${n}/`, n),
      getFileHandle: async (n: string) => fileHandle(`${prefix}${n}`),
      queryPermission: async () => 'granted',
    });
    (window as unknown as { showDirectoryPicker: () => Promise<unknown> }).showDirectoryPicker = async () => dirHandle('', 'thesis');
  }, files);
  await page.goto('./');
}

test('works on a folder: tree, search, links, saving in place and master documents (FOLDER-001..003, DOC-028)', async ({ page }) => {
  await fakeFolder(page, {
    'main.md': '# Thesis\n\nSee [the first chapter](chapters/one.md).\n\n{{#include chapters/one.md}}\n\n{{#include chapters/two.md}}\n',
    'chapters/one.md': '# Control\n\nA PID regulator.\n',
    'chapters/two.md': '# Results\n\nThe regulator is stable.\n',
    'notes.txt': 'not shown in the tree',
  });
  await page.getByRole('button', { name: 'Open a folder' }).click();
  const panel = page.getByRole('complementary', { name: 'Folder' });
  await expect(panel.getByRole('heading', { name: '📁 thesis' })).toBeVisible();
  await expect(panel.getByRole('button', { name: /\.md$/ })).toHaveText(['one.md', 'two.md', 'main.md']);

  // Search across the folder, then open a result at its match.
  await panel.getByLabel('Search the folder').fill('régulator');
  await expect(panel.getByText('2 matches in 2 documents')).toBeVisible();
  await panel.getByRole('button', { name: 'chapters/two.md' }).click();
  await expect(page.locator('.doc-page h1')).toHaveText('Results');
  await expect(page.getByLabel('Find', { exact: true })).toHaveValue('régulator');
  await panel.getByLabel('Search the folder').fill('');

  // The master document: sub-documents, and Ctrl+click on a relative link.
  await panel.getByRole('button', { name: 'main.md' }).click();
  const editor = page.getByRole('textbox', { name: 'Document' });
  await expect(editor.locator('div.include')).toHaveCount(2);
  await editor.getByRole('link', { name: 'the first chapter' }).click({ modifiers: ['Control'] });
  await expect(page.locator('.doc-page h1')).toHaveText('Control');
  await expect(panel.getByRole('button', { name: 'one.md' })).toHaveAttribute('aria-current', 'page');

  // Saving writes the file back into the folder.
  await editor.locator('p').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Tuned.');
  await page.locator('.header-actions').getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __folder: Map<string, string> }).__folder.get('chapters/one.md'))).toContain('A PID regulator. Tuned.');

  // Assembling the master document gives one file with its chapters.
  await panel.getByRole('button', { name: 'main.md' }).click();
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
