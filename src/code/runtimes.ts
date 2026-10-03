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
const CLANG = '@yowasp/clang@22.0.0-git20542-10';

export const RUNTIMES: Record<'lua' | 'sql' | 'cpp', Runtime> = {
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
  // Clang and LLD compiled to WebAssembly (YoWASP); the bundle fetches the other files itself.
  cpp: {
    name: 'Clang/LLD 22 (YoWASP)',
    size: '105 MB',
    files: {
      js: { url: jsdelivr(CLANG, 'gen/bundle.js'), sha256: 'c7ce70fb627eedc9bd6159928743da85eac7b4729aa2e776ae3771ae76c91dd6' },
      'llvm-resources.tar': { url: jsdelivr(CLANG, 'gen/llvm-resources.tar'), sha256: '79eef0c336fe55cf03ff8f5b42b784c8168f929a3603138b2c6301f4601e4c86' },
      'llvm.core.wasm': { url: jsdelivr(CLANG, 'gen/llvm.core.wasm'), sha256: '24fbed474c7b5b4968fd73fc4827440b93fb351c1b6264516130300eff3e7bf5' },
      'llvm.core2.wasm': { url: jsdelivr(CLANG, 'gen/llvm.core2.wasm'), sha256: '960c326eb9b5db7aedbc169540421587a2d3f3ff987e93d6ad5b4da43430ffd4' },
      'llvm.core3.wasm': { url: jsdelivr(CLANG, 'gen/llvm.core3.wasm'), sha256: '63680c043192abac4700bbda6a78e4c19b139fa086b1e872d1c6915d37a428a8' },
      'llvm.core4.wasm': { url: jsdelivr(CLANG, 'gen/llvm.core4.wasm'), sha256: 'f544dc9cc46f88a0f22d1b839a4fb0853dce2d6e231d880bd19754c59a5a234d' },
    },
  },
};

/** Where the files of the C/C++ toolchain are; its bundle asks for them relative to this. */
export const CLANG_BASE = `https://cdn.jsdelivr.net/npm/${CLANG}/gen/`;

/** C++ rather than C: what the code uses tells. */
export const isCpp = (code: string): boolean => /#\s*include\s*<(iostream|vector|string|map|set|algorithm|memory|sstream|fstream|iomanip|array|cmath|cstdio|cstdlib)>|\bstd::|\bnamespace\b|\btemplate\s*<|\bclass\s+\w+\s*[{:]|\bcout\b/.test(code);

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
