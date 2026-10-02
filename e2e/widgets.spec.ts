import { expect, test } from '@playwright/test';
import { openApp, openFile, saveAs, usePyodidePackages } from './helpers';

const COUNTER = [
  '# Widgets',
  '',
  '```python {run}',
  'import anywidget, traitlets',
  'import pwo',
  '',
  'class Counter(anywidget.AnyWidget):',
  '    _esm = """',
  'export default {',
  '  render({ model, el }) {',
  '    const b = document.createElement("button");',
  '    const show = () => { b.textContent = `count is ${model.get("count")}`; };',
  '    b.addEventListener("click", () => { model.set("count", model.get("count") + 1); model.save_changes(); });',
  '    model.on("change:count", show);',
  '    show();',
  '    el.append(b);',
  '  }',
  '};',
  '"""',
  '    count = traitlets.Int(1).tag(sync=True)',
  '',
  'counter = pwo.ui(Counter())',
  'counter',
  '```',
  '',
  '```python {run}',
  'print("twice", counter.count * 2)',
  '```',
  '',
].join('\n');

test('shows an anywidget from Python, syncs both ways and re-runs the cells using it (CODE-016)', async ({ page }) => {
  test.setTimeout(180_000);
  test.skip(!(await usePyodidePackages(page)), 'needs PYODIDE_PACKAGES or network access to the Pyodide CDN');
  const errors = await openApp(page);
  await openFile(page, 'widgets.md', COUNTER);
  const cells = page.locator('.doc-page .code-cell');
  await cells.first().getByRole('button', { name: 'Run all cells' }).click();
  await page.getByRole('dialog', { name: 'Run the code of this document?' }).getByRole('button', { name: 'Run' }).click();
  const frame = page.frameLocator('.code-widget-frame').first();
  await expect(frame.getByRole('button')).toHaveText('count is 1', { timeout: 120_000 });
  await expect(cells.nth(1).locator('.code-cell-output')).toHaveText('twice 2\n');
  // The view changes the model: Python follows, and the cell using it runs again.
  await frame.getByRole('button').click();
  await expect(frame.getByRole('button')).toHaveText('count is 2');
  await expect(cells.nth(1).locator('.code-cell-output')).toHaveText('twice 4\n', { timeout: 30_000 });
  // Saved, the widget is kept as its picture (for print, export and reopening).
  const md = (await saveAs(page, 'Markdown (.md)')).data.toString('utf8');
  const picture = /!\[Widget\]\(data:image\/png;base64,([^)\s]+) "widget"\)/.exec(md);
  expect(picture).not.toBeNull();
  expect(Buffer.from(picture![1]!, 'base64').length).toBeGreaterThan(500);
  // The widget stays live after saving.
  await expect(page.frameLocator('.code-widget-frame').first().getByRole('button')).toHaveText('count is 2');
  expect(errors.filter((e) => !e.startsWith('Failed to load resource'))).toEqual([]);
});

