import { expect, test } from '@playwright/test';

test.describe('interface language follows the browser (UI-008)', () => {
  test.use({ locale: 'fr-FR' });
  test('French', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByRole('button', { name: 'Nouveau document' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await page.getByRole('button', { name: 'Nouveau classeur' }).click();
    await expect(page.getByRole('grid', { name: 'Classeur' })).toBeVisible();
  });
});

test.describe('Chinese', () => {
  test.use({ locale: 'zh-CN' });
  test('Simplified Chinese, persisted choice', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByRole('button', { name: '新建演示文稿' })).toBeVisible();
    await page.getByLabel('语言').selectOption('en');
    await expect(page.getByRole('button', { name: 'New presentation' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'New presentation' })).toBeVisible();
  });
});
