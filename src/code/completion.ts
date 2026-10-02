/**
 * Completion while writing code (CODE-011): keywords, snippets and the names
 * of the code for every language that has them, the standard objects of
 * JavaScript and TypeScript (`Math.`, `JSON.`…), and for Python cells the
 * names known by the running interpreter (jedi: variables of earlier cells,
 * modules, their functions with signature and documentation).
 */
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, type Completion, type CompletionContext, type CompletionResult, type CompletionSource } from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';
import { keymap } from '@codemirror/view';

/** A completion from the Python interpreter. */
export interface SmartItem {
  name: string;
  /** jedi's type: module, class, function, instance, keyword, statement, param, path, property. */
  type: string;
  signature?: string;
  doc?: string;
}

/** Ask the interpreter for the completions at a line (1-based) and column; null when it is not running. */
export type SmartComplete = (code: string, line: number, column: number) => Promise<SmartItem[] | null>;

/** The completion popup, closing brackets and quotes, and their keys. */
export function completionSupport(override?: CompletionSource[]): Extension[] {
  return [autocompletion({ icons: true, ...(override ? { override } : {}) }), closeBrackets(), keymap.of([...closeBracketsKeymap, ...completionKeymap])];
}

/** JavaScript and TypeScript: the standard objects and their members. */
export async function scriptGlobals(): Promise<Extension> {
  const { javascriptLanguage, scopeCompletionSource } = await import('@codemirror/lang-javascript');
  return javascriptLanguage.data.of({ autocomplete: scopeCompletionSource(globalThis) });
}

const TYPES: Record<string, string> = {
  module: 'namespace',
  class: 'class',
  function: 'function',
  instance: 'variable',
  statement: 'variable',
  param: 'variable',
  keyword: 'keyword',
  property: 'property',
  path: 'text',
};

/** jedi's completions as CodeMirror options. */
export function smartOptions(items: SmartItem[]): Completion[] {
  return items.map((item, i) => ({
    label: item.name,
    type: TYPES[item.type] ?? 'variable',
    ...(item.signature ? { detail: item.signature.replace(/^\w+/, '') } : {}),
    ...(item.doc ? { info: item.doc } : {}),
    // jedi orders them best first.
    boost: Math.max(-99, 50 - i),
  }));
}

/** Merge the results of several sources (same start), each name once. */
export function mergeResults(results: (CompletionResult | null)[]): CompletionResult | null {
  const valid = results.filter((r): r is CompletionResult => !!r && r.options.length > 0);
  if (!valid.length) return null;
  const from = Math.max(...valid.map((r) => r.from));
  const seen = new Set<string>();
  const options: Completion[] = [];
  for (const r of valid) {
    if (r.from !== from) continue;
    for (const o of r.options) {
      if (seen.has(o.label)) continue;
      seen.add(o.label);
      options.push(o);
    }
  }
  return { from, options, validFor: /^\w*$/ };
}

/**
 * Python: the interpreter's completions when it is running (they know the
 * variables of earlier cells), else the names of the code, keywords and
 * built-ins.
 */
export async function pythonSources(smart?: SmartComplete): Promise<CompletionSource[]> {
  const { localCompletionSource, globalCompletion } = await import('@codemirror/lang-python');
  const fallback = async (ctx: CompletionContext): Promise<CompletionResult | null> => mergeResults(await Promise.all([localCompletionSource(ctx), globalCompletion(ctx)]));
  if (!smart) return [fallback];
  return [
    async (ctx) => {
      const word = ctx.matchBefore(/\w*$/);
      const afterDot = ctx.matchBefore(/\.\w*$/);
      if (!ctx.explicit && !afterDot && (!word || word.from === word.to)) return null;
      const line = ctx.state.doc.lineAt(ctx.pos);
      const items = await smart(ctx.state.doc.toString(), line.number, ctx.pos - line.from).catch(() => null);
      if (ctx.aborted) return null;
      if (items?.length) return { from: word ? word.from : ctx.pos, options: smartOptions(items), validFor: /^\w*$/ };
      return afterDot ? null : fallback(ctx);
    },
  ];
}
