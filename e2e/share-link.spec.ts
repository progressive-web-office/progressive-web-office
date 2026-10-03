import { expect, test } from '@playwright/test';
import { openApp, openFile } from './helpers';

test('builds a link containing the document and rebuilds it from the link (SHARE-009, SHARE-010)', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const errors = await openApp(page);
  await openFile(page, 'cours.md', '# Cours\n\nUne **phrase** et une formule $E=mc^2$.\n\n```mermaid\nflowchart LR\n  A --> B\n```\n');
  await page.getByRole('button', { name: 'Send to another device…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Send to another device' });
  await expect(dialog).toContainText('contains the document itself');
  const field = dialog.getByLabel('Link containing the document');
  const link = await field.inputValue();
  expect(link).toMatch(/^http:\/\/localhost:4173\/#doc=v1\.[dr]\./);
  await dialog.getByRole('button', { name: 'Copy link' }).click();
  await expect(page.locator('.app-alert')).toContainText('Link copied.');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);

  // Someone else opens the link: the document is rebuilt, and the fragment removed.
  const other = await context.newPage();
  const otherErrors: string[] = [];
  other.on('pageerror', (e) => otherErrors.push(e.message));
  await other.goto(link);
  await expect(other.locator('.doc-name')).toHaveText('cours.md');
  await expect(other.locator('.doc-page h1')).toHaveText('Cours');
  await expect(other.locator('.doc-page strong')).toHaveText('phrase');
  await expect(other.locator('.doc-page span.diagram')).toHaveCount(1);
  expect(new URL(other.url()).hash).toBe('');

  // A damaged link is reported.
  await other.goto(`${link.slice(0, 60)}!!`);
  await expect(other.locator('.app-alert')).toContainText('does not contain a valid document');
  expect([...errors, ...otherErrors]).toEqual([]);
});

test('carries a Word document as Markdown in its link (SHARE-009)', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'New document' }).click();
  await page.locator('.doc-page').click();
  await page.keyboard.type('Bonjour');
  await page.getByRole('button', { name: 'Send to another device…' }).click();
  const link = await page.getByRole('dialog').getByLabel('Link containing the document').inputValue();
  const { decodeDocumentLink } = await import('../src/share/link');
  const doc = decodeDocumentLink(new URL(link).hash)!;
  expect(doc.name).toBe('Untitled document.md');
  expect(new TextDecoder().decode(doc.bytes)).toContain('Bonjour');
});

test('protects a link with a password (SHARE-014)', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const errors = await openApp(page);
  await openFile(page, 'secret.md', '# Secret\n\nPlans.\n');
  await page.getByRole('button', { name: 'Send to another device…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Send to another device' });
  const field = dialog.getByLabel('Link containing the document');
  await dialog.getByText('Protect with a password').click();
  await dialog.getByLabel('Password').fill('tulip');
  await expect(field).toHaveValue(/#doc=v2\./);
  const link = await field.inputValue();
  expect(link).not.toContain('secret');
  await dialog.getByRole('button', { name: 'Copy link' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);

  const other = await context.newPage();
  await other.goto(link);
  const ask = other.getByRole('dialog', { name: 'Protected document' });
  await ask.getByLabel('Password').fill('rose');
  await ask.getByRole('button', { name: 'Open' }).click();
  await expect(other.getByRole('dialog', { name: 'Protected document' }).getByRole('alert')).toContainText('Wrong password');
  await other.getByRole('dialog', { name: 'Protected document' }).getByLabel('Password').fill('tulip');
  await other.getByRole('dialog', { name: 'Protected document' }).getByRole('button', { name: 'Open' }).click();
  await expect(other.locator('.doc-name')).toHaveText('secret.md');
  await expect(other.locator('.doc-page h1')).toHaveText('Secret');
  expect(new URL(other.url()).hash).toBe('');
  expect(errors).toEqual([]);
});
