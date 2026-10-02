import { expect, test } from '@playwright/test';
import { openApp, openFile, saveAs } from './helpers';

/**
 * The anywidget instruments (anywidget-instruments-industrial) as a host
 * without Python would use them: the built front end (`static/index.js` and
 * `index.css`, folder given by AWI_STATIC) driven by traits from a JavaScript
 * cell (CODE-016).
 */
test('runs the industrial instruments from a JavaScript cell and keeps their picture (CODE-016)', async ({ page }) => {
  const dir = process.env.AWI_STATIC;
  test.skip(!dir, 'needs AWI_STATIC: the static folder of a build of anywidget-instruments-industrial');
  test.setTimeout(120_000);
  const { readFileSync } = await import('node:fs');
  await page.route('https://instruments.example.org/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop()!;
    return route.fulfill({ body: readFileSync(`${dir}/${name}`), headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  const errors = await openApp(page);
  await openFile(
    page,
    'station.md',
    [
      '```javascript {run}',
      'const esm = await importWidget("https://instruments.example.org/index.js");',
      'const css = await importWidget("https://instruments.example.org/index.css");',
      'const tank = widget(esm, { _kind: "tank", value: 3.2, min: 0, max: 5, unit: "m", label: "Level", lo: 0.5, hi: 4.5, show_limits: true }, { css, name: "Tank" });',
      'const gain = ui(widget(esm, { _kind: "knob", mode: "control", step: 0.5, value: 2.5, min: 0, max: 10, unit: "dB", label: "Gain" }, { css, name: "Knob" }));',
      'display(tank, gain);',
      '```',
      '',
      '```javascript {run}',
      'console.log("gain", gain.get("value"));',
      '```',
    ].join('\n'),
  );
  const cells = page.locator('.doc-page .code-cell');
  await cells.first().getByRole('button', { name: 'Run all cells' }).click();
  await page.getByRole('dialog', { name: 'Run the code of this document?' }).getByRole('button', { name: 'Run' }).click();
  await page.getByRole('dialog', { name: 'Download code for this document?' }).getByRole('button', { name: 'Allow' }).click();
  await expect(page.frameLocator('.code-widget-frame').first().getByText('3.2 m')).toBeVisible({ timeout: 60_000 });
  await expect(cells.nth(1).locator('.code-cell-output')).toHaveText('gain 2.5\n');
  // Turning the knob runs the cell using it again.
  const field = page.frameLocator('.code-widget-frame').nth(1).getByRole('textbox').first();
  await field.fill('7');
  await field.press('Enter');
  await expect(cells.nth(1).locator('.code-cell-output')).toHaveText('gain 7\n', { timeout: 30_000 });
  const md = (await saveAs(page, 'Markdown (.md)')).data.toString('utf8');
  expect([...md.matchAll(/!\[Widget\]\(data:image\/png;base64,[^)\s]+ "widget"\)/g)]).toHaveLength(2);
  expect(errors.filter((e) => !e.startsWith('Failed to load resource'))).toEqual([]);
});
