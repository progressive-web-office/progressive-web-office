import { expect, test } from '@playwright/test';
import { unzipSync, strFromU8 } from 'fflate';
import { openApp, openFile, saveAs } from './helpers';

const FLOW = 'flowchart LR\n  A[Write] --> B[Share]';

test('renders, edits and exports Mermaid diagrams (DIAG-001..DIAG-005)', async ({ page }) => {
  const errors = await openApp(page);
  await openFile(page, 'diagram.md', '# Plan\n\n```mermaid\n' + FLOW + '\n```\n\nEnd.\n');

  // DIAG-002: rendered as a picture, offline.
  const diagram = page.locator('.doc-page span.diagram');
  await expect(diagram.locator('img')).toBeVisible();
  const size = await diagram.locator('img').evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight]);
  expect(size[0]).toBeGreaterThan(50);
  expect(size[1]).toBeGreaterThan(20);

  // DIAG-001: click to edit, live preview, invalid source reported.
  await diagram.click();
  const dialog = page.getByRole('dialog', { name: 'Edit diagram' });
  const source = dialog.getByLabel('Mermaid source');
  await expect(source).toHaveValue(FLOW);
  await expect(dialog.locator('.diagram-preview img')).toBeVisible();
  await source.fill('flowchart LR\n  A[Write] --> ');
  await expect(dialog.locator('.diagram-message')).toContainText('error');
  await source.fill(FLOW + ' --> C[Review]');
  await expect(dialog.locator('.diagram-message')).toBeEmpty();
  await dialog.getByRole('button', { name: 'Update' }).click();
  await expect(page.locator('.modified')).toBeVisible();
  await expect(diagram.locator('img')).toBeVisible();

  // DIAG-004: Markdown keeps the fence.
  const md = (await saveAs(page, 'Markdown (.md)')).data.toString('utf8');
  expect(md).toContain('```mermaid\n' + FLOW + ' --> C[Review]\n```');

  // DIAG-005: DOCX gets a PNG picture carrying the source, and reads back as a diagram.
  const docx = await saveAs(page, 'Word document (.docx)');
  const zip = unzipSync(new Uint8Array(docx.data));
  const png = Object.keys(zip).find((p) => p.startsWith('word/media/') && p.endsWith('.png'));
  expect(png).toBeDefined();
  expect(Array.from(zip[png!]!.slice(1, 4))).toEqual([0x50, 0x4e, 0x47]);
  expect(strFromU8(zip['word/document.xml']!)).toContain('title="mermaid"');
  await openFile(page, 'diagram.docx', docx.data);
  await expect(page.locator('.doc-page span.diagram img')).toBeVisible();
  expect(errors).toEqual([]);
});

test('inserts a diagram from a template (DIAG-001)', async ({ page }) => {
  const errors = await openApp(page);
  await openFile(page, 'empty.md', 'Intro\n');
  await page.locator('.doc-page p').first().click();
  await page.getByRole('button', { name: 'Insert diagram' }).click();
  const dialog = page.getByRole('dialog', { name: 'Insert diagram' });
  await dialog.getByLabel('Start from a template…').selectOption('sequence');
  await expect(dialog.getByLabel('Mermaid source')).toHaveValue(/^sequenceDiagram/);
  await expect(dialog.locator('.diagram-preview img')).toBeVisible();
  await dialog.getByRole('button', { name: 'Insert' }).click();
  await expect(page.locator('.doc-page span.diagram img')).toBeVisible();
  const md = (await saveAs(page, 'Markdown (.md)')).data.toString('utf8');
  expect(md).toMatch(/^Intro\n\n```mermaid\nsequenceDiagram\n/);
  expect(errors).toEqual([]);
});
