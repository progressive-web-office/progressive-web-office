/**
 * Review mode of text documents (REVIEW-001..REVIEW-004): the document shown
 * as pages, like a PDF file, read-only except for comments, with the same
 * page controls and keyboard shortcuts as the PDF viewer.
 */
import type { EditorView as PmView } from 'prosemirror-view';
import { TextSelection } from 'prosemirror-state';
import { button, h } from '../app/dom';
import { t, type MessageKey } from '../i18n';
import { fitScale, PAGES_PER_ROW, type PdfZoom } from '../pdf/fit';
import { isTyping, reviewAction, reviewCommands, spreadStart, type ReviewAction } from '../review/keys';
import { isDistractionFree, showReviewHelp, toggleDistractionFree } from '../review/ui';
import type { PageFlow } from '../pdf/viewer';

/** A page of the screen layout, in CSS pixels (US Letter at 96 dpi, as the editor). */
export const PAGE = { width: 816, height: 1056, marginX: 80, marginY: 72, gap: 24 } as const;

/** The page (0-based) of a point `x` pixels from the left of the paged content. */
export const pageAt = (x: number): number => Math.max(0, Math.floor(x / (PAGE.width + PAGE.gap)));

/** Width of `n` pages side by side. */
export const spreadWidth = (n: number): number => n * PAGE.width + (n - 1) * PAGE.gap;

const VIEW_KEY = 'pwo.review.view';

function loadView(): { zoom: PdfZoom; perRow: number; flow: PageFlow } {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY) ?? '{}') as { zoom?: unknown; perRow?: unknown; flow?: unknown };
    return {
      zoom: v.zoom === 'width' ? 'width' : 'page',
      perRow: (PAGES_PER_ROW as readonly number[]).includes(v.perRow as number) ? (v.perRow as number) : 1,
      flow: v.flow === 'scroll' ? 'scroll' : 'pages',
    };
  } catch {
    return { zoom: 'page', perRow: 1, flow: 'pages' };
  }
}

export interface ReviewHost {
  /** The editor's root (`.doc-editor`). */
  root: HTMLElement;
  /** The element around the page (`.doc-scroll`). */
  scroller: HTMLElement;
  view(): PmView;
  /** Make the text editable or not (comments stay possible). */
  setReviewing(on: boolean): void;
  comment(): void;
  find(): void;
  notify(message: string): void;
  statusChanged(): void;
}

export class DocReview {
  active = false;
  readonly bar: HTMLElement;
  private zoom: PdfZoom;
  private perRow: number;
  private flow: PageFlow;
  private scale = 1;
  /** Pages of the document, and the first page shown (1-based). */
  private pages = 1;
  private current = 1;
  private readonly pageInput = h('input', { type: 'number', min: '1', class: 'page-input', 'aria-label': t('pdf.pageNumber') });
  private readonly pageTotal = h('span', { class: 'page-total' });
  private readonly zoomLabel = h('span', { class: 'zoom-label', 'aria-live': 'polite' });
  private readonly perRowSelect = h(
    'select',
    { 'aria-label': t('pdf.pagesPerRow'), title: t('pdf.pagesPerRow') },
    ...PAGES_PER_ROW.map((n) => h('option', { value: String(n) }, t(n === 1 ? 'pdf.onePage' : 'pdf.nPages', { n }))),
  );
  private readonly flowButton: HTMLButtonElement;
  private readonly fullscreenButton: HTMLButtonElement;
  private resizeObserver: ResizeObserver | undefined;
  private frame = 0;

