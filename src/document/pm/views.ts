/**
 * Node views of the text editor: images, equations, diagrams and code cells
 * are drawn with the same elements and renderers as before (MATH-001,
 * DIAG-001, CODE-001), and open their editor when clicked.
 */
import type { Node as PmNode } from 'prosemirror-model';
import type { EditorView, NodeView, NodeViewConstructor } from 'prosemirror-view';
import { bibliographyElement, codeCellElement, diagramElement, mathElement, type ImageInfo } from '../html';
import type { Citations } from '../bibliography';
import { seqText, type CodeCellRun, type Run, type SeqKind } from '../model';
import type { PmCrossRefs } from './convert';
import { t } from '../../i18n';

export interface ViewHooks {
  /** Headings listed by a table of contents, with their positions (DOC-023). */
  tocEntries(levels: number): { level: number; text: string; pos: number }[];
  gotoHeading(pos: number): void;
  /** Table of contents views, refreshed after every change. */
  tocViews: Set<{ refresh(): void }>;
  resolve(key: string): ImageInfo | undefined;
  editFootnote(pos: number, node: PmNode): void;
  editMath(pos: number, node: PmNode): void;
  editDiagram(pos: number, node: PmNode): void;
  /** A code cell button or its source was clicked. */
  cellAction(action: string, pos: number, node: PmNode): void;
  /** CODE-016: draw the live widgets of a cell (slots `.code-cell-widget[data-model]`). */
  mountWidgets?(cell: HTMLElement): void;
  /** Current numbers and cross-reference targets (DOC-026). */
  xref(): PmCrossRefs;
  /** Show the paragraph with this anchor. */
  gotoAnchor(id: string): void;
  /** Current citation numbers and texts (DOC-027). */
  citations(): Citations;
  editCitation(pos: number, node: PmNode): void;
  /** Open a sub-document from the folder; false without a folder (DOC-028). */
  openInclude(src: string): boolean;
  /** Edit a picture's alternative text (IMG-003). */
  editImage(pos: number, node: PmNode): void;
}

/** The code cell element of a node view, with its position (for running cells in order). */
export interface CellHandle {
  element: HTMLElement;
  getPos(): number | undefined;
  /** Draw the cell again from the document (after a run that left its node unchanged). */
  refresh(): void;
}

const CELL_HANDLE = Symbol('cell');

export function cellHandle(el: Element | null): CellHandle | undefined {
  return (el as (Element & { [CELL_HANDLE]?: CellHandle }) | null)?.[CELL_HANDLE];
}

function atom(className: string): HTMLElement {
  const wrap = document.createElement('span');
  wrap.className = `pm-atom pm-${className}`;
  wrap.contentEditable = 'false';
  return wrap;
}

class AtomView implements NodeView {
  dom: HTMLElement;
  constructor(
    protected node: PmNode,
    protected view: EditorView,
    protected getPos: () => number | undefined,
    protected hooks: ViewHooks,
  ) {
    this.dom = atom(node.type.name);
    this.render();
  }

  protected render(): void {}

  update(node: PmNode): boolean {
    if (node.type !== this.node.type) return false;
    if (!node.sameMarkup(this.node)) {
      this.node = node;
      this.render();
    }
    return true;
  }

  ignoreMutation(): boolean {
    return true;
  }

  selectNode(): void {
    this.dom.classList.add('ProseMirror-selectednode');
  }

  deselectNode(): void {
    this.dom.classList.remove('ProseMirror-selectednode');
  }
}

class MathView extends AtomView {
  protected override render(): void {
    this.dom.replaceChildren(mathElement(this.node.attrs.math as string, !!this.node.attrs.display, document));
    this.dom.classList.toggle('pm-display', !!this.node.attrs.display);
    void import('../../math/ui').then(({ renderMath }) => renderMath(this.dom));
    this.dom.onclick = () => {
      const pos = this.getPos();
      if (pos !== undefined) this.hooks.editMath(pos, this.node);
    };
  }
}

class DiagramView extends AtomView {
  protected override render(): void {
    this.dom.replaceChildren(diagramElement(this.node.attrs.diagram as string, 'mermaid', document));
    void import('../../diagram/ui').then(({ renderDiagrams }) => renderDiagrams(this.dom));
    this.dom.onclick = () => {
      const pos = this.getPos();
      if (pos !== undefined) this.hooks.editDiagram(pos, this.node);
    };
  }
}

/** A table of contents, regenerated from the headings as you type (DOC-023). */
class TocView implements NodeView {
  dom: HTMLElement;
  constructor(
    private node: PmNode,
    private readonly hooks: ViewHooks,
  ) {
    this.dom = document.createElement('nav');
    this.dom.className = 'toc';
    this.dom.contentEditable = 'false';
    this.dom.setAttribute('aria-label', t('toc.title'));
    hooks.tocViews.add(this);
    this.refresh();
  }

