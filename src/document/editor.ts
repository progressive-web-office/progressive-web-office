/**
 * WYSIWYG editor view for text documents (DOC-003..DOC-010, DOC-013, DOC-015,
 * DOC-018), built on ProseMirror: a structured document with transactions,
 * a reliable undo history and precise collaboration.
 */
import { Fragment, Slice, type Node as PmNode } from 'prosemirror-model';
import { EditorState, type Command, type Transaction } from 'prosemirror-state';
import { EditorView as PmView } from 'prosemirror-view';
import { toggleMark } from 'prosemirror-commands';
import { redo, undo } from 'prosemirror-history';
import { applyDocumentParts, documentParts, type CollabAdapter, type PeerCursor } from '../collab/parts';
import { documentTools, type AgentTool } from '../ai/tools';
import type { PrintSettings } from '../print/settings';
import { t, type MessageKey } from '../i18n';
import { button, h } from '../app/dom';
import type { EditorView, ViewContext } from '../app/views';
import { domToBlocks, isSafeUrl, sanitizeHtml, type ImageInfo } from './html';
import { writeDocumentAsync, type TextFormat } from './io';
import { decodeDataUri } from './markdown-reader';
import { bytesToBase64 } from './markdown-writer';
import { addResource, wordCount, type Align, type Block, type ParagraphStyle, type RichDocument } from './model';
import type { CodeRunner } from '../code/runner';
import { blockToPm, blocksToPm, pmToBlocks } from './pm/convert';
import { schema } from './pm/schema';
import { changeIndent, clearFormatting, currentAlign, currentStyle, inList, insertInline, insertOnOwnLine, insertRule, insertTable, linkAt, markActive, markValue, paragraphAttr, setAlign, setLink, setMarkValue, setParagraphAttrs, setStyle, toggleList } from './pm/commands';
import { LINE_SPACINGS } from './paragraph-dialog';
import { basePlugins, peersKey, type PeerMarker } from './pm/plugins';
import { cellHandle, nodeViews } from './pm/views';
import { listCss } from './pm/list-css';
import { FindBar } from './find-bar';
import 'prosemirror-view/style/prosemirror.css';
import 'prosemirror-tables/style/tables.css';
import 'prosemirror-gapcursor/style/gapcursor.css';

/** List styles, added once to the page. */
function installListCss(): void {
  if (document.getElementById('pwo-list-css')) return;
  const style = document.createElement('style');
  style.id = 'pwo-list-css';
  style.textContent = listCss('.doc-page');
  document.head.append(style);
}

/** Fonts offered in the toolbar: common names, rendered with metric-compatible fallbacks when missing. */
const FONTS = ['Arial', 'Calibri', 'Cambria', 'Georgia', 'Liberation Sans', 'Liberation Serif', 'Times New Roman', 'Verdana', 'OpenDyslexic'];
const SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72];

const STYLES: [ParagraphStyle, MessageKey][] = [
  ['normal', 'doc.style.normal'],
  ['h1', 'doc.style.h1'],
  ['h2', 'doc.style.h2'],
  ['h3', 'doc.style.h3'],
  ['h4', 'doc.style.h4'],
  ['quote', 'doc.style.quote'],
  ['code', 'doc.style.code'],
];

/** Transactions coming from other participants: not "changes" of this user. */
const REMOTE = 'pwo-remote';

export class DocumentEditor implements EditorView {
  readonly element: HTMLElement;
  private readonly page: HTMLElement;
  readonly view: PmView;
  private readonly styleSelect: HTMLSelectElement;
  private readonly fontSelect: HTMLSelectElement;
  private readonly sizeSelect: HTMLSelectElement;
  private readonly lineSelect: HTMLSelectElement;
  private readonly markButtons: [string, HTMLButtonElement][] = [];
  private readonly stateButtons: [() => boolean, HTMLButtonElement][] = [];
  private readonly urls = new Map<string, string>();
  private statusTimer: ReturnType<typeof setTimeout> | undefined;
  private runner: CodeRunner | undefined;
  private readonly findBar: FindBar;
  /** CODE-004: the user agreed to run this document's code. */
  private trusted = false;

