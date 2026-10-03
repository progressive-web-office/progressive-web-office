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

/**
 * CODE-018: serve the runtimes downloaded from the npm CDN from a local folder
 * of unpacked npm packages (`RUNTIME_PACKAGES`, e.g. wasmoon-1.16.0/package/…),
 * where the network is unavailable. Without it, the tests need the network (CI).
 */
export async function useRuntimePackages(page: Page): Promise<boolean> {
  const local = process.env.RUNTIME_PACKAGES;
  if (!local) return !!process.env.CI;
  const { readFileSync, existsSync } = await import('node:fs');
  await page.route('https://cdn.jsdelivr.net/npm/**', (route) => {
    // /npm/<name>@<version>/<path> → <local>/<name>-<version>/package/<path>
    const m = /^\/npm\/((?:@[^/]+\/)?[^@/]+)@([^/]+)\/(.+)$/.exec(new URL(route.request().url()).pathname);
    const file = m && `${local}/${m[1]!.replace(/^@/, '').replace('/', '-')}-${m[2]}/package/${m[3]}`;
    if (!file || !existsSync(file)) return route.abort();
    return route.fulfill({ body: readFileSync(file), headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  return true;
}

/** CODE-018: serve webR from the unpacked npm package (`RUNTIME_PACKAGES/webr-<version>/package/dist`). */
export async function useWebR(page: Page): Promise<boolean> {
  const local = process.env.RUNTIME_PACKAGES;
  if (!local) return !!process.env.CI;
  const { readFileSync, existsSync } = await import('node:fs');
  await page.context().route('https://webr.r-wasm.org/**', (route) => {
    const m = /^\/v([^/]+)\/(.+)$/.exec(new URL(route.request().url()).pathname);
    // The CDN's webr.mjs is the browser build, webr.js in the npm package.
    const file = m && `${local}/webr-${m[1]}/package/dist/${m[2] === 'webr.mjs' ? 'webr.js' : m[2]}`;
    if (!file || !existsSync(file)) return route.fulfill({ status: 404, body: '' });
    const type = file.endsWith('.mjs') || file.endsWith('.js') ? 'text/javascript' : file.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream';
    return route.fulfill({ body: readFileSync(file), headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': type } });
  });
  return true;
}

/** An in-memory folder behind window.showDirectoryPicker (FOLDER-001); files are exposed as window.__folder. */
export async function fakeFolder(page: Page, files: Record<string, string>): Promise<void> {
  await page.addInitScript((initial: Record<string, string>) => {
    delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker;
    const store = new Map<string, string>(Object.entries(initial));
    (window as unknown as { __folder: Map<string, string> }).__folder = store;
    const fileHandle = (path: string) => ({
      kind: 'file',
      name: path.split('/').pop(),
      getFile: async () => new File([store.get(path) ?? ''], path.split('/').pop()!),
      createWritable: async () => {
        const parts: (Uint8Array | Blob)[] = [];
        return {
          write: async (d: Uint8Array | Blob) => void parts.push(d),
          close: async () => {
            const d = parts[0] ?? new Uint8Array();
            store.set(path, d instanceof Blob ? await d.text() : new TextDecoder().decode(d));
          },
        };
      },
    });
    const dirHandle = (prefix: string, name: string): unknown => ({
      kind: 'directory',
      name,
      async *values() {
        const seen = new Set<string>();
        for (const path of store.keys()) {
          if (!path.startsWith(prefix)) continue;
          const rest = path.slice(prefix.length);
          const head = rest.split('/')[0]!;
          if (seen.has(head)) continue;
          seen.add(head);
          yield rest.includes('/') ? dirHandle(`${prefix}${head}/`, head) : fileHandle(path);
        }
      },
      getDirectoryHandle: async (n: string, opts: { create?: boolean } = {}) => {
        if (!opts.create && ![...store.keys()].some((k) => k.startsWith(`${prefix}${n}/`))) throw Object.assign(new Error('NotFoundError'), { name: 'NotFoundError' });
        return dirHandle(`${prefix}${n}/`, n);
      },
      getFileHandle: async (n: string, opts: { create?: boolean } = {}) => {
        if (!opts.create && !store.has(`${prefix}${n}`)) throw Object.assign(new Error('NotFoundError'), { name: 'NotFoundError' });
        if (opts.create && !store.has(`${prefix}${n}`)) store.set(`${prefix}${n}`, '');
        return fileHandle(`${prefix}${n}`);
      },
      removeEntry: async (n: string) => {
        for (const k of [...store.keys()]) if (k === `${prefix}${n}` || k.startsWith(`${prefix}${n}/`)) store.delete(k);
      },
      queryPermission: async () => 'granted',
    });
    (window as unknown as { showDirectoryPicker: () => Promise<unknown> }).showDirectoryPicker = async () => dirHandle('', 'thesis');
  }, files);
  await page.goto('./');
}

export async function openLocalFolder(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Open a folder' }).click();
  const dialog = page.getByRole('dialog', { name: 'Open a folder' });
  await dialog.getByLabel('A folder of this device').check();
  await dialog.getByRole('button', { name: 'Open' }).click();
}
