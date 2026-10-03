import { expect, test, type Page } from '@playwright/test';
import { fakeFolder, openLocalFolder, usePyodidePackages, useRuntimePackages, useWebR } from './helpers';

// CODE-019: a file of an open folder runs with the other files of its project.

async function openInFolder(page: Page, path: string): Promise<void> {
  const panel = page.getByRole('complementary', { name: 'Folder' });
  const parts = path.split('/');
  for (const dir of parts.slice(0, -1)) {
    const button = panel.getByRole('button', { name: dir, exact: true });
    if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
  }
  await panel.getByRole('button', { name: parts[parts.length - 1], exact: true }).click();
}

async function run(page: Page): Promise<ReturnType<Page['getByRole']>> {
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  return page.getByRole('region', { name: 'Output' });
}

test('runs a JavaScript and TypeScript project: modules, JSON and data files of the folder (CODE-019)', async ({ page }) => {
  await fakeFolder(page, {
    'web/main.js': 'import { area } from "./lib/geometry.js";\nimport config from "./config.json";\nconsole.log(config.name, area(3));\nconsole.log(readText("data/notes.txt").trim());\n',
    'web/lib/geometry.ts': 'import { PI } from "./constants";\nexport const area = (r: number): number => Math.round(PI * r * r);\n',
    'web/lib/constants.ts': 'export const PI: number = 3.14159;\n',
    'web/config.json': '{ "name": "disc" }',
    'web/data/notes.txt': 'notes of the project\n',
  });
  await openLocalFolder(page);
  await openInFolder(page, 'web/main.js');
  const output = await run(page);
  await expect(output.getByRole('heading')).toHaveText('Output of main.js (project web)');
  await expect(output).toContainText('disc 28');
  await expect(output).toContainText('notes of the project');
  // A missing module says so (without a project file, the project is the folder of the file run).
  await openInFolder(page, 'web/lib/geometry.ts');
  await page.getByRole('textbox').first().click();
  await page.keyboard.press('Control+Home');
  await page.keyboard.type('import "./nowhere";\n');
  await expect(await run(page)).toContainText('geometry.ts: cannot find module "./nowhere"');
});

test('runs the entry point named by pwo.toml, with the module being edited (CODE-019)', async ({ page }) => {
  await fakeFolder(page, {
    'tool/pwo.toml': '# the tool\nmain = "src/app.js"\n',
    'tool/src/app.js': 'import { greet } from "./greet.js";\nconsole.log(greet("project"));\n',
    'tool/src/greet.js': 'export const greet = (who) => `hello ${who}`;\n',
  });
  await openLocalFolder(page);
  // The module is open, being edited: the entry point runs with the text as it is.
  await openInFolder(page, 'tool/src/greet.js');
  await page.getByRole('textbox').first().click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('export const unused = 1;\n');
  const output = await run(page);
  await expect(output.getByRole('heading')).toHaveText('Output of app.js (project tool)');
  await expect(output).toContainText('hello project');
});

test('runs a Python project: packages, data files, arguments and input (CODE-019)', async ({ page }) => {
  test.setTimeout(180_000);
  test.skip(!(await usePyodidePackages(page)), 'needs PYODIDE_PACKAGES or network access to the Pyodide CDN');
  await fakeFolder(page, {
    'stats/pwo.toml': 'main = "main.py"\nargs = ["marks.csv"]\nstdin = "input.txt"\n',
    'stats/main.py': 'import sys\nfrom tools.mean import mean\nwith open(sys.argv[1]) as f:\n    values = [float(x) for x in f.read().split(",")]\nprint("mean", mean(values), "for", input())\n',
    'stats/tools/__init__.py': '',
    'stats/tools/mean.py': 'def mean(xs):\n    return sum(xs) / len(xs)\n',
    'stats/marks.csv': '12,14,16',
    'stats/input.txt': 'the class\n',
  });
  await openLocalFolder(page);
  await openInFolder(page, 'stats/main.py');
  const output = await run(page);
  await expect(output).toContainText('mean 14.0 for the class', { timeout: 120_000 });
  // An edit of a module (not saved) is taken at the next run.
  await openInFolder(page, 'stats/tools/mean.py');
  await page.getByRole('textbox').first().click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('mean = lambda xs: max(xs)\n');
  await expect(await run(page)).toContainText('mean 16.0 for the class', { timeout: 60_000 });
});

