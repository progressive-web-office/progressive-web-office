import { expect, test } from '@playwright/test';
import { openApp } from './helpers';

test('exam mode: no network, no outside paste, a log, ended with the teacher’s code (TEACH-005)', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Exam mode…' }).click();
  const start = page.getByRole('dialog', { name: '🔒 Start the exam mode' });
  await start.getByLabel('Name of the test (shown in the banner)').fill('Maths test');
  await start.getByLabel('Teacher’s code (at least 4 characters)').fill('2468');
  await start.getByLabel('The code again').fill('2469');
  await start.getByRole('button', { name: 'Start the exam mode' }).click();
  await expect(start.getByText('The two codes differ.')).toBeVisible();
  await start.getByLabel('The code again').fill('2468');
  await start.getByRole('button', { name: 'Start the exam mode' }).click();

  // The application starts again, locked.
  const banner = page.getByRole('region', { name: 'Exam mode' });
  await expect(banner).toContainText('Maths test');
  await expect(page.getByRole('button', { name: 'Open from repository…' })).toHaveCount(0);
  await page.getByRole('button', { name: 'New document' }).click();
  await expect(page.locator('.header-actions').getByLabel('Share', { exact: true })).toHaveCount(0);
  await expect(page.locator('.header-actions').getByRole('button', { name: 'AI assistant' })).toHaveCount(0);
  // The network is out of reach, the application itself is not.
  const results = await page.evaluate(async () => {
    const outside = await fetch('https://example.com/').then(() => 'reached', (e: Error) => e.message);
    const inside = await fetch('icon.svg').then((r) => String(r.ok), (e: Error) => e.message);
    return { outside, inside };
  });
  expect(results.outside).toMatch(/no network/);
  expect(results.inside).toBe('true');
  // A paste from outside does not reach the document.
  const editor = page.locator('.ProseMirror');
  await editor.click();
  await page.keyboard.type('My answer');
  await editor.evaluate((el) => {
    const data = new DataTransfer();
    data.setData('text/plain', 'copied from the web');
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect(banner).toContainText('Pasting from outside is off.');
  await expect(editor).toHaveText('My answer');

  // Ending: a wrong code is refused and logged.
  await banner.getByRole('button', { name: 'End the exam mode' }).click();
  const end = page.getByRole('dialog', { name: 'End the exam mode' });
  await end.getByLabel('Teacher’s code').fill('1111');
  await end.getByRole('button', { name: 'End the exam mode' }).click();
  await expect(end.getByText('Wrong code (logged).')).toBeVisible();
  await end.getByLabel('Teacher’s code').fill('2468');
  await end.getByRole('button', { name: 'End the exam mode' }).click();
  const log = page.getByRole('dialog', { name: 'Exam mode ended: its log' });
  await expect(log).toContainText('Paste from outside refused: 1');
  await expect(log).toContainText('Connection refused: 1');
  await expect(log).toContainText('Wrong teacher’s code: 1');
  await log.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('region', { name: 'Exam mode' })).toHaveCount(0);
});
