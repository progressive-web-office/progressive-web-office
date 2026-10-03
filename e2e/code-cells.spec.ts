import { expect, test, type Page } from '@playwright/test';
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

const REACTIVE = [
  '# Reactive',
  '',
  '```python {run}',
  'b = a * 10',
  'print("b =", b)',
  '```',
  '',
  '```python {run}',
  'a = 2',
  '```',
  '',
  '```javascript {run}',
  'console.log("twice", k * 2);',
  '```',
  '',
  '```javascript {run}',
  'const k = 5;',
  '```',
  '',
  '```python {run}',
  'a = 1',
  '```',
  '',
].join('\n');

test('runs cells in the order of what they use, marks out-of-date cells and refuses a name defined twice (CODE-014)', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await openApp(page);
  await openFile(page, 'reactive.md', REACTIVE);
  const cells = page.locator('.doc-page .code-cell');
  await expect(cells).toHaveCount(5);
  await cells.first().getByRole('button', { name: 'Run all cells' }).click();
  await page.getByRole('dialog', { name: 'Run the code of this document?' }).getByRole('button', { name: 'Run' }).click();
  // `a` is defined twice: those cells and the one using it do not run.
  await expect(cells.nth(1).locator('.code-cell-output.error')).toContainText('“a” is defined in several cells (2, 5)', { timeout: 60_000 });
  await expect(cells.nth(4).locator('.code-cell-output.error')).toContainText('defined in several cells');
  await expect(page.locator('.code-stale')).toHaveCount(1);
  // JavaScript cells share their names too, in the order of what they use.
  await expect(cells.nth(2).locator('.code-cell-output')).toHaveText('twice 10\n');

  // The second definition becomes local to its cell (`_`): the cell using `a` runs after the one defining it.
  await cells.nth(4).getByRole('button', { name: 'Edit code' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit code cell' });
  await edit.getByLabel('Code').fill('_a = 1');
  await edit.getByRole('button', { name: 'Update' }).click();
  await cells.nth(0).getByRole('button', { name: 'Run all cells' }).click();
  await expect(cells.nth(0).locator('.code-cell-output')).toHaveText('b = 20\n', { timeout: 30_000 });
  await expect(page.locator('.code-stale')).toHaveCount(0);

  // Changing `a` makes the cell using it out of date until it runs again.
  await cells.nth(1).getByRole('button', { name: 'Edit code' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit code cell' });
  await dialog.getByLabel('Code').fill('a = 3');
  await dialog.getByRole('button', { name: 'Update' }).click();
  // The edited cell (its output cleared) and the cell using it.
  await expect(page.locator('.code-stale')).toHaveCount(2);
  await expect(page.locator('.code-stale .code-cell-output')).toHaveText(['b = 20\n']);
  await cells.nth(0).getByRole('button', { name: 'Run cell' }).click();
  await expect(cells.nth(0).locator('.code-cell-output')).toHaveText('b = 30\n', { timeout: 30_000 });
  await expect(page.locator('.code-stale')).toHaveCount(0);
  // Completion in the code editor asks the Pyodide CDN for jedi, out of reach here.
  expect(errors.filter((e) => !e.startsWith('Failed to load resource'))).toEqual([]);
});

test('shows the dependency graph of the cells, and goes to a cell from it (CODE-015)', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await openApp(page);
  await openFile(page, 'graph.md', ['# Graph', '', '```python {run}', 'a = 2', '```', '', '```python {run}', 'b = a * 10', '```', '', '```python {run}', 'print(a + b)', '```', ''].join('\n'));
  const cells = page.locator('.doc-page .code-cell');
  await cells.first().getByRole('button', { name: 'Run all cells' }).click();
  await page.getByRole('dialog', { name: 'Run the code of this document?' }).getByRole('button', { name: 'Run' }).click();
  await expect(cells.nth(2).locator('.code-cell-output')).toHaveText('22\n', { timeout: 60_000 });

  await page.getByRole('combobox', { name: 'View' }).selectOption({ label: 'Dependencies of the cells' });
  const panel = page.getByRole('region', { name: 'Dependencies of the cells' });
  await expect(panel.locator('svg g.node')).toHaveCount(3, { timeout: 30_000 });
  await expect(panel.locator('svg .edgeLabel').filter({ hasText: /^a$/ })).toHaveCount(2);
  await panel.getByText('As a list').click();
  await expect(panel.locator('.dag-item').nth(2)).toContainText('uses 1 · Python (a) ; 2 · Python (b)');

  // Changing the first cell: the others are out of date in the graph.
  await cells.nth(0).getByRole('button', { name: 'Edit code' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit code cell' });
  await dialog.getByLabel('Code').fill('a = 3');
  await dialog.getByRole('button', { name: 'Update' }).click();
  await expect(panel.locator('.dag-item.dag-stale')).toHaveCount(3);

  // From the graph to a cell, and from a cell to the graph.
  await panel.locator('svg g.node[data-cell="2"]').click();
  await expect(page.locator('.dag-highlight')).toHaveCount(1);
  await cells.nth(1).getByRole('button', { name: 'Show this cell in the dependencies' }).click();
  await expect(panel.locator('svg g.node.dag-current')).toHaveAttribute('data-cell', '1');
  expect(errors.filter((e) => !e.startsWith('Failed to load resource'))).toEqual([]);
});

test('opens a KaimonSlate notebook as a document and saves it back unchanged (DOC-038)', async ({ page }) => {
  const nb = '#%% md id=intro\n# Widgets\n\nDrag the **sliders**.\n\n#%% code id=controls collapsed\n@bind n Slider(20:5:200)\n\n#%% md id=more\n* kept as written\n';
  const errors = await openApp(page);
  await openFile(page, 'demo.jl', nb, 'text/plain');
  await expect(page.locator('.doc-page h1')).toHaveText('Widgets');
  const cell = page.locator('.code-cell[data-lang="julia"]');
  await expect(cell.locator('.code-cell-lang')).toHaveText('Julia');
  await expect(cell.locator('.code-cell-header')).toHaveText('#%% code id=controls collapsed');
  await expect(cell.getByRole('button', { name: 'Run cell' })).toHaveCount(0);
  const saved = await saveAs(page, 'KaimonSlate notebook (.jl)');
  expect(saved.name).toBe('demo.jl');
  expect(saved.data.toString()).toBe(nb);
  // Editing a Julia cell keeps its language and its header.
  await cell.getByRole('button', { name: 'Edit code' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit code cell' });
  await expect(dialog.getByLabel('Language')).toHaveValue('julia');
  await dialog.locator('.cm-content').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\n@bind m Slider(1:3)');
  await dialog.getByRole('button', { name: 'Update' }).click();
  const again = await saveAs(page, 'KaimonSlate notebook (.jl)');
  expect(again.data.toString()).toContain('#%% code id=controls collapsed\n@bind n Slider(20:5:200)\n@bind m Slider(1:3)\n');
  expect(errors).toEqual([]);
});

test('opens a marimo notebook as a document, runs its cells and saves it back unchanged (DOC-039)', async ({ page }) => {
  test.setTimeout(120_000);
  const { MARIMO_NB } = await import('../tests/fixtures-marimo');
  const errors = await openApp(page);
  await openFile(page, 'intro.py', MARIMO_NB, 'text/x-python');
  const editor = page.getByRole('textbox', { name: 'Document' });
  await expect(editor).toContainText('marimo knows how your cells are related');
  const cells = editor.locator('.code-cell[data-lang="python"]');
  await expect(cells).toHaveCount(4);
  // import marimo as mo works; the last cell shows x.
  await cells.nth(3).getByRole('button', { name: 'Run all cells' }).click();
  await page.getByRole('dialog', { name: 'Run the code of this document?' }).getByRole('button', { name: 'Run' }).click();
  await expect(cells.nth(3).locator('.code-cell-output')).toHaveText('0\n', { timeout: 90_000 });
  await expect(cells.nth(0).locator('.code-cell-output.error')).toHaveCount(0);
  const saved = await saveAs(page, 'marimo notebook (.py)');
  expect(saved.name).toBe('intro.py');
  // Outputs are not part of a marimo file: it comes back as it was.
  expect(saved.data.toString()).toBe(MARIMO_NB);
  expect(errors.filter((e) => !e.includes('ERR_TUNNEL_CONNECTION_FAILED'))).toEqual([]);
});

test('colours the code of cells, shown and edited, and completes every language (CODE-011, CODE-018)', async ({ page }) => {
  const errors = await openApp(page);
  await page.getByRole('button', { name: 'Templates and examples' }).click();
  await page.getByRole('dialog', { name: 'New from a template' }).getByRole('button', { name: 'Languages' }).click();
  const cells = page.locator('.doc-page .code-cell');
  // Shown in the document: coloured, in every language.
  for (const i of [0, 1, 2, 3, 5, 8]) await expect(cells.nth(i).locator('.code-cell-source [class^="tok-"]').first()).toBeVisible();
  const colour = (l: ReturnType<Page['locator']>) => l.evaluate((el) => getComputedStyle(el).color);
  const text = await colour(page.locator('.doc-page p').first());
  expect(await colour(cells.nth(0).locator('.code-cell-source .tok-keyword').first())).not.toBe(text);
  // Edited: coloured too, with completion of the language's words (Lua here).
  await cells.nth(2).getByRole('button', { name: 'Edit code' }).click();
  const editor = page.locator('dialog[open] .cm-content');
  await expect(editor.locator('.tok-keyword').first()).toBeVisible();
  expect(await colour(editor.locator('.tok-keyword').first())).not.toBe(text);
  await editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\nipa');
  await expect(page.locator('.cm-tooltip-autocomplete')).toContainText('ipairs');
  expect(errors).toEqual([]);
});
