/**
 * Code worker, started inside the sandbox document (CODE-003). It must not
 * import anything: it is loaded from a blob: URL, so it cannot resolve
 * relative chunks. Every file it needs (Python runtime, packages) is asked
 * from the application through `postMessage`; the sandbox policy blocks any
 * other network access. (Small modules without imports of their own, like
 * `runtimes.ts`, are bundled into it.)
 */
import { CLANG_BASE, isCpp, RUNTIMES, textTable, umdModule, type Runtime } from './runtimes';
import { loadNoteTables, usesNoteTables, type NoteTables, type SqlFill } from './note-tables';
import { runWasi } from './wasi';
import { cSources, normalise, PROJECT_DIR, resolveModule, rewriteImports, type RunProject } from './project';
import { MARIMO_SHIM } from './marimo-shim';

interface RunRequest {
  type: 'run';
  id: number;
  lang: 'python' | 'javascript' | 'lua' | 'sql' | 'r' | 'cpp';
  code: string;
  /** CODE-019: the files of the project the code belongs to. */
  project?: RunProject;
  /** NOTE-002: the notes of the open folder, as tables of SQL. */
  notes?: NoteTables;
}
interface CompleteRequest {
  type: 'complete';
  id: number;
  code: string;
  line: number;
  column: number;
}
interface AnalyzeRequest {
  type: 'analyze';
  id: number;
  code: string;
}
interface ForgetRequest {
  type: 'forget';
  lang: 'python' | 'javascript';
  names: string[];
}
interface CommRequest {
  type: 'comm';
  comm_id: string;
  data: Record<string, unknown>;
  buffers?: ArrayBuffer[];
}
interface FetchReply {
  type: 'fetched';
  id: number;
  files?: ArrayBuffer[];
  error?: string;
}
interface FileReply {
  type: 'file';
  id: number;
  bytes?: ArrayBuffer;
  error?: string;
}

/** Fake base URL the Python runtime loads its files from; served by `fetch` below. */
const BASE = 'https://pyodide.invalid/';

const scope = self as unknown as {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  addEventListener(type: 'message', listener: (e: MessageEvent) => void): void;
  fetch: typeof fetch;
};

let nextFile = 0;
const waiting = new Map<number, { resolve(b: ArrayBuffer): void; reject(e: Error): void }>();

function requestFile(name: string): Promise<ArrayBuffer> {
  const id = ++nextFile;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    scope.postMessage({ type: 'file-request', id, name });
  });
}

// Not needed, and Pyodide refuses to start when it works (it takes it for an old-style worker).
(self as unknown as { importScripts: unknown }).importScripts = () => {
  throw new TypeError('importScripts is disabled in the sandbox');
};

const blockedFetch = scope.fetch.bind(scope);
scope.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!url.startsWith(BASE)) return blockedFetch(input, init); // refused by the sandbox policy
  const name = decodeURIComponent(url.slice(BASE.length).split(/[?#]/)[0]!);
  const bytes = await requestFile(name);
  const type = name.endsWith('.wasm') ? 'application/wasm' : name.endsWith('.json') ? 'application/json' : 'application/octet-stream';
  return new Response(bytes, { headers: { 'Content-Type': type } });
}) as typeof fetch;

const blobModule = (bytes: ArrayBuffer | string): string => URL.createObjectURL(new Blob([bytes], { type: 'text/javascript' }));

const report = (id: number, text: string): void => scope.postMessage({ type: 'status', id, text });

// --- projects (CODE-019) -------------------------------------------------------

/** The part of Emscripten's file system the runtimes share. */
interface EmFS {
  mkdir(path: string): void;
  writeFile(path: string, data: Uint8Array): void;
  readdir(path: string): string[];
  unlink(path: string): void;
  rmdir(path: string): void;
  stat(path: string): { mode: number };
  isDir(mode: number): boolean;
  chdir(path: string): void;
}

const dirOf = (p: string): string => p.slice(0, Math.max(0, p.lastIndexOf('/')));
/** The folder of the entry point in the sandbox. */
const entryDir = (project: RunProject): string => [PROJECT_DIR, dirOf(project.entry)].filter(Boolean).join('/');

function removeTree(fs: EmFS, path: string): void {
  let mode: number;
  try {
    mode = fs.stat(path).mode;
  } catch {
    return;
  }
  if (!fs.isDir(mode)) return fs.unlink(path);
  for (const name of fs.readdir(path)) if (name !== '.' && name !== '..') removeTree(fs, `${path}/${name}`);
  fs.rmdir(path);
}

/** Copy the project to /project (replacing the one of an earlier run), the working folder. */
function mountProject(fs: EmFS, project: RunProject): void {
  fs.chdir('/');
  removeTree(fs, PROJECT_DIR);
  fs.mkdir(PROJECT_DIR);
  const made = new Set<string>();
  for (const [path, bytes] of Object.entries(project.files)) {
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) {
      const dir = parts.slice(0, i).join('/');
      if (!made.has(dir)) fs.mkdir(`${PROJECT_DIR}/${dir}`);
      made.add(dir);
    }
    fs.writeFile(`${PROJECT_DIR}/${path}`, bytes);
  }
  fs.chdir(PROJECT_DIR);
}

