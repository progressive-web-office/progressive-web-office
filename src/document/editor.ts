/**
 * WYSIWYG editor view for text documents (DOC-003..DOC-010, DOC-013, DOC-015,
 * DOC-018), built on ProseMirror: a structured document with transactions,
 * a reliable undo history and precise collaboration.
 */
import { Fragment, Slice, type Node as PmNode } from 'prosemirror-model';
import { EditorState, NodeSelection, TextSelection, type Command, type Transaction } from 'prosemirror-state';
import { EditorView as PmView } from 'prosemirror-view';
import { toggleMark } from 'prosemirror-commands';
import { addColumnAfter, addColumnBefore, addRowAfter, addRowBefore, deleteColumn, deleteRow, deleteTable, isInTable, mergeCells, splitCell, toggleHeaderRow } from 'prosemirror-tables';
import { editCaption, pickReference, seqWord, type ReferenceTarget } from './xref-dialog';
import { manageReferences, pickCitation } from './bib-dialog';
import { citationsOf, type Citations } from './bibliography';
import { redo, undo } from 'prosemirror-history';
import { applyDocumentParts, documentParts, type CollabAdapter, type PeerCursor } from '../collab/parts';
import { documentTools, type AgentTool } from '../ai/tools';
import type { PrintSettings } from '../print/settings';
import { getLocale, t, type MessageKey } from '../i18n';
import { button, h } from '../app/dom';
import { sizeInput, type SizeInput } from '../app/size-input';
import type { EditorView, SaveVariant, SyncableDocument, ViewContext } from '../app/views';
import { domToBlocks, isSafeUrl, markdownInline, sanitizeHtml, type ImageInfo } from './html';
import { writeDocumentAsync, type TextFormat } from './io';
import { decodeDataUri } from './markdown-reader';
import { bytesToBase64 } from './markdown-writer';
import { addResource, newAnchor, wordCount, type Run, type Align, type Block, type ParagraphStyle, type RichDocument, type Revision } from './model';
import type { CodeRunner } from '../code/runner';
import { blockToPm, blocksToPm, pmCiteRuns, pmCrossTargets, pmToBlocks, type PmCrossRefs } from './pm/convert';
import { schema } from './pm/schema';
import { inDisplayEquation, insertBlockAfter, insertCaption, insertCrossReference, numberEquation, insertToc, changeIndent, clearFormatting, currentAlign, currentStyle, inList, insertInline, insertOnOwnLine, insertRule, insertTable, linkAt, markActive, markValue, paragraphAttr, setAlign, setLink, setMarkValue, setParagraphAttrs, setStyle, toggleList } from './pm/commands';
import { LINE_SPACINGS } from './paragraph-dialog';
import { basePlugins, peersKey, type PeerMarker } from './pm/plugins';
import { cellHandle, nodeViews } from './pm/views';
import { listCss } from './pm/list-css';
import { askAuthor } from '../app/author';
import { isHistoryTransaction } from 'prosemirror-history';
import { ChangePanel } from './change-panel';
import { trackTransaction, UNTRACKED } from './changes';
import { withoutSolutions } from './solutions';
import { TRANSFORMS, transformText, typographyRules, type TransformId } from './text-tools';
import { loadTypography, saveTypography } from './typography';
import { writingKey, writingPlugin } from './pm/writing-plugin';
import { readability } from './readability';
import { addWritten, loadGoal, saveGoal } from './writing-stats';
import { CommentPanel } from './comment-panel';
import { pruneComments } from './comments';
import { FindBar } from './find-bar';
import { editPageSetup, pageSetupCss, zonePreview } from './page-setup';
import { DocReview } from './review';
import { loadReading } from '../review/settings';
import { REVIEW_KEYWORDS } from '../review/keys';

/** Words finding a button in the command palette (UI-018). */
function withKeywords(b: HTMLButtonElement, keywords: string): HTMLButtonElement {
  b.dataset.keywords = keywords;
  return b;
}
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
const SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72, 96, 120, 144];

const STYLES: [ParagraphStyle, MessageKey][] = [
  ['normal', 'doc.style.normal'],
  ['h1', 'doc.style.h1'],
  ['h2', 'doc.style.h2'],
  ['h3', 'doc.style.h3'],
  ['h4', 'doc.style.h4'],
  ['quote', 'doc.style.quote'],
  ['code', 'doc.style.code'],
  ['caption', 'doc.style.caption'],
];

/** Transactions coming from other participants: not "changes" of this user. */
const REMOTE = 'pwo-remote';


