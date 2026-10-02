/**
 * PDF viewer (PDF-001..PDF-005) with form filling and signatures
 * (PDF-008..PDF-015), built on pdf.js for rendering and pdf-lib for saving.
 */
// The legacy build ships polyfills (e.g. Map.prototype.getOrInsertComputed) needed by current browsers.
import { t } from '../i18n';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import type { PDFDocumentProxy, PDFPageProxy, PageViewport } from 'pdfjs-dist';
import { button, h } from '../app/dom';
import type { EditorView, SaveVariant, ViewContext } from '../app/views';
import { applyEdits, inspectPdf, type FormField, type PdfInfo, type Stamp } from './forms';
import { captureSignature } from './signature-pad';
import { fitScale, PAGES_PER_ROW, type PdfZoom } from './fit';
import { findInPages, type PdfMatch } from './find';

const VIEW_KEY = 'pwo.pdf.view';
const GAP = 12;

/** The zoom mode and pages per row chosen last (PDF-016). */
function loadView(): { zoom: PdfZoom; columns: number } {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY) ?? '{}') as { zoom?: unknown; columns?: unknown };
    const zoom = v.zoom === 'page' || v.zoom === 'width' ? v.zoom : 'width';
    const columns = (PAGES_PER_ROW as readonly number[]).includes(v.columns as number) ? (v.columns as number) : 1;
    return { zoom, columns };
  } catch {
    return { zoom: 'width', columns: 1 };
  }
}

function saveView(zoom: PdfZoom, columns: number): void {
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify({ zoom: typeof zoom === 'number' ? 'width' : zoom, columns }));
  } catch {
    /* not kept */
  }
}

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const assetUrl = (dir: string): string => new URL(`pdfjs/${dir}/`, document.baseURI).href;

interface PageShell {
  index: number;
  el: HTMLElement;
  proxy?: PDFPageProxy;
  viewport?: PageViewport;
  rendered: boolean;
}

export async function createPdfViewer(bytes: Uint8Array, ctx: ViewContext): Promise<PdfViewer> {
  // PDF-004: PDF JavaScript is never run — pdf.js only executes it through its
  // optional scripting sandbox, which is not loaded (and quickjs is not shipped).
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    enableXfa: false,
    cMapUrl: assetUrl('cmaps'),
    cMapPacked: true,
    standardFontDataUrl: assetUrl('standard_fonts'),
    wasmUrl: assetUrl('wasm'),
    iccUrl: assetUrl('iccs'),
  });
  const [doc, info] = await Promise.all([
    task.promise,
    inspectPdf(bytes).catch((): PdfInfo => ({ pageCount: 0, fields: [], readOnlyReason: 'unreadable', readOnlyCode: 'unreadable' })),
  ]);
  return new PdfViewer(bytes, doc, info, ctx, () => void task.destroy());
}

export class PdfViewer implements EditorView {
  readonly element: HTMLElement;
  private readonly pagesEl = h('div', { class: 'pdf-pages' });
  private readonly scroller = h('div', { class: 'pdf-scroll', tabindex: '0', 'aria-label': t('pdf.pages') });
  private readonly pageInput = h('input', { type: 'number', min: '1', class: 'page-input', 'aria-label': t('pdf.pageNumber') });
  private readonly zoomLabel = h('span', { class: 'zoom-label', 'aria-live': 'polite' });
  private pages: PageShell[] = [];
  private zoom: PdfZoom = loadView().zoom;
  /** Pages side by side (PDF-016). */
  private columns = loadView().columns;
  private readonly columnsSelect = h(
    'select',
    { 'aria-label': t('pdf.pagesPerRow'), title: t('pdf.pagesPerRow') },
    ...PAGES_PER_ROW.map((n) => h('option', { value: String(n) }, t(n === 1 ? 'pdf.onePage' : 'pdf.nPages', { n }))),
  );
  private scale = 1;
  private current = 1;
  private observer: IntersectionObserver | undefined;
  private values: Record<string, string | boolean | string[]> = {};
  private stamps: Stamp[] = [];
  private resizeObserver: ResizeObserver | undefined;
  /** PDF-017: text search. */
  private readonly findInput = h('input', { type: 'search', class: 'pdf-find-input', 'aria-label': t('pdf.findLabel'), placeholder: t('pdf.findLabel') });
  private readonly findCount = h('span', { class: 'pdf-find-count', 'aria-live': 'polite' });
  private readonly findBar = h('div', { class: 'toolbar pdf-find', role: 'search', hidden: true });
  private texts: Promise<string[][]> | undefined;
  private matches: PdfMatch[] = [];
  private matchIndex = -1;
  /** The text spans of each rendered page, with their texts. */
  private readonly textDivs = new Map<number, { divs: HTMLElement[]; strs: string[] }>();

