import { expect, test } from '@playwright/test';
import { openApp, usePyodidePackages, pickTemplate } from './helpers';

/**
 * FILE-018, CODE-016: every example with code runs without an error — all
 * their cells, as a reader would run them (the network is needed for the
 * packages: CI).
 */
const EXAMPLES: [name: string, cells: number][] = [
  ['A tour of the word processor', 1],
  ['Lab report with Python plots', 0],
  ['Interactive widgets', 0],
  ['Instrument panel', 3],
];

for (const [name, min] of EXAMPLES) {
  test(`runs every cell of the example “${name}” without an error (FILE-018)`, async ({ page }) => {
    test.setTimeout(600_000);
    test.skip(!(await usePyodidePackages(page)) || !process.env.CI, 'needs the network (CI) for the Python packages');
    const errors = await openApp(page);
    await page.getByRole('button', { name: 'Templates and examples' }).click();
    await pickTemplate(page, name);
    const cells = page.locator('.doc-page .code-cell');
    await expect.poll(() => cells.count()).toBeGreaterThanOrEqual(Math.max(1, min));
    await page.addLocatorHandler(page.getByRole('dialog', { name: 'Run the code of this document?' }), async (d) => d.getByRole('button', { name: 'Run' }).click());
    await page.addLocatorHandler(page.getByRole('dialog', { name: 'Download code for this document?' }), async (d) => d.getByRole('button', { name: 'Allow' }).click());
    await cells.first().getByRole('button', { name: 'Run all cells' }).click();
    // Started, then done: an error, or no cell waiting or running any more.
    const pending = page.locator('.doc-page .code-cell-output.pending');
    await expect(pending.first()).toBeVisible({ timeout: 60_000 });
    const failed = cells.locator('.code-cell-output.error');
    await expect.poll(async () => (await failed.count()) > 0 || (await pending.count()) === 0, { timeout: 540_000, intervals: [2_000] }).toBe(true);
    const problems = await failed.allTextContents();
    // The whole message in the CI log, to fix the example.
    for (const p of problems) console.log(`[${name}] cell error:\n${p}`);
    expect(problems).toEqual([]);
    expect(errors.filter((e) => !e.startsWith('Failed to load resource'))).toEqual([]);
  });
}