test('installs a widget package from a list of wheels after asking, and lays widgets out in a grid (CODE-016)', async ({ page }) => {
  test.setTimeout(180_000);
  test.skip(!(await usePyodidePackages(page)), 'needs PYODIDE_PACKAGES or network access to the Pyodide CDN');
  const { readFileSync } = await import('node:fs');
  await page.route('https://widgets.example.org/demo/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop()!;
    return route.fulfill({ body: readFileSync(`e2e/fixtures/${name}`), headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  const errors = await openApp(page);
  const md = [
    '```python {run}',
    'import pwo',
    'await pwo.install("https://widgets.example.org/demo/wheel.txt")',
    '```',
    '',
    '```python {run}',
    'import ipywidgets',
    'from pwo_gauge_demo import Gauge',
    'level = Gauge(value=1.5, label="Level")',
    'flow = Gauge(value=3, label="Flow")',
    'ipywidgets.GridBox([level, flow, ipywidgets.HTML("<b>bold</b>")], layout=ipywidgets.Layout(grid_template_columns="repeat(3, 1fr)"))',
    '```',
    '',
    '```python {run}',
    '_ = setattr(flow, "value", 4.5)',
    '```',
    '',
  ].join('\n');
  await openFile(page, 'install.md', md);
  const cells = page.locator('.doc-page .code-cell');
  await cells.first().getByRole('button', { name: 'Run cell' }).click();
  await page.getByRole('dialog', { name: 'Run the code of this document?' }).getByRole('button', { name: 'Run' }).click();
  const ask = page.getByRole('dialog', { name: 'Download code for this document?' });
  await expect(ask).toContainText('https://widgets.example.org', { timeout: 120_000 });
  await ask.getByRole('button', { name: 'Allow' }).click();
  await expect(cells.nth(0).locator('.code-cell-output')).toHaveCount(1, { timeout: 60_000 });
  await expect(cells.nth(0).locator('.code-cell-output')).not.toHaveClass(/pending|error/, { timeout: 60_000 });

  await cells.nth(1).getByRole('button', { name: 'Run cell' }).click();
  const frame = page.frameLocator('.code-widget-frame').first();
  await expect(frame.locator('.gauge')).toHaveText(['Level: 1.5', 'Flow: 3'], { timeout: 60_000 });
  await expect(frame.locator('b')).toHaveText('bold');
  expect(await frame.locator('.pwo-box').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(3);
  await expect(frame.locator('.gauge').first()).toHaveCSS('color', 'rgb(0, 102, 51)');

  // Python changes a model: the view follows.
  await cells.nth(2).getByRole('button', { name: 'Run cell' }).click();
  await expect(frame.locator('.gauge').nth(1)).toHaveText('Flow: 4.5', { timeout: 30_000 });
  expect(errors.filter((e) => !e.startsWith('Failed to load resource'))).toEqual([]);
});

test('shows a widget from a JavaScript cell and re-runs the cells using it (CODE-016)', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await openApp(page);
  const md = [
    '```javascript {run}',
    'const knob = ui(widget(`export default { render({ model, el }) {',
    '  const input = document.createElement("input");',
    '  input.type = "number"; input.value = model.get("value");',
    '  input.addEventListener("change", () => { model.set("value", Number(input.value)); model.save_changes(); });',
    '  model.on("change:value", () => { input.value = model.get("value"); });',
    '  el.append(input);',
    '} }`, { value: 3 }));',
    'display(knob);',
    '```',
    '',
    '```javascript {run}',
    'console.log("square", knob.get("value") ** 2);',
    '```',
    '',
  ].join('\n');
  await openFile(page, 'knob.md', md);
  const cells = page.locator('.doc-page .code-cell');
  await cells.first().getByRole('button', { name: 'Run all cells' }).click();
  await page.getByRole('dialog', { name: 'Run the code of this document?' }).getByRole('button', { name: 'Run' }).click();
  const frame = page.frameLocator('.code-widget-frame').first();
  await expect(frame.locator('input')).toHaveValue('3', { timeout: 60_000 });
  await expect(cells.nth(1).locator('.code-cell-output')).toHaveText('square 9\n');
  await frame.locator('input').fill('5');
  await frame.locator('input').press('Enter');
  await expect(cells.nth(1).locator('.code-cell-output')).toHaveText('square 25\n', { timeout: 30_000 });
  expect(errors.filter((e) => !e.startsWith('Failed to load resource'))).toEqual([]);
});

test('opens the interactive widgets example and brings its widgets to life (CODE-016, FILE-018)', async ({ page }) => {
  test.setTimeout(180_000);
  const python = await usePyodidePackages(page);
  const errors = await openApp(page);
  await page.getByRole('button', { name: 'Templates and examples' }).click();
  await page.getByRole('dialog', { name: 'New from a template' }).getByRole('button', { name: /Interactive widgets/ }).click();
  const cells = page.locator('.doc-page .code-cell');
  await expect(cells).toHaveCount(4);
  // The JavaScript widget needs no download.
  await cells.nth(2).getByRole('button', { name: 'Run cell' }).click();
  await page.getByRole('dialog', { name: 'Run the code of this document?' }).getByRole('button', { name: 'Run' }).click();
  const button = page.frameLocator('.code-widget-frame').first().getByRole('button');
  await expect(button).toHaveText('👍 0', { timeout: 60_000 });
  await cells.nth(3).getByRole('button', { name: 'Run cell' }).click();
  await expect(cells.nth(3).locator('.code-cell-output')).toHaveText('clicks so far: 0\n');
  await button.click();
  await expect(cells.nth(3).locator('.code-cell-output')).toHaveText('clicks so far: 1\n', { timeout: 30_000 });
  // The Python slider and its plot, when Python packages can be had (numpy, matplotlib from the CDN).
  if (python) {
    await cells.nth(0).getByRole('button', { name: 'Run cell' }).click();
    const slider = page.frameLocator('.code-widget-frame').first().getByRole('slider');
    await expect(slider).toHaveValue('2', { timeout: 120_000 });
    await expect(page.frameLocator('.code-widget-frame').first().locator('output')).toHaveText(' 2');
  }
  if (python && process.env.CI) {
    await cells.nth(1).getByRole('button', { name: 'Run cell' }).click();
    await expect(cells.nth(1).locator('.code-cell-figures img')).toHaveCount(1, { timeout: 120_000 });
  }
  expect(errors.filter((e) => !e.startsWith('Failed to load resource'))).toEqual([]);
});