  refresh(): void {
    const levels = this.node.attrs.levels as number;
    const entries = this.hooks.tocEntries(levels);
    const title = document.createElement('p');
    title.className = 'toc-title';
    title.textContent = t('toc.title');
    const list = document.createElement('ol');
    for (const e of entries) {
      const li = document.createElement('li');
      li.className = `toc-${e.level}`;
      const a = document.createElement('a');
      a.href = '#';
      a.textContent = e.text;
      a.addEventListener('click', (ev) => {
        ev.preventDefault();
        this.hooks.gotoHeading(e.pos);
      });
      li.append(a);
      list.append(li);
    }
    const children: Node[] = [title, list];
    if (!entries.length) {
      const hint = document.createElement('p');
      hint.className = 'toc-empty';
      hint.textContent = t('toc.empty');
      children.push(hint);
    }
    this.dom.replaceChildren(...children);
  }

  update(node: PmNode): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.refresh();
    return true;
  }

  stopEvent(e: Event): boolean {
    return e.type === 'click' && !!(e.target as HTMLElement).closest('a');
  }

  ignoreMutation(): boolean {
    return true;
  }

  destroy(): void {
    this.hooks.tocViews.delete(this);
  }
}

/** The number of a figure, table or equation, recounted after every change (DOC-026). */
class SeqView extends AtomView {
  constructor(node: PmNode, view: EditorView, getPos: () => number | undefined, hooks: ViewHooks) {
    super(node, view, getPos, hooks);
    hooks.tocViews.add(this);
  }

  protected override render(): void {
    this.refresh();
  }

  refresh(): void {
    const pos = this.getPos();
    const n = (pos !== undefined ? this.hooks.xref().numbers.get(pos) : undefined) ?? 0;
    const kind = this.node.attrs.kind as SeqKind;
    const text = seqText(kind, n);
    if (this.dom.textContent !== text) this.dom.textContent = text;
    this.dom.dataset.seq = kind;
  }

  destroy(): void {
    this.hooks.tocViews.delete(this);
  }
}

/** A cross-reference: its target's label, following renumbering; a click shows the target (DOC-026). */
class XrefView extends AtomView {
  constructor(node: PmNode, view: EditorView, getPos: () => number | undefined, hooks: ViewHooks) {
    super(node, view, getPos, hooks);
    hooks.tocViews.add(this);
  }

  protected override render(): void {
    this.refresh();
    this.dom.onclick = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      this.hooks.gotoAnchor(this.node.attrs.ref as string);
    };
  }

  refresh(): void {
    const target = this.hooks.xref().targets.get(this.node.attrs.ref as string);
    const label = target?.label ?? '??';
    if (this.dom.textContent !== label) this.dom.textContent = label;
    this.dom.classList.toggle('broken', !target);
    this.dom.title = target ? `${target.description} — ${t('xref.follow')}` : t('xref.broken');
  }

  destroy(): void {
    this.hooks.tocViews.delete(this);
  }
}

/** A citation, renumbered after every change; a click edits it (DOC-027). */
class CiteView extends AtomView {
  constructor(node: PmNode, view: EditorView, getPos: () => number | undefined, hooks: ViewHooks) {
    super(node, view, getPos, hooks);
    hooks.tocViews.add(this);
  }

  protected override render(): void {
    this.refresh();
    this.dom.onclick = () => {
      const pos = this.getPos();
      if (pos !== undefined) this.hooks.editCitation(pos, this.node);
    };
  }

  refresh(): void {
    const keys = this.node.attrs.keys as string[];
    const cite = { cite: keys, ...(this.node.attrs.locator ? { locator: this.node.attrs.locator as string } : {}) };
    const c = this.hooks.citations();
    const text = c.text(cite);
    if (this.dom.textContent !== text) this.dom.textContent = text;
    const missing = keys.some((k) => !c.numbers.has(k));
    this.dom.classList.toggle('broken', missing);
    this.dom.title = missing ? t('bib.missing', { keys: keys.join(', ') }) : keys.join(', ');
  }

  destroy(): void {
    this.hooks.tocViews.delete(this);
  }
}

/** A sub-document of a master document: its path and an Open button (DOC-028). */
class IncludeView implements NodeView {
  dom: HTMLElement;
  constructor(
    private node: PmNode,
    private readonly hooks: ViewHooks,
  ) {
    this.dom = document.createElement('div');
    this.dom.className = 'include';
    this.dom.contentEditable = 'false';
    this.render();
  }

  private render(): void {
    const src = this.node.attrs.src as string;
    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = t('master.openSub');
    open.title = t('master.openSubTitle', { src });
    open.addEventListener('click', () => {
      if (!this.hooks.openInclude(src)) open.title = t('master.noFolder');
    });
    const label = document.createElement('span');
    label.className = 'include-src';
    label.textContent = `📄 ${src}`;
    const hint = document.createElement('span');
    hint.className = 'include-hint';
    hint.textContent = t('master.subHint');
    this.dom.dataset.include = src;
    this.dom.replaceChildren(label, hint, open);
  }

