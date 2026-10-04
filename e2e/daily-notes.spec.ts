import { expect, test } from '@playwright/test';
import { openApp } from './helpers';

// FOLDER-027: the calendar and today's note, from the command palette, with no folder open.

test("opens today's note from the command palette, in the browser's storage when no folder is open (FOLDER-027)", async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 9, 4, 9, 30));
  const errors = await openApp(page);
  await page.keyboard.press('Control+Shift+P');
  const commands = page.getByRole('combobox', { name: 'Commands' });
  await commands.fill('calendar');
  await expect(page.getByRole('option', { name: /Calendar of the notes/ })).toBeVisible();
  await expect(page.getByRole('option', { name: /Today's note/ })).toBeVisible();
  await commands.fill("today's note");
  await commands.press('Enter');
  await expect(page.locator('.ProseMirror h1')).toHaveText('2026-10-04');
  const panel = page.getByRole('complementary', { name: 'Folder' });
  await expect(panel.getByRole('heading', { name: '📁 Browser storage' })).toBeVisible();
  await expect(panel.locator('.daily-calendar .daily-day.today.has-note')).toHaveText('4');
  expect(errors).toEqual([]);
});