/** A file of the project, named relative to it (the working folder). */
function projectFile(project: RunProject, path: string): Uint8Array {
  const p = normalise(path.startsWith(`${PROJECT_DIR}/`) ? path.slice(PROJECT_DIR.length + 1) : path);
  const bytes = p === undefined ? undefined : project.files[p];
  if (!bytes) throw new Error(`${path}: no such file in the project`);
  return bytes;
}

// --- Python -------------------------------------------------------------------

interface PyProxyLike {
  toJs?(): unknown;
  destroy?(): void;
  type?: string;
}
interface Pyodide {
  runPythonAsync(code: string): Promise<unknown>;
  registerJsModule(name: string, module: object): void;
  pyimport(name: string): unknown;
  loadPackage(names: string[], options?: { messageCallback?(m: string): void; errorCallback?(m: string): void }): Promise<unknown>;
  globals: { get(name: string): unknown; set(name: string, value: unknown): void };
  FS: EmFS;
  loadPackagesFromImports(code: string, options?: { messageCallback?(m: string): void; errorCallback?(m: string): void }): Promise<unknown>;
  setStdout(options: { batched(text: string): void }): void;
  setStderr(options: { batched(text: string): void }): void;
}

let python: Promise<Pyodide> | undefined;
/** Packages of the Python distribution. */
let lockNames = new Set<string>();

async function loadPython(id: number): Promise<Pyodide> {
  report(id, 'loading-python');
  const [loader, asm, lock] = await Promise.all([requestFile('pyodide.mjs'), requestFile('pyodide.asm.mjs'), requestFile('pyodide-lock.json')]);
  lockNames = new Set(Object.keys((JSON.parse(new TextDecoder().decode(lock)) as { packages: Record<string, unknown> }).packages));
  const { loadPyodide } = (await import(/* @vite-ignore */ blobModule(loader))) as { loadPyodide(options: object): Promise<Pyodide> };
  const { default: createPyodideModule } = (await import(/* @vite-ignore */ blobModule(asm))) as { default: unknown };
  return loadPyodide({
    indexURL: BASE,
    createPyodideModule,
    lockFileContents: new TextDecoder().decode(lock),
    packageBaseUrl: BASE,
    stdLibURL: `${BASE}python_stdlib.zip`,
    env: { MPLBACKEND: 'Agg' },
  });
}

/** Collect matplotlib figures as PNG files, then close them. */
const FIGURES = `
def _pwo_figures():
    import sys
    if "matplotlib.pyplot" not in sys.modules:
        return []
    import io
    import warnings
    import matplotlib.pyplot as plt
    out = []
    for n in plt.get_fignums():
        buf = io.BytesIO()
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            plt.figure(n).savefig(buf, format="png", dpi=100, bbox_inches="tight")
        out.append(buf.getvalue())
    plt.close("all")
    return out
_pwo_figures()
`;

/** CODE-019: the project's folders on the module path, its modules imported afresh, its arguments and input. */
const PROJECT_SETUP = `
def _pwo_project(entry, argv, stdin):
    import importlib, io, os, sys
    for name, module in list(sys.modules.items()):
        if str(getattr(module, "__file__", None) or "").startswith("${PROJECT_DIR}/"):
            del sys.modules[name]
    here = os.path.dirname(entry)
    sys.path[:] = [here, "${PROJECT_DIR}"] + [p for p in sys.path if p and not p.startswith("${PROJECT_DIR}")]
    sys.argv = [entry, *argv]
    sys.stdin = io.StringIO(stdin) if stdin is not None else sys.__stdin__
    importlib.invalidate_caches()
    return entry
`;

async function runPython(id: number, code: string, project?: RunProject): Promise<Output> {
  python ??= loadPython(id);
  const py = await python;
  if (project) {
    mountProject(py.FS, project);
    await py.runPythonAsync(PROJECT_SETUP);
    const setup = py.globals.get('_pwo_project') as (entry: string, argv: string[], stdin: string | null) => string;
    const stdin = project.config.stdin ? new TextDecoder().decode(projectFile(project, project.config.stdin)) : null;
    py.globals.set('__file__', setup(`${PROJECT_DIR}/${project.entry}`, project.config.args ?? [], stdin));
    // The packages the project's modules import are installed too.
    const imports = Object.entries(project.files).filter(([p]) => p.endsWith('.py')).map(([, b]) => new TextDecoder().decode(b)).join('\n');
    await py.loadPackagesFromImports(imports, { messageCallback: (m) => report(id, `packages:${m}`), errorCallback: () => undefined });
  }
  const out: string[] = [];
  py.setStdout({ batched: (t) => out.push(`${t}\n`) });
  py.setStderr({ batched: (t) => out.push(`${t}\n`) });
  // CODE-016: widgets (and the pwo module) are loaded when the code mentions them.
  if (WIDGET_CODE.test(code)) {
    try {
      await ensureWidgets(id);
    } catch (err) {
      out.push(`Widgets unavailable: ${(err as Error).message}\n`);
    }
  }
  // DOC-039: `import marimo` in a marimo notebook gets a small stand-in, unless marimo itself was installed.
  if (/\bmarimo\b/.test(code)) await py.runPythonAsync(MARIMO_SHIM);
  await py.loadPackagesFromImports(code, {
    messageCallback: (m) => report(id, `packages:${m}`),
    errorCallback: (m) => out.push(`${m}\n`),
  });
  report(id, 'running');
  let shown: string[] = [];
  try {
    const value = await py.runPythonAsync(code);
    // A widget on the last line is shown, not described.
    const isWidget = widgetsReady && value !== undefined && value !== null && typeof value === 'object' && (py.globals.get('_pwo_show') as (v: unknown) => boolean)(value);
    if (value !== undefined && value !== null && !isWidget) out.push(`${describe(value)}\n`);
  } catch (err) {
    return { text: out.join('') + pythonError(err), error: true, images: [], widgets: await takeDisplayed(py) };
  } finally {
    shown = await takeDisplayed(py);
  }
  const figures = (await py.runPythonAsync(FIGURES)) as PyProxyLike;
  const images = ((figures.toJs?.() as unknown[]) ?? []).map((b) => (b as Uint8Array).slice().buffer);
  figures.destroy?.();
  return { text: out.join(''), images, widgets: shown };
}


