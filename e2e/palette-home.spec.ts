import { expect, test } from '@playwright/test';
import { openApp } from './helpers';

// UI-024: back to the start screen from the command palette.

test('goes back to the start screen from the command palette (UI-024)', async ({ page }) => {
  const errors = await openApp(page);
  await page.getByRole('button', { name: 'New document' }).click();
  await expect(page.locator('.ProseMirror')).toBeVisible();
  await page.keyboard.press('Control+Shift+P');
  const commands = page.getByRole('combobox', { name: 'Commands' });
  await commands.fill('home');
  await expect(page.getByRole('option', { name: /^Home Start screen/ })).toBeVisible();
  await commands.press('Enter');
  await expect(page.locator('.ProseMirror')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'New document' })).toBeVisible();
  // On the start screen, nothing to go back to.
  await page.keyboard.press('Control+Shift+P');
  await commands.fill('home');
  await expect(page.getByRole('option', { name: /^Home Start screen/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});
