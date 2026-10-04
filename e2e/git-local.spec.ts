import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const env = { ...process.env, GIT_AUTHOR_NAME: 'Cli', GIT_AUTHOR_EMAIL: 'cli@x', GIT_COMMITTER_NAME: 'Cli', GIT_COMMITTER_EMAIL: 'cli@x' };
const git = (cwd: string, ...args: string[]): string => execFileSync('git', args, { cwd, encoding: 'utf8', env });

/** Every file of a folder, base64. */
function files(dir: string, rel = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of readdirSync(join(dir, rel))) {
    const r = rel ? `${rel}/${name}` : name;
    if (statSync(join(dir, r)).isDirectory()) Object.assign(out, files(dir, r));
    else out[r] = readFileSync(join(dir, r)).toString('base64');
  }
  return out;
}

/** The browser's private storage, written or read whole. */
const putStorage = (page: Page, all: Record<string, string>) =>
  page.evaluate(async (entries) => {
    // "Browser storage" is the Documents folder of the private storage.
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('Documents', { create: true });
    for (const [path, b64] of Object.entries(entries)) {
      const parts = path.split('/');
      let dir = root;
      for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p, { create: true });
      const w = await (await dir.getFileHandle(parts.at(-1)!, { create: true })).createWritable();
      await w.write(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
      await w.close();
    }
  }, all);
const getStorage = (page: Page) =>
  page.evaluate(async () => {
    const out: Record<string, string> = {};
    const walk = async (dir: FileSystemDirectoryHandle, rel: string): Promise<void> => {
      for await (const [name, h] of (dir as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
        const r = rel ? `${rel}/${name}` : name;
        if (h.kind === 'directory') await walk(h as FileSystemDirectoryHandle, r);
        else {
          const bytes = new Uint8Array(await (await (h as FileSystemFileHandle).getFile()).arrayBuffer());
          let bin = '';
          for (const b of bytes) bin += String.fromCharCode(b);
          out[r] = btoa(bin);
        }
      }
    };
    await walk(await (await navigator.storage.getDirectory()).getDirectoryHandle('Documents'), '');
    return out;
  });

test('commits in a Git working copy, shows the local history of a document (GIT-017)', async ({ page }) => {
  const dir = mkdtempSync(join(tmpdir(), 'pwo-e2e-git-'));
  try {
    git(dir, 'init', '-q', '-b', 'main');
    git(dir, 'config', 'user.name', 'Ada');
    git(dir, 'config', 'user.email', 'ada@example.org');
    writeFileSync(join(dir, 'notes.md'), '# Notes\n');
    git(dir, 'add', '.');
    git(dir, 'commit', '-q', '-m', 'docs: first');
    git(dir, 'gc', '-q');

    await page.goto('./');
    await putStorage(page, files(dir));
    await page.getByRole('button', { name: 'Open a folder' }).click();
    const where = page.getByRole('dialog', { name: 'Open a folder' });
    await where.getByLabel('Browser storage').check();
    await where.getByRole('button', { name: 'Open' }).click();
    const panel = page.getByRole('complementary', { name: 'Folder' });
    await expect(panel.getByRole('button', { name: 'Git working copy, branch main' })).toBeVisible();

    // Saved, then committed by the application.
    await panel.getByRole('button', { name: 'notes.md' }).click();
    await page.locator('.doc-page h1').click();
    await page.keyboard.press('End');
    await page.keyboard.type(' and plans');
    await page.locator('.header-actions').getByRole('button', { name: 'Save', exact: true }).click();
    const commit = page.getByRole('dialog', { name: 'Commit on main' });
    await expect(commit.getByLabel('Commit message')).toHaveValue('docs: update notes.md');
    await expect(commit.getByRole('checkbox', { name: /notes\.md/ })).toBeChecked();
    await commit.getByRole('button', { name: 'Commit' }).click();
    await expect(page.getByRole('alert')).toContainText('Committed 1 file(s) to main');

    // The history of the document, from the local commits.
    await panel.getByRole('button', { name: 'Git working copy, branch main' }).click();
    const menu = page.getByRole('dialog', { name: 'This folder is a Git working copy' });
    await menu.getByLabel('History of this document…').check();
    await menu.getByRole('button', { name: 'Continue' }).click();
    const history = page.getByRole('dialog', { name: /History of notes\.md/ });
    await expect(history.locator('.history-list > li')).toHaveCount(2);
    await expect(history).toContainText('docs: update notes.md');
    await expect(history).toContainText('docs: first');
    await history.getByRole('button', { name: 'Close' }).click();

    // Git agrees.
    rmSync(dir, { recursive: true, force: true });
    for (const [path, b64] of Object.entries(await getStorage(page))) {
      mkdirSync(join(dir, path, '..'), { recursive: true });
      writeFileSync(join(dir, path), Buffer.from(b64, 'base64'));
    }
    expect(git(dir, 'log', '--format=%s|%an')).toBe('docs: update notes.md|Ada\ndocs: first|Cli\n');
    expect(git(dir, 'status', '--porcelain')).toBe('');
    git(dir, 'fsck', '--strict');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