// --- completion (CODE-011) -------------------------------------------------------

/** jedi's completions, with the interpreter's names (variables of earlier cells, imported modules). */
const COMPLETE = `
def _pwo_complete(code, line, column):
    import json
    import __main__
    import jedi
    try:
        found = jedi.Interpreter(code, [__main__.__dict__]).complete(line, column)
    except Exception:
        return "[]"
    out = []
    for i, c in enumerate(found[:80]):
        item = {"name": c.name, "type": c.type}
        if i < 12:
            try:
                signatures = c.get_signatures()
                if signatures:
                    item["signature"] = signatures[0].to_string()
                doc = c.docstring(raw=True)
                if doc:
                    item["doc"] = doc[:800]
            except Exception:
                pass
        out.append(item)
    return json.dumps(out)
`;

let jedi: Promise<boolean> | undefined;

/** Completions from the running interpreter; null when Python was not started (it is not started for this). */
async function completePython(code: string, line: number, column: number): Promise<unknown[] | null> {
  if (!python) return null;
  const py = await python;
  jedi ??= py
    .loadPackagesFromImports('import jedi')
    .then(() => py.runPythonAsync(COMPLETE))
    .then(() => true, () => false);
  if (!(await jedi)) return null;
  // JSON strings are valid Python string literals.
  const result = await py.runPythonAsync(`_pwo_complete(${JSON.stringify(code)}, ${line | 0}, ${column | 0})`);
  return JSON.parse(String(result)) as unknown[];
}

// --- reactive cells (CODE-014) -----------------------------------------------------

/** Names a cell defines at its top level and names it uses, from Python's own symbol tables. */
const DEPS = `
def _pwo_deps(code):
    import json
    import symtable
    try:
        top = symtable.symtable(code, "<cell>", "exec")
    except SyntaxError:
        return "null"
    defs, refs = set(), set()
    for s in top.get_symbols():
        if s.is_assigned() or s.is_imported() or s.is_namespace():
            defs.add(s.get_name())
        if s.is_referenced():
            refs.add(s.get_name())
    def visit(table):
        for child in table.get_children():
            for s in child.get_symbols():
                if s.is_global():
                    if s.is_declared_global() and s.is_assigned():
                        defs.add(s.get_name())
                    if s.is_referenced():
                        refs.add(s.get_name())
            visit(child)
    visit(top)
    return json.dumps({"defs": sorted(defs), "refs": sorted(refs)})
`;

let deps: Promise<void> | undefined;

async function analyzePython(id: number, code: string): Promise<unknown> {
  python ??= loadPython(id);
  const py = await python;
  deps ??= py.runPythonAsync(DEPS).then(() => undefined);
  await deps;
  return JSON.parse(String(await py.runPythonAsync(`_pwo_deps(${JSON.stringify(code)})`))) as unknown;
}

/** Remove names no cell defines any more, so that no hidden state is left. */
async function forget(lang: 'python' | 'javascript', names: string[]): Promise<void> {
  if (lang === 'javascript') {
    const shared = (globalThis as unknown as { __pwoScope?: Record<string, unknown> }).__pwoScope;
    for (const n of names) if (shared) delete shared[n];
    return;
  }
  if (!python) return;
  const py = await python;
  await py.runPythonAsync(`import __main__\nfor _pwo_n in ${JSON.stringify(names)}:\n    __main__.__dict__.pop(_pwo_n, None)\ndel _pwo_n`);
}

function describe(value: unknown): string {
  const proxy = value as PyProxyLike & { toString(): string };
  const text = proxy.toString();
  proxy.destroy?.();
  return text;
}

/** Keep the user's part of a Python traceback. */
function pythonError(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.includes('File "<exec>"'));
  return (start > 0 ? ['Traceback (most recent call last):', ...lines.slice(start)] : lines).join('\n').trimEnd() + '\n';
}

// --- JavaScript ---------------------------------------------------------------

/** CODE-019: the project of the JavaScript being run, for `readText` and `readBytes`. */
let jsProject: RunProject | undefined;

