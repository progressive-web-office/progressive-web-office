import { expect, test } from '@playwright/test';
import { openApp, openFile, saveAs } from './helpers';

// NOTE-001: the front matter of a note, shown and changed as properties.

test.use({ viewport: { width: 1280, height: 900 } });

const NOTE = `---
title: Kick-off meeting
tags:
  - meeting
  - team
done: false
due: 2026-10-15
project: "[[Project Alpha]]"
rating: 4
---

# Kick-off meeting

Notes.
`;

test('shows the properties of a note above its page, changes them and writes them back (NOTE-001)', async ({ page }) => {
  const errors = await openApp(page);
  await openFile(page, 'kick-off.md', NOTE, 'text/markdown');
  const card = page.getByRole('region', { name: 'Properties' });
  await expect(card).toBeVisible();
  await expect(card.getByLabel('title', { exact: true })).toHaveValue('Kick-off meeting');
  await expect(card.locator('.note-chip.tag')).toHaveText(['#meeting×', '#team×']);
  await expect(card.getByLabel('due', { exact: true })).toHaveValue('2026-10-15');
  await expect(card.getByLabel('rating', { exact: true })).toHaveValue('4');
  // The link is drawn as a link; the pencil changes it.
  await expect(card.getByRole('button', { name: 'Project Alpha', exact: true })).toBeVisible();
  await card.getByRole('button', { name: 'Change project' }).click();
  await expect(card.getByLabel('project', { exact: true })).toHaveValue('[[Project Alpha]]');
  await expect(card.getByLabel('project', { exact: true })).toBeFocused();
  await card.getByLabel('project', { exact: true }).blur();
  await expect(card.getByRole('button', { name: 'Project Alpha', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/note-properties.png' });

  await card.getByLabel('done', { exact: true }).check();
  await card.getByLabel('due', { exact: true }).fill('2026-10-20');
  await card.getByLabel('due', { exact: true }).dispatchEvent('change');
  await card.getByLabel('Add to tags').fill('kick-off');
  await card.getByLabel('Add to tags').press('Enter');
  await card.getByRole('button', { name: 'Remove #team' }).click();
  await card.getByLabel('Name of the property').fill('status');
  await card.getByLabel('Name of the property').press('Enter');
  await card.getByLabel('status', { exact: true }).fill('open');
  await card.getByLabel('status', { exact: true }).press('Enter');
  await card.getByRole('button', { name: 'Remove the property rating' }).click();

  const md = (await saveAs(page, 'Markdown (.md)')).data.toString();
  expect(md).toContain('title: Kick-off meeting');
  expect(md).toContain('tags:\n  - meeting\n  - kick-off\ndone: true\ndue: 2026-10-20\nproject: "[[Project Alpha]]"\nstatus: open\n---');
  expect(md).not.toContain('rating');
  expect(errors).toEqual([]);
});

test('takes back the whole front matter edited in the source (NOTE-001, DOC-044)', async ({ page }) => {
  const errors = await openApp(page);
  await openFile(page, 'note.md', NOTE, 'text/markdown');
  await page.getByLabel('View', { exact: true }).first().selectOption({ label: 'Source' });
  const line = page.locator('.source-pane .cm-line', { hasText: '- team' });
  await line.click();
  await page.keyboard.press('End');
  await page.keyboard.insertText('\n  - source');
  await page.locator('.doc-mode-bar').getByRole('button', { name: 'Visual editing' }).click();
  await expect(page.getByRole('region', { name: 'Properties' }).locator('.note-chip.tag')).toHaveText(['#meeting×', '#team×', '#source×']);
  expect(errors).toEqual([]);
});

test('shows the properties to read, or as YAML to change at once (NOTE-001)', async ({ page }) => {
  const errors = await openApp(page);
  await openFile(page, 'kick-off.md', NOTE, 'text/markdown');
  const card = page.getByRole('region', { name: 'Properties' });
  await card.getByRole('button', { name: 'Read', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Read', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(card.locator('input, textarea')).toHaveCount(0);
  await expect(card.getByRole('img', { name: 'No' })).toBeVisible();
  await expect(card.locator('time[datetime="2026-10-15"]')).toHaveText(/2026/);
  await expect(card.getByRole('button', { name: 'Project Alpha', exact: true })).toBeVisible();
  await expect(card.locator('.note-chip.tag')).toHaveText(['#meeting', '#team']);
  await page.screenshot({ path: 'test-results/note-properties-read.png' });

  await card.getByRole('button', { name: 'YAML', exact: true }).click();
  const yaml = card.getByLabel('Front matter (YAML)');
  await expect(yaml).toHaveValue(/^title: Kick-off meeting\ntags:\n  - meeting/);
  await yaml.fill('title: Kick-off meeting\nstatus: draft\nproject: "[[Project Beta]]"');
  await yaml.dispatchEvent('change');
  // Kept across notes, until another way is chosen.
  await card.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(card.getByLabel('status', { exact: true })).toHaveValue('draft');
  await expect(card.getByRole('button', { name: 'Project Beta', exact: true })).toBeVisible();
  await expect(card.locator('.note-chip.tag')).toHaveCount(0);

  const md = (await saveAs(page, 'Markdown (.md)')).data.toString();
  expect(md).toMatch(/^---\ntitle: Kick-off meeting\nstatus: draft\nproject: "\[\[Project Beta\]\]"\n---/);
  expect(errors).toEqual([]);
});
