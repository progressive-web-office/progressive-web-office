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
  const message = event.data as RunRequest | FileReply | CompleteRequest;
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
