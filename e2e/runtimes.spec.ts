import { expect, test } from '@playwright/test';
import { answerCodeQuestions, openApp, openFile, usePyodidePackages, useRuntimePackages, useWebR, pickTemplate } from './helpers';

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

test('compiles and runs C and C++ files with Clang downloaded when first needed (CODE-018)', async ({ page }) => {
  test.setTimeout(300_000);
  test.skip(!(await useRuntimePackages(page)), 'needs RUNTIME_PACKAGES or network access to the npm CDN');
  const errors = await openApp(page);
  await openFile(page, 'hello.cpp', '#include <iostream>\n#include <vector>\nint main() {\n  std::vector<int> v{1, 2, 3};\n  int s = 0;\n  for (int x : v) s += x * x;\n  std::cout << "sum of squares: " << s << std::endl;\n}\n', 'text/plain');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await page.getByRole('dialog').filter({ hasText: 'cdn.jsdelivr.net' }).getByRole('button', { name: 'Allow' }).click();
  const output = page.getByRole('region', { name: 'Output' });
  await expect(output).toContainText('sum of squares: 14', { timeout: 240_000 });

  await page.locator('.header-actions').getByRole('button', { name: 'Close' }).click();
  await openFile(page, 'oops.c', '#include <stdio.h>\nint main(void) { printf("%d\\n", 6 * 7); return missing; }\n', 'text/plain');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  // Compiler errors are shown.
  await expect(page.getByRole('region', { name: 'Output' }).locator('.code-file-text.error')).toContainText("use of undeclared identifier 'missing'", { timeout: 120_000 });
  expect(errors).toEqual([]);
});

test('runs R files with webR, in a sandbox of its own, plots included (CODE-018)', async ({ page }) => {
  test.setTimeout(300_000);
  test.skip(!(await useWebR(page)), 'needs RUNTIME_PACKAGES or network access to webr.r-wasm.org');
  const errors = await openApp(page);
  await openFile(page, 'stats.R', 'x <- c(2, 4, 4, 4, 5, 5, 7, 9)\ncat("mean:", mean(x), "\\n")\nsd(x)\nplot(x)\n', 'text/plain');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await page.getByRole('dialog').filter({ hasText: 'webr.r-wasm.org' }).getByRole('button', { name: 'Allow' }).click();
  const output = page.getByRole('region', { name: 'Output' });
  await expect(output).toContainText('mean: 5', { timeout: 240_000 });
  await expect(output).toContainText('[1] 2.13809');
  await expect(output.locator('img')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('runs every cell of the languages example (FILE-018, CODE-017, CODE-018)', async ({ page }) => {
  test.setTimeout(600_000);
  const ready = (await usePyodidePackages(page)) && (await useRuntimePackages(page)) && (await useWebR(page));
  test.skip(!ready, 'needs PYODIDE_PACKAGES and RUNTIME_PACKAGES, or the network');
  const errors = await openApp(page);
  await page.getByRole('button', { name: 'Templates and examples' }).click();
  await pickTemplate(page, 'Languages');
  const cells = page.locator('.doc-page .code-cell');
  await expect(cells).toHaveCount(9);
  // Each download is asked once per site; the trust question comes first.
  answerCodeQuestions(page);
  await cells.first().getByRole('button', { name: 'Run all cells' }).click();
  const out = (i: number) => cells.nth(i).locator('.code-cell-output');
  // The languages run side by side: wait for each output.
  const long = { timeout: 540_000 };
  await expect(out(0)).toContainText('mean = 13.60', long);
  await expect(out(1)).toContainText('0, 1, 1, 2, 3, 5, 8, 13', long);
  await expect(out(2)).toContainText('the\t3', long);
  await expect(out(4)).toContainText('maths | 5 | 13.6 | 17', long);
  await expect(out(5)).toContainText('2 3 5 7 11 13', long);
  await expect(out(6)).toContainText('Chloé\t17', long);
  await expect(out(7)).toContainText('wt', long);
  await expect(cells.nth(8).locator('.code-cell-figures img')).toHaveCount(1, long);
  await expect(cells.locator('.code-cell-output.error')).toHaveCount(0);
  expect(errors).toEqual([]);
});
