/**
 * Text and source files (FILE-022): edited with CodeMirror (line numbers,
 * syntax colouring for the file's language, search, folding) and saved
 * under their own name, with their BOM and line ends.
 */
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, foldGutter, foldKeymap, indentOnInput, LanguageSupport, syntaxHighlighting, type Language, type StreamLanguage } from '@codemirror/language';
import { gotoLine, highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { Compartment, EditorSelection, EditorState, RangeSetBuilder, type Extension } from '@codemirror/state';
import { Decoration, drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { highlightCode, tagHighlighter, tags } from '@lezer/highlight';
import { button, h } from '../app/dom';
import type { EditorView as PwoView, ViewContext } from '../app/views';
import { t } from '../i18n';
import { languageOf } from './languages';
import { reviewComments, reviewLine, type CommentTokens } from './review';
import { askAuthor } from '../app/author';

/** FILE-024: lines holding a review comment stand out. */
const reviewLines = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }
    update(u: ViewUpdate): void {
      if (u.docChanged || u.viewportChanged) this.decorations = this.build(u.view);
    }
    build(view: EditorView): DecorationSet {
      const b = new RangeSetBuilder<Decoration>();
      for (const { from, to } of view.visibleRanges) {
        for (let pos = from; pos <= to; ) {
          const line = view.state.doc.lineAt(pos);
          if (line.text.includes('REVIEW(')) b.add(line.from, line.from, Decoration.line({ class: 'cm-review' }));
          pos = line.to + 1;
        }
      }
      return b.finish();
    }
  },
  { decorations: (v) => v.decorations },
);
import './files.css';

export interface DecodedText {
  text: string;
  encoding: 'utf-8' | 'windows-1252';
  bom: boolean;
  crlf: boolean;
}

/** UTF-8 (with or without BOM), else Windows-1252; CRLF line ends are remembered. */
export function decodeText(bytes: Uint8Array): DecodedText {
  const bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  let text: string;
  let encoding: DecodedText['encoding'] = 'utf-8';
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bom ? bytes.subarray(3) : bytes);
  } catch {
    encoding = 'windows-1252';
    text = new TextDecoder('windows-1252').decode(bytes);
  }
  const crlf = (text.match(/\r\n/g)?.length ?? 0) > (text.match(/(?<!\r)\n/g)?.length ?? 0);
  return { text: text.replace(/\r\n?/g, '\n'), encoding, bom, crlf };
}

/** Saved as UTF-8, with the BOM and line ends of the file. */
export function encodeText(text: string, from: Pick<DecodedText, 'bom' | 'crlf'>): Uint8Array {
  const body = new TextEncoder().encode(from.crlf ? text.replace(/\n/g, '\r\n') : text);
  if (!from.bom) return body;
  const out = new Uint8Array(body.length + 3);
  out.set([0xef, 0xbb, 0xbf]);
  out.set(body, 3);
  return out;
}

/** Token classes, coloured by `files.css` in both themes (also in print). */
export const highlighter = tagHighlighter([
  { tag: [tags.comment, tags.lineComment, tags.blockComment, tags.docComment], class: 'tok-comment' },
  { tag: [tags.string, tags.special(tags.string), tags.character, tags.regexp], class: 'tok-string' },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], class: 'tok-number' },
  { tag: [tags.keyword, tags.controlKeyword, tags.definitionKeyword, tags.moduleKeyword, tags.operatorKeyword, tags.modifier, tags.self], class: 'tok-keyword' },
  { tag: [tags.typeName, tags.className, tags.namespace, tags.standard(tags.typeName)], class: 'tok-type' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.macroName], class: 'tok-function' },
  { tag: [tags.tagName, tags.angleBracket, tags.processingInstruction, tags.meta], class: 'tok-tag' },
  { tag: [tags.attributeName, tags.propertyName], class: 'tok-property' },
  { tag: [tags.heading, tags.strong], class: 'tok-strong' },
  { tag: [tags.inserted], class: 'tok-inserted' },
  { tag: [tags.deleted, tags.invalid], class: 'tok-deleted' },
]);

