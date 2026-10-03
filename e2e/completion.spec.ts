import { expect, test } from '@playwright/test';
import { openApp, openFile } from './helpers';

const popup = (page: import('@playwright/test').Page) => page.locator('.cm-tooltip-autocomplete');

test('completes Python and JavaScript in source files (CODE-011)', async ({ page }) => {
  const errors = await openApp(page);
  await openFile(page, 'sum.py', 'def total(values):\n    return sum(values)\n', 'text/x-python');
  const code = page.getByRole('textbox', { name: 'Content of sum.py' });
  await expect(code.locator('.tok-keyword').first()).toHaveText('def');
  await code.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\npri');
  await expect(popup(page).getByRole('option', { name: /^print/ })).toBeVisible();
  // CodeMirror ignores Enter for a moment after the list changes (no accidental choice).
  await page.waitForTimeout(150);
  await page.keyboard.press('Enter');
  await page.keyboard.type('(tot');
  await expect(popup(page).getByRole('option', { name: /^total/ })).toBeVisible();
  await page.waitForTimeout(150);
  await page.keyboard.press('Enter');
  // The bracket was closed for us.
  await expect(code.locator('.cm-line').last()).toHaveText('print(total)');

  await page.locator('.header-actions').getByRole('button', { name: 'Close' }).click();
  page.once('dialog', (d) => void d.accept());
  await openFile(page, 'calc.js', 'const r = 2;\n', 'text/javascript');
  const js = page.getByRole('textbox', { name: 'Content of calc.js' });
  await expect(js.locator('.tok-keyword').first()).toHaveText('const');
  await js.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('Math.fl');
  await expect(popup(page).getByRole('option', { name: /^floor/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('completes the code of a cell (CODE-011)', async ({ page }) => {
  const errors = await openApp(page);
  await page.getByRole('button', { name: 'New document' }).click();
  await page.getByRole('textbox', { name: 'Document' }).click();
  await page.getByRole('button', { name: 'Insert code cell' }).click();
  const dialog = page.getByRole('dialog', { name: 'Insert code cell' });
  const code = dialog.getByLabel('Code');
  await code.click();
  await page.keyboard.type('imp');
  await expect(popup(page).getByRole('option', { name: /^import/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await dialog.getByLabel('Language').selectOption('javascript');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('JSON.str');
  await expect(popup(page).getByRole('option', { name: /^stringify/ })).toBeVisible();
  expect(errors).toEqual([]);
});

/** jedi comes from the Pyodide CDN (see code-cells.spec.ts for PYODIDE_PACKAGES). */
test('completes with the names known by the running interpreter (CODE-011)', async ({ page }) => {
  const local = process.env.PYODIDE_PACKAGES;
  test.skip(!local && !process.env.CI, 'needs PYODIDE_PACKAGES or network access to the Pyodide CDN');
  test.setTimeout(180_000);
  if (local) {
    const { readFileSync } = await import('node:fs');
    await page.route('https://cdn.jsdelivr.net/pyodide/**', async (route) => {
      const name = new URL(route.request().url()).pathname.split('/').pop()!;
      // As on a slow network: jedi arrives after the first completion requests gave up.
      if (/^jedi-/.test(name)) await new Promise((r) => setTimeout(r, 6000));
      await route.fulfill({ body: readFileSync(`${local}/${name}`), headers: { 'Access-Control-Allow-Origin': '*' } });
    });
  }
  await openApp(page);
  await openFile(page, 'nb.md', '```python {run}\nvoltage_drop = 3.2\nimport statistics\nprint("ready")\n```\n\nNext.\n');
  const cell = page.locator('.doc-page .code-cell');
  await cell.getByRole('button', { name: 'Run cell' }).click();
  await page.getByRole('dialog', { name: 'Run the code of this document?' }).getByRole('button', { name: 'Run' }).click();
  // The interpreter is running once the cell has printed (loading Python takes a while on a busy machine).
  await expect(cell.locator('.code-cell-output')).toHaveText('ready\n', { timeout: 150_000 });
  await page.getByText('Next.').click();
  await page.getByRole('button', { name: 'Insert code cell' }).click();
  const code = page.getByRole('dialog', { name: 'Insert code cell' }).getByLabel('Code');
  await code.click();
  await page.keyboard.type('statistics.me');
  await expect(popup(page).getByRole('option', { name: /^mean/ })).toBeVisible({ timeout: 60_000 });
  await page.keyboard.press('Control+a');
  await page.keyboard.type('voltage_');
  await expect(popup(page).getByRole('option', { name: /^voltage_drop/ })).toBeVisible({ timeout: 30_000 });
});

test('knows the types of TypeScript and JavaScript: completions, errors, types under the pointer (CODE-012)', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = await openApp(page);
  await openFile(page, 'shapes.ts', 'interface Circle {\n  radius: number;\n  /** The colour, as a CSS name. */\n  colour: string;\n}\nconst c: Circle = { radius: 2, colour: "red" };\nconst n: number = "three";\n', 'text/plain');
  const code = page.getByRole('textbox', { name: 'Content of shapes.ts' });
  await expect(code.locator('.tok-keyword').first()).toHaveText('interface');
  // A type error is underlined.
  await expect(code.locator('.cm-lintRange-error')).toHaveCount(1, { timeout: 60_000 });
  // The members of a typed value, with their documentation.
  await code.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('c.');
  const list = popup(page);
  await expect(list.getByRole('option', { name: /^colour/ })).toBeVisible({ timeout: 30_000 });
  await expect(list.getByRole('option', { name: /^radius/ })).toBeVisible();
  await expect(list.getByRole('option')).toHaveCount(2);
  await page.keyboard.press('Escape');
  // The type of what is under the pointer.
  await code.getByText('Circle', { exact: true }).last().hover();
  await expect(page.locator('.cm-tooltip-hover .cm-ts-info')).toContainText('interface Circle');

  // A JavaScript cell is completed by the same service.
  page.once('dialog', (d) => void d.accept());
  await page.locator('.header-actions').getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'New document' }).click();
  await page.getByRole('textbox', { name: 'Document' }).click();
  await page.getByRole('button', { name: 'Insert code cell' }).click();
  const dialog = page.getByRole('dialog', { name: 'Insert code cell' });
  await dialog.getByLabel('Language').selectOption('javascript');
  await dialog.getByLabel('Code').click();
  await page.keyboard.type('const words = ["a", "b"];\nwords.fla');
  await expect(list.getByRole('option', { name: /^flatMap/ })).toBeVisible({ timeout: 30_000 });
  expect(errors).toEqual([]);
});