export class DocumentEditor implements EditorView {
  readonly element: HTMLElement;
  private readonly page: HTMLElement;
  readonly view: PmView;
  private readonly styleSelect: HTMLSelectElement;
  private readonly fontSelect: HTMLSelectElement;
  private readonly sizeSelect: SizeInput;
  private readonly lineSelect: HTMLSelectElement;
  private readonly markButtons: [string, HTMLButtonElement][] = [];
  private readonly stateButtons: [() => boolean, HTMLButtonElement][] = [];
  /** Table commands, enabled when they apply (DOC-025). */
  private readonly tableButtons: [Command, HTMLButtonElement][] = [];
  private tableBar!: HTMLElement;
  private readonly urls = new Map<string, string>();
  private statusTimer: ReturnType<typeof setTimeout> | undefined;
  private runner: CodeRunner | undefined;
  private readonly findBar: FindBar;
  private readonly tocViews = new Set<{ refresh(): void }>();
  /** The footnotes, listed under the page (DOC-022). */
  private readonly notes = h('aside', { class: 'doc-notes', 'aria-label': t('note.notes') });
  /** Header and footer previews around the page (DOC-024). */
  private readonly headerStrip = h('div', { class: 'doc-furniture header', role: 'button', tabindex: '0', title: t('hf.edit'), 'aria-label': t('hf.header') });
  private readonly footerStrip = h('div', { class: 'doc-furniture footer', role: 'button', tabindex: '0', title: t('hf.edit'), 'aria-label': t('hf.footer') });
  /** CODE-004: the user agreed to run this document's code. */
  private trusted = false;
  /** REV-001: the comments beside the page. */
  private readonly comments: CommentPanel;
  /** REV-005: tracked changes, recorded while `tracking` with this author. */
  private readonly changesPanel: ChangePanel;
  private tracking: Revision | undefined;
  private readonly trackButton: HTMLButtonElement;
  /** DOC-031: typography as you type (kept for the next documents). */
  private typography = loadTypography();
  private readonly textTools = h('select', { 'aria-label': t('text.tools'), title: t('text.toolsTitle'), class: 'text-tools' });
  /** DOC-033..DOC-035: how the document is shown while writing. */
  private readonly viewMenu = h('select', { 'aria-label': t('wview.menu'), title: t('wview.menuTitle'), class: 'text-tools' });
  private writing = { readability: false, focus: false, typewriter: false };
  private goal: number | undefined;
  private lastWords: number | undefined;
  private wordsTimer: ReturnType<typeof setTimeout> | undefined;
  private timerEnd = 0;
  private timerTick: ReturnType<typeof setInterval> | undefined;
  /** TEACH-001: solutions shown (answer key) or hidden (exercise sheet). */
  private readonly solutionsButton = button(t('solution.hide'), () => this.toggleSolutions(), { text: '👁', title: t('solution.hideTitle') });
  private hadSolutions = false;

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
    // UI-016: any size can be typed, the usual ones are suggested.
    this.sizeSelect = sizeInput({
      label: t('fmt.size'),
      suggestions: SIZES,
      onChange: (pt) => {
        this.command(setMarkValue(schema.marks.size!, { pt }));
        this.refocus();
      },
    });
    this.lineSelect = h('select', { 'aria-label': t('para.lineSpacing'), title: t('para.lineSpacing'), class: 'size-select' }, h('option', { value: '' }, '↕'), ...LINE_SPACINGS.map((n) => h('option', { value: String(n) }, `↕ ${n}`)));
    this.lineSelect.addEventListener('change', () => {
      const v = Number(this.lineSelect.value);
      this.command(setParagraphAttrs({ lineHeight: v || null }));
      this.refocus();
    });
    this.findBar = new FindBar(() => this.view);
    this.comments = new CommentPanel({ view: () => this.view, doc: this.doc, readOnly: () => this.readOnly, changed: () => this.changed() });
    this.changesPanel = new ChangePanel(() => this.view, () => this.readOnly);
    this.trackButton = button(t('track.button'), () => void this.toggleTracking(), { text: '±', title: t('track.title'), className: 'track-btn' });
    this.trackButton.setAttribute('aria-pressed', 'false');
    const scroller = h('div', { class: 'doc-scroll' }, this.headerStrip, this.page, this.footerStrip, this.notes);
    this.element = h('div', { class: 'doc-editor' });
    // REVIEW-001: read and comment page by page.
    this.review = new DocReview(
      {
        root: this.element,
        scroller,
        view: () => this.view,
        setReviewing: (on) => {
          this.reviewing = on;
          this.view.setProps({});
          this.updateToolbar();
        },
        comment: () => this.addComment(),
        find: () => this.findBar.open(false),
        notify: (message) => (this.ctx.notify ? this.ctx.notify(message) : window.alert(message)),
        statusChanged: () => this.ctx.statusChanged(),
      },
      () => this.review.toggle(false),
    );
    this.element.append(
      this.toolbar(),
      this.review.bar,
      this.buildTableBar(),
      this.findBar.element,
      h('div', { class: 'doc-body' }, scroller, h('div', { class: 'doc-side' }, this.changesPanel.element, this.comments.element)),
    );
    for (const strip of [this.headerStrip, this.footerStrip]) {
      strip.addEventListener('click', () => void this.editPageSetup());
      strip.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          void this.editPageSetup();
        }
      });
    }
    this.renderFurniture();
    this.view = new PmView(
      { mount: this.page },
      {
        state: EditorState.create({
          doc: blocksToPm(doc.blocks),
          plugins: [
            // DOC-031: typography as you type, in the document's language.
            typographyRules({ enabled: () => this.typography, lang: () => this.lang() }),
            // DOC-033, DOC-035: readability and focus decorations.
            writingPlugin((score, level, wps) => t('read.label', { score, level: t(`read.${level}` as MessageKey), wps })),
            ...basePlugins({ footnote: () => void this.editNote(), find: (replace) => this.findBar.open(replace), link: () => this.insertLink(), math: () => void this.editMath(), diagram: () => void this.editDiagram() }),
          ],
        }),
        nodeViews: nodeViews({
          resolve: (key) => this.resolve(key),
          editMath: (pos, node) => void this.editMath(pos, node),
          editFootnote: (pos, node) => void this.editNote(pos, node),
          tocViews: this.tocViews,
          tocEntries: (levels) => this.headings(levels),
          gotoHeading: (pos) => {
            this.view.dispatch(this.view.state.tr.setSelection(TextSelection.near(this.view.state.doc.resolve(pos + 1))).scrollIntoView());
            this.view.focus();
          },
          editDiagram: (pos, node) => void this.editDiagram(pos, node),
          cellAction: (action, pos, node) => this.onCellAction(action, pos, node),
          xref: () => this.crossRefs(),
          gotoAnchor: (id) => this.gotoAnchor(id),
          citations: () => this.citations(),
          openInclude: (src) => this.ctx.openLink?.(src) ?? false,
          editCitation: (pos, node) => void this.editCitation(pos, node),
          editImage: (pos, node) => void this.describeImage(pos, node),
        }),
        editable: () => !this.readOnly && !this.reviewing,
        attributes: { role: 'textbox', 'aria-multiline': 'true', 'aria-label': t('doc.label'), spellcheck: 'true', class: 'doc-page' },
        dispatchTransaction: (tr) => this.dispatch(tr),
        handlePaste: (_view, event) => this.onPaste(event),
        // FOLDER-003: Ctrl+click follows a link (a relative one from the open folder).
        handleClick: (view, pos, event) => {
          if (!(event.ctrlKey || event.metaKey)) return false;
          const mark = schema.marks.link!.isInSet(view.state.doc.resolve(pos).marks());
          const href = (event.target as HTMLElement).closest?.('a[href]:not(.xref)')?.getAttribute('href') ?? (mark?.attrs.href as string | undefined);
          if (!href || href.startsWith('#')) return false;
          if (!this.ctx.openLink?.(href) && isSafeUrl(href)) window.open(href, '_blank', 'noopener');
          return true;
        },
        handleDrop: (_view, event) => this.onDrop(event as DragEvent),
        handleKeyDown: (_view, event) => {
          // REV-001: Ctrl+Alt+M comments the selection.
          if (!(event.ctrlKey || event.metaKey) || !event.altKey || event.key.toLowerCase() !== 'm') return false;
          this.addComment();
          return true;
        },
      },
    );
    this.updateToolbar();
    this.renderNotes();
    this.comments.refresh();
    this.changesPanel.refresh();
    this.hadSolutions = this.hasSolutions();
    // DOC-034: the goal of this document, and the words it starts with.
    this.goal = loadGoal(this.goalKey());
    this.lastWords = this.words();
    this.element.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.writing.focus) this.setWriting({ focus: false });
      // REVIEW-001: Ctrl+Alt+R enters and leaves the review mode.
      if ((e.ctrlKey || e.metaKey) && e.altKey && !e.shiftKey && e.code === 'KeyR') {
        e.preventDefault();
        this.review.toggle();
      }
    });
    this.element.style.setProperty('--solution-label', JSON.stringify(t('solution.label')));
    for (const toc of this.tocViews) toc.refresh();
  }

  /** Header and footer shown above and below the page, fields as examples. */
  private renderFurniture(): void {
    const page = this.doc.page;
    const title = this.doc.meta.title ?? '';
    for (const [strip, kind] of [[this.headerStrip, 'header'], [this.footerStrip, 'footer']] as const) {
      const zones = page?.[kind];
      strip.hidden = !zones;
      strip.replaceChildren(...(['left', 'center', 'right'] as const).map((z) => h('span', { class: `zone ${z}` }, zones?.[z] ? zonePreview(zones[z]!, title, page) : '')));
    }
  }

  /** Header and footer dialog (DOC-024). */
  private async editPageSetup(): Promise<void> {
    const setup = await editPageSetup(this.element, this.doc.page);
    if (!setup) return;
    if (setup.header || setup.footer) this.doc.page = setup;
    else delete this.doc.page;
    this.renderFurniture();
    this.changed();
  }

  /** Top-level headings up to `levels`, with their positions (DOC-023). */
  /** Numbers and cross-reference targets, recomputed after a change (DOC-026). */
  private xrefCache: PmCrossRefs | undefined;

  private crossRefs(): PmCrossRefs {
    if (!this.view) return { numbers: new Map(), targets: new Map() };
    this.xrefCache ??= pmCrossTargets(this.view.state.doc);
    return this.xrefCache;
  }

  /** Put the cursor at the start of the paragraph with this anchor. */
  private gotoAnchor(id: string): void {
    let at: number | undefined;
    this.view.state.doc.descendants((node, pos) => {
      if (at !== undefined) return false;
      if (node.type === schema.nodes.paragraph && node.attrs.anchor === id) at = pos;
      return node.type !== schema.nodes.paragraph;
    });
    if (at === undefined) return;
    this.view.dispatch(this.view.state.tr.setSelection(TextSelection.near(this.view.state.doc.resolve(at + 1))).scrollIntoView());
    this.view.focus();
  }

  /** Citation numbers and texts, recomputed after a change (DOC-027). */
  private citeCache: Citations | undefined;

  private citations(): Citations {
    if (!this.view) return citationsOf([], this.doc.references);
    this.citeCache ??= citationsOf(pmCiteRuns(this.view.state.doc), this.doc.references);
    return this.citeCache;
  }

  /** The sources changed: renumber the citations and the list. */
  private referencesChanged(): void {
    this.citeCache = undefined;
    for (const v of this.tocViews) v.refresh();
  }

  /** The document's sources and citation style (DOC-027). */
  private async editReferences(): Promise<void> {
    const cited = new Set(pmCiteRuns(this.view.state.doc).flatMap((c) => c.cite));
    const choice = await manageReferences(this.element, this.doc.references, cited);
    if (!choice) return;
    if (choice.references.entries.length || choice.references.style) this.doc.references = choice.references;
    else delete this.doc.references;
    this.referencesChanged();
    if (choice.insertList) this.command(insertBlockAfter(schema.nodes.bibliography!.create()));
    else this.changed();
    this.refocus();
  }

  /** Cite sources at the cursor, or change the citation at `pos` (DOC-027). */
  private async editCitation(pos?: number, node?: PmNode): Promise<void> {
    if (this.readOnly) return;
    const initial = node ? { cite: node.attrs.keys as string[], ...(node.attrs.locator ? { locator: node.attrs.locator as string } : {}) } : undefined;
    const result = await pickCitation(this.element, this.doc.references?.entries ?? [], initial);
    if (!result) return this.refocus();
    const tr = this.view.state.tr;
    if (result === 'remove') {
      if (pos !== undefined && node) tr.delete(pos, pos + node.nodeSize);
    } else {
      const cite = schema.nodes.cite!.create({ keys: result.cite, locator: result.locator ?? null });
      if (pos !== undefined && node) tr.replaceWith(pos, pos + node.nodeSize, cite);
      else tr.replaceSelectionWith(cite, false);
    }
    this.view.dispatch(tr.scrollIntoView());
    this.refocus();
  }

  /** Number a figure, table or equation (DOC-026). */
  private async editCaption(): Promise<void> {
    const state = this.view.state;
    const choice = await editCaption(this.element, { equation: inDisplayEquation(state), inTable: isInTable(state) });
    if (!choice) return;
    if (choice.kind === 'equation') this.command(numberEquation(newAnchor('equation')));
    else this.command(insertCaption(choice.kind, seqWord(choice.kind), choice.text, newAnchor(choice.kind)));
    this.refocus();
  }

  /** Refer to a numbered item or a heading (DOC-026). */
  private async insertCrossReference(): Promise<void> {
    const { targets } = this.crossRefs();
    const list: ReferenceTarget[] = [...targets.values()].map((x) => ({ id: x.id, kind: x.kind, label: x.label, description: x.description }));
    // Headings without an anchor get one when they are chosen.
    this.view.state.doc.descendants((node, pos) => {
      if (node.type !== schema.nodes.paragraph) return true;
      const text = node.textContent.replace(/\s+/g, ' ').trim();
      if (/^h\d$/.test(node.attrs.style as string) && !node.attrs.anchor && text) list.push({ id: newAnchor('heading'), kind: 'heading', label: text, description: text, anchorAt: pos });
      return false;
    });
    const target = await pickReference(this.element, list);
    if (target) this.command(insertCrossReference(target.id, target.anchorAt));
    this.refocus();
  }

  private headings(levels: number): { level: number; text: string; pos: number }[] {
    const out: { level: number; text: string; pos: number }[] = [];
    this.view?.state.doc.forEach((node, pos) => {
      const m = node.type === schema.nodes.paragraph ? /^h(\d)$/.exec(node.attrs.style as string) : null;
      const text = node.textContent.replace(/\s+/g, ' ').trim();
      if (m && Number(m[1]) <= levels && text) out.push({ level: Number(m[1]), text, pos });
    });
    return out;
  }

  /** Footnotes in reading order, under the page; clicking one edits it. */
  private renderNotes(): void {
    const items: HTMLElement[] = [];
    this.view.state.doc.descendants((node, pos) => {
      if (node.type !== schema.nodes.footnote) return true;
      const n = items.length + 1;
      const li = h('li', { value: String(n) });
      li.append(...markdownInline(node.attrs.runs as Run[]));
      li.addEventListener('click', () => void this.editNote(pos, node));
      items.push(li);
      return false;
    });
    this.notes.hidden = !items.length;
    this.notes.replaceChildren(...(items.length ? [h('h2', { class: 'sr-only' }, t('note.notes')), h('ol', {}, ...items)] : []));
    if (this.notes.querySelector('span.math')) void import('../math/ui').then(({ renderMath }) => renderMath(this.notes));
  }

  /** Insert a footnote at the cursor, or edit one; an emptied note is removed (DOC-022). */
  private async editNote(pos?: number, node?: PmNode): Promise<void> {
    if (this.readOnly) return;
    const { editFootnote } = await import('./footnote-dialog');
    const runs = await editFootnote(this.element, node?.attrs.runs as Run[] | undefined);
    if (!runs) return;
    if (pos !== undefined) {
      const tr = this.view.state.tr;
      if (runs.length) tr.setNodeMarkup(pos, undefined, { runs });
      else tr.delete(pos, pos + 1);
      this.view.dispatch(tr);
    } else if (runs.length) {
      this.command(insertInline(schema.nodes.footnote!.create({ runs })));
    }
    this.refocus();
  }

  private dispatch(tr: Transaction): void {
    // REV-005: while tracking, edits are recorded as insertions and deletions.
    if (this.tracking && tr.docChanged && !tr.getMeta(REMOTE) && !tr.getMeta(UNTRACKED) && !isHistoryTransaction(tr)) {
      tr = trackTransaction(this.view.state, tr, { ...this.tracking, date: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z') });
    }
    const state = this.view.state.apply(tr);
    this.view.updateState(state);
    if (tr.docChanged && !tr.getMeta(REMOTE)) this.changed();
    else if (tr.selectionSet) this.statusSoon();
    this.updateToolbar();
    if (tr.docChanged && this.findBar?.isOpen) this.findBar.refresh();
    if (this.writing.typewriter && (tr.docChanged || tr.selectionSet)) this.centerCursor();
    if (this.review.active) {
      if (tr.docChanged) this.review.relayout();
      else if (tr.selectionSet) this.review.reveal(state.selection.head);
    }
    if (tr.docChanged) {
      this.countWords();
      this.comments.refresh();
      this.changesPanel.refresh();
      // TEACH-001: the sheet variants appear with the first solution.
      const has = this.hasSolutions();
      if (has !== this.hadSolutions) {
        this.hadSolutions = has;
        this.ctx.headerChanged?.();
      }
    }
    else if (tr.selectionSet) this.comments.selectionChanged();
    if (tr.docChanged) {
      this.xrefCache = undefined;
      this.citeCache = undefined;
      this.renderNotes();
      for (const toc of this.tocViews) toc.refresh();
    }
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
    if (this.readOnly) return;
    if (action === 'run') void this.runCells([pos]);
    else if (action === 'run-all') void this.runCells(this.cellPositions());
    else if (action === 'stop') this.runner?.stop();
    else if (action === 'edit') void this.editCell(pos, node);
    // CODE-013: show or hide the code, the output staying.
    else if (action === 'toggle-code') this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, hidden: !node.attrs.hidden }));
  }

  /** CODE-013: hide (or show) the code of every cell of the document. */
  private setAllCodeHidden(hidden: boolean): void {
    const tr = this.view.state.tr;
    this.view.state.doc.descendants((n, pos) => {
      if (n.type === schema.nodes.code_cell && !!n.attrs.hidden !== hidden) tr.setNodeMarkup(pos, undefined, { ...n.attrs, hidden });
    });
    if (tr.docChanged) this.view.dispatch(tr);
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
    if (this.readOnly) return;
    const { editCell } = await import('../code/ui');
    const current = node?.attrs as { cell: string; lang: 'python' | 'javascript'; output: unknown } | undefined;
    // CODE-011: the interpreter of the document's cells completes with what it knows, once running.
    const value = await editCell(this.element, current ? { lang: current.lang, code: current.cell } : undefined, (code, line, column) => this.runner?.complete(code, line, column) ?? Promise.resolve(null));
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
    if (this.readOnly) return;
    const { editDiagram } = await import('../diagram/ui');
    const source = await editDiagram(this.element, (node?.attrs.diagram as string | undefined) ?? '');
    if (source === null) return;
    if (pos !== undefined) this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, undefined, { ...node!.attrs, diagram: source }));
    else this.command(insertOnOwnLine(schema.nodes.diagram!.create({ diagram: source, lang: 'mermaid' })));
    this.refocus();
  }

  /** Insert a new equation at the cursor, or edit an existing one (MATH-001). */
  private async editMath(pos?: number, node?: PmNode): Promise<void> {
    if (this.readOnly) return;
    const { editEquation } = await import('../math/ui');
    const value = await editEquation(this.element, node ? { latex: node.attrs.math as string, display: !!node.attrs.display } : undefined);
    if (!value) return;
    const attrs = { math: value.latex, display: value.display };
    if (pos !== undefined) this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, undefined, attrs));
    else this.command(insertInline(schema.nodes.math!.create(attrs)));
    this.refocus();
  }

  /** Document properties: title, author, keywords… (DOC-017). */
  /** The accessibility check, and a way to each issue (DOC-030). */
  private async checkAccessibility(): Promise<void> {
    const [{ checkAccessibility }, { showAccessibility }] = await Promise.all([import('./a11y'), import('./a11y-dialog')]);
    const choice = await showAccessibility(this.element, checkAccessibility(this.view.state.doc, this.doc.meta));
    if (!choice) return this.refocus();
    const { issue, fix } = choice;
    if (issue.kind === 'title' || issue.kind === 'language') return void this.editProperties();
    if (issue.pos === undefined) return;
    const node = this.view.state.doc.nodeAt(issue.pos);
    if (fix && node?.type === schema.nodes.image) return void this.describeImage(issue.pos, node);
    const tr = this.view.state.tr;
    if (node && !node.isText && node.type !== schema.nodes.paragraph && !node.isBlock) tr.setSelection(NodeSelection.create(tr.doc, issue.pos));
    else tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(issue.pos + 1, tr.doc.content.size))));
    this.view.dispatch(tr.scrollIntoView());
    if (fix && issue.kind === 'tableHeader') this.command(toggleHeaderRow);
    this.refocus();
  }

  private async editProperties(): Promise<void> {
    const { editProperties } = await import('./properties');
    const meta = await editProperties(this.element, this.doc.meta);
    if (!meta) return;
    this.doc.meta = meta;
    this.renderFurniture();
    this.changed();
  }

  // --- EditorView ---------------------------------------------------------------

  mounted(): void {
    // SET-002: documents with text may open in review mode.
    if (loadReading().review && this.view.state.doc.textContent.trim()) this.review.toggle(true, false);
  }

  focus(): void {
    this.view.focus();
  }

  status(): string {
    const { words, characters } = wordCount({ ...this.doc, blocks: this.currentBlocks() });
    const extra: string[] = [];
    if (this.goal) extra.push(t('goal.status', { words, goal: this.goal, pct: Math.min(100, Math.round((words / this.goal) * 100)) }));
    if (this.timerEnd) {
      const left = Math.max(0, Math.ceil((this.timerEnd - Date.now()) / 1000));
      extra.push(`⏱ ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`);
    }
    if (this.writing.readability) {
      const r = readability(this.view.state.doc.textBetween(0, this.view.state.doc.content.size, '\n', ' '), this.lang());
      if (r) extra.push(t('read.status', { score: r.score, level: t(`read.${r.level}` as MessageKey) }));
    }
    if (this.tracking) extra.push(t('track.on'));
    const page = this.review.status();
    if (page) extra.unshift(page);
    return [t(words === 1 ? 'doc.word' : 'doc.words', { words, characters }), ...extra].join(' · ');
  }

  async save(format: Parameters<EditorView['save'] & object>[0]): Promise<Uint8Array> {
    this.doc.blocks = this.currentBlocks();
    // REV-001: comments whose text is gone are left out (an undo can still bring them back here).
    const out = { ...this.doc };
    pruneComments(out);
    return writeDocumentAsync(out, format as TextFormat);
  }

  /** The document's language, else the interface's. */
  private lang(): string {
    return this.doc.meta.language || getLocale();
  }

  /** "Text" menu: typography as you type, and transforms of the selection or the document (DOC-031, DOC-032). */
  private textToolsMenu(): HTMLSelectElement {
    const select = this.textTools;
    const fill = (): void => {
      select.replaceChildren(
        h('option', { value: '' }, t('text.tools')),
        h('option', { value: 'typography' }, `${this.typography ? '✓ ' : ''}${t('text.typography')}`),
        ...TRANSFORMS.map((id) => h('option', { value: id }, t(`text.${id}` as MessageKey))),
      );
    };
    fill();
    select.addEventListener('change', () => {
      const value = select.value;
      select.value = '';
      if (value === 'typography') {
        this.typography = !this.typography;
        saveTypography(this.typography);
        fill();
      } else if (value && !this.readOnly) {
        this.command((state, dispatch) => {
          dispatch?.(transformText(state, value as TransformId, this.lang()).scrollIntoView());
          return true;
        });
      }
      this.refocus();
    });
    return select;
  }

  /** "View" menu: readability, focus and typewriter modes, writing goal (DOC-033..DOC-035). */
  private viewToolsMenu(): HTMLSelectElement {
    const select = this.viewMenu;
    const mark = (on: boolean): string => (on ? '✓ ' : '');
    const fill = (): void => {
      select.replaceChildren(
        h('option', { value: '' }, t('wview.menu')),
        h('option', { value: 'readability' }, `${mark(this.writing.readability)}${t('wview.readability')}`),
        h('option', { value: 'focus' }, `${mark(this.writing.focus)}${t('wview.focus')}`),
        h('option', { value: 'typewriter' }, `${mark(this.writing.typewriter)}${t('wview.typewriter')}`),
        h('option', { value: 'goal' }, t('wview.goal')),
        h('option', { value: 'hide-code' }, t('code.hideAll')),
        h('option', { value: 'show-code' }, t('code.showAll')),
      );
    };
    fill();
    select.addEventListener('refill', fill);
    select.addEventListener('change', () => {
      const value = select.value;
      select.value = '';
      if (value === 'goal') void this.editGoal();
      else if (value === 'hide-code' || value === 'show-code') this.setAllCodeHidden(value === 'hide-code');
      else if (value === 'readability' || value === 'focus' || value === 'typewriter') this.setWriting({ [value]: !this.writing[value] });
      fill();
      this.refocus();
    });
    return select;
  }

  private setWriting(patch: Partial<typeof this.writing>): void {
    this.writing = { ...this.writing, ...patch };
    this.element.classList.toggle('focus-mode', this.writing.focus);
    this.element.classList.toggle('typewriter', this.writing.typewriter);
    this.view.dispatch(this.view.state.tr.setMeta(writingKey, { readability: this.writing.readability, focus: this.writing.focus, lang: this.lang() }));
    if (this.writing.typewriter) this.centerCursor();
    this.viewMenu.dispatchEvent(new Event('refill'));
    this.ctx.statusChanged();
  }

  /** Typewriter mode: the line of the cursor stays in the middle of the screen. */
  private centerCursor(): void {
    let scroller: HTMLElement | null = this.page.parentElement;
    while (scroller && !(scroller.scrollHeight > scroller.clientHeight && /auto|scroll/.test(getComputedStyle(scroller).overflowY))) scroller = scroller.parentElement;
    const target = scroller ?? (document.scrollingElement as HTMLElement | null);
    if (!target) return;
    try {
      const at = this.view.coordsAtPos(this.view.state.selection.head);
      const box = scroller ? scroller.getBoundingClientRect() : { top: 0, height: window.innerHeight };
      target.scrollTop += at.top - (box.top + box.height / 2);
    } catch {
      /* not laid out */
    }
  }

  /** The key of the document's goal: its title or first heading. */
  private goalKey(): string {
    let first = '';
    this.view.state.doc.descendants((node) => {
      if (first) return false;
      if (node.type === schema.nodes.paragraph && /^h\d$/.test(node.attrs.style as string)) first = node.textContent.trim();
      return !first;
    });
    return this.doc.meta.title?.trim() || first || 'untitled';
  }

  private words(): number {
    return wordCount({ ...this.doc, blocks: this.currentBlocks() }).words;
  }

  private async editGoal(): Promise<void> {
    const { editGoal } = await import('./goal-dialog');
    const choice = await editGoal(this.element, { goal: this.goal, words: this.words() });
    if (!choice) return this.refocus();
    this.goal = choice.goal;
    saveGoal(this.goalKey(), choice.goal);
    if (choice.timer) this.startTimer(choice.timer);
    this.ctx.statusChanged();
    this.refocus();
  }

  /** A focus timer shown in the status bar. */
  private startTimer(minutes: number): void {
    clearInterval(this.timerTick);
    this.timerEnd = Date.now() + minutes * 60_000;
    this.timerTick = setInterval(() => {
      if (Date.now() >= this.timerEnd) {
        clearInterval(this.timerTick);
        this.timerEnd = 0;
        this.ctx.statusChanged();
        window.alert(t('goal.timerDone'));
        return;
      }
      this.ctx.statusChanged();
    }, 1000);
    this.ctx.statusChanged();
  }

  /** Words added since the last count go to today's statistics. */
  private countWords(): void {
    clearTimeout(this.wordsTimer);
    this.wordsTimer = setTimeout(() => {
      const now = this.words();
      if (this.lastWords !== undefined) addWritten(now - this.lastWords);
      this.lastWords = now;
    }, 2000);
  }

  /** Show or hide the solutions, on screen and in print (TEACH-001). */
  private toggleSolutions(): void {
    const hidden = this.element.classList.toggle('hide-solutions');
    this.solutionsButton.setAttribute('aria-pressed', String(hidden));
  }

  /** The exercise sheet: copies without the solutions (TEACH-001). */
  saveVariants(): SaveVariant[] {
    if (!this.hasSolutions()) return [];
    return (['odt', 'docx', 'md'] as const).map((format) => ({
      id: `sheet-${format}`,
      label: t('solution.sheet', { ext: format }),
      format,
      suffix: t('solution.sheetSuffix'),
      save: () => {
        const doc = withoutSolutions({ ...this.doc, blocks: this.currentBlocks() });
        pruneComments(doc);
        return writeDocumentAsync(doc, format);
      },
    }));
  }

  /** N variants of the sheet and their answer keys, in a ZIP (TEACH-002). */
  private async generateVariants(): Promise<void> {
    const doc = { ...this.doc, blocks: this.currentBlocks() };
    const [{ definitions, draw, random, substitute, checkDefinitions }, { chooseVariants }] = await Promise.all([import('../teach/variants'), import('../teach/variants-dialog')]);
    const defs = definitions(doc);
    if (!defs.length) return window.alert(t('variants.none'));
    const problems = checkDefinitions(defs);
    if (problems.length) return window.alert(t('variants.error', { message: problems.join('\n') }));
    const choice = await chooseVariants(this.element, defs, this.hasSolutions());
    if (!choice) return this.refocus();
    const [{ writeZip }, { saveFile }] = await Promise.all([import('../core/zip'), import('../storage/file-io')]);
    const stem = (doc.meta.title || t('variants.stem')).replace(/[\\/:*?"<>|]+/g, '-').trim();
    const pad = (n: number): string => String(n).padStart(String(choice.count).length, '0');
    const entries: { path: string; data: Uint8Array | string }[] = [];
    const rows: string[] = [['variant', ...defs.map((d) => d.name)].join(',')];
    for (let i = 1; i <= choice.count; i++) {
      const values = draw(defs, random(choice.seed + i));
      const variant = substitute(doc, values);
      pruneComments(variant);
      entries.push({ path: `${stem}-${pad(i)}.${choice.format}`, data: await writeDocumentAsync(withoutSolutions(variant), choice.format) });
      if (choice.keys) entries.push({ path: `${stem}-${pad(i)}-${t('variants.keySuffix')}.${choice.format}`, data: await writeDocumentAsync(variant, choice.format) });
      rows.push([String(i), ...defs.map((d) => JSON.stringify(String(values[d.name] ?? '')))].join(','));
    }
    entries.push({ path: `${stem}-values.csv`, data: `${rows.join('\n')}\n` });
    await saveFile(writeZip(entries), `${stem}-variants.zip`, 'texzip', { mimeType: 'application/zip', extension: 'zip' });
    this.refocus();
  }

  private hasSolutions(): boolean {
    let found = false;
    this.view?.state.doc.descendants((node) => {
      if (found) return false;
      if (node.type === schema.nodes.paragraph && node.attrs.solution) found = true;
      return !found;
    });
    return found;
  }

  /** Record the edits as tracked changes, or stop (REV-005). */
  private async toggleTracking(): Promise<void> {
    if (this.tracking) this.tracking = undefined;
    else {
      const author = await askAuthor(t('comment.yourName'));
      this.tracking = author ? { author } : {};
    }
    this.trackButton.setAttribute('aria-pressed', String(!!this.tracking));
    this.element.classList.toggle('tracking', !!this.tracking);
    this.ctx.statusChanged();
  }

  /** Comment the selection or the word at the cursor (REV-001). */
  private addComment(): void {
    if (this.readOnly) return;
    if (!this.comments.add()) window.alert(t('comment.selectText'));
  }

  /** FILE-017: no edits while read-only (toolbars hidden, document not editable). */
  private readOnly = false;
  /** REVIEW-001: reading and commenting, the text itself not editable. */
  private reviewing = false;
  private review!: DocReview;

  setReadOnly(readOnly: boolean): void {
    this.readOnly = readOnly;
    this.element.classList.toggle('read-only', readOnly);
    this.view.setProps({});
  }

  /** UI-018: the review mode in the palette, even when the toolbar is hidden (read-only). */
  commands(): import('../app/palette').PaletteCommand[] {
    const toggle = this.review.active
      ? { label: t('review.leaveTitle'), where: t('review.bar'), keys: ['Ctrl+Alt+R'], run: () => this.review.toggle(false) }
      : { label: t('review.mode'), where: t('doc.formatting'), keys: ['Ctrl+Alt+R'], keywords: REVIEW_KEYWORDS, run: () => this.review.toggle(true) };
    return [toggle, ...this.review.commands()];
  }

  /** FOLDER-002: show the first match of a search from the folder panel. */
  find(query: string): void {
    this.findBar.openWith(query);
  }

  /** DOC-028: the document, its sub-documents as include blocks. */
  masterDocument(): RichDocument {
    return { ...this.doc, blocks: this.currentBlocks() };
  }

  /** DOC-028: include a document of the folder (or a path) after the current block. */
  private async insertInclude(): Promise<void> {
    const docs = await this.ctx.folderDocuments?.();
    let src: string | null;
    if (docs?.length) src = await this.ctx.choose(t('master.include'), t('master.includeMessage'), docs, docs[0]!);
    else src = window.prompt(t('master.includePrompt'), 'chapter1.md');
    if (!src?.trim()) return this.refocus();
    this.command(insertBlockAfter(schema.nodes.include!.create({ src: src.trim() })));
    this.refocus();
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
      write: (parts) => {
        this.replaceBlocks(applyDocumentParts(this.doc, parts), true);
        this.renderFurniture();
        this.referencesChanged();
      },
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

  /** Offline synchronisation (COLLAB-008): the whole document in and out. */
  syncable(): SyncableDocument {
    return {
      read: () => ({ ...this.doc, meta: { ...this.doc.meta }, blocks: this.currentBlocks() }),
      write: (doc) => {
        this.doc.meta = { ...doc.meta };
        if (doc.page) this.doc.page = doc.page;
        else delete this.doc.page;
        if (doc.references) this.doc.references = doc.references;
        else delete this.doc.references;
        for (const [id, res] of doc.resources) if (!this.doc.resources.has(id)) this.doc.resources.set(id, res);
        this.replaceBlocks(doc.blocks, false);
        this.renderFurniture();
        this.referencesChanged();
        this.ctx.changed();
      },
    };
  }

  printContent(_settings?: PrintSettings): HTMLElement {
    const root = h('div', { class: 'print-document' });
    for (const node of Array.from(this.view.dom.childNodes)) root.append(node.cloneNode(true));
    for (const el of Array.from(root.querySelectorAll('[contenteditable]'))) el.removeAttribute('contenteditable');
    for (const el of Array.from(root.querySelectorAll('.code-cell-bar, .ProseMirror-trailingBreak, .ProseMirror-separator, .column-resize-handle'))) el.remove();
    for (const el of Array.from(root.querySelectorAll<HTMLElement>('.peer-here'))) el.classList.remove('peer-here');
    // TEACH-001: the exercise sheet is printed without its solutions.
    if (this.element.classList.contains('hide-solutions')) for (const el of Array.from(root.querySelectorAll('[data-solution]'))) el.remove();
    // Header and footer in the page margins (DOC-024).
    const css = pageSetupCss(this.doc.page, this.doc.meta.title ?? '');
    if (css) root.prepend(h('style', {}, css));
    // Footnotes are printed as notes at the end of the document (DOC-022).
    if (!this.notes.hidden) {
      const notes = this.notes.cloneNode(true) as HTMLElement;
      notes.className = 'print-notes';
      root.append(notes);
    }
    return root;
  }

  destroy(): void {
    if (this.review.active) this.review.toggle(false, false);
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
      // REVIEW-001: the review mode, named, first in the toolbar.
      withKeywords(act(t('review.mode'), `📖 ${t('review.mode')}`, () => this.review.toggle(true), t('review.modeTitle')), REVIEW_KEYWORDS),
      h('span', { class: 'sep' }),
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
      this.sizeSelect.element,
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
      this.textToolsMenu(),
      this.viewToolsMenu(),
      act(t('comment.add'), '💬', () => this.addComment(), `${t('comment.add')} (Ctrl+Alt+M)`),
      this.trackButton,
      h('span', { class: 'sep' }),
      state(t('solution.button'), '✓', (s, d) => setParagraphAttrs({ solution: !paragraphAttr(s, 'solution') })(s, d), () => !!paragraphAttr(this.view.state, 'solution'), t('solution.title')),
      this.solutionsButton,
      act(t('variants.button'), '🎲', () => void this.generateVariants(), t('variants.buttonTitle')),
      act(t('note.button'), '¹', () => void this.editNote(), `${t('note.insert')} (Ctrl+Alt+F)`),
      act(t('xref.captionButton'), '🏷', () => void this.editCaption(), t('xref.captionButtonTitle')),
      act(t('xref.button'), '↪', () => void this.insertCrossReference(), t('xref.buttonTitle')),
      act(t('bib.cite'), '❝', () => void this.editCitation(), t('bib.citeTitle')),
      act(t('bib.title_'), '📚', () => void this.editReferences(), t('bib.buttonTitle')),
      act(t('master.include'), '📄', () => void this.insertInclude(), t('master.includeTitle')),
      act(t('doc.insertLink'), '🔗', () => this.insertLink(), t('doc.insertLinkTitle')),
      act(t('common.insertImage'), '🖼', () => void this.pickImage()),
      act(t('doc.insertTable'), '▦', () => this.command(insertTable()), t('doc.insertTableTitle')),
      act(t('doc.insertEquation'), '∑', () => void this.editMath(), t('doc.insertEquationTitle')),
      act(t('doc.insertCode'), '{ }', () => void this.editCell(), t('doc.insertCodeTitle')),
      act(t('doc.insertDiagram'), '⧉', () => void this.editDiagram(), t('doc.insertDiagramTitle')),
      act(t('meta.button'), 'ⓘ', () => void this.editProperties(), t('meta.buttonTitle')),
      act(t('a11y.button'), '♿', () => void this.checkAccessibility(), t('a11y.buttonTitle')),
      act(t('hf.button'), '▤', () => void this.editPageSetup()),
      act(t('toc.button'), '§', () => this.command(insertToc), t('toc.insertTitle')),
      act(t('doc.insertRule'), '―', () => this.command(insertRule())),
      act(t('doc.pageBreak'), '⤓', () => this.command(insertRule(true)), `${t('doc.pageBreak')} (Ctrl+Enter)`),
    );
  }

  /** Contextual bar shown while the cursor is in a table (DOC-025). */
  private buildTableBar(): HTMLElement {
    const act = (key: MessageKey, text: string, cmd: Command): HTMLButtonElement => {
      const b = button(
        t(key),
        () => {
          this.command(cmd);
          this.refocus();
        },
        { text, title: t(key) },
      );
      this.tableButtons.push([cmd, b]);
      return b;
    };
    this.tableBar = h(
      'div',
      { class: 'toolbar table-bar', role: 'toolbar', 'aria-label': t('table.bar'), hidden: '' },
      h('span', { class: 'table-bar-label' }, t('table.bar')),
      act('table.rowAbove', '⬆+', addRowBefore),
      act('table.rowBelow', '⬇+', addRowAfter),
      act('table.colLeft', '⬅+', addColumnBefore),
      act('table.colRight', '➡+', addColumnAfter),
      h('span', { class: 'sep' }),
      act('table.deleteRow', '⬌−', deleteRow),
      act('table.deleteCol', '⬍−', deleteColumn),
      h('span', { class: 'sep' }),
      act('table.merge', '⊞', mergeCells),
      act('table.split', '⊟', splitCell),
      act('table.header', 'H', toggleHeaderRow),
      h('span', { class: 'sep' }),
      act('table.delete', '🗑', deleteTable),
    );
    this.tableBar.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).closest('button')) e.preventDefault();
    });
    return this.tableBar;
  }

  private updateToolbar(): void {
    const state = this.view?.state;
    if (!state) return;
    const inTable = isInTable(state);
    this.tableBar.hidden = !inTable;
    if (inTable) for (const [cmd, b] of this.tableButtons) b.disabled = !cmd(state);
    for (const [name, b] of this.markButtons) b.setAttribute('aria-pressed', String(markActive(state, schema.marks[name]!)));
    for (const [active, b] of this.stateButtons) b.setAttribute('aria-pressed', String(active()));
    this.styleSelect.value = currentStyle(state);
    const font = (markValue(state, schema.marks.font!, 'family') as string | undefined) ?? '';
    if (font && ![...this.fontSelect.options].some((o) => o.value === font)) this.fontSelect.append(h('option', { value: font }, font));
    this.fontSelect.value = font;
    const size = markValue(state, schema.marks.size!, 'pt') as number | undefined;
    this.sizeSelect.set(size);
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

  private async insertImageFile(file: File, pos?: number, describe = true): Promise<void> {
    if (!file.type.startsWith('image/')) return;
    const data = new Uint8Array(await file.arrayBuffer());
    const key = addResource(this.doc, data, file.type, file.name);
    const node = schema.nodes.image!.create({ image: key, alt: null });
    const at = pos ?? this.view.state.selection.from;
    if (pos !== undefined) this.view.dispatch(this.view.state.tr.insert(pos, node));
    else this.command(insertInline(node));
    // IMG-003: describe the picture and caption it, right away.
    const placed = this.view.state.doc.nodeAt(at)?.type === schema.nodes.image ? at : undefined;
    if (describe && placed !== undefined) await this.describeImage(placed, this.view.state.doc.nodeAt(placed)!, true);
  }

  /** The alternative text of a picture, and a caption when it is new (IMG-003). */
  private async describeImage(pos: number, node: PmNode, isNew = false): Promise<void> {
    if (this.readOnly) return;
    const { editPicture } = await import('./picture-dialog');
    const choice = await editPicture(this.element, { alt: node.attrs.alt as string | null, src: this.resolve(node.attrs.image as string)?.url, withCaption: isNew });
    if (!choice) return this.refocus();
    const current = this.view.state.doc.nodeAt(pos);
    if (current?.type !== schema.nodes.image) return;
    const tr = this.view.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, alt: choice.alt });
    tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 1)));
    this.view.dispatch(tr);
    if (choice.caption) this.command(insertCaption('figure', seqWord('figure'), choice.caption, newAnchor('figure')));
    this.refocus();
  }

  private onPaste(e: ClipboardEvent): boolean {
    const data = e.clipboardData;
    if (!data) return false;
    const images = Array.from(data.files).filter((f) => f.type.startsWith('image/'));
    if (images.length) {
      void (async () => {
        for (const f of images) await this.insertImageFile(f, undefined, images.length === 1);
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
      for (const f of files) await this.insertImageFile(f, pos, files.length === 1);
    })();
    return true;
  }
}