const theme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'var(--surface)', color: 'var(--text)' },
  '.cm-scroller': { fontFamily: "ui-monospace, 'Cascadia Code', 'SF Mono', Menlo, Consolas, 'DejaVu Sans Mono', monospace", lineHeight: '1.5' },
  '.cm-gutters': { backgroundColor: 'var(--bg)', color: 'var(--muted)', borderRight: '1px solid var(--border)' },
  '.cm-activeLine': { backgroundColor: 'var(--sel)' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--sel)', color: 'var(--text)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'var(--sel) !important' },
  '.cm-cursor': { borderLeftColor: 'var(--text)' },
  '.cm-panels': { backgroundColor: 'var(--bg)', color: 'var(--text)' },
  '.cm-searchMatch': { outline: '1px solid var(--focus)' },
});

export class TextView implements PwoView {
  readonly element: HTMLElement;
  private readonly view: EditorView;
  private readonly decoded: DecodedText;
  private readonly language = new Compartment();
  private readonly readOnly = new Compartment();
  private readonly wrapping = new Compartment();
  private parserLanguage: Language | undefined;
  /** FILE-024: the review comments of the file. */
  private readonly reviews = h('aside', { class: 'code-reviews', 'aria-label': t('textfile.reviews'), hidden: true });
  private reviewTimer: ReturnType<typeof setTimeout> | undefined;
  private readOnlyMode = false;

