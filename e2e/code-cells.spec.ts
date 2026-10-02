import { expect, test } from '@playwright/test';
import { openApp, openFile, saveAs } from './helpers';

const NOTEBOOK = [
  '# Notebook',
  '',
  '```python {run}',
  'x = 6 * 7',
  'print("x =", x)',
  '```',
  '',
  '```python {run}',
  'import statistics',
  'statistics.mean([x, 0])',
  '```',
  '',
  '```javascript {run}',
  'console.log("js", [1, 2].map((n) => n * 2));',
  'let leaked = "no";',
  'try { await fetch("https://example.com"); leaked = "network"; } catch {}',
  'try { localStorage.getItem("x"); leaked = "storage"; } catch {}',
  'console.log("leak:", leaked);',
  '```',
  '',
].join('\n');

test('runs Python and JavaScript cells in a sandbox and keeps their output (CODE-001..CODE-006)', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await openApp(page);
  await openFile(page, 'notebook.md', NOTEBOOK);
  const cells = page.locator('.doc-page .code-cell');
  await expect(cells).toHaveCount(3);
  await expect(cells.first().locator('.code-cell-lang')).toHaveText('Python');

  // CODE-004: the first run asks for confirmation.
  await cells.first().getByRole('button', { name: 'Run all cells' }).click();
  const trust = page.getByRole('dialog', { name: 'Run the code of this document?' });
  await expect(trust).toContainText('isolated sandbox');
  await trust.getByRole('button', { name: 'Run' }).click();

  await expect(cells.nth(0).locator('.code-cell-output')).toHaveText('x = 42\n', { timeout: 60_000 });
  await expect(cells.nth(1).locator('.code-cell-output')).toHaveText('21\n');
  // CODE-003: no network, no storage.
  await expect(cells.nth(2).locator('.code-cell-output')).toHaveText('js [2,4]\nleak: no\n');
  await expect(page.locator('.modified')).toBeVisible();

  // CODE-006: outputs are saved with the document.
  const md = (await saveAs(page, 'Markdown (.md)')).data.toString('utf8');
  expect(md).toContain('```python {run}\nx = 6 * 7\nprint("x =", x)\n```\n\n```text {output}\nx = 42\n```');

  // Errors are shown and kept; editing the code clears the stale output.
  await cells.nth(1).getByRole('button', { name: 'Edit code' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit code cell' });
  await dialog.getByLabel('Code').fill('1 / 0');
  await dialog.getByRole('button', { name: 'Update' }).click();
  await expect(cells.nth(1).locator('.code-cell-output')).toHaveCount(0);
  await cells.nth(1).getByRole('button', { name: 'Run cell' }).click();
  await expect(cells.nth(1).locator('.code-cell-output.error')).toContainText('ZeroDivisionError: division by zero');
  expect(errors).toEqual([]);
});

test('inserts a cell and stops an endless loop (CODE-001, CODE-003)', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await openApp(page);
  await openFile(page, 'loop.md', 'Intro\n');
  await page.locator('.doc-page p').first().click();
  await page.getByRole('button', { name: 'Insert code cell' }).click();
  const dialog = page.getByRole('dialog', { name: 'Insert code cell' });
  await dialog.getByLabel('Language').selectOption('javascript');
  await dialog.getByLabel('Code').fill('while (true) {}');
  await dialog.getByRole('button', { name: 'Insert' }).click();
  const cell = page.locator('.doc-page .code-cell');
  await expect(cell.locator('.code-cell-lang')).toHaveText('JavaScript');
  await cell.getByRole('button', { name: 'Run cell' }).click();
  await page.getByRole('dialog', { name: 'Run the code of this document?' }).getByRole('button', { name: 'Run' }).click();
  await expect(cell.locator('.code-cell-output.pending')).toHaveText('Running…');
  // The page stays responsive while the loop runs.
  await cell.getByRole('button', { name: 'Stop' }).click();
  await expect(cell.locator('.code-cell-output.error')).toHaveText('Stopped.\n');
  // A new run starts a fresh sandbox.
  await cell.getByRole('button', { name: 'Edit code' }).click();
  await page.getByRole('dialog', { name: 'Edit code cell' }).getByLabel('Code').fill('console.log("again")');
  await page.getByRole('dialog', { name: 'Edit code cell' }).getByRole('button', { name: 'Update' }).click();
  await cell.getByRole('button', { name: 'Run cell' }).click();
  await expect(cell.locator('.code-cell-output')).toHaveText('again\n');
  const md = (await saveAs(page, 'Markdown (.md)')).data.toString('utf8');
  expect(md).toMatch(/^Intro\n\n```javascript \{run\}\nconsole\.log\("again"\)\n```\n\n```text \{output\}\nagain\n```\n/);
  expect(errors).toEqual([]);
});

