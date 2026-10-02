import { expect, test } from '@playwright/test';
import { openApp } from './helpers';

test.use({ viewport: { width: 393, height: 851 }, hasTouch: true, isMobile: true });

test('keeps the header on one line and the toolbar on one row on a phone (UI-014)', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'New document' }).click();
  const header = page.locator('.app-header');
  const toolbar = page.getByRole('toolbar', { name: 'Formatting' });
  expect((await header.boundingBox())!.height).toBeLessThan(64);
  expect((await toolbar.boundingBox())!.height).toBeLessThan(56);
  await expect(header.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
  await expect(header.getByRole('button', { name: 'Print' })).toBeHidden();
  await page.screenshot({ path: test.info().outputPath('phone.png') });
  // The other actions are in the "⋯" menu, and the menu closes after use.
  await header.getByRole('button', { name: 'More actions' }).click();
  await expect(header.getByRole('button', { name: 'Print' })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('phone-menu.png') });
  await header.getByRole('button', { name: 'More actions' }).click();
  await expect(header.getByRole('button', { name: 'Print' })).toBeHidden();
  // Toolbar buttons further right are reached by scrolling it.
  const table = toolbar.getByRole('button', { name: 'Insert table' });
  await table.scrollIntoViewIfNeeded();
  await table.click();
  await expect(page.getByRole('toolbar', { name: 'Table' })).toBeVisible();
});
