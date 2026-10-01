import { expect, test } from '@playwright/test';
import { openApp } from './helpers';
import pkg from '../package.json' with { type: 'json' };

test('shows the About window from the header (UI-012)', async ({ page }) => {
  const errors = await openApp(page);
  await page.locator('.header-actions').getByRole('button', { name: 'About' }).click();
  const about = page.getByRole('dialog', { name: 'About' });
  await expect(about).toContainText(`Version${pkg.version}`);
  await expect(about.getByRole('img', { name: /QR code of the app address http:\/\/localhost:4173\// })).toBeVisible();
  await expect(about.getByRole('link', { name: 'Documentation' })).toHaveAttribute('href', 'http://localhost:4173/docs/');
  await expect(about.getByRole('link', { name: 'Source code' })).toHaveAttribute('href', 'https://github.com/s-celles/progressive-web-office');
  await expect(about.getByRole('link', { name: /^[0-9a-f]{7}$/ })).toHaveAttribute('href', /\/commit\/[0-9a-f]{40}$/);
  await page.screenshot({ path: test.info().outputPath('about.png') });
  await about.getByRole('button', { name: 'Close' }).click();
  await expect(about).toBeHidden();
  expect(errors).toEqual([]);
});