  constructor(
    private readonly doc: RichDocument,
    private readonly ctx: ViewContext,
  ) {
    installListCss();
    this.page = h('div', { class: 'doc-page' });
    this.styleSelect = h('select', { 'aria-label': t('doc.style'), title: t('doc.style') }, ...STYLES.map(([v, l]) => h('option', { value: v }, t(l))));
    this.styleSelect.addEventListener('change', () => {
      this.command(setStyle(this.styleSelect.value as ParagraphStyle));
      this.refocus();
    });
    this.fontSelect = h('select', { 'aria-label': t('fmt.font'), title: t('fmt.font'), class: 'font-select' }, h('option', { value: '' }, t('fmt.default')), ...FONTS.map((f) => h('option', { value: f, style: `font-family: "${f}"` }, f)));
    this.fontSelect.addEventListener('change', () => {
      const v = this.fontSelect.value;
      this.command(setMarkValue(schema.marks.font!, v ? { family: v } : null));
      this.refocus();
    });
    this.sizeSelect = h('select', { 'aria-label': t('fmt.size'), title: t('fmt.size'), class: 'size-select' }, h('option', { value: '' }, '—'), ...SIZES.map((n) => h('option', { value: String(n) }, String(n))));
    this.sizeSelect.addEventListener('change', () => {
      const v = Number(this.sizeSelect.value);
      this.command(setMarkValue(schema.marks.size!, v ? { pt: v } : null));
      this.refocus();
    });
    this.lineSelect = h('select', { 'aria-label': t('para.lineSpacing'), title: t('para.lineSpacing'), class: 'size-select' }, h('option', { value: '' }, '↕'), ...LINE_SPACINGS.map((n) => h('option', { value: String(n) }, `↕ ${n}`)));
    this.lineSelect.addEventListener('change', () => {
      const v = Number(this.lineSelect.value);
      this.command(setParagraphAttrs({ lineHeight: v || null }));
      this.refocus();
    });
    this.findBar = new FindBar(() => this.view);
    this.element = h('div', { class: 'doc-editor' }, this.toolbar(), this.findBar.element, h('div', { class: 'doc-scroll' }, this.page));
    this.view = new PmView(
      { mount: this.page },
      {
        state: EditorState.create({
          doc: blocksToPm(doc.blocks),
          plugins: basePlugins({ find: (replace) => this.findBar.open(replace), link: () => this.insertLink(), math: () => void this.editMath(), diagram: () => void this.editDiagram() }),
        }),
        nodeViews: nodeViews({
          resolve: (key) => this.resolve(key),
          editMath: (pos, node) => void this.editMath(pos, node),
          editDiagram: (pos, node) => void this.editDiagram(pos, node),
          cellAction: (action, pos, node) => this.onCellAction(action, pos, node),
        }),
        attributes: { role: 'textbox', 'aria-multiline': 'true', 'aria-label': t('doc.label'), spellcheck: 'true', class: 'doc-page' },
        dispatchTransaction: (tr) => this.dispatch(tr),
        handlePaste: (_view, event) => this.onPaste(event),
        handleDrop: (_view, event) => this.onDrop(event as DragEvent),
      },
    );
    this.updateToolbar();
  }

  private dispatch(tr: Transaction): void {
    const state = this.view.state.apply(tr);
    this.view.updateState(state);
    if (tr.docChanged && !tr.getMeta(REMOTE)) this.changed();
    else if (tr.selectionSet) this.statusSoon();
    this.updateToolbar();
    if (tr.docChanged && this.findBar?.isOpen) this.findBar.refresh();
  }

  /** Give the focus back to the document, without touching the selection when it already has it. */
  private refocus(): void {
    if (!this.view.hasFocus()) this.view.focus();
  }

  private command(cmd: Command): boolean {
    return cmd(this.view.state, (tr) => this.view.dispatch(tr), this.view);
  }

  // --- code cells (CODE-001..CODE-005) ----------------------------------------

  private onCellAction(action: string, pos: number, node: PmNode): void {
    if (action === 'run') void this.runCells([pos]);
    else if (action === 'run-all') void this.runCells(this.cellPositions());
    else if (action === 'stop') this.runner?.stop();
    else if (action === 'edit') void this.editCell(pos, node);
  }