/** The modules of a project as blob: URLs, their relative imports rewritten; the URL of the entry point. */
function projectModules(project: RunProject, code: string): string {
  const files = new Set(Object.keys(project.files));
  const urls = new Map<string, string>();
  const visiting = new Set<string>();
  const build = (path: string, source?: string): string => {
    const known = urls.get(path);
    if (known) return known;
    if (visiting.has(path)) throw new Error(`${path}: circular imports are not supported here`);
    visiting.add(path);
    let text = source ?? new TextDecoder().decode(project.files[path]);
    if (path.endsWith('.json')) text = `export default ${text};`;
    else
      text = rewriteImports(text, (spec) => {
        const target = resolveModule(files, path, spec);
        if (!target) throw new Error(`${path}: cannot find module "${spec}"`);
        return build(target);
      });
    const url = blobModule(text);
    urls.set(path, url);
    visiting.delete(path);
    return url;
  };
  return build(project.entry, code);
}

async function runJavaScript(id: number, code: string, project?: RunProject): Promise<Output> {
  report(id, 'running');
  jsProject = project;
  // CODE-014: the names shared by the JavaScript cells of the document.
  (globalThis as unknown as { __pwoScope?: object }).__pwoScope ??= {};
  const out: string[] = [];
  const format = (args: unknown[]): string =>
    args
      .map((a) => {
        if (typeof a === 'string') return a;
        try {
          return JSON.stringify(a) ?? String(a);
        } catch {
          return String(a);
        }
      })
      .join(' ');
  const original = { log: console.log, info: console.info, warn: console.warn, error: console.error };
  for (const k of Object.keys(original) as (keyof typeof original)[]) console[k] = (...args: unknown[]) => void out.push(`${format(args)}\n`);
  try {
    await import(/* @vite-ignore */ project ? projectModules(project, code) : blobModule(code));
    return { text: out.join(''), images: [], widgets: jsDisplayed.splice(0) };
  } catch (err) {
    const e = err as Error;
    return { text: `${out.join('')}${e?.name ?? 'Error'}: ${e?.message ?? String(err)}\n`, error: true, images: [] };
  } finally {
    Object.assign(console, original);
  }
}


// --- widgets (CODE-016) -----------------------------------------------------------

/** Code that uses widgets or the pwo module. */
const WIDGET_CODE = /\b(pwo|anywidget|ipywidgets)\b/;
let widgetsReady = false;
let widgets: Promise<void> | undefined;
/** The packages bundled with the application, in installation order. */
const BUNDLED = new Set(['anywidget', 'ipywidgets', 'comm', 'psygnal']);

let nextFetch = 0;
const fetches = new Map<number, { resolve(files: ArrayBuffer[]): void; reject(e: Error): void }>();

/** Files from a URL or the package index, through the application (which asks the user). */
function fetchFiles(spec: string, kind: 'python' | 'module'): Promise<ArrayBuffer[]> {
  const id = ++nextFetch;
  return new Promise((resolve, reject) => {
    fetches.set(id, { resolve, reject });
    scope.postMessage({ type: 'fetch-request', id, spec, kind });
  });
}

const GLUE = `
import _pwo_js
import pwo_widgets
from js import Object
from pyodide.ffi import to_js

def _pwo_send(payload, buffers):
    _pwo_js.send(to_js(payload, dict_converter=Object.fromEntries), to_js([memoryview(b) for b in buffers]))

async def _pwo_fetch(spec):
    files = await _pwo_js.fetch(spec)
    return [f.to_bytes() for f in files]

async def _pwo_load(names):
    await _pwo_js.load(to_js(list(names)))

def _pwo_show(value):
    return pwo_widgets.show(value)

def _pwo_receive(comm_id, data, buffers):
    return to_js(pwo_widgets.receive(comm_id, data.to_py(), [b.to_bytes() for b in buffers]))

pwo_widgets.install(_pwo_send)
pwo_widgets.module(_pwo_fetch, _pwo_load)
`;

/** Install the bundled widget packages and the bridge (once). */
function ensureWidgets(id: number): Promise<void> {
  widgets ??= (async () => {
    python ??= loadPython(id);
    const py = await python;
    report(id, 'packages:widgets');
    await py.loadPackage(['traitlets', 'ipython', 'typing-extensions'], { messageCallback: (m) => report(id, `packages:${m}`), errorCallback: (m) => report(id, `packages:${m}`) });
    const list = JSON.parse(new TextDecoder().decode(await requestFile('python/wheels.json'))) as { wheels: { file: string }[] };
    const bridge = new TextDecoder().decode(await requestFile('pwo_widgets.py'));
    // The bridge is a module of its own; the wheels are unpacked by it.
    (self as unknown as { __pwoBridge?: string }).__pwoBridge = bridge;
    await py.runPythonAsync(`
import sys, types
from js import __pwoBridge
_m = types.ModuleType("pwo_widgets")
exec(__pwoBridge, _m.__dict__)
sys.modules["pwo_widgets"] = _m
del _m
`);
    const bridgeModule = py.pyimport('pwo_widgets') as { unpack(data: Uint8Array): unknown };
    for (const w of list.wheels) bridgeModule.unpack(new Uint8Array(await requestFile(`python/${w.file}`)));
    py.registerJsModule('_pwo_js', {
      send(payload: { msg_type: string; comm_id: string; data: unknown; metadata: unknown }, buffers: Uint8Array[]) {
        const list = Array.from(buffers, (b) => b.slice().buffer);
        scope.postMessage({ type: 'comm', ...payload, buffers: list, transfer: list }, list);
      },
      fetch: async (spec: string) => (await fetchFiles(spec, 'python')).map((b) => new Uint8Array(b)),
      async load(names: string[]) {
        const wanted = Array.from(names);
        if (wanted.some((n) => BUNDLED.has(n))) await ensureWidgets(id);
        const known = wanted.filter((n) => lockNames.has(n) && !BUNDLED.has(n));
        if (known.length) await py.loadPackage(known, { messageCallback: () => undefined, errorCallback: (m) => console.warn(m) });
      },
    });
    await py.runPythonAsync(GLUE);
    widgetsReady = true;
  })();
  return widgets;
}

