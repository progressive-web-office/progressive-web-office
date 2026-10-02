/**
 * Code worker, started inside the sandbox document (CODE-003). It must not
 * import anything: it is loaded from a blob: URL, so it cannot resolve
 * relative chunks. Every file it needs (Python runtime, packages) is asked
 * from the application through `postMessage`; the sandbox policy blocks any
 * other network access.
 */

interface RunRequest {
  type: 'run';
  id: number;
  lang: 'python' | 'javascript';
  code: string;
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

// --- Python -------------------------------------------------------------------

interface PyProxyLike {
  toJs?(): unknown;
  destroy?(): void;
  type?: string;
}
interface Pyodide {
  runPythonAsync(code: string): Promise<unknown>;
  loadPackagesFromImports(code: string, options?: { messageCallback?(m: string): void; errorCallback?(m: string): void }): Promise<unknown>;
  setStdout(options: { batched(text: string): void }): void;
  setStderr(options: { batched(text: string): void }): void;
}

let python: Promise<Pyodide> | undefined;

async function loadPython(id: number): Promise<Pyodide> {
  report(id, 'loading-python');
  const [loader, asm, lock] = await Promise.all([requestFile('pyodide.mjs'), requestFile('pyodide.asm.mjs'), requestFile('pyodide-lock.json')]);
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

async function runPython(id: number, code: string): Promise<Output> {
  python ??= loadPython(id);
  const py = await python;
  const out: string[] = [];
  py.setStdout({ batched: (t) => out.push(`${t}\n`) });
  py.setStderr({ batched: (t) => out.push(`${t}\n`) });
  await py.loadPackagesFromImports(code, {
    messageCallback: (m) => report(id, `packages:${m}`),
    errorCallback: (m) => out.push(`${m}\n`),
  });
  report(id, 'running');
  try {
    const value = await py.runPythonAsync(code);
    if (value !== undefined && value !== null) out.push(`${describe(value)}\n`);
  } catch (err) {
    return { text: out.join('') + pythonError(err), error: true, images: [] };
  }
  const figures = (await py.runPythonAsync(FIGURES)) as PyProxyLike;
  const images = ((figures.toJs?.() as unknown[]) ?? []).map((b) => (b as Uint8Array).slice().buffer);
  figures.destroy?.();
  return { text: out.join(''), images };
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

async function runJavaScript(id: number, code: string): Promise<Output> {
  report(id, 'running');
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
    await import(/* @vite-ignore */ blobModule(code));
    return { text: out.join(''), images: [] };
  } catch (err) {
    const e = err as Error;
    return { text: `${out.join('')}${e?.name ?? 'Error'}: ${e?.message ?? String(err)}\n`, error: true, images: [] };
  } finally {
    Object.assign(console, original);
  }
}

// --- protocol -----------------------------------------------------------------

interface Output {
  text: string;
  error?: boolean;
  images: ArrayBuffer[];
}

let queue: Promise<unknown> = Promise.resolve();

scope.addEventListener('message', (event: MessageEvent) => {
  const message = event.data as RunRequest | FileReply | CompleteRequest | AnalyzeRequest | ForgetRequest;
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
        output = message.lang === 'python' ? await runPython(message.id, message.code) : await runJavaScript(message.id, message.code);
      } catch (err) {
        output = { text: `${(err as Error)?.message ?? String(err)}\n`, error: true, images: [] };
      }
      scope.postMessage({ type: 'result', id: message.id, ...output, transfer: output.images }, output.images);
    });
  }
});

scope.postMessage({ type: 'worker-ready' });

export {};