  constructor(private readonly host: ReviewHost, leave: () => void) {
    const v = loadView();
    this.zoom = v.zoom;
    this.perRow = v.perRow;
    this.flow = v.flow;
    this.flowButton = button(t('review.flow'), () => this.do('flow'), { text: '', className: 'flow-btn' });
    this.fullscreenButton = button(t('review.fullscreen'), () => this.do('fullscreen'), { text: '⛶', title: t('review.fullscreenTitle'), className: 'icon', pressed: false });
    this.perRowSelect.value = String(this.perRow);
    this.perRowSelect.addEventListener('change', () => this.setPerRow(Number(this.perRowSelect.value) || 1));
    this.pageInput.addEventListener('change', () => this.goTo(Number(this.pageInput.value)));
    this.bar = h(
      'div',
      { class: 'toolbar review-bar', role: 'toolbar', 'aria-label': t('review.bar'), hidden: true },
      button(t('pdf.prev'), () => this.do('prev'), { text: '◀', title: `${t('pdf.prev')} (j)` }),
      this.pageInput,
      this.pageTotal,
      button(t('pdf.next'), () => this.do('next'), { text: '▶', title: `${t('pdf.next')} (k)` }),
      h('span', { class: 'sep' }),
      button(t('pdf.zoomOut'), () => this.do('zoomOut'), { text: '−', title: `${t('pdf.zoomOut')} (-)` }),
      this.zoomLabel,
      button(t('pdf.zoomIn'), () => this.do('zoomIn'), { text: '+', title: `${t('pdf.zoomIn')} (+)` }),
      button(t('pdf.fit'), () => this.do('fitWidth'), { text: '↔', title: `${t('pdf.fit')} (w)` }),
      button(t('pdf.fitPage'), () => this.do('fitPage'), { text: '↕', title: `${t('pdf.fitPage')} (h)` }),
      this.perRowSelect,
      this.flowButton,
      h('span', { class: 'sep' }),
      button(t('comment.add'), () => this.do('comment'), { text: '💬', title: `${t('comment.add')} (c)` }),
      button(t('review.action.prevComment'), () => this.do('prevComment'), { text: '⟨💬', title: `${t('review.action.prevComment')} ([)` }),
      button(t('review.action.nextComment'), () => this.do('nextComment'), { text: '💬⟩', title: `${t('review.action.nextComment')} (])` }),
      button(t('find.title'), () => this.do('find'), { text: '🔍', title: `${t('find.title')} (/)` }),
      h('span', { class: 'sep' }),
      this.fullscreenButton,
      button(t('review.help'), () => this.do('help'), { text: '⌨', title: t('review.helpTitle'), className: 'icon' }),
      button(t('review.leave'), leave, { text: `✎ ${t('review.leave')}`, title: t('review.leaveTitle') }),
    );
    this.renderFlowButton();
    host.root.addEventListener('keydown', (e) => {
      if (!this.active) return;
      if (e.key === 'Escape' && isDistractionFree() && !isTyping(e.target)) {
        e.preventDefault();
        this.do('fullscreen');
        return;
      }
      if (isTyping(e.target) || e.defaultPrevented) return;
      const action = reviewAction(e);
      if (action && this.do(action)) e.preventDefault();
    });
    host.scroller.addEventListener(
      'wheel',
      (e) => {
        if (!this.active || this.flow !== 'pages' || e.ctrlKey || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
        const s = host.scroller;
        const atEnd = e.deltaY > 0 ? s.scrollTop + s.clientHeight >= s.scrollHeight - 2 : s.scrollTop <= 0;
        if (!atEnd) return;
        e.preventDefault();
        if (e.timeStamp - this.lastWheel < 350) return;
        this.lastWheel = e.timeStamp;
        this.do(e.deltaY > 0 ? 'next' : 'prev');
      },
      { passive: false },
    );
  }

  private lastWheel = 0;

  // --- mode -----------------------------------------------------------------------------

  toggle(on = !this.active): void {
    this.active = on;
    this.bar.hidden = !on;
    this.host.root.classList.toggle('reviewing', on);
    this.host.scroller.tabIndex = on ? 0 : -1;
    this.host.setReviewing(on);
    if (on) {
      this.layout();
      this.host.scroller.focus({ preventScroll: true });
      if (typeof ResizeObserver === 'function') {
        this.resizeObserver = new ResizeObserver(() => this.relayout());
        this.resizeObserver.observe(this.host.scroller);
      }
    } else {
      cancelAnimationFrame(this.frame);
      this.resizeObserver?.disconnect();
      this.resizeObserver = undefined;
      if (isDistractionFree()) this.do('fullscreen');
      this.host.root.classList.remove('paged');
      const dom = this.host.view().dom as HTMLElement;
      for (const p of ['--pages', 'zoom', 'margin-left', 'clip-path']) dom.style.removeProperty(p);
      this.host.view().focus();
    }
    this.host.statusChanged();
  }

  /** The review actions for the command palette, while reviewing. */
  commands(): ReturnType<typeof reviewCommands> {
    if (!this.active) return [];
    return reviewCommands((a) => t(`review.action.${a}` as MessageKey), t('review.bar'), (a) => void this.do(a));
  }

  status(): string {
    return this.active && this.flow === 'pages' ? t('review.pageOf', { n: this.current, total: this.pages }) : '';
  }

  /** The content changed: its pages may have too. */
  relayout(): void {
    if (!this.active) return;
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.layout());
  }