async function takeDisplayed(py: Pyodide): Promise<string[]> {
  const js = jsDisplayed.splice(0);
  if (!widgetsReady) return js;
  const taken = (await py.runPythonAsync('import pwo_widgets as _w; _w.take_displayed()')) as PyProxyLike;
  const ids = (taken.toJs?.() as string[]) ?? [];
  taken.destroy?.();
  return [...js, ...ids];
}

/** A message of a widget's front end. */
async function receiveComm(commId: string, data: Record<string, unknown>, buffers: ArrayBuffer[]): Promise<void> {
  const js = jsWidgets.get(commId);
  if (js) {
    const names = js.receive(data, buffers);
    if (names.length) scope.postMessage({ type: 'widget-changed', lang: 'javascript', names });
    return;
  }
  if (!widgetsReady || !python) return;
  const py = await python;
  const receive = py.globals.get('_pwo_receive') as (id: string, data: unknown, buffers: Uint8Array[]) => PyProxyLike | string[];
  const result = receive(commId, data, buffers.map((b) => new Uint8Array(b)));
  const names = Array.isArray(result) ? result : (((result as PyProxyLike).toJs?.() as string[]) ?? []);
  if (names.length) scope.postMessage({ type: 'widget-changed', lang: 'python', names });
}

// JavaScript widgets: an AFM module and its traits, from a JavaScript cell.

const jsWidgets = new Map<string, JsWidget>();
const jsDisplayed: string[] = [];
const isBinary = (v: unknown): v is ArrayBuffer | ArrayBufferView => v instanceof ArrayBuffer || ArrayBuffer.isView(v);

/** Top-level binary traits travel as buffers. */
function splitState(state: Record<string, unknown>): { state: Record<string, unknown>; buffer_paths: string[][]; buffers: ArrayBuffer[] } {
  const out: Record<string, unknown> = {};
  const buffer_paths: string[][] = [];
  const buffers: ArrayBuffer[] = [];
  for (const [k, v] of Object.entries(state)) {
    if (isBinary(v)) {
      buffer_paths.push([k]);
      buffers.push((v instanceof ArrayBuffer ? new Uint8Array(v) : new Uint8Array(v.buffer, v.byteOffset, v.byteLength)).slice().buffer);
      out[k] = null;
    } else out[k] = v;
  }
  return { state: out, buffer_paths, buffers };
}

class JsWidget {
  readonly model_id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
  private readonly state: Record<string, unknown>;
  private readonly handlers = new Map<string, ((...args: unknown[]) => void)[]>();
  reactive = false;

  constructor(esm: string, traits: Record<string, unknown> = {}, options: { css?: string; name?: string } = {}) {
    if (typeof esm !== 'string' || !esm.trim()) throw new TypeError('widget(esm, traits): esm is the text of the widget module');
    this.state = {
      _model_name: 'AnyModel',
      _model_module: 'anywidget',
      _view_name: 'AnyView',
      _view_module: 'anywidget',
      _esm: esm,
      _anywidget_id: options.name ?? 'pwo.js.widget',
      ...(options.css ? { _css: options.css } : {}),
      ...traits,
    };
    jsWidgets.set(this.model_id, this);
    this.post('comm_open', splitState(this.state));
  }

  private post(msg_type: string, data: { state?: Record<string, unknown>; buffer_paths?: string[][]; buffers?: ArrayBuffer[]; method?: string; content?: unknown }): void {
    const { buffers = [], ...rest } = data;
    scope.postMessage({ type: 'comm', msg_type, comm_id: this.model_id, data: rest, metadata: {}, buffers, transfer: buffers }, buffers);
  }

  get(key: string): unknown {
    return this.state[key];
  }

  set(key: string, value: unknown): void {
    this.state[key] = value;
    const { state, buffer_paths, buffers } = splitState({ [key]: value });
    this.post('comm_msg', { method: 'update', state, buffer_paths, buffers });
    this.emit(`change:${key}`, value);
    this.emit('change');
  }

  /** `change:<trait>`, `change` or `msg:custom`. */
  on(name: string, callback: (...args: unknown[]) => void): this {
    this.handlers.set(name, [...(this.handlers.get(name) ?? []), callback]);
    return this;
  }

  off(name?: string, callback?: (...args: unknown[]) => void): this {
    if (!name) this.handlers.clear();
    else this.handlers.set(name, callback ? (this.handlers.get(name) ?? []).filter((h) => h !== callback) : []);
    return this;
  }

