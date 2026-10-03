/**
 * The code editor of a cell (CODE-011): highlighting, indentation, closing
 * brackets and completion, Python (with the interpreter's names when it is
 * running) or JavaScript.
 */
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput, indentUnit, syntaxHighlighting } from '@codemirror/language';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { drawSelection, EditorView, highlightActiveLine, keymap, lineNumbers } from '@codemirror/view';
import type { CodeLang } from '../document/model';
import { highlighter } from '../files/text-view';
import { completionSupport, pythonSources, type SmartComplete } from './completion';

const theme = EditorView.theme({
  '&': { backgroundColor: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '6px', minHeight: '16rem', maxHeight: '60vh' },
  '&.cm-focused': { outline: '2px solid var(--focus)' },
  '.cm-scroller': { fontFamily: "ui-monospace, 'Cascadia Code', 'SF Mono', Menlo, Consolas, 'DejaVu Sans Mono', monospace", lineHeight: '1.5', overflow: 'auto' },
  '.cm-gutters': { backgroundColor: 'var(--bg)', color: 'var(--muted)', borderRight: '1px solid var(--border)' },
  '.cm-activeLine': { backgroundColor: 'var(--sel)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'var(--sel) !important' },
  '.cm-cursor': { borderLeftColor: 'var(--text)' },
});

export interface CellEditor {
  readonly view: EditorView;
  value(): string;
  setLanguage(lang: CodeLang): void;
  focus(): void;
  destroy(): void;
}

export function createCellEditor(parent: HTMLElement, opts: { doc: string; lang: CodeLang; label: string; complete?: SmartComplete }): CellEditor {
  const language = new Compartment();
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: opts.doc,
      extensions: [
        lineNumbers(),
        history(),
        drawSelection(),
        indentOnInput(),
        indentUnit.of('    '),
        bracketMatching(),
        highlightActiveLine(),
        syntaxHighlighting(highlighter),
        language.of([]),
        // Tab indents (Python); Escape then Tab leaves the editor.
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        theme,
        EditorView.contentAttributes.of({ 'aria-label': opts.label, spellcheck: 'false', autocorrect: 'off', autocapitalize: 'off' }),
      ],
    }),
  });
  let generation = 0;
  const setLanguage = (lang: CodeLang): void => {
    const mine = ++generation;
    void loadLanguage(lang, opts.complete).then((ext) => {
      if (mine === generation) view.dispatch({ effects: language.reconfigure(ext) });
    });
  };
  setLanguage(opts.lang);
  return {
    view,
    value: () => view.state.doc.toString(),
    setLanguage,
    focus: () => view.focus(),
    destroy: () => view.destroy(),
  };
}

async function loadLanguage(lang: CodeLang, complete?: SmartComplete): Promise<Extension> {
  if (lang === 'julia') {
    const [{ StreamLanguage }, { julia }] = await Promise.all([import('@codemirror/language'), import('@codemirror/legacy-modes/mode/julia')]);
    return StreamLanguage.define(julia);
  }
  if (lang === 'lua') {
    const [{ StreamLanguage }, { lua }] = await Promise.all([import('@codemirror/language'), import('@codemirror/legacy-modes/mode/lua')]);
    return StreamLanguage.define(lua);
  }
  if (lang === 'r') {
    const [{ StreamLanguage }, { r }] = await Promise.all([import('@codemirror/language'), import('@codemirror/legacy-modes/mode/r')]);
    return StreamLanguage.define(r);
  }
  if (lang === 'sql') return (await import('@codemirror/lang-sql')).sql();
  if (lang === 'cpp') return (await import('@codemirror/lang-cpp')).cpp();
  if (lang === 'python') {
    const [{ python }, sources] = await Promise.all([import('@codemirror/lang-python'), pythonSources(complete)]);
    return [python(), completionSupport(sources)];
  }
  // CODE-012: the TypeScript language service, for JavaScript cells (modules, top-level await).
  const [{ javascript }, { scriptIntelligence }] = await Promise.all([import('@codemirror/lang-javascript'), import('./ts-language')]);
  return [javascript(), ...(await scriptIntelligence('cell.mjs'))];
}
