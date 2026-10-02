import { expect, test } from '@playwright/test';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { openApp, openFile } from './helpers';

// A 1×1 transparent PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

test('opens a ZIP archive as a folder, shows source files and pictures, downloads the changes (FILE-021..FILE-023)', async ({ page }) => {
  const errors = await openApp(page);
  const zip = zipSync({
    'Group A/Alice/main.c': strToU8('#include <stdio.h>\n/* entry */\nint main(void) {\n  printf("hi\\n");\n  return 0;\n}\n'),
    'Group A/Bob/solution.py': strToU8('def f(x):\n    return x * 2  # double\n'),
    'Group A/Bob/plot.png': new Uint8Array(PNG),
    'Group A/Bob/data.bin': new Uint8Array([0, 1, 2, 3]),
    'readme.txt': strToU8('Submissions'),
    'Group B/Carol.zip': zipSync({ 'carol/answer.java': strToU8('class A {}\n') }),
  });
  await openFile(page, 'submissions.zip', Buffer.from(zip), 'application/zip');
  const panel = page.getByRole('complementary', { name: 'Folder' });
  await expect(panel.getByRole('heading', { name: '📁 submissions.zip' })).toBeVisible();
  await expect(page.getByRole('status').or(page.getByRole('alert')).filter({ hasText: 'is open as a folder' })).toBeVisible();

  await panel.getByRole('button', { name: 'Group A' }).click();
  await panel.getByRole('button', { name: 'Alice' }).click();
  await panel.getByRole('button', { name: 'main.c' }).click();
  const code = page.getByRole('textbox', { name: 'Content of main.c' });
  await expect(code).toContainText('printf("hi\\n");');
  await expect(page.locator('.code-info')).toHaveText('C · UTF-8 · LF');
  await expect(code.locator('.tok-keyword')).toHaveText(['return']);
  await expect(code.locator('.tok-string').first()).toHaveText('<stdio.h>');
  await expect(code.locator('.tok-comment')).toHaveText('/* entry */');
  await expect(page.locator('.cm-gutter.cm-lineNumbers .cm-gutterElement').filter({ hasText: /^7$/ })).toBeVisible();

  // An archive inside the archive is a folder.
  await panel.getByRole('button', { name: 'Group B' }).click();
  await panel.getByRole('button', { name: 'Carol.zip' }).click();
  await panel.getByRole('button', { name: 'carol', exact: true }).click();
  await panel.getByRole('button', { name: 'answer.java' }).click();
  await expect(page.getByRole('textbox', { name: 'Content of answer.java' })).toHaveText('class A {}');
  await expect(page.locator('.code-info')).toHaveText('Java · UTF-8 · LF');

  // Edit a Python file and save it into the archive.
  await panel.getByRole('button', { name: 'Bob' }).click();
  await panel.getByRole('button', { name: 'solution.py' }).click();
  const py = page.getByRole('textbox', { name: 'Content of solution.py' });
  await expect(py.locator('.tok-comment')).toHaveText('# double');
  await py.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('print(f(21))\n');
  await page.locator('.header-actions').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved in the archive.')).toBeVisible();

  // A picture is shown; a file the app cannot show is offered for download.
  await panel.getByRole('button', { name: 'plot.png' }).click();
  await expect(page.getByRole('img', { name: 'plot.png' })).toBeVisible();
  page.once('dialog', (d) => void d.dismiss());
  await panel.getByRole('button', { name: 'data.bin' }).click();

  // The archive is downloaded with the change.
  const download = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'Download the archive with its changes' }).click();
  const d = await download;
  expect(d.suggestedFilename()).toBe('submissions.zip');
  const chunks: Buffer[] = [];
  for await (const c of await d.createReadStream()) chunks.push(c as Buffer);
  const back = unzipSync(new Uint8Array(Buffer.concat(chunks)));
  expect(Object.keys(back).sort()).toEqual(['Group A/Alice/main.c', 'Group A/Bob/data.bin', 'Group A/Bob/plot.png', 'Group A/Bob/solution.py', 'Group B/Carol.zip', 'readme.txt']);
  expect(new TextDecoder().decode(back['Group A/Bob/solution.py'])).toBe('def f(x):\n    return x * 2  # double\nprint(f(21))\n');
  expect(errors).toEqual([]);
});

test('opens a source file on its own and saves it under its name (FILE-022)', async ({ page }) => {
  await openApp(page);
  await openFile(page, 'hello.py', 'print("hello")\n', 'text/x-python');
  const code = page.getByRole('textbox', { name: 'Content of hello.py' });
  await expect(code).toHaveText('print("hello")');
  await code.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('x = 1\n');
  const download = page.waitForEvent('download');
  await page.locator('.header-actions').getByRole('button', { name: 'Save', exact: true }).click();
  const d = await download;
  expect(d.suggestedFilename()).toBe('hello.py');
});
