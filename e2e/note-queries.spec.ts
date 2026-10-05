import { expect, test, type Page } from '@playwright/test';
import { answerCodeQuestions, fakeFolder, openLocalFolder, useRuntimePackages } from './helpers';

// NOTE-002: the notes of the open folder queried in SQL, from a cell of a note or a .sql file.

async function openInFolder(page: Page, path: string): Promise<void> {
  const panel = page.getByRole('complementary', { name: 'Folder' });
  const parts = path.split('/');
  for (const dir of parts.slice(0, -1)) {
    const button = panel.getByRole('button', { name: dir, exact: true });
    if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
  }
  await panel.getByRole('button', { name: parts[parts.length - 1], exact: true }).click();
}

test('queries the notes of the folder in SQL: properties, tasks, links (NOTE-002)', async ({ page }) => {
  test.setTimeout(120_000);
  test.skip(!(await useRuntimePackages(page)), 'needs RUNTIME_PACKAGES or network access to the npm CDN');
  await fakeFolder(page, {
    'People/Ada Lovelace.md': '---\ntype: "[[Person]]"\norganization: Analytical Engines\n---\n# Ada\n',
    'People/Grace Hopper.md': '---\ntype: "[[Person]]"\norganization: Navy\n---\n# Grace\n',
    'Projects/Engine.md': '---\ntype: "[[Project]]"\nstatus: active\n---\n# Engine\n\n- [ ] Draw the mill\n- [x] Order the gears\n\nWith [[Ada Lovelace]].\n',
    'Dashboard.md': "# Dashboard\n\n```sql {run}\nSELECT name, prop(path, 'organization') AS organization FROM notes WHERE prop(path, 'type') = '[[Person]]' ORDER BY name;\n```\n",
    'queries/open tasks.sql': "SELECT n.name, k.text FROM tasks k JOIN notes n USING (path) WHERE NOT k.done;\nSELECT source FROM links WHERE target = 'People/Ada Lovelace.md';\n",
  });
  await openLocalFolder(page);
  const download = page.getByRole('dialog').filter({ hasText: 'cdn.jsdelivr.net' });
  await page.addLocatorHandler(download, async (d) => d.getByRole('button', { name: 'Allow' }).click());

  // A saved query: a .sql file of the folder.
  await openInFolder(page, 'queries/open tasks.sql');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  const output = page.getByRole('region', { name: 'Output' });
  await expect(output).toContainText('Engine | Draw the mill', { timeout: 60_000 });
  await expect(output).not.toContainText('Order the gears');
  await expect(output).toContainText('Projects/Engine.md');

  // A cell of a note: the table of the people, as the notes say.
  await page.removeLocatorHandler(download);
  const stop = answerCodeQuestions(page);
  await openInFolder(page, 'Dashboard.md');
  const cell = page.locator('.code-cell').first();
  await cell.getByRole('button', { name: 'Run cell' }).click();
  await expect(cell.locator('.code-cell-output')).toContainText('Ada Lovelace | Analytical Engines', { timeout: 60_000 });
  await expect(cell.locator('.code-cell-output')).toContainText('Grace Hopper | Navy');
  stop();
  await page.screenshot({ path: 'test-results/note-queries.png' });
});