  update(node: PmNode): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.render();
    return true;
  }

  stopEvent(e: Event): boolean {
    return !!(e.target as HTMLElement).closest?.('button');
  }

  ignoreMutation(): boolean {
    return true;
  }
}

/** The list of cited references, rebuilt after every change (DOC-027). */
class BibliographyView implements NodeView {
  dom: HTMLElement;
  constructor(private readonly hooks: ViewHooks) {
    this.dom = document.createElement('section');
    this.dom.className = 'bibliography';
    this.dom.contentEditable = 'false';
    hooks.tocViews.add(this);
    this.refresh();
  }

  refresh(): void {
    const c = this.hooks.citations();
    this.dom.replaceChildren(...Array.from(bibliographyElement(c, c.numeric, document).childNodes));
  }

  update(node: PmNode): boolean {
    return node.type.name === 'bibliography';
  }

  ignoreMutation(): boolean {
    return true;
  }

  destroy(): void {
    this.hooks.tocViews.delete(this);
  }
}

/** A footnote reference: a superscript number (CSS counter); the text shows on hover (DOC-022). */
class FootnoteView extends AtomView {
  protected override render(): void {
    const runs = this.node.attrs.runs as Run[];
    this.dom.title = runs.map((r) => ('text' in r ? r.text : 'math' in r ? `$${r.math}$` : '')).join('');
    this.dom.setAttribute('role', 'doc-noteref');
    this.dom.onclick = () => {
      const pos = this.getPos();
      if (pos !== undefined) this.hooks.editFootnote(pos, this.node);
    };
  }
}

class CodeCellView extends AtomView {
  protected override render(): void {
    const a = this.node.attrs;
    const run: CodeCellRun = { cell: a.cell as string, lang: a.lang as CodeCellRun['lang'], ...(a.output ? { output: a.output as CodeCellRun['output'] } : {}), ...(a.hidden ? { hidden: true } : {}) };
    const el = codeCellElement(run, document, (key) => this.hooks.resolve(key));
    (el as HTMLElement & { [CELL_HANDLE]?: CellHandle })[CELL_HANDLE] = { element: el, getPos: this.getPos, refresh: () => this.render() };
    this.dom.replaceChildren(el);
    void import('../../code/ui').then(({ decorateCells }) => decorateCells(this.dom));
    if (run.output?.widgets?.length) this.hooks.mountWidgets?.(el);
    this.dom.onclick = (e) => {
      const target = e.target as HTMLElement;
      const action = target.closest<HTMLElement>('[data-action]')?.dataset.action ?? (target.closest('.code-cell-source') ? 'edit' : undefined);
      const pos = this.getPos();
      if (action && pos !== undefined) this.hooks.cellAction(action, pos, this.node);
    };
  }

  stopEvent(e: Event): boolean {
    return !!(e.target as HTMLElement).closest?.('button');
  }
}

class ImageView implements NodeView {
  dom: HTMLImageElement;
  constructor(
    private node: PmNode,
    private hooks: ViewHooks,
    getPos: () => number | undefined,
  ) {
    this.dom = document.createElement('img');
    // IMG-003: a double click edits the alternative text.
    this.dom.addEventListener('dblclick', () => {
      const pos = getPos();
      if (pos !== undefined) this.hooks.editImage(pos, this.node);
    });
    this.render();
  }

  private render(): void {
    const a = this.node.attrs;
    const info = this.hooks.resolve(a.image as string);
    this.dom.src = info?.url ?? (a.src as string | null) ?? '';
    this.dom.alt = (a.alt as string | null) ?? '';
    this.dom.dataset.resource = a.image as string;
    if (a.title) this.dom.title = a.title as string;
    if (a.width) this.dom.width = Math.round(a.width as number);
    else this.dom.removeAttribute('width');
    if (a.height) this.dom.height = Math.round(a.height as number);
    else this.dom.removeAttribute('height');
  }

  update(node: PmNode): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.render();
    return true;
  }
}

export function nodeViews(hooks: ViewHooks): Record<string, NodeViewConstructor> {
  return {
    math: (node, view, getPos) => new MathView(node, view, getPos, hooks),
    diagram: (node, view, getPos) => new DiagramView(node, view, getPos, hooks),
    code_cell: (node, view, getPos) => new CodeCellView(node, view, getPos, hooks),
    footnote: (node, view, getPos) => new FootnoteView(node, view, getPos, hooks),
    toc: (node) => new TocView(node, hooks),
    seq: (node, view, getPos) => new SeqView(node, view, getPos, hooks),
    xref: (node, view, getPos) => new XrefView(node, view, getPos, hooks),
    cite: (node, view, getPos) => new CiteView(node, view, getPos, hooks),
    bibliography: () => new BibliographyView(hooks),
    include: (node) => new IncludeView(node, hooks),
    image: (node, _view, getPos) => new ImageView(node, hooks, getPos),
  };
}