  /** A custom message to the front end. */
  send(content: unknown, buffers: ArrayBuffer[] = []): void {
    this.post('comm_msg', { method: 'custom', content, buffers });
  }

  private emit(name: string, ...args: unknown[]): void {
    for (const h of this.handlers.get(name) ?? []) {
      try {
        h(...args);
      } catch (err) {
        console.error(err);
      }
    }
  }

  /** From the front end; the names of the cells' scope to re-run for (`ui`). */
  receive(data: Record<string, unknown>, buffers: ArrayBuffer[]): string[] {
    if (data.method === 'update' && data.state && typeof data.state === 'object') {
      const patch = { ...(data.state as Record<string, unknown>) };
      ((data.buffer_paths as (string | number)[][]) ?? []).forEach((path, i) => {
        if (path.length === 1 && buffers[i]) patch[String(path[0])] = new DataView(buffers[i]!);
      });
      // Front ends often write back what they were given: only real changes count.
      const changed = Object.keys(patch).filter((k) => JSON.stringify(this.state[k]) !== JSON.stringify(patch[k]) || isBinary(patch[k]));
      Object.assign(this.state, patch);
      for (const k of changed) this.emit(`change:${k}`, patch[k]);
      if (changed.length) this.emit('change');
      if (!this.reactive || !changed.length) return [];
      const shared = (globalThis as unknown as { __pwoScope?: Record<string, unknown> }).__pwoScope ?? {};
      return Object.keys(shared).filter((k) => shared[k] === this && !k.startsWith('_'));
    }
    if (data.method === 'custom') this.emit('msg:custom', data.content, buffers.map((b) => new DataView(b)));
    return [];
  }
}

Object.assign(globalThis, {
  /** `widget(esm, traits, { css })`: a widget from the text of an AFM module. */
  widget: (esm: string, traits?: Record<string, unknown>, options?: { css?: string; name?: string }) => new JsWidget(esm, traits, options),
  /** Show widgets below the cell (other values are printed). */
  display: (...values: unknown[]) => {
    for (const v of values) {
      if (v instanceof JsWidget) jsDisplayed.push(v.model_id);
      else console.log(v);
    }
  },
  /** Re-run the cells using this widget when the user changes it. */
  ui: <T>(w: T): T => {
    if (w instanceof JsWidget) w.reactive = true;
    return w;
  },
  /** The text of a widget module (or any text file) from a URL, after the user agreed. */
  /** CODE-019: a file of the project, relative to it. */
  readText: (path: string): string => {
    if (!jsProject) throw new Error('readText: the file is not part of an open folder');
    return new TextDecoder().decode(projectFile(jsProject, path));
  },
  readBytes: (path: string): Uint8Array => {
    if (!jsProject) throw new Error('readBytes: the file is not part of an open folder');
    return projectFile(jsProject, path).slice();
  },
  importWidget: async (url: string): Promise<string> => new TextDecoder().decode((await fetchFiles(url, 'module'))[0]),
});

// --- runtimes downloaded when needed (CODE-018) ---------------------------------

/** The files of a runtime, downloaded (or read from the cache) after the user agreed, and checked. */
async function runtimeFiles(id: number, rt: Runtime): Promise<Record<string, ArrayBuffer>> {
  const out: Record<string, ArrayBuffer> = {};
  for (const [key, file] of Object.entries(rt.files)) {
    report(id, `packages:${rt.name} (${rt.size})`);
    // Checked against its SHA-256 by the application.
    const [bytes] = await fetchFiles(file.url, 'module');
    if (!bytes) throw new Error(`${file.url}: not available`);
    out[key] = bytes;
  }
  return out;
}

const umdImport = async <T>(bytes: ArrayBuffer): Promise<T> => ((await import(/* @vite-ignore */ blobModule(umdModule(new TextDecoder().decode(bytes))))) as { default: T }).default;

interface LuaEngine {
  global: { set(name: string, value: unknown): void };
  doString(code: string): Promise<unknown>;
}
let lua: Promise<LuaEngine> | undefined;
let luaFs: EmFS | undefined;
let luaOut: ((s: string) => void) | undefined;