  private cellPositions(): number[] {
    const out: number[] = [];
    this.view.state.doc.descendants((n, pos) => {
      if (n.type === schema.nodes.code_cell) out.push(pos);
    });
    return out;
  }

  /** Insert a new cell on its own line, or edit an existing one (CODE-001). */
  private async editCell(pos?: number, node?: PmNode): Promise<void> {
    const { editCell } = await import('../code/ui');
    const current = node?.attrs as { cell: string; lang: 'python' | 'javascript'; output: unknown } | undefined;
    const value = await editCell(this.element, current ? { lang: current.lang, code: current.cell } : undefined);
    if (!value) return;
    // Changing the code makes the previous output stale.
    const unchanged = current && current.cell === value.code && current.lang === value.lang;
    const attrs = { cell: value.code, lang: value.lang, output: unchanged ? current.output : null };
    if (pos !== undefined) this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, undefined, attrs));
    else this.command(insertOnOwnLine(schema.nodes.code_cell!.create(attrs)));
    this.refocus();
  }

  /** Run cells in order in the sandbox and store their output in the document (CODE-002, CODE-005). */
  private async runCells(positions: number[]): Promise<void> {
    const ui = await import('../code/ui');
    if (!this.trusted) {
      if (!(await ui.confirmRun(this.element))) return;
      this.trusted = true;
    }
    if (!this.runner) {
      const { CodeRunner } = await import('../code/runner');
      this.runner = new CodeRunner(this.element);
    }
    const runner = this.runner;
    // Positions move while cells run and the user types: follow the elements.
    const handles = positions.map((pos) => cellHandle((this.view.nodeDOM(pos) as HTMLElement | null)?.querySelector('.code-cell') ?? null)).filter((x) => !!x);
    for (const handle of handles) {
      const pos = handle.getPos();
      const node = pos === undefined ? null : this.view.state.doc.nodeAt(pos);
      if (pos === undefined || !node || node.type !== schema.nodes.code_cell) continue;
      const cell = handle.element;
      cell.classList.add('running');
      ui.setCellStatus(cell, t('code.queued'));
      const result = await runner.run(node.attrs.lang as 'python' | 'javascript', node.attrs.cell as string, (status) => {
        const text = status === 'loading-python' ? t('code.loadingPython') : status === 'running' ? t('code.running') : `${t('code.packages')} ${status.slice('packages:'.length)}`;
        ui.setCellStatus(cell, text);
      });
      const images = result.images.map((png) => addResource(this.doc, png, 'image/png'));
      const output = { text: result.text, ...(result.error ? { error: true } : {}), ...(images.length ? { images } : {}) };
      const now = handle.getPos();
      const current = now === undefined ? null : this.view.state.doc.nodeAt(now);
      if (now !== undefined && current?.type === schema.nodes.code_cell) {
        this.view.dispatch(this.view.state.tr.setNodeMarkup(now, undefined, { ...current.attrs, output }));
      }
      if (result.error) break; // like a notebook's "run all": stop at the first error
    }
  }

  // --- diagrams, equations, properties ----------------------------------------

  /** Insert a new diagram on its own line, or edit an existing one (DIAG-001). */
  private async editDiagram(pos?: number, node?: PmNode): Promise<void> {
    const { editDiagram } = await import('../diagram/ui');
    const source = await editDiagram(this.element, (node?.attrs.diagram as string | undefined) ?? '');
    if (source === null) return;
    if (pos !== undefined) this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, undefined, { ...node!.attrs, diagram: source }));
    else this.command(insertOnOwnLine(schema.nodes.diagram!.create({ diagram: source, lang: 'mermaid' })));
    this.refocus();
  }

  /** Insert a new equation at the cursor, or edit an existing one (MATH-001). */
  private async editMath(pos?: number, node?: PmNode): Promise<void> {
    const { editEquation } = await import('../math/ui');
    const value = await editEquation(this.element, node ? { latex: node.attrs.math as string, display: !!node.attrs.display } : undefined);
    if (!value) return;
    const attrs = { math: value.latex, display: value.display };
    if (pos !== undefined) this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, undefined, attrs));
    else this.command(insertInline(schema.nodes.math!.create(attrs)));
    this.refocus();
  }

  /** Document properties: title, author, keywords… (DOC-017). */
  private async editProperties(): Promise<void> {
    const { editProperties } = await import('./properties');
    const meta = await editProperties(this.element, this.doc.meta);
    if (!meta) return;
    this.doc.meta = meta;
    this.changed();
  }

  // --- EditorView ---------------------------------------------------------------

  mounted(): void {}

  focus(): void {
    this.view.focus();
  }

  status(): string {
    const { words, characters } = wordCount({ ...this.doc, blocks: this.currentBlocks() });
    return t(words === 1 ? 'doc.word' : 'doc.words', { words, characters });
  }

  async save(format: Parameters<EditorView['save'] & object>[0]): Promise<Uint8Array> {
    this.doc.blocks = this.currentBlocks();
    return writeDocumentAsync(this.doc, format as TextFormat);
  }

  agentTools(): AgentTool[] {
    return documentTools({
      doc: this.doc,
      getBlocks: () => this.currentBlocks(),
      setBlocks: (blocks) => this.replaceBlocks(blocks, false),
    });
  }

  /**
   * Replace the content with `blocks`, touching only the blocks that differ so
   * that the cursor and the undo history of untouched parts are kept.
   */
  private replaceBlocks(blocks: Block[], remote: boolean): void {
    const next = blocksToPm(blocks);
    const cur = this.view.state.doc;
    let start = 0;
    while (start < cur.childCount && start < next.childCount && cur.child(start).eq(next.child(start))) start++;
    let endCur = cur.childCount;
    let endNext = next.childCount;
    while (endCur > start && endNext > start && cur.child(endCur - 1).eq(next.child(endNext - 1))) {
      endCur--;
      endNext--;
    }
    if (start === endCur && start === endNext) return;
    const posOf = (doc: PmNode, index: number): number => {
      let pos = 0;
      for (let i = 0; i < index; i++) pos += doc.child(i).nodeSize;
      return pos;
    };
    const nodes: PmNode[] = [];
    for (let i = start; i < endNext; i++) nodes.push(next.child(i));
    const tr = this.view.state.tr.replaceWith(posOf(cur, start), posOf(cur, endCur), Fragment.from(nodes));
    if (remote) tr.setMeta(REMOTE, true).setMeta('addToHistory', false);
    this.view.dispatch(tr);
  }

  /** Real-time collaboration: properties, images and one shared part per block (COLLAB-002). */
  collab(): CollabAdapter {
    return {
      read: () => documentParts(this.doc, this.currentBlocks()),
      write: (parts) => this.replaceBlocks(applyDocumentParts(this.doc, parts), true),
      cursor: () => ({ block: this.view.state.selection.$from.index(0) }),
      showPeers: (peers: PeerCursor[]) => {
        const markers: PeerMarker[] = peers.flatMap((p) => {
          const block = (p.cursor as { block?: number } | undefined)?.block;
          return typeof block === 'number' ? [{ name: p.name, color: p.color, block }] : [];
        });
        this.view.dispatch(this.view.state.tr.setMeta(peersKey, markers).setMeta(REMOTE, true).setMeta('addToHistory', false));
      },
    };
  }

  printContent(_settings?: PrintSettings): HTMLElement {
    const root = h('div', { class: 'print-document' });
    for (const node of Array.from(this.view.dom.childNodes)) root.append(node.cloneNode(true));
    for (const el of Array.from(root.querySelectorAll('[contenteditable]'))) el.removeAttribute('contenteditable');
    for (const el of Array.from(root.querySelectorAll('.code-cell-bar, .ProseMirror-trailingBreak, .ProseMirror-separator, .column-resize-handle'))) el.remove();
    for (const el of Array.from(root.querySelectorAll<HTMLElement>('.peer-here'))) el.classList.remove('peer-here');
    return root;
  }

  destroy(): void {
    this.runner?.destroy();
    this.view.destroy();
    clearTimeout(this.statusTimer);
    if (typeof URL.revokeObjectURL === 'function') for (const url of this.urls.values()) if (url.startsWith('blob:')) URL.revokeObjectURL(url);
  }

  // ---------------------------------------------------------------------------

  private currentBlocks(): Block[] {
    const blocks = pmToBlocks(this.view.state.doc);
    return blocks.length ? blocks : [{ type: 'paragraph', style: 'normal', runs: [] }];
  }

  private resolve(key: string): ImageInfo | undefined {
    const res = this.doc.resources.get(key);
    if (!res) return undefined;
    let url = this.urls.get(key);
    if (!url) {
      url =
        typeof URL.createObjectURL === 'function'
          ? URL.createObjectURL(new Blob([res.data as BlobPart], { type: res.mediaType }))
          : `data:${res.mediaType};base64,${bytesToBase64(res.data)}`;
      this.urls.set(key, url);
    }
    return { url };
  }

  /** Map a pasted <img> to a resource key. */
  private lookup(img: HTMLImageElement): string | undefined {
    const key = img.dataset.resource;
    if (key && this.doc.resources.has(key)) return key;
    const src = img.getAttribute('src') ?? '';
    if (src.startsWith('data:image/')) {
      const decoded = decodeDataUri(src);
      if (decoded) return addResource(this.doc, decoded.data, decoded.mediaType);
    }
    return undefined;
  }

  private changed(): void {
    this.ctx.changed();
    this.statusSoon();
  }

  private statusSoon(): void {
    clearTimeout(this.statusTimer);
    this.statusTimer = setTimeout(() => this.ctx.statusChanged(), 150);
  }

  // --- toolbar ------------------------------------------------------------------

  private toolbar(): HTMLElement {
    const bar = this.buildToolbar();
    // Toolbar buttons never take the focus: the editor keeps its selection, and
    // the next key goes to the document (a refocus could lose the selection).
    bar.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).closest('button')) e.preventDefault();
    });
    return bar;
  }

  private buildToolbar(): HTMLElement {
    const act = (label: string, text: string, fn: () => void, title = label): HTMLButtonElement =>
      button(
        label,
        () => {
          fn();
          this.refocus();
        },
        { text, title },
      );
    const mark = (name: string, label: string, text: string, shortcut: string): HTMLButtonElement => {
      const b = act(label, text, () => this.command(toggleMark(schema.marks[name]!)), `${label} (${shortcut})`);
      b.setAttribute('aria-pressed', 'false');
      this.markButtons.push([name, b]);
      return b;
    };
    const state = (label: string, text: string, cmd: Command, active: () => boolean, shortcut: string): HTMLButtonElement => {
      const b = act(label, text, () => this.command(cmd), `${label} (${shortcut})`);
      b.setAttribute('aria-pressed', 'false');
      this.stateButtons.push([active, b]);
      return b;
    };
    const align = (a: Align, label: string, text: string, shortcut: string): HTMLButtonElement => state(label, text, setAlign(a), () => currentAlign(this.view.state) === a, shortcut);
    return h(
      'div',
      { class: 'toolbar', role: 'toolbar', 'aria-label': t('doc.formatting') },
      act(t('common.undo'), '↶', () => this.command(undo), `${t('common.undo')} (Ctrl+Z)`),
      act(t('common.redo'), '↷', () => this.command(redo), `${t('common.redo')} (Ctrl+Y)`),
      h('span', { class: 'sep' }),
      this.styleSelect,
      h('span', { class: 'sep' }),
      mark('bold', t('common.bold'), 'B', 'Ctrl+B'),
      mark('italic', t('common.italic'), 'I', 'Ctrl+I'),
      mark('underline', t('common.underline'), 'U', 'Ctrl+U'),
      mark('strike', t('common.strike'), 'S', 'Ctrl+Shift+X'),
      mark('code', t('doc.inlineCode'), '</>', 'Ctrl+`'),
      h('span', { class: 'sep' }),
      this.fontSelect,
      this.sizeSelect,
      this.colorControl(t('fmt.color'), 'A', '#c00000', (hex) => this.command(setMarkValue(schema.marks.color!, hex ? { hex } : null)), t('fmt.automatic')),
      this.colorControl(t('fmt.highlight'), '🖍', '#ffff00', (hex) => this.command(setMarkValue(schema.marks.highlight!, hex ? { hex } : null)), t('fmt.noHighlight')),
      act(t('fmt.clear'), '⌫', () => this.command(clearFormatting), `${t('fmt.clear')} (Ctrl+Space)`),
      h('span', { class: 'sep' }),
      state(t('common.bullets'), '•≡', toggleList(false), () => inList(this.view.state, false), 'Ctrl+Shift+8'),
      state(t('common.numbering'), '1≡', toggleList(true), () => inList(this.view.state, true), 'Ctrl+Shift+7'),
      h('span', { class: 'sep' }),
      align('left', t('common.alignLeft'), '⇤', 'Ctrl+L'),
      align('center', t('common.alignCenter'), '↔', 'Ctrl+E'),
      align('right', t('common.alignRight'), '⇥', 'Ctrl+R'),
      align('justify', t('common.justify'), '☰', 'Ctrl+J'),
      act(t('para.indentLess'), '⇠', () => this.command(changeIndent(-1))),
      act(t('para.indentMore'), '⇢', () => this.command(changeIndent(1))),
      this.lineSelect,
      act(t('para.button'), '¶', () => void this.editParagraph()),
      h('span', { class: 'sep' }),
      act(t('find.title'), '🔍', () => this.findBar.open(false), `${t('find.title')} (Ctrl+F, Ctrl+H)`),
      act(t('doc.insertLink'), '🔗', () => this.insertLink(), t('doc.insertLinkTitle')),
      act(t('common.insertImage'), '🖼', () => void this.pickImage()),
      act(t('doc.insertTable'), '▦', () => this.command(insertTable()), t('doc.insertTableTitle')),
      act(t('doc.insertEquation'), '∑', () => void this.editMath(), t('doc.insertEquationTitle')),
      act(t('doc.insertCode'), '{ }', () => void this.editCell(), t('doc.insertCodeTitle')),
      act(t('doc.insertDiagram'), '⧉', () => void this.editDiagram(), t('doc.insertDiagramTitle')),
      act(t('meta.button'), 'ⓘ', () => void this.editProperties(), t('meta.buttonTitle')),
      act(t('doc.insertRule'), '―', () => this.command(insertRule)),
    );
  }

  private updateToolbar(): void {
    const state = this.view?.state;
    if (!state) return;
    for (const [name, b] of this.markButtons) b.setAttribute('aria-pressed', String(markActive(state, schema.marks[name]!)));
    for (const [active, b] of this.stateButtons) b.setAttribute('aria-pressed', String(active()));
    this.styleSelect.value = currentStyle(state);
    const font = (markValue(state, schema.marks.font!, 'family') as string | undefined) ?? '';
    if (font && ![...this.fontSelect.options].some((o) => o.value === font)) this.fontSelect.append(h('option', { value: font }, font));
    this.fontSelect.value = font;
    const size = markValue(state, schema.marks.size!, 'pt') as number | undefined;
    if (size && ![...this.sizeSelect.options].some((o) => o.value === String(size))) this.sizeSelect.append(h('option', { value: String(size) }, String(size)));
    this.sizeSelect.value = size ? String(size) : '';
    const line = paragraphAttr(state, 'lineHeight') as number | null | undefined;
    if (line && ![...this.lineSelect.options].some((o) => o.value === String(line))) this.lineSelect.append(h('option', { value: String(line) }, `↕ ${line}`));
    this.lineSelect.value = line ? String(line) : '';
  }

  /** A colour button: applies the last colour; the swatch picks another; × removes it. */
  private colorControl(label: string, text: string, initial: string, apply: (hex: string | null) => void, resetLabel: string): HTMLElement {
    const picker = h('input', { type: 'color', value: initial, 'aria-label': label, title: label });
    const main = button(label, () => {
      apply(picker.value);
      this.refocus();
    }, { text, title: label, className: 'color-apply' });
    main.style.setProperty('--swatch', initial);
    picker.addEventListener('change', () => {
      main.style.setProperty('--swatch', picker.value);
      apply(picker.value);
      this.refocus();
    });
    const reset = button(resetLabel, () => {
      apply(null);
      this.refocus();
    }, { text: '×', title: resetLabel, className: 'color-reset' });
    return h('span', { class: 'color-control' }, main, picker, reset);
  }

  /** Paragraph spacing dialog (DOC-020). */
  private async editParagraph(): Promise<void> {
    const { editParagraphLayout } = await import('./paragraph-dialog');
    const node = this.view.state.selection.$from.parent;
    const a = node.attrs as Record<string, number | null>;
    const pick = (k: string): number | undefined => a[k] ?? undefined;
    const initial = { indent: pick('indent'), firstLine: pick('firstLine'), spaceBefore: pick('spaceBefore'), spaceAfter: pick('spaceAfter'), lineHeight: pick('lineHeight') };
    const value = await editParagraphLayout(this.element, Object.fromEntries(Object.entries(initial).filter(([, v]) => v !== undefined)));
    if (!value) return;
    this.command(setParagraphAttrs({ indent: value.indent ?? null, firstLine: value.firstLine ?? null, spaceBefore: value.spaceBefore ?? null, spaceAfter: value.spaceAfter ?? null, lineHeight: value.lineHeight ?? null }));
    this.refocus();
  }

  private insertLink(): void {
    const current = linkAt(this.view.state)?.attrs.href as string | undefined;
    const url = window.prompt(t('doc.linkPrompt'), current ?? 'https://');
    if (url === null) return;
    if (!url || url === 'https://') {
      if (current) this.command(toggleMark(schema.marks.link!, { href: current }));
      return;
    }
    if (!isSafeUrl(url)) {
      window.alert(t('doc.linkRefused'));
      return;
    }
    this.command(setLink(url));
  }

  // --- images, paste, drop -----------------------------------------------------

  private async pickImage(): Promise<void> {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml';
    const file = await new Promise<File | null>((resolve) => {
      input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true });
      input.addEventListener('cancel', () => resolve(null), { once: true });
      input.click();
    });
    if (file) await this.insertImageFile(file);
  }

  private async insertImageFile(file: File, pos?: number): Promise<void> {
    if (!file.type.startsWith('image/')) return;
    const data = new Uint8Array(await file.arrayBuffer());
    const key = addResource(this.doc, data, file.type, file.name);
    const node = schema.nodes.image!.create({ image: key, alt: file.name.replace(/\.[^.]+$/, '') });
    if (pos !== undefined) this.view.dispatch(this.view.state.tr.insert(pos, node));
    else this.command(insertInline(node));
  }

  private onPaste(e: ClipboardEvent): boolean {
    const data = e.clipboardData;
    if (!data) return false;
    const images = Array.from(data.files).filter((f) => f.type.startsWith('image/'));
    if (images.length) {
      void (async () => {
        for (const f of images) await this.insertImageFile(f);
      })();
      return true;
    }
    const html = data.getData('text/html');
    // Content copied from this editor keeps its exact structure.
    if (!html || html.includes('data-pm-slice')) return false;
    // Other sources: only the supported subset survives; pasted data: images become resources.
    const holder = document.createElement('div');
    holder.innerHTML = sanitizeHtml(html, (img) => this.lookup(img));
    const blocks = domToBlocks(holder, (img) => this.lookup(img));
    if (!blocks.length) return false;
    const nodes = blocks.map(blockToPm);
    const { $from, empty } = this.view.state.selection;
    if (empty && $from.parent.type === schema.nodes.paragraph && $from.parent.content.size === 0 && $from.depth > 0) {
      // An empty line takes the pasted blocks as they are (headings stay headings).
      const tr = this.view.state.tr.replaceWith($from.before(), $from.after(), Fragment.from(nodes));
      this.view.dispatch(tr.scrollIntoView());
      return true;
    }
    const open = (n: PmNode | undefined): number => (n?.type === schema.nodes.paragraph ? 1 : 0);
    const slice = new Slice(Fragment.from(nodes), open(nodes[0]), open(nodes[nodes.length - 1]));
    this.view.dispatch(this.view.state.tr.replaceSelection(slice).scrollIntoView());
    return true;
  }

  private onDrop(e: DragEvent): boolean {
    const files = Array.from(e.dataTransfer?.files ?? []).filter((f) => f.type.startsWith('image/'));
    if (!files.length) return false;
    const pos = this.view.posAtCoords({ left: e.clientX, top: e.clientY })?.pos;
    void (async () => {
      for (const f of files) await this.insertImageFile(f, pos);
    })();
    return true;
  }
}
