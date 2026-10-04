/**
 * PDF-020: the Typst compiler (WebAssembly) around a document written by
 * `writeTypst`: its pictures given as files, an equation Typst refuses
 * written as its LaTeX instead of failing the whole document.
 */
import type * as Wasm from '@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler.mjs';
import { withoutEquation } from '../document/typst-text';
import type { TypstOutput } from '../document/typst-writer';

export type TypstModule = typeof Wasm;

export interface TypstEngine {
  typeset(doc: Pick<TypstOutput, 'source' | 'files' | 'equations'>): Uint8Array;
}

const MAIN = '/main.typ';

/** A compiler with these fonts; `wasm` is the initialised module. */
export async function createEngine(wasm: TypstModule, fonts: Uint8Array[]): Promise<TypstEngine> {
  const builder = new wasm.TypstCompilerBuilder();
  builder.set_dummy_access_model();
  for (const font of fonts) {
    try {
      await builder.add_raw_font(font);
    } catch {
      /* not a font Typst reads: the others are enough */
    }
  }
  const compiler = await builder.build();
  const compile = (source: string): Uint8Array => {
    compiler.add_source(MAIN, source);
    const out = compiler.compile(MAIN, null, 'pdf', 1) as { result?: Uint8Array } | undefined;
    if (!out?.result) throw new Error('Typst produced no PDF');
    return out.result;
  };
  return {
    typeset(doc) {
      compiler.reset_shadow();
      for (const [path, data] of doc.files) compiler.map_shadow(path, data);
      try {
        return compile(doc.source);
      } catch (err) {
        if (!doc.equations.length) throw typstError(err);
        // Which equations Typst refuses, one by one; they are written as their LaTeX.
        let source = doc.source;
        doc.equations.forEach((eq, k) => {
          if (!eq.typst) return;
          try {
            compile(`$${eq.typst}$`);
          } catch {
            source = withoutEquation(source, k, eq.latex);
          }
        });
        try {
          return compile(source);
        } catch (again) {
          throw typstError(again);
        }
      }
    },
  };
}

/** The first message of Typst's diagnostics, readable. */
export function typstError(err: unknown): Error {
  const text = String(err instanceof Error ? err.message : err);
  const message = /message: "((?:[^"\\]|\\.)*)"/.exec(text)?.[1]?.replace(/\\"/g, '"');
  return new Error(message ? `Typst: ${message}` : text.slice(0, 300));
}