  // --- layout ---------------------------------------------------------------------------

  private layout(): void {
    // A layout asked for just before leaving the review mode must not page the editor again.
    if (!this.active) return;
    const dom = this.host.view().dom as HTMLElement;
    const paged = this.flow === 'pages';
    this.host.root.classList.toggle('paged', paged);
    const s = this.host.scroller;
    const across = paged ? this.perRow : 1;
    this.scale = fitScale(this.zoom, { width: s.clientWidth || 900, height: s.clientHeight || 1100, pageWidth: spreadWidth(across) / across, pageHeight: PAGE.height, columns: across, gap: 16 });
    this.zoomLabel.textContent = `${Math.round(this.scale * 100)}%`;
    dom.style.setProperty('zoom', String(this.scale));
    if (!paged) {
      for (const p of ['--pages', 'margin-left', 'clip-path']) dom.style.removeProperty(p);
      this.pageTotal.textContent = '';
      this.pageInput.hidden = true;
      return;
    }
    this.pageInput.hidden = false;
    // Lay the text out on one page: what does not fit flows into more columns, to count them.
    dom.style.setProperty('--pages', '1');
    const box = dom.getBoundingClientRect();
    const ratio = box.width / PAGE.width || 1;
    let right = 0;
    for (const child of Array.from(dom.children)) right = Math.max(right, child.getBoundingClientRect().right);
    const used = Math.max(1, pageAt((right - box.left) / ratio - 1) + 1);
    this.pages = used;
    // Whole spreads, so that the last one is aligned like the others.
    dom.style.setProperty('--pages', String(Math.ceil(used / this.perRow) * this.perRow));
    this.pageTotal.textContent = `/ ${this.pages}`;
    this.pageInput.max = String(this.pages);
    this.goTo(this.current);
  }

  private goTo(page: number): void {
    this.current = spreadStart(Math.max(1, Math.min(this.pages, page || 1)), this.flow === 'pages' ? this.perRow : 1);
    this.pageInput.value = String(this.current);
    if (this.flow === 'pages') {
      const dom = this.host.view().dom as HTMLElement;
      const s = this.host.scroller;
      const visible = spreadWidth(this.perRow) * this.scale;
      const offset = Math.max(0, (s.clientWidth - visible) / 2) / this.scale;
      const before = (this.current - 1) * (PAGE.width + PAGE.gap);
      const all = Number(dom.style.getPropertyValue('--pages')) || 1;
      dom.style.setProperty('margin-left', `${offset - before}px`);
      // Only the spread is shown (and can be clicked).
      dom.style.setProperty('clip-path', `inset(0 ${Math.max(0, spreadWidth(all) - before - spreadWidth(this.perRow))}px 0 ${before}px)`);
      s.scrollTop = 0;
    }
    this.host.statusChanged();
  }

  /** The page (1-based) of a position of the document, when shown as pages. */
  private pageOf(pos: number): number | undefined {
    if (!this.active || this.flow !== 'pages') return undefined;
    const view = this.host.view();
    const dom = view.dom as HTMLElement;
    let left: number;
    try {
      left = view.coordsAtPos(pos).left;
    } catch {
      return undefined;
    }
    const box = dom.getBoundingClientRect();
    const ratio = box.width / spreadWidth(Number(dom.style.getPropertyValue('--pages')) || 1) || 1;
    return pageAt((left - box.left) / ratio) + 1;
  }

  private shown(page: number): boolean {
    return page >= this.current && page < this.current + this.perRow;
  }

  /** Show the page of a position of the document. */
  reveal(pos: number): void {
    const page = this.pageOf(pos);
    if (page !== undefined && !this.shown(page)) this.goTo(page);
  }

  // --- actions --------------------------------------------------------------------------

