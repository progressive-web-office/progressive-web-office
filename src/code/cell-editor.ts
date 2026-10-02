/**
 * The code editor of a cell (CODE-007): highlighting, indentation, closing
 * brackets and completion, Python (with the interpreter's names when it is
 * running) or JavaScript.
 */
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput, indentUnit, syntaxHighlighting } from '@codemirror/language';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { drawSelection, EditorView, highlightActiveLine, keymap, lineNumbers } from '@codemirror/view';
import type { CodeLang } from '../document/model';
import { highlighter } from '../files/text-view';
import { completionSupport, pythonSources, scriptGlobals, type SmartComplete } from './completion';

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
  if (lang === 'python') {
    const [{ python }, sources] = await Promise.all([import('@codemirror/lang-python'), pythonSources(complete)]);
    return [python(), completionSupport(sources)];
  }
  const [{ javascript }, globals] = await Promise.all([import('@codemirror/lang-javascript'), scriptGlobals()]);
  return [javascript(), globals, completionSupport()];
}
