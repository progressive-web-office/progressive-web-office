import { expect, test } from '@playwright/test';

// The former address of the application, before the repository became the organisation's site, leads to it.
test('the former path of the application redirects to the site root, keeping the link (BACKUP-006)', async ({ page }) => {
  const seen: string[] = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) seen.push(frame.url());
  });
  await page.goto('/progressive-web-office/?x=1#doc=abc');
  await expect.poll(() => seen.some((u) => /:\d+\/\?x=1#doc=abc$/.test(u))).toBe(true);
  await expect(page.getByRole('button', { name: 'New document' })).toBeVisible();
});
