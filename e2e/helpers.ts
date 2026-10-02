import { expect, type Page } from '@playwright/test';

/** Load the app with the File System Access API disabled (downloads are observable). */
export async function openApp(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (m) => { if (process.env.E2E_DEBUG) console.log('[browser]', m.type(), m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.addInitScript(() => {
    delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker;
  });
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Progressive Web Office' })).toBeVisible();
  return errors;
}

export async function openFile(page: Page, name: string, data: Buffer | string, mimeType = 'application/octet-stream'): Promise<void> {
  const chooser = page.waitForEvent('filechooser');
  await page.locator('.header-actions').getByRole('button', { name: 'Open', exact: true }).click();
  await (await chooser).setFiles({ name, mimeType, buffer: Buffer.isBuffer(data) ? data : Buffer.from(data) });
}

export async function saveAs(page: Page, label: string): Promise<{ name: string; data: Buffer }> {
  const download = page.waitForEvent('download');
  await page.getByLabel('Save as format').selectOption({ label });
  const d = await download;
  const stream = await d.createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  return { name: d.suggestedFilename(), data: Buffer.concat(chunks) };
}

/** Answer the window asking the user's name, the first time it is needed (SET-003). */
export async function answerName(page: Page, name: string): Promise<void> {
  const dialog = page.getByRole('dialog', { name: 'Your name, shown on your comments:' });
  await dialog.getByRole('textbox').fill(name);
  await dialog.getByRole('button', { name: 'OK' }).click();
}

/**
 * Packages of the Python distribution from a local folder (PYODIDE_PACKAGES)
 * when the Pyodide CDN is out of reach. The folder may hold the same wheels
 * from the Python package index: the lock file is then given their hashes.
 * False when neither the folder nor the network (CI) is there.
 */
export async function usePyodidePackages(page: Page): Promise<boolean> {
  const local = process.env.PYODIDE_PACKAGES;
  if (!local) return !!process.env.CI;
  const { readFileSync, readdirSync } = await import('node:fs');
  const { createHash } = await import('node:crypto');
  const files = new Set(readdirSync(local));
  await page.route('https://cdn.jsdelivr.net/pyodide/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop()!;
    if (!files.has(name)) return route.abort();
    return route.fulfill({ body: readFileSync(`${local}/${name}`), headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  await page.route('**/pyodide/pyodide-lock.json', async (route) => {
    const response = await route.fetch();
    const lock = (await response.json()) as { packages: Record<string, { file_name: string; sha256: string }> };
    for (const p of Object.values(lock.packages)) {
      if (files.has(p.file_name)) p.sha256 = createHash('sha256').update(readFileSync(`${local}/${p.file_name}`)).digest('hex');
    }
    return route.fulfill({ response, json: lock });
  });
  return true;
}
