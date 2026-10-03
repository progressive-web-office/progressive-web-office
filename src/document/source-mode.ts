/**
 * DOC-044: the source of a Markdown or LaTeX document, edited as text with
 * its colours, beside a live preview; the visual editor takes it back when
 * the user returns to it.
 */
import { EditorView, keymap, lineNumbers, drawSelection, highlightActiveLine } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { StreamLanguage, syntaxHighlighting, type StreamParser } from '@codemirror/language';
import { h } from '../app/dom';
import { highlighter } from '../code/highlight';

export type SourceLang = 'markdown' | 'latex';

/** The kind of source of a file, if it has one the visual editor reads back. */
export function sourceLangOf(fileName: string | undefined): SourceLang | undefined {
  if (!fileName) return undefined;
  if (/\.(md|markdown)$/i.test(fileName)) return 'markdown';
  if (/\.tex$/i.test(fileName)) return 'latex';
  return undefined;
}

interface MdState {
  fence: string | null;
  math: boolean;
}

/** A small Markdown grammar for colours: headings, emphasis, code, links, math, quotes, lists. */
export const markdownMode: StreamParser<MdState> = {
  name: 'markdown',
  startState: () => ({ fence: null, math: false }),
  token(stream, state) {
    if (stream.sol()) {
      const fence = stream.match(/^\s*(`{3,}|~{3,})/, false) as RegExpMatchArray | null;
      if (fence) {
        const mark = fence[1]!;
        if (state.fence === null) state.fence = mark[0]!.repeat(3);
        else if (mark.startsWith(state.fence)) state.fence = null;
        stream.skipToEnd();
        return 'meta';
      }
      if (state.fence !== null) {
        stream.skipToEnd();
        return 'string';
      }
      if (stream.match(/^\s*\$\$/)) {
        // `$$…$$` on one line leaves the state as it is; a lone `$$` opens or closes a block.
        if (!stream.match(/.*\$\$\s*$/)) state.math = !state.math;
        stream.skipToEnd();
        return 'string';
      }
      if (state.math) {
        stream.skipToEnd();
        return 'string';
      }
      if (stream.match(/^#{1,6}\s.*$/)) return 'header';
      if (stream.match(/^---\s*$/) || stream.match(/^\*\*\*\s*$/)) return 'meta';
      if (stream.match(/^\s*>/)) return 'quote';
      if (stream.match(/^\s*(?:[-*+]|\d+[.)])\s/)) return 'keyword';
    }
    if (state.fence !== null || state.math) {
      stream.skipToEnd();
      return 'string';
    }
    if (stream.match(/^`[^`]*`/)) return 'string';
    if (stream.match(/^\$[^$\n]+\$/)) return 'string';
    if (stream.match(/^\*\*[^*]+\*\*/) || stream.match(/^__[^_]+__/)) return 'strong';
    if (stream.match(/^\*[^*\s][^*]*\*/) || stream.match(/^_[^_\s][^_]*_/)) return 'em';
    if (stream.match(/^!?\[[^\]]*\]\([^)]*\)/)) return 'link';
    if (stream.match(/^\[[^\]]*\]\{[^}]*\}/)) return 'meta';
    if (stream.match(/^\{(date|time|page|pages|title|author|filename)\}/)) return 'meta';
    if (stream.match(/^\\[A-Za-z]+/)) return 'keyword';
    stream.next();
    while (!stream.eol() && !/[`$*_![{\\]/.test(stream.peek() ?? '')) stream.next();
    return null;
  },
};

export interface SourcePaneOptions {
  text: string;
  lang: SourceLang;
  label: string;
  previewLabel: string;
  /** The preview of a source text. */
  render(text: string): Node | Promise<Node>;
  changed(): void;
}

export class SourcePane {
  readonly element: HTMLElement;
  private readonly editor: EditorView;
  private readonly preview = h('div', { class: 'source-preview doc-page', role: 'region' });
  private timer: ReturnType<typeof setTimeout> | undefined;
  private round = 0;

  constructor(private readonly opts: SourcePaneOptions) {
    const host = h('div', { class: 'source-text' });
    this.preview.setAttribute('aria-label', opts.previewLabel);
    this.element = h('div', { class: 'source-pane' }, host, h('div', { class: 'source-preview-scroll' }, this.preview));
    this.editor = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: opts.text,
        extensions: [
          lineNumbers(),
          history(),
          drawSelection(),
          highlightActiveLine(),
          EditorView.lineWrapping,
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          syntaxHighlighting(highlighter),
          EditorView.contentAttributes.of({ 'aria-label': opts.label, spellcheck: 'true' }),
          EditorView.updateListener.of((u) => {
            if (!u.docChanged) return;
            opts.changed();
            this.previewSoon();
          }),
        ],
      }),
    });
    void this.language();
    void this.renderPreview();
  }

  private async language(): Promise<void> {
    const parser = this.opts.lang === 'latex' ? (await import('@codemirror/legacy-modes/mode/stex')).stex : markdownMode;
    const { StateEffect } = await import('@codemirror/state');
    this.editor.dispatch({ effects: StateEffect.appendConfig.of(StreamLanguage.define(parser as StreamParser<unknown>)) });
  }

  private previewSoon(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.renderPreview(), 300);
  }

  private async renderPreview(): Promise<void> {
    const n = ++this.round;
    try {
      const content = await this.opts.render(this.text());
      if (n === this.round) this.preview.replaceChildren(content);
    } catch {
      /* a source being typed may not read: the last preview stays */
    }
  }

  text(): string {
    return this.editor.state.doc.toString();
  }

  focus(): void {
    this.editor.focus();
  }

  destroy(): void {
    clearTimeout(this.timer);
    this.editor.destroy();
    this.element.remove();
  }
}
