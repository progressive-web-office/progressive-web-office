import { expect, test } from '@playwright/test';
import { openApp } from './helpers';

// UI-020: compact toolbars (the default): the other tools in menus.
test.use({ storageState: { cookies: [], origins: [] } });

test('groups the tools in menus that open below their button (UI-020)', async ({ page }) => {
  const errors = await openApp(page);
  await page.getByRole('button', { name: 'New document' }).click();
  const toolbar = page.getByRole('toolbar', { name: 'Formatting' });
  // In sight: the most used tools; the others are hidden in menus.
  await expect(toolbar.getByRole('button', { name: 'Bold' })).toBeVisible();
  await expect(toolbar.getByRole('button', { name: 'Insert table' })).toBeHidden();
  const insert = toolbar.getByRole('button', { name: 'Insert', exact: true });
  await expect(insert).toHaveAttribute('aria-expanded', 'false');
  await insert.click();
  await expect(insert).toHaveAttribute('aria-expanded', 'true');
  if (process.env.SCREENSHOTS) await page.screenshot({ path: 'test-results/toolbars-menu.png', clip: { x: 0, y: 0, width: 1280, height: 600 } });
  await page.getByRole('group', { name: 'Insert' }).getByRole('button', { name: 'Insert table' }).click();
  // A tool used closes its menu.
  await expect(page.getByRole('group', { name: 'Insert' })).toBeHidden();
  await expect(page.getByRole('textbox', { name: 'Document' }).locator('table')).toBeVisible();
  // Escape and a click elsewhere close a menu too.
  await toolbar.getByRole('button', { name: 'Paragraph', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Paragraph' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('group', { name: 'Paragraph' })).toBeHidden();
  // The header: file and sharing actions in menus.
  const header = page.locator('.header-actions');
  await header.getByRole('button', { name: 'Share', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Share' }).getByRole('button', { name: 'Send to another device…' })).toBeVisible();
  await page.mouse.click(5, 400);
  await expect(page.getByRole('group', { name: 'Share' })).toBeHidden();
  if (process.env.SCREENSHOTS) await page.screenshot({ path: 'test-results/toolbars.png' });
  expect(errors).toEqual([]);
});

test('shows every tool when the settings ask for full toolbars (UI-020)', async ({ page }) => {
  await openApp(page);
  await page.locator('.header-actions').getByRole('button', { name: 'Settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByLabel('Toolbars').selectOption('full');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'New document' }).click();
  await expect(page.getByRole('toolbar', { name: 'Formatting' }).getByRole('button', { name: 'Insert table' })).toBeVisible();
});
