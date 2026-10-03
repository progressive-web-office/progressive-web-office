import { expect, test } from '@playwright/test';
import { openApp, openFile, useRuntimePackages } from './helpers';

// CODE-018: Lua and SQL files run with a runtime downloaded from its CDN after the user agreed.
test('runs Lua and SQL files with runtimes downloaded when first needed (CODE-018)', async ({ page }) => {
  test.setTimeout(120_000);
  test.skip(!(await useRuntimePackages(page)), 'needs RUNTIME_PACKAGES or network access to the npm CDN');
  const errors = await openApp(page);
  await openFile(page, 'hello.lua', 'local t = {}\nfor i = 1, 3 do t[#t + 1] = i * i end\nprint("squares", table.concat(t, ","))\nreturn #t\n', 'text/plain');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  // The download is asked first.
  const ask = page.getByRole('dialog').filter({ hasText: 'cdn.jsdelivr.net' });
  await ask.getByRole('button', { name: /Allow|Download/ }).click();
  const output = page.getByRole('region', { name: 'Output' });
  await expect(output).toContainText('squares\t1,4,9', { timeout: 60_000 });
  await expect(output).toContainText('3');

  await page.locator('.header-actions').getByRole('button', { name: 'Close' }).click();
  await openFile(page, 'people.sql', "CREATE TABLE p(name TEXT, age INT);\nINSERT INTO p VALUES ('Ada', 36), ('Grace', 85);\nSELECT name, age FROM p ORDER BY age DESC;\n", 'text/plain');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  // The site was allowed in this session: no second question.
  await expect(page.getByRole('region', { name: 'Output' })).toContainText('Grace | 85', { timeout: 60_000 });
  await expect(page.getByRole('region', { name: 'Output' })).toContainText('(2 rows)');
  expect(errors).toEqual([]);
});