  private save(): void {
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify({ zoom: typeof this.zoom === 'number' ? 'page' : this.zoom, perRow: this.perRow, flow: this.flow }));
    } catch {
      /* not kept */
    }
  }

  private setPerRow(n: number): void {
    this.perRow = n;
    this.perRowSelect.value = String(n);
    this.save();
    this.layout();
  }

  private renderFlowButton(): void {
    const paged = this.flow === 'pages';
    this.flowButton.textContent = paged ? `📄 ${t('review.flowPages')}` : `📜 ${t('review.flowScroll')}`;
    this.flowButton.title = `${t('review.action.flow')} (s)`;
    this.flowButton.setAttribute('aria-pressed', String(paged));
  }

  private zoomBy(dir: number): void {
    const steps = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
    const i = steps.findIndex((z) => z >= this.scale - 0.01);
    this.zoom = steps[Math.max(0, Math.min(steps.length - 1, (i < 0 ? steps.length - 1 : i) + dir))]!;
    this.layout();
  }

  /** The comment anchors after (or before) the selection, in the document's order. */
  private gotoComment(dir: 1 | -1): void {
    const view = this.host.view();
    const at = dir > 0 ? view.state.selection.to : view.state.selection.from;
    const starts: number[] = [];
    let inside = false;
    view.state.doc.descendants((node, pos) => {
      if (!node.isInline) {
        inside = false;
        return true;
      }
      const has = node.marks.some((m) => m.type.name === 'comment');
      if (has && !inside) starts.push(pos);
      inside = has;
      return false;
    });
    // From the cursor when it is on the pages shown, else from these pages.
    const head = this.pageOf(at);
    let target: number | undefined;
    if (head !== undefined && !this.shown(head)) {
      const pages = starts.map((p) => this.pageOf(p + 1) ?? 0);
      target = dir > 0 ? starts.find((_, i) => pages[i]! >= this.current) : [...starts].reverse().find((_, i) => pages[starts.length - 1 - i]! < this.current);
    } else target = dir > 0 ? starts.find((p) => p >= at) : [...starts].reverse().find((p) => p < at - 1);
    if (target === undefined) return this.host.notify(t('review.noComment'));
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, target + 1)));
    this.reveal(target + 1);
    if (this.flow === 'scroll') (view.domAtPos(target + 1).node as HTMLElement).parentElement?.scrollIntoView?.({ block: 'center' });
  }

  /** Do a review action; false when it does not apply. */
  do(action: ReviewAction): boolean {
    const scroll = (dir: number): void => {
      const main = this.host.scroller.closest<HTMLElement>('.app-main') ?? this.host.scroller;
      main.scrollBy({ top: dir * main.clientHeight * 0.9 });
    };
    switch (action) {
      case 'next':
      case 'prev': {
        const dir = action === 'next' ? 1 : -1;
        if (this.flow === 'pages') this.goTo(this.current + dir * this.perRow);
        else scroll(dir);
        return true;
      }
      case 'first':
      case 'last':
        if (this.flow === 'pages') this.goTo(action === 'first' ? 1 : this.pages);
        else (this.host.scroller.closest<HTMLElement>('.app-main') ?? this.host.scroller).scrollTo({ top: action === 'first' ? 0 : 1e9 });
        return true;
      case 'zoomIn':
        this.zoomBy(1);
        return true;
      case 'zoomOut':
        this.zoomBy(-1);
        return true;
      case 'fitWidth':
      case 'fitPage':
        this.zoom = action === 'fitWidth' ? 'width' : 'page';
        this.save();
        this.layout();
        return true;
      case 'perRow1':
      case 'perRow2':
      case 'perRow3':
      case 'perRow4':
        this.setPerRow(Number(action.slice(-1)));
        return true;
      case 'flow':
        this.flow = this.flow === 'pages' ? 'scroll' : 'pages';
        this.save();
        this.renderFlowButton();
        this.layout();
        return true;
      case 'comment':
        this.host.comment();
        return true;
      case 'nextComment':
      case 'prevComment':
        this.gotoComment(action === 'nextComment' ? 1 : -1);
        return true;
      case 'find':
        this.host.find();
        return true;
      case 'fullscreen':
        toggleDistractionFree(undefined, (on) => {
          this.fullscreenButton.setAttribute('aria-pressed', String(on));
          this.relayout();
        });
        return true;
      case 'help':
        showReviewHelp();
        return true;
    }
  }
}
