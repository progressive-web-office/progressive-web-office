import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

const LIGHT_BG = 'rgb(244, 246, 249)';
const DARK_BG = 'rgb(20, 24, 31)';
const background = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test('switches between system, light and dark themes and remembers the choice (UI-011)', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  const errors = await openApp(page);
  const toggle = page.locator('.theme-toggle');

  // System (default): follows the dark system preference.
  await expect(toggle).toHaveAccessibleName('Theme: System');
  expect(await background(page)).toBe(DARK_BG);

  // Light, even though the system is dark; native controls follow.
  await toggle.click();
  await expect(toggle).toHaveAccessibleName('Theme: Light');
  expect(await background(page)).toBe(LIGHT_BG);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('light');

  // Persisted across reloads.
  await page.reload();
  await expect(page.locator('.theme-toggle')).toHaveAccessibleName('Theme: Light');
  expect(await background(page)).toBe(LIGHT_BG);

  // Dark, even when the system turns light.
  await page.emulateMedia({ colorScheme: 'light' });
  await page.locator('.theme-toggle').click();
  await expect(page.locator('.theme-toggle')).toHaveAccessibleName('Theme: Dark');
  expect(await background(page)).toBe(DARK_BG);

  // Back to System: light again.
  await page.locator('.theme-toggle').click();
  await expect(page.locator('.theme-toggle')).toHaveAccessibleName('Theme: System');
  expect(await background(page)).toBe(LIGHT_BG);

  // Also available while editing a document.
  await page.getByRole('button', { name: 'New document' }).click();
  await expect(page.locator('.theme-toggle')).toBeVisible();
  expect(errors).toEqual([]);
});
