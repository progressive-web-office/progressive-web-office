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