async function runLua(id: number, code: string, project?: RunProject): Promise<Output> {
  lua ??= (async () => {
    const files = await runtimeFiles(id, RUNTIMES.lua);
    const { LuaFactory } = await umdImport<{ LuaFactory: new (wasm: string) => { createEngine(): Promise<LuaEngine>; getLuaModule(): Promise<{ module: { FS: EmFS } }> } }>(files.js!);
    const factory = new LuaFactory(URL.createObjectURL(new Blob([files.wasm!], { type: 'application/wasm' })));
    const engine = await factory.createEngine();
    luaFs = (await factory.getLuaModule()).module.FS;
    engine.global.set('__pwo_out', (s: string) => luaOut?.(s));
    // print and io.write go to the output, values shown as Lua's tostring does.
    await engine.doString(
      "print = function(...) local t = {} for i = 1, select('#', ...) do t[#t + 1] = tostring((select(i, ...))) end __pwo_out(table.concat(t, '\\t') .. '\\n') end\n" +
        "io.write = function(...) for i = 1, select('#', ...) do __pwo_out(tostring((select(i, ...)))) end end",
    );
    return engine;
  })();
  lua.catch(() => (lua = undefined));
  const engine = await lua;
  report(id, 'running');
  const out: string[] = [];
  luaOut = (s) => out.push(s);
  try {
    if (project && luaFs) {
      // CODE-019: require finds the project's modules (loaded afresh), io.open its files; arg holds the arguments.
      mountProject(luaFs, project);
      const here = entryDir(project);
      engine.global.set('__pwo_args', [`${PROJECT_DIR}/${project.entry}`, ...(project.config.args ?? [])]);
      await engine.doString(
        `__pwo_default_path = __pwo_default_path or package.path\nlocal path = "${here}/?.lua;${here}/?/init.lua;${PROJECT_DIR}/?.lua;${PROJECT_DIR}/?/init.lua"\n` +
          'for name in pairs(package.loaded) do if package.searchpath(name, path) then package.loaded[name] = nil end end\n' +
          'package.path = path .. ";" .. __pwo_default_path\n' +
          'arg = {} for i, v in ipairs(__pwo_args) do arg[i - 1] = v end',
      );
    }
    const value = await engine.doString(code);
    if (value !== undefined && value !== null) out.push(`${describe(value)}\n`);
    return { text: out.join(''), images: [] };
  } catch (err) {
    return { text: `${out.join('')}${(err as Error)?.message ?? String(err)}\n`, error: true, images: [] };
  } finally {
    luaOut = undefined;
  }
}

interface SqlDatabase extends SqlFill {
  exec(sql: string): { columns: string[]; values: unknown[][] }[];
  getRowsModified(): number;
}
let sqlDb: Promise<SqlDatabase> | undefined;
let SqlDatabaseClass: (new (data?: Uint8Array) => SqlDatabase) | undefined;

async function runSql(id: number, code: string, project?: RunProject, notes?: NoteTables): Promise<Output> {
  sqlDb ??= (async () => {
    const files = await runtimeFiles(id, RUNTIMES.sql);
    const init = await umdImport<(config: object) => Promise<{ Database: new (data?: Uint8Array) => SqlDatabase }>>(files.js!);
    const SQL = await init({ wasmBinary: files.wasm });
    SqlDatabaseClass = SQL.Database;
    return new SQL.Database();
  })();
  sqlDb.catch(() => (sqlDb = undefined));
  let db = await sqlDb;
  report(id, 'running');
  try {
    // CODE-019: `.read file.sql` runs a file of the project, `.open file.db` opens a database of it (a copy).
    if (project) {
      code = code.replace(/^[ \t]*\.read[ \t]+(\S+)[ \t]*$/gm, (_all, path: string) => new TextDecoder().decode(projectFile(project, path)));
      const open = /^[ \t]*\.open[ \t]+(\S+)[ \t]*$/m.exec(code);
      if (open) {
        db = new SqlDatabaseClass!(projectFile(project, open[1]!));
        sqlDb = Promise.resolve(db);
        code = code.replace(open[0], '');
      }
    } else if (/^[ \t]*\.(read|open)\b/m.test(code)) throw new Error('.read and .open need the file to be part of an open folder');
    // NOTE-002: the notes of the folder, made again for each query naming them.
    if (notes && usesNoteTables(code)) loadNoteTables(db, notes);
    const results = db.exec(code);
    const text = results.length ? results.map((r) => textTable(r.columns, r.values)).join('\n\n') : `OK, ${db.getRowsModified()} row(s) changed`;
    return { text: `${text}\n`, images: [] };
  } catch (err) {
    return { text: `${(err as Error)?.message ?? String(err)}\n`, error: true, images: [] };
  }
}

type Tree = Record<string, Uint8Array | string | object>;
type RunClang = (args: string[], files: Tree, options: { stdout(b: Uint8Array | null): void; stderr(b: Uint8Array | null): void; decodeASCII?: boolean }) => Promise<Tree>;
let clang: Promise<RunClang> | undefined;

/** C/C++: compiled by Clang to WebAssembly, then run with a small WASI (output only). */
/** CODE-019: files of the project as the nested folders the compiler takes. */
function tree(files: Record<string, Uint8Array>): Tree {
  const root: Tree = {};
  for (const [path, bytes] of Object.entries(files)) {
    const parts = path.split('/');
    let dir = root;
    for (const part of parts.slice(0, -1)) dir = (dir[part] ??= {}) as Tree;
    dir[parts[parts.length - 1]!] = bytes;
  }
  return root;
}

