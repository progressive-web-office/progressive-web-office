/**
 * TypeScript language service (CODE-012), in a worker: completions with
 * types and documentation, type errors and the type of what is under the
 * pointer, for TypeScript and JavaScript. Loaded on first use; the standard
 * library declarations it needs are loaded with it.
 */
import ts from 'typescript-service';

const LIBS = import.meta.glob<string>('/node_modules/typescript-service/lib/lib.*.d.ts', { query: '?raw', import: 'default' });
/** The standard library of a browser script. */
const ROOT_LIBS = ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'];

const files = new Map<string, { text: string; version: number }>();

/** Load a library file and those it refers to (`/// <reference lib="…" />`). */
async function loadLib(name: string): Promise<void> {
  const path = `/${name}`;
  if (files.has(path)) return;
  const load = LIBS[`/node_modules/typescript-service/lib/${name}`];
  if (!load) return;
  files.set(path, { text: '', version: 0 });
  const text = await load();
  files.set(path, { text, version: 1 });
  const refs = [...text.matchAll(/\/\/\/\s*<reference\s+lib="([^"]+)"/g)].map((m) => `lib.${m[1]!.toLowerCase()}.d.ts`);
  await Promise.all(refs.map(loadLib));
}

const ready = Promise.all(ROOT_LIBS.map(loadLib));

const options: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  moduleDetection: ts.ModuleDetectionKind.Force,
  lib: ROOT_LIBS,
  allowJs: true,
  checkJs: false,
  strict: true,
  noEmit: true,
  jsx: ts.JsxEmit.Preserve,
  skipLibCheck: true,
};

const host: ts.LanguageServiceHost = {
  getCompilationSettings: () => options,
  getScriptFileNames: () => [...files.keys()].filter((f) => !f.startsWith('/lib.')),
  getScriptVersion: (f) => String(files.get(f)?.version ?? 0),
  getScriptSnapshot: (f) => {
    const file = files.get(f);
    return file ? ts.ScriptSnapshot.fromString(file.text) : undefined;
  },
  getCurrentDirectory: () => '/',
  getDefaultLibFileName: () => '/lib.d.ts',
  fileExists: (f) => files.has(f),
  readFile: (f) => files.get(f)?.text,
};
const service = ts.createLanguageService(host, ts.createDocumentRegistry());

function update(file: string, text: string): void {
  const current = files.get(file);
  if (current?.text === text) return;
  files.set(file, { text, version: (current?.version ?? 0) + 1 });
}

const display = (parts?: ts.SymbolDisplayPart[]): string => ts.displayPartsToString(parts ?? []);

export type TsRequest =
  | { type: 'complete'; file: string; text: string; pos: number }
  | { type: 'details'; file: string; text: string; pos: number; name: string; source?: string }
  | { type: 'diagnostics'; file: string; text: string }
  | { type: 'hover'; file: string; text: string; pos: number }
  | { type: 'analyze'; text: string };

/** Names a binding pattern declares (`const { a, b: [c] } = …`). */
function bound(name: ts.BindingName, out: Set<string>): void {
  if (ts.isIdentifier(name)) out.add(name.text);
  else for (const e of name.elements) if (!ts.isOmittedExpression(e)) bound(e.name, out);
}

/** Diagnostics of a name not found (`Cannot find name`, `No value exists in scope for the shorthand property`). */
const UNRESOLVED = new Set([2304, 2552, 18004, 2662, 2663]);

/**
 * CODE-014: the names a JavaScript cell declares at its top level, and the
 * names it uses without declaring them (found as unresolved by the checker).
 */
let analyses = 0;

function analyze(text: string): { defs: string[]; refs: string[] } {
  const file = '/__cell_analysis.ts';
  // A new version each time: the service keeps what it parsed by version.
  files.set(file, { text, version: ++analyses });
  const source = service.getProgram()?.getSourceFile(file);
  const defs = new Set<string>();
  for (const st of source?.statements ?? []) {
    if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) bound(d.name, defs);
    else if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st) || ts.isEnumDeclaration(st)) && st.name) defs.add(st.name.text);
    else if (ts.isImportDeclaration(st) && st.importClause) {
      const c = st.importClause;
      if (c.name) defs.add(c.name.text);
      if (c.namedBindings && ts.isNamespaceImport(c.namedBindings)) defs.add(c.namedBindings.name.text);
      else if (c.namedBindings) for (const e of c.namedBindings.elements) defs.add(e.name.text);
    }
  }
  const refs = new Set<string>();
  for (const d of service.getSemanticDiagnostics(file)) {
    if (!UNRESOLVED.has(d.code) || d.start === undefined || !d.length) continue;
    const name = text.slice(d.start, d.start + d.length);
    if (/^[\p{L}_$][\p{L}\p{N}_$]*$/u.test(name)) refs.add(name);
  }
  files.delete(file);
  return { defs: [...defs].sort(), refs: [...refs].sort() };
}

function answer(req: TsRequest): unknown {
  if (req.type === 'analyze') return analyze(req.text);
  update(req.file, req.text);
  switch (req.type) {
    case 'complete': {
      const info = service.getCompletionsAtPosition(req.file, req.pos, { includeCompletionsWithInsertText: true });
      if (!info) return null;
      return {
        member: info.isMemberCompletion,
        entries: info.entries
          .slice()
          .sort((a, b) => a.sortText.localeCompare(b.sortText))
          .slice(0, 400)
          .map((e) => ({ name: e.name, kind: e.kind, sortText: e.sortText, ...(e.insertText ? { insertText: e.insertText } : {}), ...(e.source ? { source: e.source } : {}) })),
      };
    }
    case 'details': {
      const d = service.getCompletionEntryDetails(req.file, req.pos, req.name, {}, req.source, {}, undefined);
      return d ? { detail: display(d.displayParts), doc: display(d.documentation) } : null;
    }
    case 'diagnostics': {
      const js = /\.(c|m)?jsx?$/.test(req.file);
      // JavaScript: only what cannot run (syntax); TypeScript: type errors too.
      const all = [...service.getSyntacticDiagnostics(req.file), ...(js ? [] : service.getSemanticDiagnostics(req.file))];
      return all.map((d) => ({
        from: d.start ?? 0,
        to: (d.start ?? 0) + (d.length ?? 0),
        message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
        severity: d.category === ts.DiagnosticCategory.Error ? 'error' : d.category === ts.DiagnosticCategory.Warning ? 'warning' : 'info',
      }));
    }
    case 'hover': {
      const q = service.getQuickInfoAtPosition(req.file, req.pos);
      return q ? { from: q.textSpan.start, to: q.textSpan.start + q.textSpan.length, detail: display(q.displayParts), doc: display(q.documentation) } : null;
    }
  }
}

self.addEventListener('message', (event: MessageEvent<{ id: number; request: TsRequest }>) => {
  const { id, request } = event.data;
  void ready.then(
    () => {
      let result: unknown = null;
      try {
        result = answer(request);
      } catch {
        result = null;
      }
      (self as unknown as Worker).postMessage({ id, result });
    },
    () => (self as unknown as Worker).postMessage({ id, result: null }),
  );
});
