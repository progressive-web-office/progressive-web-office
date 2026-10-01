import { devices, expect, test } from '@playwright/test';
import { openApp } from './helpers';

test.use({ ...devices['Pixel 7'], launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {} });

test('types an equation with the MathLive virtual keyboard on a phone (MATH-001)', async ({ page }) => {
  const errors = await openApp(page);
  await page.getByRole('button', { name: 'New document' }).tap();
  await page.getByRole('textbox', { name: 'Document' }).tap();
  await page.getByRole('button', { name: 'Insert equation' }).tap();
  const field = page.locator('math-field');
  await field.tap();
  // The keyboard must sit above the modal dialog, not behind its backdrop.
  // Keycap labels also contain their shifted variant (e.g. "x" + "y").
  const key = (label: RegExp) => page.locator('.ML__keyboard.is-visible .MLK__keycap', { hasText: label }).first();
  await key(/^xy$/).tap({ timeout: 5000 });
  await key(/^\+∑$/).tap();
  await key(/^1■−1$/).tap();
  await expect(page.getByLabel('LaTeX source')).toHaveValue('x+1');
  await page.getByRole('button', { name: 'Insert', exact: true }).tap();
  await expect(page.locator('.doc-page span.math')).toHaveAttribute('data-latex', 'x+1');
  await expect(page.locator('.ML__keyboard.is-visible')).toHaveCount(0);
  expect(errors).toEqual([]);
});
