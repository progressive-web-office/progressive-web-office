import { expect, test } from '@playwright/test';
import { openApp, openFile } from './helpers';

// CODE-017: source files run in the sandbox of the code cells.
test('runs a Python, JavaScript or TypeScript file opened in the code viewer (CODE-017)', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await openApp(page);
  await openFile(page, 'hello.js', 'const n = 6 * 7;\nconsole.log("answer", n);\n', 'text/javascript');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  const output = page.getByRole('region', { name: 'Output' });
  await expect(output).toContainText('Output of hello.js');
  await expect(output).toContainText('answer 42');

  await page.locator('.header-actions').getByRole('button', { name: 'Close' }).click();
  await openFile(page, 'typed.ts', 'interface P { x: number }\nconst p: P = { x: 2 };\nconsole.log(p.x ** 10);\n', 'text/plain');
  await page.keyboard.press('Control+Enter');
  await expect(page.getByRole('region', { name: 'Output' })).toContainText('1024');

  await page.locator('.header-actions').getByRole('button', { name: 'Close' }).click();
  await openFile(page, 'calc.py', 'import math\nprint(round(math.pi, 4))\n1 / 0\n', 'text/x-python');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  const py = page.getByRole('region', { name: 'Output' });
  await expect(py).toContainText('3.1416', { timeout: 90_000 });
  await expect(py.locator('.code-file-text.error')).toContainText('ZeroDivisionError');
  expect(errors).toEqual([]);
});
