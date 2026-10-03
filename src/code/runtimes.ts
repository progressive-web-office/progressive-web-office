/**
 * Language runtimes downloaded when first needed (CODE-018): Lua, SQL, R and
 * C/C++ are not part of the application. The first run of such code asks the
 * user before downloading the runtime from its CDN (pinned versions, files
 * checked against their SHA-256); it is then kept in the browser for offline
 * use, like the Python packages.
 */

export type RuntimeLang = 'lua' | 'sql' | 'r' | 'cpp';

export interface RuntimeFile {
  url: string;
  /** SHA-256 of the file, hex; the download is refused when it differs. */
  sha256: string;
}

export interface Runtime {
  name: string;
  /** Approximate download, for the user. */
  size: string;
  files: Record<string, RuntimeFile>;
}

const jsdelivr = (pkg: string, path: string): string => `https://cdn.jsdelivr.net/npm/${pkg}/${path}`;

export const RUNTIMES: Record<'lua' | 'sql', Runtime> = {
  lua: {
    name: 'Lua 5.4 (wasmoon 1.16.0)',
    size: '0.5 MB',
    files: {
      js: { url: jsdelivr('wasmoon@1.16.0', 'dist/index.js'), sha256: 'dc2dcf019449008bb224370052473dc760db28b3ba14fc604e1ca3e8646af35d' },
      wasm: { url: jsdelivr('wasmoon@1.16.0', 'dist/glue.wasm'), sha256: '95f3f19ddb740125883bc41d5ec670cd0828e7b58c8bdad385323cbff497b55c' },
    },
  },
  sql: {
    name: 'SQLite 3 (sql.js 1.14.2)',
    size: '0.7 MB',
    files: {
      js: { url: jsdelivr('sql.js@1.14.2', 'dist/sql-wasm.js'), sha256: 'f1c84000dbc856c9d87f4f3aabc4d3654bd436165db4be3da13751db3a9c20d7' },
      wasm: { url: jsdelivr('sql.js@1.14.2', 'dist/sql-wasm.wasm'), sha256: '38c14f6e379210bc942bdc4ebca44e7bfdb4318ecc1c72ca666a28fdce96670a' },
    },
  },
};

/** The SHA-256 expected for a runtime file, by URL. */
export function runtimeHash(url: string): string | undefined {
  for (const rt of Object.values(RUNTIMES)) for (const f of Object.values(rt.files)) if (f.url === url) return f.sha256;
  return undefined;
}

/** Languages of source files, by extension. */
export function runtimeOf(fileName: string): RuntimeLang | undefined {
  if (/\.lua$/i.test(fileName)) return 'lua';
  if (/\.sql$/i.test(fileName)) return 'sql';
  if (/\.r$/i.test(fileName)) return 'r';
  if (/\.(c|cc|cpp|cxx|c\+\+)$/i.test(fileName)) return 'cpp';
  return undefined;
}

/** A UMD script (sql.js, wasmoon) as an ES module exporting what it defines. */
export function umdModule(code: string): string {
  return `let module = { exports: {} }; let exports = module.exports;\n${code}\nexport default module.exports;\n`;
}

/** A query result as a text table. */
export function textTable(columns: string[], rows: unknown[][]): string {
  const cell = (v: unknown): string => (v === null || v === undefined ? 'NULL' : v instanceof Uint8Array ? `<${v.length} bytes>` : String(v));
  const cells = rows.map((r) => r.map(cell));
  const widths = columns.map((c, i) => Math.max(c.length, ...cells.map((r) => r[i]!.length)));
  const line = (vals: string[]): string => vals.map((v, i) => v.padEnd(widths[i]!)).join(' | ').trimEnd();
  return [line(columns), widths.map((w) => '-'.repeat(w)).join('-+-'), ...cells.map(line), `(${rows.length} row${rows.length === 1 ? '' : 's'})`].join('\n');
}