test('runs Lua, SQL and C projects (CODE-019)', async ({ page }) => {
  test.setTimeout(300_000);
  test.skip(!(await useRuntimePackages(page)), 'needs RUNTIME_PACKAGES or network access to the npm CDN');
  await fakeFolder(page, {
    'lua/main.lua': 'local geom = require "geom"\nlocal f = io.open("size.txt")\nprint("area", geom.square(tonumber(f:read("l"))))\n',
    'lua/geom.lua': 'return { square = function(x) return x * x end }\n',
    'lua/size.txt': '7\n',
    'db/query.sql': '.read schema.sql\nSELECT name, age FROM people ORDER BY age;\n',
    'db/schema.sql': "CREATE TABLE people(name TEXT, age INT);\nINSERT INTO people VALUES ('Ada', 36), ('Alan', 41);\n",
    'c/pwo.toml': 'main = "src/main.c"\nsources = ["src/*.c"]\ncflags = ["-O1", "-DGREETING=\\"hi\\""]\nargs = ["data/n.txt"]\nstdin = "data/in.txt"\n',
    'c/src/main.c':
      '#include <stdio.h>\n#include "util.h"\nint main(int argc, char **argv) {\n  FILE *f = fopen(argv[1], "r");\n  int n = 0;\n  if (!f || fscanf(f, "%d", &n) != 1) return 2;\n  fclose(f);\n  char word[32];\n  if (scanf("%31s", word) != 1) return 3;\n  FILE *o = fopen("out.txt", "w");\n  fprintf(o, "%d", twice(n));\n  fclose(o);\n  o = fopen("out.txt", "r");\n  int back = 0;\n  fscanf(o, "%d", &back);\n  printf("%s %s %d\\n", GREETING, word, back);\n  return 0;\n}\n',
    'c/src/util.c': '#include "util.h"\nint twice(int x) { return 2 * x; }\n',
    'c/src/util.h': 'int twice(int x);\n',
    'c/data/n.txt': '21\n',
    'c/data/in.txt': 'world\n',
  });
  await openLocalFolder(page);
  await page.addLocatorHandler(page.getByRole('dialog').filter({ hasText: 'cdn.jsdelivr.net' }), async (d) => d.getByRole('button', { name: 'Allow' }).click());
  await openInFolder(page, 'lua/main.lua');
  await expect(await run(page)).toContainText('area\t49', { timeout: 60_000 });
  await openInFolder(page, 'db/query.sql');
  await expect(await run(page)).toContainText('Alan | 41', { timeout: 60_000 });
  await openInFolder(page, 'c/src/util.c');
  await expect(await run(page)).toContainText('hi world 42', { timeout: 240_000 });
});

test('runs an R project: sourced files, data and arguments (CODE-019)', async ({ page }) => {
  test.setTimeout(300_000);
  test.skip(!(await useWebR(page)), 'needs RUNTIME_PACKAGES or network access to webr.r-wasm.org');
  await fakeFolder(page, {
    'r/pwo.toml': 'args = ["double"]\n',
    'r/main.R': 'source("helpers.R")\nd <- read.csv("data/values.csv")\ncat(commandArgs(trailingOnly = TRUE), total(d$x), "\\n")\n',
    'r/helpers.R': 'total <- function(x) 2 * sum(x)\n',
    'r/data/values.csv': 'x\n1\n2\n3\n',
  });
  await openLocalFolder(page);
  await page.addLocatorHandler(page.getByRole('dialog').filter({ hasText: 'webr.r-wasm.org' }), async (d) => d.getByRole('button', { name: 'Allow' }).click());
  await openInFolder(page, 'r/main.R');
  await expect(await run(page)).toContainText('double 12', { timeout: 240_000 });
});