/**
 * numpy + matplotlib come from the Pyodide CDN. Locally, set PYODIDE_PACKAGES
 * to a folder holding the wheels (from the Pyodide release archive) to serve
 * them instead; in CI the real CDN is used.
 */
test('plots a matplotlib figure and stores it with the document (CODE-005)', async ({ page }) => {
  const local = process.env.PYODIDE_PACKAGES;
  test.skip(!local && !process.env.CI, 'needs PYODIDE_PACKAGES or network access to the Pyodide CDN');
  test.setTimeout(180_000);
  if (local) {
    const { readFileSync } = await import('node:fs');
    await page.route('https://cdn.jsdelivr.net/pyodide/**', (route) => {
      const name = new URL(route.request().url()).pathname.split('/').pop()!;
      route.fulfill({ body: readFileSync(`${local}/${name}`), headers: { 'Access-Control-Allow-Origin': '*' } });
    });
  }
  const errors = await openApp(page);
  await openFile(page, 'plot.md', '```python {run}\nimport numpy as np\nimport matplotlib.pyplot as plt\nx = np.linspace(0, np.pi, 51)\nplt.plot(x, np.sin(x))\nprint(round(float(np.sin(x).max()), 3))\n```\n');
  const cell = page.locator('.doc-page .code-cell');
  await cell.getByRole('button', { name: 'Run cell' }).click();
  await page.getByRole('dialog', { name: 'Run the code of this document?' }).getByRole('button', { name: 'Run' }).click();
  await expect(cell.locator('.code-cell-output')).toHaveText('1.0\n', { timeout: 150_000 });
  const figure = cell.locator('.code-cell-figures img');
  await expect(figure).toHaveCount(1);
  expect(await figure.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(200);
  const md = (await saveAs(page, 'Markdown (.md)')).data.toString('utf8');
  expect(md).toMatch(/```text \{output\}\n1\.0\n```\n\n!\[Output\]\(data:image\/png;base64,[^)]+ "output"\)/);
  expect(errors).toEqual([]);
});

test('hides the code of a cell, its output staying, and keeps it hidden in the file (CODE-013)', async ({ page }) => {
  const errors = await openApp(page);
  await openFile(page, 'nb.md', '# Notes\n\n```python {run}\nprint(6 * 7)\n```\n\n```text {output}\n42\n```\n');
  const cell = page.locator('.doc-page .code-cell');
  await expect(cell.locator('.code-cell-source')).toBeVisible();
  await cell.getByRole('button', { name: 'Hide the code (keep the output)' }).click();
  await expect(cell.locator('.code-cell-source')).toBeHidden();
  await expect(cell.locator('.code-cell-output')).toHaveText('42\n');
  await expect(cell.locator('.code-cell-bar')).toContainText('code hidden');
  const md = (await saveAs(page, 'Markdown (.md)')).data.toString('utf8');
  expect(md).toContain('```python {run hide}\nprint(6 * 7)\n```');
  // Every cell at once, from the View menu.
  await page.getByRole('combobox', { name: 'View' }).selectOption({ label: 'Show the code of every cell' });
  await expect(cell.locator('.code-cell-source')).toBeVisible();
  await page.getByRole('combobox', { name: 'View' }).selectOption({ label: 'Hide the code of every cell' });
  await expect(cell.locator('.code-cell-source')).toBeHidden();
  expect(errors).toEqual([]);
});
