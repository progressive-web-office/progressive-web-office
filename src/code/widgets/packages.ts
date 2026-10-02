/**
 * Python packages and widget modules for the code sandbox (CODE-016).
 *
 * - The widget packages (anywidget, ipywidgets, comm, psygnal) are bundled
 *   with the application (`public/python/`), checked against their SHA-256.
 * - Others come from where the code says, once the user agreed for that site:
 *   a wheel URL, a list of wheels (`wheel.txt`, one per line, relative to it,
 *   as in the anywidget instruments demos), or a project name of the Python
 *   package index (its pure-Python wheel). They are kept for offline use.
 */

const CACHE = 'pwo-python-packages';

const appUrl = (path: string): string => new URL(path, document.baseURI).href;

const hex = (buf: ArrayBuffer): string => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

let manifest: Promise<{ wheels: { file: string; sha256: string }[] }> | undefined;

/** A file of `public/python/`: the list, or a wheel checked against it. */
export async function bundledWheel(file: string): Promise<ArrayBuffer> {
  if (!/^[\w.+-]+$/.test(file)) throw new Error(`Not a bundled file: ${file}`);
  const get = async (name: string): Promise<ArrayBuffer> => {
    const r = await fetch(appUrl(`python/${name}`));
    if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
    return r.arrayBuffer();
  };
  if (file === 'wheels.json') return get(file);
  manifest ??= get('wheels.json').then((b) => JSON.parse(new TextDecoder().decode(b)) as { wheels: { file: string; sha256: string }[] });
  const entry = (await manifest).wheels.find((w) => w.file === file);
  if (!entry) throw new Error(`Not a bundled wheel: ${file}`);
  const bytes = await get(file);
  if (hex(await crypto.subtle.digest('SHA-256', bytes)) !== entry.sha256) throw new Error(`${file}: checksum mismatch`);
  return bytes;
}

/**
 * A download, from the cache when it was made before. A `fresh` answer (the
 * package index, which changes) is downloaded again, the cache serving offline.
 */
async function cachedFetch(url: string, fresh = false): Promise<ArrayBuffer> {
  let cache: Cache | undefined;
  try {
    cache = await caches.open(CACHE);
    const hit = fresh ? undefined : await cache.match(url);
    if (hit) return hit.arrayBuffer();
  } catch {
    cache = undefined;
  }
  let r: Response;
  try {
    r = await fetch(url);
  } catch (err) {
    const hit = await cache?.match(url);
    if (hit) return hit.arrayBuffer();
    throw err;
  }
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  const bytes = await r.arrayBuffer();
  try {
    await cache?.put(url, new Response(bytes.slice(0)));
  } catch {
    /* not kept */
  }
  return bytes;
}

export const isUrl = (spec: string): boolean => /^https?:\/\//i.test(spec);

/** The URLs a `wheel.txt` list names, relative to it; comments and blank lines skipped. */
export function wheelList(text: string, base: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/#.*/, '').trim())
    .filter(Boolean)
    .map((l) => new URL(l, base).href);
}

/** The pure-Python wheel of the latest release of a project, from the package index's answer. */
export function pureWheel(index: { urls?: { packagetype?: string; filename?: string; url?: string }[] }): string | undefined {
  return index.urls?.find((u) => u.packagetype === 'bdist_wheel' && /-py3-none-any\.whl$|-py2\.py3-none-any\.whl$/.test(u.filename ?? ''))?.url;
}

/**
 * The files `spec` stands for. `allow(url)` throws when the user refuses the
 * site. A widget module (`kind: 'module'`) is one file at a URL.
 */
export async function resolveSpec(spec: string, kind: 'python' | 'module', allow: (url: string) => Promise<void>): Promise<ArrayBuffer[]> {
  const get = async (url: string, fresh = false): Promise<ArrayBuffer> => {
    await allow(url);
    return cachedFetch(url, fresh);
  };
  if (kind === 'module' || /\.whl([?#].*)?$/i.test(spec)) {
    if (!isUrl(spec)) throw new Error(`Not a URL: ${spec}`);
    return [await get(spec)];
  }
  if (isUrl(spec)) {
    const list = wheelList(new TextDecoder().decode(await get(spec, true)), spec);
    const out: ArrayBuffer[] = [];
    for (const url of list) out.push(await get(url));
    return out;
  }
  if (!/^[A-Za-z0-9][\w.-]*$/.test(spec)) throw new Error(`Not a package name: ${spec}`);
  const index = `https://pypi.org/pypi/${encodeURIComponent(spec)}/json`;
  const info = JSON.parse(new TextDecoder().decode(await get(index, true))) as Parameters<typeof pureWheel>[0];
  const url = pureWheel(info);
  if (!url) throw new Error(`${spec}: no pure-Python wheel on the package index`);
  return [await get(url)];
}