async function runCpp(id: number, code: string, project?: RunProject): Promise<Output> {
  clang ??= (async () => {
    report(id, `packages:${RUNTIMES.cpp.name} (${RUNTIMES.cpp.size})`);
    // The toolchain's own downloads go through the application too (asked, checked, kept offline).
    const native = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (!url.startsWith(CLANG_BASE)) return native(input, init);
      report(id, `packages:${url.slice(CLANG_BASE.length)}`);
      const [bytes] = await fetchFiles(url, 'module');
      return new Response(bytes, { headers: { 'content-type': url.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream', 'content-length': String(bytes!.byteLength) } });
    }) as typeof fetch;
    const [bundle] = await fetchFiles(RUNTIMES.cpp.files.js!.url, 'module');
    const source = new TextDecoder().decode(bundle).replaceAll('import.meta.url', JSON.stringify(`${CLANG_BASE}bundle.js`));
    const mod = (await import(/* @vite-ignore */ blobModule(source))) as { runClang: RunClang };
    return mod.runClang;
  })();
  clang.catch(() => (clang = undefined));
  const runClang = await clang;
  report(id, 'running');
  const sources = project ? cSources(project) : [];
  const cpp = project ? sources.some((s) => !/\.c$/i.test(s)) : isCpp(code);
  const source = project ? project.entry : cpp ? 'main.cpp' : 'main.c';
  const flags = project?.config.cflags ?? ['-O2'];
  const includes = project ? [`-I${dirOf(project.entry) || '.'}`, '-I.'] : [];
  const inputs: Tree = project ? tree({ ...project.files, [project.entry]: new TextEncoder().encode(code) }) : { [source]: code };
  const log: string[] = [];
  const dec = new TextDecoder();
  const collect = (b: Uint8Array | null): void => void (b && log.push(dec.decode(b, { stream: true })));
  let program: Uint8Array;
  try {
    // The C++ library of WASI has no exceptions.
    const files = await runClang([...(cpp ? ['clang++', '-fno-exceptions'] : ['clang']), ...flags, ...includes, ...(project ? sources : [source]), '-o', 'main.wasm'], inputs, { stdout: collect, stderr: collect, decodeASCII: false });
    program = files['main.wasm'] as Uint8Array;
  } catch (err) {
    return { text: `${log.join('') || (err as Error)?.message || String(err)}\n`, error: true, images: [] };
  }
  // Warnings of the compiler come first.
  const out: string[] = log.length ? [log.join('')] : [];
  try {
    const name = source.replace(/^.*\//, '').replace(/\..*/, '');
    const fs = project && { files: project.files, cwd: '', stdin: project.config.stdin ? projectFile(project, project.config.stdin) : undefined };
    const status = runWasi(await WebAssembly.compile(program as BufferSource), [name, ...(project?.config.args ?? [])], (_fd, text) => out.push(text), fs || undefined);
    if (status !== 0) out.push(`\n(exit status ${status})\n`);
    return { text: out.join(''), images: [], ...(status !== 0 ? { error: true } : {}) };
  } catch (err) {
    return { text: `${out.join('')}${(err as Error)?.message ?? String(err)}\n`, error: true, images: [] };
  }
}

// --- protocol -----------------------------------------------------------------

interface Output {
  text: string;
  error?: boolean;
  images: ArrayBuffer[];
  /** CODE-016: models of the widgets the cell shows. */
  widgets?: string[];
}

let queue: Promise<unknown> = Promise.resolve();

scope.addEventListener('message', (event: MessageEvent) => {
  const message = event.data as RunRequest | FileReply | CompleteRequest | AnalyzeRequest | ForgetRequest | CommRequest | FetchReply;
  if (message.type === 'comm') {
    // From a widget's front end, after the cells already queued.
    queue = queue.then(() => receiveComm(message.comm_id, message.data, message.buffers ?? []).catch((err) => console.error(err)));
    return;
  }
  if (message.type === 'fetched') {
    const f = fetches.get(message.id);
    fetches.delete(message.id);
    if (message.files) f?.resolve(message.files);
    else f?.reject(new Error(message.error ?? 'Download refused'));
    return;
  }
  if (message.type === 'analyze' || message.type === 'forget') {
    // Queued with the cells: the analysis and the cleaning come before the runs that follow.
    queue = queue.then(async () => {
      if (message.type === 'forget') return forget(message.lang, message.names).catch(() => undefined);
      const result = await analyzePython(message.id, message.code).catch(() => null);
      scope.postMessage({ type: 'deps', id: message.id, deps: result });
    });
    return;
  }
  if (message.type === 'complete') {
    // Not queued after the cells: while one runs, completion simply waits.
    void completePython(message.code, message.line, message.column).then(
      (items) => scope.postMessage({ type: 'completions', id: message.id, items }),
      () => scope.postMessage({ type: 'completions', id: message.id, items: null }),
    );
    return;
  }
  if (message.type === 'file') {
    const w = waiting.get(message.id);
    waiting.delete(message.id);
    if (message.bytes) w?.resolve(message.bytes);
    else w?.reject(new Error(message.error ?? 'File unavailable'));
    return;
  }
  if (message.type === 'run') {
    // Cells run one after the other, sharing the Python interpreter.
    queue = queue.then(async () => {
      let output: Output;
      try {
        output =
          message.lang === 'python'
            ? await runPython(message.id, message.code, message.project)
            : message.lang === 'lua'
              ? await runLua(message.id, message.code, message.project)
              : message.lang === 'sql'
                ? await runSql(message.id, message.code, message.project, message.notes)
                : message.lang === 'cpp'
                  ? await runCpp(message.id, message.code, message.project)
                  : await runJavaScript(message.id, message.code, message.project);
      } catch (err) {
        output = { text: `${(err as Error)?.message ?? String(err)}\n`, error: true, images: [] };
      }
      scope.postMessage({ type: 'result', id: message.id, ...output, transfer: output.images }, output.images);
    });
  }
});

scope.postMessage({ type: 'worker-ready' });

export {};
