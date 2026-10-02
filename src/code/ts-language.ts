/**
 * TypeScript and JavaScript intelligence in the code editors (CODE-012):
 * completions with types and documentation, errors underlined, the type of
 * what is under the pointer. The language service runs in a worker loaded on
 * first use; until it answers (or if it cannot load), the simple completion
 * of CODE-011 is used.
 */
import type { Completion, CompletionContext, CompletionResult, CompletionSource } from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';
import { hoverTooltip, type EditorView } from '@codemirror/view';
import { completionSupport, mergeResults } from './completion';
import type { TsRequest } from './ts.worker';

interface TsEntry {
  name: string;
  kind: string;
  sortText: string;
  insertText?: string;
  source?: string;
}

let worker: Worker | undefined;
let broken = false;
let nextId = 0;
const waiting = new Map<number, (result: unknown) => void>();

function ask<T>(request: TsRequest, timeoutMs = 8000): Promise<T | null> {
  if (broken) return Promise.resolve(null);
  if (!worker) {
    try {
      worker = new Worker(new URL('./ts.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<{ id: number; result: unknown }>) => {
        waiting.get(e.data.id)?.(e.data.result);
        waiting.delete(e.data.id);
      };
      worker.onerror = () => {
        broken = true;
        for (const done of waiting.values()) done(null);
        waiting.clear();
      };
    } catch {
      broken = true;
      return Promise.resolve(null);
    }
  }
  return new Promise((resolve) => {
    const id = ++nextId;
    const timer = setTimeout(() => {
      waiting.delete(id);
      resolve(null);
    }, timeoutMs);
    waiting.set(id, (result) => {
      clearTimeout(timer);
      resolve(result as T);
    });
    worker!.postMessage({ id, request });
  });
}

const TYPES: Record<string, string> = {
  keyword: 'keyword',
  'primitive type': 'type',
  module: 'namespace',
  class: 'class',
  interface: 'interface',
  type: 'type',
  enum: 'enum',
  'enum member': 'constant',
  var: 'variable',
  'local var': 'variable',
  let: 'variable',
  const: 'constant',
  function: 'function',
  'local function': 'function',
  method: 'method',
  getter: 'property',
  setter: 'property',
  property: 'property',
  constructor: 'class',
  parameter: 'variable',
  alias: 'namespace',
};

function infoNode(detail: string, doc: string): HTMLElement {
  const box = document.createElement('div');
  box.className = 'cm-ts-info';
  const code = document.createElement('code');
  code.textContent = detail;
  box.append(code);
  if (doc) {
    const p = document.createElement('p');
    p.textContent = doc;
    box.append(p);
  }
  return box;
}

/** The completion of the language service, else `fallback`. */
function tsSource(file: string, fallback: CompletionSource[]): CompletionSource {
  return async (ctx: CompletionContext): Promise<CompletionResult | null> => {
    const word = ctx.matchBefore(/[\w$]*$/);
    const afterDot = ctx.matchBefore(/\.[\w$]*$/);
    if (!ctx.explicit && !afterDot && (!word || word.from === word.to)) return null;
    const text = ctx.state.doc.toString();
    const result = await ask<{ member: boolean; entries: TsEntry[] }>({ type: 'complete', file, text, pos: ctx.pos });
    if (ctx.aborted) return null;
    if (!result?.entries.length) return mergeResults(await Promise.all(fallback.map((s) => s(ctx))));
    const from = word ? word.from : ctx.pos;
    const options: Completion[] = result.entries.map((e, i) => ({
      label: e.name,
      type: TYPES[e.kind] ?? 'variable',
      ...(e.insertText && e.insertText !== e.name ? { apply: e.insertText } : {}),
      boost: Math.max(-99, 99 - i),
      info: async () => {
        const d = await ask<{ detail: string; doc: string }>({ type: 'details', file, text, pos: ctx.pos, name: e.name, ...(e.source ? { source: e.source } : {}) });
        return d ? infoNode(d.detail, d.doc) : null;
      },
    }));
    return { from, options, validFor: /^[\w$]*$/ };
  };
}

/**
 * The extensions of a TypeScript or JavaScript editor: completion, errors
 * and types under the pointer. `file` names the code (its extension tells
 * the language: `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`).
 */
export async function scriptIntelligence(file: string): Promise<Extension[]> {
  const [{ linter }, js] = await Promise.all([import('@codemirror/lint'), import('@codemirror/lang-javascript')]);
  const path = `/${file.replace(/^\/+/, '').replace(/[^\w.\-/]/g, '_')}`;
  const globals = js.scopeCompletionSource(globalThis);
  const fallback: CompletionSource[] = [js.localCompletionSource, globals];
  return [
    completionSupport([tsSource(path, fallback)]),
    linter(
      async (view: EditorView) => {
        const diags = await ask<{ from: number; to: number; message: string; severity: 'error' | 'warning' | 'info' }[]>({ type: 'diagnostics', file: path, text: view.state.doc.toString() });
        const length = view.state.doc.length;
        return (diags ?? []).map((d) => ({ ...d, from: Math.min(d.from, length), to: Math.min(Math.max(d.to, d.from), length) }));
      },
      { delay: 600 },
    ),
    hoverTooltip(async (view, pos) => {
      const q = await ask<{ from: number; to: number; detail: string; doc: string }>({ type: 'hover', file: path, text: view.state.doc.toString(), pos }, 4000);
      if (!q?.detail) return null;
      return { pos: q.from, end: q.to, above: true, create: () => ({ dom: infoNode(q.detail, q.doc) }) };
    }),
  ];
}

/** CODE-014: the names a JavaScript cell declares and uses; null when the language service is unavailable. */
export const analyzeScript = (code: string): Promise<import('./reactive').CellDeps | null> => ask<import('./reactive').CellDeps>({ type: 'analyze', text: code }, 20000);
