/**
 * Node views of the text editor: images, equations, diagrams and code cells
 * are drawn with the same elements and renderers as before (MATH-001,
 * DIAG-001, CODE-001), and open their editor when clicked.
 */
import type { Node as PmNode } from 'prosemirror-model';
import type { EditorView, NodeView, NodeViewConstructor } from 'prosemirror-view';
import { codeCellElement, diagramElement, mathElement, type ImageInfo } from '../html';
import type { CodeCellRun, Run } from '../model';
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
}

/** The code cell element of a node view, with its position (for running cells in order). */
export interface CellHandle {
  element: HTMLElement;
  getPos(): number | undefined;
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
    const run: CodeCellRun = { cell: a.cell as string, lang: a.lang as CodeCellRun['lang'], ...(a.output ? { output: a.output as CodeCellRun['output'] } : {}) };
    const el = codeCellElement(run, document, (key) => this.hooks.resolve(key));
    (el as HTMLElement & { [CELL_HANDLE]?: CellHandle })[CELL_HANDLE] = { element: el, getPos: this.getPos };
    this.dom.replaceChildren(el);
    void import('../../code/ui').then(({ decorateCells }) => decorateCells(this.dom));
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
  ) {
    this.dom = document.createElement('img');
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
    image: (node) => new ImageView(node, hooks),
  };
}
