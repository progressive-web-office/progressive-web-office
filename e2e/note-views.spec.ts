import { expect, test, type Page } from '@playwright/test';
import { fakeFolder, openLocalFolder } from './helpers';

// NOTE-003: a view of the notes — table, cards, board — whose changes go into the notes.

test.use({ viewport: { width: 1280, height: 900 } });

const stored = (page: Page, path: string) => page.evaluate((p) => (window as unknown as { __folder: Map<string, string> }).__folder.get(p), path);

test('shows the notes as a table, cards and a board, and changes them in place (NOTE-003)', async ({ page }) => {
  await fakeFolder(page, {
    'Projects/Engine.md': '---\ntype: "[[Project]]"\nstatus: doing\ndue: 2026-10-20\nlead: "[[Ada Lovelace]]"\n---\n# Engine\n',
    'Projects/Loom.md': '---\ntype: "[[Project]]"\nstatus: todo\ndue: 2026-09-30\n---\n# Loom\n',
    'Projects/Archive.md': '---\ntype: "[[Project]]"\nstatus: done\n---\n# Archive\n',
    'People/Ada Lovelace.md': '---\ntype: "[[Person]]"\n---\n# Ada\n',
    'Projects.view.yaml': 'title: Projects\nfrom: Projects\nwhere:\n  - type = Project\ncolumns: [name, status, due, lead]\nsort: [due]\nlayout: table\ngroups: [todo, doing, done]\n',
  });
  await openLocalFolder(page);
  await page.getByRole('complementary', { name: 'Folder' }).getByRole('button', { name: 'Projects.view.yaml', exact: true }).click();
  const view = page.getByRole('region', { name: 'Projects' });
  const table = view.getByRole('table', { name: 'Projects' });
  await expect(table.locator('tbody tr th')).toHaveText(['Loom', 'Engine', 'Archive']);
  // A link of a property: to its note.
  await expect(table.locator('tbody tr').nth(1).getByRole('button', { name: 'Ada Lovelace' })).toBeVisible();

  // Sorted by a column, the largest first at the second click.
  await table.getByRole('button', { name: 'Sort by due' }).click();
  await expect(table.locator('tbody tr th')).toHaveText(['Engine', 'Loom', 'Archive']);

  // A cell changed: the note's front matter, its other lines kept.
  await table.locator('tbody tr').filter({ hasText: 'Loom' }).locator('td[data-column="due"]').dblclick();
  const input = view.getByRole('textbox', { name: 'Change due of Loom' });
  await input.fill('2026-11-02');
  await input.press('Enter');
  await expect.poll(() => stored(page, 'Projects/Loom.md')).toBe('---\ntype: "[[Project]]"\nstatus: todo\ndue: 2026-11-02\n---\n# Loom\n');
  await expect(table.locator('tbody tr th')).toHaveText(['Loom', 'Engine', 'Archive']);

  // Cards.
  await view.getByRole('button', { name: 'Cards' }).click();
  await expect(view.getByRole('article')).toHaveCount(3);
  await expect(view.getByRole('article', { name: 'Engine' })).toContainText('doing');

  // A board by status: a card moved to another column, from the keyboard, then by dragging.
  await view.getByLabel('Columns by').selectOption('status');
  const board = view.locator('.notes-board');
  await expect(board.locator('.notes-board-column h3 span:first-child')).toHaveText(['todo', 'doing', 'done']);
  await board.getByLabel('Column of Loom').selectOption('doing');
  await expect.poll(() => stored(page, 'Projects/Loom.md')).toContain('status: doing\n');
  await expect(board.getByRole('region', { name: 'doing' }).getByRole('article')).toHaveCount(2);
  await board.getByRole('article', { name: 'Engine' }).dragTo(board.getByRole('region', { name: 'done' }));
  await expect.poll(() => stored(page, 'Projects/Engine.md')).toContain('status: done\n');

  // A note made in a column: in the folder of the view, with what it asks for.
  page.once('dialog', (d) => void d.accept('Mill'));
  await board.getByRole('region', { name: 'todo' }).getByRole('button', { name: 'New note in todo' }).click();
  await expect.poll(() => stored(page, 'Projects/Mill.md')).toBe('---\ntype: Project\nstatus: todo\n---\n\n# Mill\n');
  await expect(board.getByRole('region', { name: 'todo' }).getByRole('article', { name: 'Mill' })).toBeVisible();
  await page.screenshot({ path: 'test-results/note-views-board.png' });

  // The view is a file of the folder: saved with what was changed.
  await page.keyboard.press('Control+s');
  await expect.poll(() => stored(page, 'Projects.view.yaml')).toBe('title: Projects\nfrom: Projects\nwhere:\n  - type = Project\ncolumns: [name, status, due, lead]\nsort: [-due]\nlayout: board\ngroup: status\ngroups: [todo, doing, done]\n');
});