  constructor(
    private readonly bytes: Uint8Array,
    private readonly doc: PDFDocumentProxy,
    private readonly info: PdfInfo,
    private readonly ctx: ViewContext,
    private readonly release: () => void,
  ) {
    this.scroller.append(this.pagesEl);
    const reason = { encrypted: t('pdf.encrypted'), xfa: t('pdf.xfa'), unreadable: t('pdf.formError') };
    const notice = info.readOnlyReason ? h('div', { class: 'pdf-notice', role: 'note' }, info.readOnlyCode ? reason[info.readOnlyCode] : info.readOnlyReason) : null;
    this.findBar.append(
      this.findInput,
      this.findCount,
      button(t('pdf.findPrev'), () => this.nextMatch(-1), { text: '▲', className: 'icon' }),
      button(t('pdf.findNext'), () => this.nextMatch(1), { text: '▼', className: 'icon' }),
      button(t('pdf.findClose'), () => this.closeFind(), { text: '✕', className: 'icon' }),
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    this.findInput.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => void this.search(this.findInput.value), 200);
    });
    this.findInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.nextMatch(e.shiftKey ? -1 : 1);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.closeFind();
      }
    });
    this.element = h('div', { class: 'pdf-viewer' }, this.toolbar(), this.findBar, notice, this.scroller);
    this.element.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        this.openFind();
      }
    });
    this.scroller.addEventListener('scroll', () => this.updateCurrent());
    this.columnsSelect.value = String(this.columns);
    this.columnsSelect.addEventListener('change', () => {
      this.columns = Number(this.columnsSelect.value) || 1;
      saveView(this.zoom, this.columns);
      void this.layout();
    });
    this.pageInput.addEventListener('change', () => this.goTo(Number(this.pageInput.value)));
  }

  // --- EditorView -------------------------------------------------------------------

  mounted(): void {
    this.layout();
    if (typeof ResizeObserver === 'function') {
      let width = this.scroller.clientWidth;
      let height = this.scroller.clientHeight;
      this.resizeObserver = new ResizeObserver(() => {
        const moved = Math.abs(this.scroller.clientWidth - width) > 16 || (this.zoom === 'page' && Math.abs(this.scroller.clientHeight - height) > 16);
        if (typeof this.zoom !== 'number' && moved) {
          width = this.scroller.clientWidth;
          height = this.scroller.clientHeight;
          void this.layout();
        }
      });
      this.resizeObserver.observe(this.scroller);
    }
  }

  focus(): void {
    this.scroller.focus();
  }

  status(): string {
    const fields = this.info.fields.length ? ` · ${t('pdf.fields', { n: this.info.fields.length })}` : '';
    return t('pdf.status', { n: this.current, total: this.doc.numPages, zoom: Math.round(this.scale * 100) }) + fields;
  }

  /** Save with the form fields still editable, for later changes (PDF-009). */
  async save(): Promise<Uint8Array> {
    if (!Object.keys(this.values).length && !this.stamps.length) return this.bytes;
    return applyEdits(this.bytes, { values: this.values, stamps: this.stamps, flatten: false });
  }

  /** "Flattened PDF": a copy whose filled fields become part of the page (PDF-010). */
  saveVariants(): SaveVariant[] {
    if (this.info.readOnlyReason || !this.info.fields.length) return [];
    return [
      {
        id: 'pdf-flattened',
        label: t('pdf.saveFlattened'),
        format: 'pdf',
        suffix: t('pdf.flattenedSuffix'),
        save: () => applyEdits(this.bytes, { values: this.values, stamps: this.stamps, flatten: true }),
      },
    ];
  }

  print(): void {
    void this.save().then((bytes) => {
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    });
  }

  destroy(): void {
    this.observer?.disconnect();
    this.resizeObserver?.disconnect();
    this.release();
  }

  // --- text search (PDF-017) -----------------------------------------------------------

  private openFind(): void {
    this.findBar.hidden = false;
    this.findInput.focus();
    this.findInput.select();
  }

  private closeFind(): void {
    this.findBar.hidden = true;
    this.matches = [];
    this.matchIndex = -1;
    for (const page of this.textDivs.keys()) this.highlight(page);
    this.scroller.focus();
  }

  /** FOLDER-002: show the first match of a search from the folder panel. */
  find(query: string): void {
    this.findBar.hidden = false;
    this.findInput.value = query;
    void this.search(query);
  }

  private pageTexts(): Promise<string[][]> {
    this.texts ??= Promise.all(
      Array.from({ length: this.doc.numPages }, async (_, i) => {
        const content = await (await this.doc.getPage(i + 1)).getTextContent();
        return content.items.map((item) => ('str' in item ? item.str : '')).filter((_, k) => 'str' in content.items[k]!);
      }),
    );
    return this.texts;
  }

  private async search(query: string): Promise<void> {
    const pages = await this.pageTexts();
    if (query !== this.findInput.value) return;
    this.matches = findInPages(pages, query);
    // The first match from the page shown.
    const from = this.matches.findIndex((m) => m.page >= this.current - 1);
    this.matchIndex = this.matches.length ? Math.max(0, from) : -1;
    this.showMatch();
  }

  private nextMatch(dir: number): void {
    if (!this.matches.length) return;
    this.matchIndex = (this.matchIndex + dir + this.matches.length) % this.matches.length;
    this.showMatch();
  }

  private showMatch(): void {
    const q = this.findInput.value.trim();
    this.findCount.textContent = q ? (this.matches.length ? t('pdf.findCount', { n: this.matchIndex + 1, total: this.matches.length }) : t('pdf.findNone')) : '';
    for (const page of this.textDivs.keys()) this.highlight(page);
    const m = this.matches[this.matchIndex];
    if (m && m.page !== this.current - 1) this.goTo(m.page + 1, false);
    else this.revealCurrent();
  }

  private revealCurrent(): void {
    this.scroller.querySelector('mark.pdf-hit.current')?.scrollIntoView({ block: 'center', inline: 'nearest' });
  }

  /** Marks around the matches of a rendered page's text. */
  private highlight(page: number): void {
    const layer = this.textDivs.get(page);
    if (!layer) return;
    const len = this.findInput.value.trim().length;
    const current = this.matches[this.matchIndex];
    layer.divs.forEach((div, item) => {
      const text = layer.strs[item] ?? '';
      const hits = this.matches.filter((m) => m.page === page && m.item === item);
      if (!hits.length) {
        if (div.querySelector('mark')) div.textContent = text;
        return;
      }
      const parts: (string | HTMLElement)[] = [];
      let at = 0;
      for (const m of hits) {
        parts.push(text.slice(at, m.offset), h('mark', { class: `pdf-hit${m === current ? ' current' : ''}` }, text.slice(m.offset, m.offset + len)));
        at = m.offset + len;
      }
      parts.push(text.slice(at));
      div.replaceChildren(...parts);
    });
    if (current?.page === page) this.revealCurrent();
  }

  // --- toolbar ------------------------------------------------------------------------

  private toolbar(): HTMLElement {
    const editable = !this.info.readOnlyReason;
    return h(
      'div',
      { class: 'toolbar', role: 'toolbar', 'aria-label': t('pdf.label') },
      button(t('pdf.prev'), () => this.goTo(this.current - 1), { text: '◀', title: t('pdf.prevTitle') }),
      this.pageInput,
      h('span', { class: 'page-total' }, `/ ${this.doc.numPages}`),
      button(t('pdf.next'), () => this.goTo(this.current + 1), { text: '▶', title: t('pdf.nextTitle') }),
      h('span', { class: 'sep' }),
      button(t('pdf.zoomOut'), () => this.zoomBy(-1), { text: '−', title: t('pdf.zoomOut') }),
      this.zoomLabel,
      button(t('pdf.zoomIn'), () => this.zoomBy(1), { text: '+', title: t('pdf.zoomIn') }),
      button(t('pdf.find'), () => this.openFind(), { text: '🔍', title: `${t('pdf.find')} (Ctrl+F)` }),
      button(t('pdf.fit'), () => this.setZoom('width'), { text: '↔', title: t('pdf.fit') }),
      button(t('pdf.fitPage'), () => this.setZoom('page'), { text: '↕', title: t('pdf.fitPage') }),
      this.columnsSelect,
      ...(editable
        ? [
            h('span', { class: 'sep' }),
            button(t('pdf.sign'), () => void this.addSignature(), { text: t('pdf.signText'), title: t('pdf.signTitle') }),
            button(t('pdf.addText'), () => this.addText(), { text: t('pdf.addTextText'), title: t('pdf.addTextTitle') }),
          ]
        : []),
    );
  }

  private zoomBy(dir: number): void {
    const i = ZOOMS.findIndex((z) => z >= this.scale - 0.01);
    const next = ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, (i < 0 ? ZOOMS.length - 1 : i) + dir))]!;
    this.setZoom(next);
  }

  private setZoom(zoom: PdfZoom): void {
    this.zoom = zoom;
    if (typeof zoom !== 'number') saveView(zoom, this.columns);
    void this.layout();
  }

  // --- layout & rendering -----------------------------------------------------------------

  private async layout(): Promise<void> {
    const keepPage = this.current;
    this.observer?.disconnect();
    const first = await this.doc.getPage(1);
    const base = first.getViewport({ scale: pdfjs.PixelsPerInch.PDF_TO_CSS_UNITS });
    this.scale = fitScale(this.zoom, {
      width: this.scroller.clientWidth || 900,
      height: this.scroller.clientHeight || 1100,
      pageWidth: base.width,
      pageHeight: base.height,
      columns: this.columns,
      gap: GAP,
    });
    this.pagesEl.style.setProperty('--columns', String(this.columns));
    this.pagesEl.classList.toggle('spread', this.columns > 1);
    this.zoomLabel.textContent = `${Math.round(this.scale * 100)}%`;
    this.pages = [];
    this.textDivs.clear();
    const shells: HTMLElement[] = [];
    for (let i = 0; i < this.doc.numPages; i++) {
      const proxy = i === 0 ? first : await this.doc.getPage(i + 1);
      const viewport = proxy.getViewport({ scale: this.scale * pdfjs.PixelsPerInch.PDF_TO_CSS_UNITS });
      const el = h('div', {
        class: 'pdf-page',
        'data-page': String(i + 1),
        role: 'region',
        'aria-label': t('pdf.page', { n: i + 1 }),
        style: `width: ${Math.floor(viewport.width)}px; height: ${Math.floor(viewport.height)}px`,
      });
      this.pages.push({ index: i, el, proxy, viewport, rendered: false });
      shells.push(el);
    }
    this.pagesEl.replaceChildren(...shells);
    if (typeof IntersectionObserver === 'function') {
      this.observer = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            const page = this.pages[Number((e.target as HTMLElement).dataset.page) - 1];
            if (page && !page.rendered) void this.renderPage(page);
          }
        },
        { root: this.scroller, rootMargin: '100% 0px' },
      );
      for (const p of this.pages) this.observer.observe(p.el);
    } else {
      for (const p of this.pages) void this.renderPage(p);
    }
    this.goTo(keepPage, false);
    this.ctx.statusChanged();
  }

  private async renderPage(page: PageShell): Promise<void> {
    if (!page.proxy || !page.viewport) return;
    page.rendered = true;
    const viewport = page.viewport;
    const ratio = window.devicePixelRatio || 1;
    const canvas = h('canvas', { class: 'pdf-canvas', 'aria-hidden': 'true' });
    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;
    const textLayer = h('div', { class: 'textLayer' });
    textLayer.style.setProperty('--total-scale-factor', String(viewport.scale));
    textLayer.style.setProperty('--scale-factor', String(viewport.scale));
    const formLayer = h('div', { class: 'pdf-form-layer' });
    const stampLayer = h('div', { class: 'pdf-stamp-layer' });
    page.el.replaceChildren(canvas, textLayer, formLayer, stampLayer);
    const context = canvas.getContext('2d');
    if (!context) return;
    try {
      await page.proxy.render({
        canvas,
        canvasContext: context,
        viewport,
        transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
      }).promise;
      const layer = new pdfjs.TextLayer({ textContentSource: page.proxy.streamTextContent(), container: textLayer, viewport });
      await layer.render();
      this.textDivs.set(page.index, { divs: layer.textDivs, strs: layer.textContentItemsStr });
      this.highlight(page.index);
    } catch (err) {
      if ((err as Error).name !== 'RenderingCancelledException') console.warn('PDF page rendering failed', err);
    }
    this.renderForm(page, formLayer);
    this.renderStamps(page, stampLayer);
  }

  private rect(viewport: PageViewport, r: [number, number, number, number]): { left: number; top: number; width: number; height: number } {
    const [x1, y1] = viewport.convertToViewportPoint(r[0], r[1]) as [number, number];
    const [x2, y2] = viewport.convertToViewportPoint(r[0] + r[2], r[1] + r[3]) as [number, number];
    return { left: Math.min(x1, x2), top: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
  }

  private place(el: HTMLElement, box: { left: number; top: number; width: number; height: number }): void {
    el.style.left = `${box.left}px`;
    el.style.top = `${box.top}px`;
    el.style.width = `${box.width}px`;
    el.style.height = `${box.height}px`;
  }

  private renderForm(page: PageShell, layer: HTMLElement): void {
    if (this.info.readOnlyReason) return;
    for (const field of this.info.fields) {
      field.widgets.forEach((w) => {
        if (w.page !== page.index) return;
        const control = this.control(field, w.option);
        if (!control) return;
        const box = this.rect(page.viewport!, w.rect);
        this.place(control, box);
        control.style.fontSize = `${Math.max(8, Math.min(box.height * 0.65, 16 * this.scale))}px`;
        layer.append(control);
      });
    }
  }

  private currentValue(field: FormField): string | boolean | string[] {
    return field.name in this.values ? this.values[field.name]! : field.value;
  }

  private control(field: FormField, option?: string): HTMLElement | null {
    const set = (v: string | boolean | string[]): void => {
      this.values[field.name] = v;
      this.ctx.changed();
      // keep twin widgets (same field on several pages) in sync
      for (const other of Array.from(this.pagesEl.querySelectorAll<HTMLInputElement>(`[data-field="${CSS.escape(field.name)}"]`))) {
        if (other.type === 'radio') other.checked = other.value === v;
        else if (other.type === 'checkbox') other.checked = v === true;
        else if (other !== document.activeElement && typeof v === 'string') other.value = v;
      }
    };
    const value = this.currentValue(field);
    const common = { 'data-field': field.name, 'aria-label': field.name, disabled: field.readOnly, class: 'pdf-field' };
    switch (field.type) {
      case 'text': {
        const el = field.multiline ? h('textarea', common) : h('input', { ...common, type: 'text', maxlength: field.maxLength ? String(field.maxLength) : undefined });
        el.value = String(value ?? '');
        el.addEventListener('input', () => set(el.value));
        return el;
      }
      case 'checkbox': {
        const el = h('input', { ...common, type: 'checkbox' });
        el.checked = value === true;
        el.addEventListener('change', () => set(el.checked));
        return el;
      }
      case 'radio': {
        const el = h('input', { ...common, type: 'radio', name: `pdf-${field.name}`, value: option ?? '', 'aria-label': `${field.name}: ${option ?? ''}` });
        el.checked = value === option;
        el.addEventListener('change', () => el.checked && set(option ?? ''));
        return el;
      }
      case 'dropdown':
      case 'list': {
        const el = h('select', { ...common, multiple: field.type === 'list' }, h('option', { value: '' }, ''), ...(field.options ?? []).map((o) => h('option', { value: o }, o)));
        const selected = Array.isArray(value) ? value : [String(value ?? '')];
        for (const o of Array.from(el.options)) o.selected = selected.includes(o.value);
        el.addEventListener('change', () => set(field.type === 'list' ? Array.from(el.selectedOptions).map((o) => o.value) : el.value));
        return el;
      }
      default:
        return null;
    }
  }

  // --- stamps (signatures, text) ----------------------------------------------------------

  private renderStamps(page: PageShell, layer: HTMLElement): void {
    layer.replaceChildren();
    this.stamps.forEach((stamp, i) => {
      if (stamp.page !== page.index) return;
      const el = h('div', { class: `pdf-stamp ${stamp.kind}`, tabindex: '0', role: 'group', 'aria-label': stamp.kind === 'image' ? t('pdf.signature') : t('pdf.stampText', { text: stamp.text }) });
      if (stamp.kind === 'image') {
        const img = h('img', { alt: 'Signature', draggable: 'false' });
        img.src = URL.createObjectURL(new Blob([stamp.png as BlobPart], { type: 'image/png' }));
        el.append(img);
      } else {
        el.append(h('span', { style: `font-size: ${stamp.size * this.scale * pdfjs.PixelsPerInch.PDF_TO_CSS_UNITS}px` }, stamp.text));
      }
      const remove = button(t('common.remove'), () => {
        this.stamps.splice(i, 1);
        this.ctx.changed();
        this.renderStamps(page, layer);
      }, { text: '×', className: 'stamp-remove' });
      const handle = h('span', { class: 'stamp-resize', 'aria-hidden': 'true' });
      el.append(remove, handle);
      this.place(el, this.rect(page.viewport!, [stamp.x, stamp.y, stamp.width, stamp.height]));
      this.makeDraggable(el, handle, page, stamp);
      layer.append(el);
    });
  }

  private makeDraggable(el: HTMLElement, handle: HTMLElement, page: PageShell, stamp: Stamp): void {
    let mode: 'move' | 'resize' | null = null;
    let start = { x: 0, y: 0, left: 0, top: 0, width: 0, height: 0 };
    el.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('.stamp-remove')) return;
      mode = e.target === handle ? 'resize' : 'move';
      el.setPointerCapture(e.pointerId);
      start = { x: e.clientX, y: e.clientY, left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight };
      e.preventDefault();
    });
    el.addEventListener('pointermove', (e) => {
      if (!mode) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (mode === 'move') {
        el.style.left = `${start.left + dx}px`;
        el.style.top = `${start.top + dy}px`;
      } else {
        const ratio = start.height / start.width;
        const width = Math.max(20, start.width + dx);
        el.style.width = `${width}px`;
        el.style.height = `${stamp.kind === 'image' ? width * ratio : Math.max(10, start.height + dy)}px`;
      }
    });
    const end = (): void => {
      if (!mode) return;
      mode = null;
      this.updateStampFromElement(el, page, stamp);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 10 : 2;
      const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      const m = moves[e.key];
      if (m) {
        e.preventDefault();
        el.style.left = `${el.offsetLeft + m[0]}px`;
        el.style.top = `${el.offsetTop + m[1]}px`;
        this.updateStampFromElement(el, page, stamp);
      } else if (e.key === 'Delete') {
        el.querySelector<HTMLButtonElement>('.stamp-remove')?.click();
      }
    });
  }

  private updateStampFromElement(el: HTMLElement, page: PageShell, stamp: Stamp): void {
    const vp = page.viewport!;
    const [ax, ay] = vp.convertToPdfPoint(el.offsetLeft, el.offsetTop + el.offsetHeight) as [number, number];
    const [bx, by] = vp.convertToPdfPoint(el.offsetLeft + el.offsetWidth, el.offsetTop) as [number, number];
    stamp.x = Math.min(ax, bx);
    stamp.y = Math.min(ay, by);
    stamp.width = Math.abs(bx - ax);
    stamp.height = Math.abs(by - ay);
    if (stamp.kind === 'text') stamp.size = Math.max(4, stamp.height * 0.8);
    this.ctx.changed();
  }

  private pageCenter(page: PageShell, width: number, height: number): { x: number; y: number } {
    const view = page.proxy!.view; // [x1, y1, x2, y2] in PDF units
    const visibleTop = Math.max(0, this.scroller.scrollTop - page.el.offsetTop);
    const [, yTop] = page.viewport!.convertToPdfPoint(0, visibleTop + 120) as [number, number];
    return { x: (view[0]! + view[2]!) / 2 - width / 2, y: Math.min(view[3]! - height - 20, yTop - height) };
  }

  private async addSignature(): Promise<void> {
    const sig = await captureSignature(this.element);
    if (!sig) return;
    const page = this.pages[this.current - 1];
    if (!page) return;
    const width = 160;
    const height = (width * sig.height) / sig.width;
    const pos = this.pageCenter(page, width, height);
    this.stamps.push({ kind: 'image', page: page.index, ...pos, width, height, png: sig.png });
    this.ctx.changed();
    this.refreshStamps(page);
  }

  private addText(): void {
    const text = window.prompt(t('pdf.textPrompt'), new Date().toISOString().slice(0, 10));
    if (!text) return;
    const page = this.pages[this.current - 1];
    if (!page) return;
    const size = 12;
    const width = Math.max(30, text.length * size * 0.55);
    const height = size * 1.25;
    const pos = this.pageCenter(page, width, height);
    this.stamps.push({ kind: 'text', page: page.index, ...pos, width, height, text, size });
    this.ctx.changed();
    this.refreshStamps(page);
  }

  private refreshStamps(page: PageShell): void {
    const layer = page.el.querySelector<HTMLElement>('.pdf-stamp-layer');
    if (layer) this.renderStamps(page, layer);
  }

  // --- navigation ---------------------------------------------------------------------------

  private goTo(n: number, smooth = true): void {
    const page = this.pages[Math.max(1, Math.min(this.doc.numPages, n || 1)) - 1];
    if (!page) return;
    this.current = page.index + 1;
    this.pageInput.value = String(this.current);
    if (typeof this.scroller.scrollTo === 'function') this.scroller.scrollTo({ top: page.el.offsetTop - GAP, behavior: smooth ? 'smooth' : 'auto' });
    this.ctx.statusChanged();
  }

  private updateCurrent(): void {
    const mark = this.scroller.scrollTop + this.scroller.clientHeight / 3;
    let current = 1;
    for (const p of this.pages) if (p.el.offsetTop <= mark) current = p.index + 1;
    if (current !== this.current) {
      this.current = current;
      this.pageInput.value = String(current);
      this.ctx.statusChanged();
    }
  }
}