  constructor(
    bytes: Uint8Array,
    private readonly ctx: ViewContext,
    private readonly fileName: string,
  ) {
    this.decoded = decodeText(bytes);
    const entry = languageOf(fileName);
    const info = h('span', { class: 'code-info' }, [entry?.name ?? t('textfile.plain'), this.decoded.encoding === 'utf-8' ? 'UTF-8' : 'Windows-1252', this.decoded.crlf ? 'CRLF' : 'LF'].join(' · '));
    const wrap = h('input', { type: 'checkbox' });
    wrap.addEventListener('change', () => this.view.dispatch({ effects: this.wrapping.reconfigure(wrap.checked ? EditorView.lineWrapping : []) }));
    const host = h('div', { class: 'code-host' });
    this.element = h(
      'div',
      { class: 'code-view' },
      h(
        'div',
        { class: 'toolbar code-toolbar', role: 'toolbar', 'aria-label': t('textfile.toolbar') },
        info,
        h('label', { class: 'code-wrap' }, wrap, ` ${t('textfile.wrap')}`),
        button(t('textfile.goToLine'), () => gotoLine(this.view), { text: '↧', className: 'icon' }),
        button(t('textfile.review'), () => this.addReview(), { text: '💬', className: 'icon', title: `${t('textfile.review')} (Ctrl+Alt+M)` }),
      ),
      h('p', { id: 'code-hint', class: 'sr-only' }, t('textfile.hint')),
      h('div', { class: 'code-main' }, host, this.reviews),
    );
    const extensions: Extension[] = [
      lineNumbers(),
      highlightActiveLineGutter(),
      foldGutter(),
      history(),
      drawSelection(),
      indentOnInput(),
      bracketMatching(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      search({ top: true }),
      syntaxHighlighting(highlighter),
      keymap.of([{ key: 'Mod-Alt-m', run: () => (this.addReview(), true) }, ...defaultKeymap, ...historyKeymap, ...searchKeymap, ...foldKeymap, indentWithTab]),
      reviewLines,
      theme,
      this.language.of([]),
      this.readOnly.of(EditorState.readOnly.of(false)),
      this.wrapping.of([]),
      EditorView.contentAttributes.of({ 'aria-label': t('textfile.label', { name: fileName }), 'aria-describedby': 'code-hint' }),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) {
          this.ctx.changed();
          clearTimeout(this.reviewTimer);
          this.reviewTimer = setTimeout(() => this.renderReviews(), 200);
        }
        if (u.docChanged || u.selectionSet) this.ctx.statusChanged();
      }),
    ];
    this.view = new EditorView({ state: EditorState.create({ doc: this.decoded.text, extensions }), parent: host });
    this.renderReviews();
    // The grammar is loaded on its own: the text shows at once, coloured when it arrives.
    void entry
      ?.load()
      .then(async (lang) => {
        this.parserLanguage = lang instanceof LanguageSupport ? lang.language : (lang as StreamLanguage<unknown>);
        // CODE-011, CODE-012: completion; for JavaScript and TypeScript, the TypeScript language service.
        this.view.dispatch({ effects: this.language.reconfigure([lang, (await import('../code/completion')).completionSupport()]) });
        if (/JavaScript|TypeScript/.test(entry.name)) {
          const { scriptIntelligence } = await import('../code/ts-language');
          this.view.dispatch({ effects: this.language.reconfigure([lang, ...(await scriptIntelligence(fileName))]) });
        }
      })
      .catch(() => undefined);
  }

  save(): Uint8Array {
    return encodeText(this.view.state.doc.toString(), this.decoded);
  }

  /** A review comment above the line of the cursor, in the language's comment syntax (FILE-024). */
  private async addReview(): Promise<void> {
    if (this.readOnlyMode) return;
    const state = this.view.state;
    const line = state.doc.lineAt(state.selection.main.head);
    const text = window.prompt(t('textfile.reviewPrompt', { line: line.number }), '')?.trim();
    if (!text) return this.view.focus();
    const author = (await askAuthor(t('comment.yourName'))) || t('comment.anonymous');
    const tokens = (state.languageDataAt<CommentTokens>('commentTokens', line.from)[0] ?? {}) as CommentTokens;
    const indent = /^\s*/.exec(line.text)![0];
    const insert = `${reviewLine(tokens, author, text, indent)}\n`;
    this.view.dispatch({ changes: { from: line.from, insert }, selection: { anchor: line.from + insert.length + indent.length } });
    this.view.focus();
  }

  private renderReviews(): void {
    const list = reviewComments(this.view.state.doc.toString());
    this.reviews.hidden = !list.length;
    this.reviews.replaceChildren(
      ...(list.length ? [h('h2', {}, t('textfile.reviews'))] : []),
      ...list.map((c) =>
        h(
          'article',
          { class: 'comment-card', 'aria-label': t('textfile.reviewOn', { line: c.line }) },
          h('p', { class: 'comment-meta' }, h('strong', {}, c.author || t('comment.anonymous')), ` · ${t('textfile.lineShort', { line: c.line })}`),
          h('p', { class: 'comment-text' }, c.text),
          h(
            'div',
            { class: 'comment-actions' },
            button(t('pdf.goToPage'), () => {
              const line = this.view.state.doc.line(Math.min(c.line + 1, this.view.state.doc.lines));
              this.view.dispatch({ selection: { anchor: line.from }, scrollIntoView: true });
              this.view.focus();
            }),
            ...(this.readOnlyMode
              ? []
              : [
                  button(t('comment.delete'), () => {
                    const line = this.view.state.doc.line(c.line);
                    this.view.dispatch({ changes: { from: line.from, to: Math.min(line.to + 1, this.view.state.doc.length) } });
                  }, { className: 'danger' }),
                ]),
          ),
        ),
      ),
    );
  }

  status(): string {
    const { state } = this.view;
    const head = state.selection.main.head;
    const line = state.doc.lineAt(head);
    return t('textfile.status', { line: line.number, col: head - line.from + 1, lines: state.doc.lines });
  }

  focus(): void {
    this.view.focus();
  }

  setReadOnly(readOnly: boolean): void {
    this.readOnlyMode = readOnly;
    this.renderReviews();
    this.view.dispatch({ effects: this.readOnly.reconfigure(EditorState.readOnly.of(readOnly)) });
  }

  find(query: string): void {
    const at = this.view.state.doc.toString().toLowerCase().indexOf(query.toLowerCase());
    if (at < 0) return;
    this.view.dispatch({ selection: EditorSelection.single(at, at + query.length), scrollIntoView: true });
    this.view.focus();
  }

  /** The text with line numbers and colours, for the print preview. */
  printContent(): HTMLElement {
    const text = this.view.state.doc.toString();
    const pre = h('pre', { class: 'code-print' });
    let n = 1;
    let line = h('span', { class: 'code-line', 'data-n': '1' });
    const put = (s: string, classes: string): void => void line.append(classes ? h('span', { class: classes }, s) : s);
    const brk = (): void => {
      pre.append(line);
      line = h('span', { class: 'code-line', 'data-n': String(++n) });
    };
    if (this.parserLanguage) highlightCode(text, this.parserLanguage.parser.parse(text), highlighter, put, brk);
    else
      text.split('\n').forEach((l, i) => {
        if (i) brk();
        put(l, '');
      });
    pre.append(line);
    return h('div', { class: 'code-view print' }, h('h1', { class: 'code-title' }, this.fileName), pre);
  }

  destroy(): void {
    clearTimeout(this.reviewTimer);
    this.view.destroy();
  }
}
