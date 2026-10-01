/** Presentation editor view (PRES-004..PRES-010). */
import { beforeMutation, slideTools, type AgentTool } from '../ai/tools';
import { contentHeightPx, contentWidthPx, mmToPx, type PrintSettings } from '../print/settings';
import { t } from '../i18n';
import { button, h } from '../app/dom';
import type { EditorView, ViewContext } from '../app/views';
import { domToBlocks } from '../document/html';
import { bytesToBase64 } from '../document/markdown-writer';
import { addResource, type Paragraph } from '../document/model';
import { imageSize } from '../core/image-size';
import { writePresentation, type SlidesFormat } from './io';
import { contentSlide, newShapeId, slideText, textShape, type Presentation, type Shape, type Slide } from './model';
import { renderShapeContent, renderSlide } from './render';
import { typesetMath } from '../math/inline';

const THUMB_W = 150;
const MAX_UNDO = 100;
const FONT_SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 54, 66, 80];

export class SlideEditor implements EditorView {
  readonly element: HTMLElement;
  private readonly list = h('div', { class: 'slide-list', role: 'listbox', 'aria-label': t('slides.list') });
  private readonly stageWrap = h('div', { class: 'stage-wrap', tabindex: '0', 'aria-label': t('slides.editor') });
  private readonly stage = h('div', { class: 'stage' });
  private readonly notes = h('textarea', { class: 'notes', 'aria-label': t('slides.notes'), placeholder: t('slides.notesPlaceholder'), rows: '3' });
  private readonly sizeSelect = h('select', { 'aria-label': t('slides.fontSize'), title: t('slides.fontSize') }, ...FONT_SIZES.map((s) => h('option', { value: String(s) }, `${s} pt`)));
  private readonly fillInput = h('input', { type: 'color', 'aria-label': t('slides.fill'), title: t('slides.fill') });
  private readonly textColor = h('input', { type: 'color', 'aria-label': t('slides.textColor'), title: t('slides.textColor'), value: '#000000' });
  private current = 0;
  private selected: number | null = null;
  private editing: { shape: Shape; content: HTMLElement } | null = null;
  private scale = 0.5;
  private urls = new Map<string, string>();
  private undoStack: Slide[][] = [];
  private redoStack: Slide[][] = [];
  private resizeObserver: ResizeObserver | undefined;

  constructor(
    private readonly pres: Presentation,
    private readonly ctx: ViewContext,
    private readonly sourceFormat: SlidesFormat,
  ) {
    this.stageWrap.append(this.stage);
    this.element = h(
      'div',
      { class: 'slide-editor' },
      this.toolbar(),
      h('div', { class: 'slide-body' }, this.list, h('div', { class: 'slide-main' }, this.stageWrap, this.notes)),
    );
    this.notes.addEventListener('input', () => {
      const slide = this.slide();
      if (this.notes.value) slide.notes = this.notes.value;
      else delete slide.notes;
      this.ctx.changed();
    });
    this.stageWrap.addEventListener('keydown', (e) => this.onKey(e));
    this.stageWrap.addEventListener('pointerdown', (e) => {
      if (e.target === this.stageWrap || e.target === this.stage.firstChild) this.select(null);
    });
    this.render();
  }

  // --- EditorView -----------------------------------------------------------------

  mounted(): void {
    this.fit();
    if (typeof ResizeObserver === 'function') {
      this.resizeObserver = new ResizeObserver(() => this.fit());
      this.resizeObserver.observe(this.stageWrap);
    }
  }

  focus(): void {
    this.stageWrap.focus();
  }

  status(): string {
    return t('slides.position', { n: this.current + 1, total: this.pres.slides.length });
  }

  save(format: Parameters<NonNullable<EditorView['save']>>[0]): Uint8Array {
    this.finishEditing();
    return writePresentation(this.pres, (format as SlidesFormat) ?? this.sourceFormat);
  }

  destroy(): void {
    this.resizeObserver?.disconnect();
    if (typeof URL.revokeObjectURL === 'function') for (const u of this.urls.values()) if (u.startsWith('blob:')) URL.revokeObjectURL(u);
  }

  agentTools(): AgentTool[] {
    this.finishEditing();
    const self = this;
    const tools = slideTools({
      get pres() {
        return self.pres;
      },
      refresh: () => {
        this.current = Math.min(this.current, this.pres.slides.length - 1);
        this.changed();
      },
    });
    return beforeMutation(tools, () => this.snapshot());
  }

  async printContent(settings: PrintSettings): Promise<HTMLElement> {
    this.finishEditing();
    const per = settings.slidesPerPage;
    const cols = per >= 4 ? 2 : 1;
    const rows = Math.ceil(per / cols);
    const gap = mmToPx(6);
    const noteSpace = settings.notes ? 60 : 0;
    const ratio = this.pres.height / this.pres.width;
    const maxW = (contentWidthPx(settings) - (cols - 1) * gap) / cols;
    const maxH = (contentHeightPx(settings) - (rows - 1) * gap) / rows - noteSpace;
    const width = Math.max(50, Math.min(maxW, maxH / ratio));
    const root = h('div', { class: 'print-slides' });
    for (let i = 0; i < this.pres.slides.length; i += per) {
      const page = h('div', { class: 'print-page', style: `grid-template-columns: repeat(${cols}, ${width}px)` });
      for (const slide of this.pres.slides.slice(i, i + per)) {
        const inner = renderSlide(slide, this.pres, (k) => this.resolve(k));
        inner.style.transform = `scale(${width / this.pres.width})`;
        const frame = h('div', { class: 'slide-frame', style: `width: ${width}px; height: ${width * ratio}px` }, inner);
        page.append(h('div', {}, frame, settings.notes && slide.notes ? h('p', { class: 'slide-notes' }, slide.notes) : null));
      }
      root.append(page);
    }
    await typesetMath(root);
    return root;
  }

  print(): void {
    const holder = h('div', { class: 'print-only print-slides' });
    for (const slide of this.pres.slides) {
      const page = h('div', { class: 'print-slide' }, renderSlide(slide, this.pres, (k) => this.resolve(k)));
      holder.append(page);
    }
    document.body.append(holder);
    document.body.classList.add('printing-sheet');
    window.print();
    document.body.classList.remove('printing-sheet');
    holder.remove();
  }

  // --- helpers ----------------------------------------------------------------------

  private slide(): Slide {
    return this.pres.slides[this.current]!;
  }

  private resolve(key: string): string | undefined {
    const res = this.pres.resources.get(key);
    if (!res) return undefined;
    let url = this.urls.get(key);
    if (!url) {
      url =
        typeof URL.createObjectURL === 'function'
          ? URL.createObjectURL(new Blob([res.data as BlobPart], { type: res.mediaType }))
          : `data:${res.mediaType};base64,${bytesToBase64(res.data)}`;
      this.urls.set(key, url);
    }
    return url;
  }

  private snapshot(): void {
    this.undoStack.push(structuredClone(this.pres.slides));
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
    this.redoStack = [];
  }

  private restore(from: Slide[][], to: Slide[][]): void {
    const state = from.pop();
    if (!state) return;
    to.push(structuredClone(this.pres.slides));
    this.pres.slides = state;
    this.current = Math.min(this.current, this.pres.slides.length - 1);
    this.selected = null;
    this.changed();
  }

  private changed(): void {
    this.ctx.changed();
    this.render();
  }

  private fit(): void {
    const w = this.stageWrap.clientWidth - 32;
    const hgt = this.stageWrap.clientHeight - 32;
    this.scale = w > 0 && hgt > 0 ? Math.min(w / this.pres.width, hgt / this.pres.height) : 0.5;
    this.renderStage();
  }

  // --- rendering --------------------------------------------------------------------

  private render(): void {
    this.renderList();
    this.renderStage();
    this.notes.value = this.slide().notes ?? '';
    this.ctx.statusChanged();
  }

  private renderList(): void {
    const scale = THUMB_W / this.pres.width;
    this.list.replaceChildren(
      ...this.pres.slides.map((slide, i) => {
        const inner = renderSlide(slide, this.pres, (k) => this.resolve(k));
        inner.style.transform = `scale(${scale})`;
        const frame = h('div', { class: 'thumb-frame', style: `width: ${THUMB_W}px; height: ${this.pres.height * scale}px` }, inner);
        const b = button(t('slides.slide', { n: i + 1 }), () => this.goTo(i), { className: 'slide-thumb', title: slideText(slide).split('\n')[0] || t('slides.slide', { n: i + 1 }) });
        b.replaceChildren(h('span', { class: 'thumb-num' }, String(i + 1)), frame);
        b.setAttribute('role', 'option');
        b.setAttribute('aria-selected', String(i === this.current));
        b.setAttribute('aria-current', String(i === this.current));
        return b;
      }),
    );
    void typesetMath(this.list);
  }

  private renderStage(): void {
    const slideEl = renderSlide(this.slide(), this.pres, (k) => this.resolve(k));
    slideEl.style.transform = `scale(${this.scale})`;
    const holder = h('div', { class: 'stage-slide', style: `width: ${this.pres.width * this.scale}px; height: ${this.pres.height * this.scale}px` }, slideEl);
    this.stage.replaceChildren(holder);
    void typesetMath(holder);
    for (const el of Array.from(slideEl.querySelectorAll<HTMLElement>('.shape'))) {
      const shape = this.slide().shapes.find((s) => String(s.id) === el.dataset.id);
      if (shape) this.makeInteractive(el, shape);
    }
  }

  private goTo(i: number): void {
    this.finishEditing();
    this.current = Math.max(0, Math.min(this.pres.slides.length - 1, i));
    this.selected = null;
    this.render();
  }

  private select(id: number | null): void {
    if (this.editing && this.editing.shape.id !== id) this.finishEditing();
    this.selected = id;
    for (const el of Array.from(this.stage.querySelectorAll<HTMLElement>('.shape'))) {
      el.classList.toggle('selected', el.dataset.id === String(id));
    }
    const shape = this.slide().shapes.find((s) => s.id === id);
    if (shape) {
      this.sizeSelect.value = String(shape.fontSize);
      this.fillInput.value = shape.fill ?? '#ffffff';
    }
  }

  // --- interaction -------------------------------------------------------------------

  private makeInteractive(el: HTMLElement, shape: Shape): void {
    el.tabIndex = -1;
    if (shape.id === this.selected) el.classList.add('selected');
    el.append(h('span', { class: 'handle', 'aria-hidden': 'true' }));
    let drag: { mode: 'move' | 'resize'; x: number; y: number; sx: number; sy: number; sw: number; sh: number; moved: boolean } | null = null;
    el.addEventListener('pointerdown', (e) => {
      if (this.editing?.shape === shape) return;
      e.stopPropagation();
      this.select(shape.id);
      this.stageWrap.focus();
      drag = { mode: (e.target as HTMLElement).classList.contains('handle') ? 'resize' : 'move', x: e.clientX, y: e.clientY, sx: shape.x, sy: shape.y, sw: shape.width, sh: shape.height, moved: false };
      el.setPointerCapture?.(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = (e.clientX - drag.x) / this.scale;
      const dy = (e.clientY - drag.y) / this.scale;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 2) return;
      if (!drag.moved) this.snapshot();
      drag.moved = true;
      if (drag.mode === 'move') {
        shape.x = Math.round(drag.sx + dx);
        shape.y = Math.round(drag.sy + dy);
      } else {
        shape.width = Math.max(10, Math.round(drag.sw + dx));
        shape.height = Math.max(10, Math.round(shape.kind === 'image' && e.shiftKey ? (drag.sh * shape.width) / drag.sw : drag.sh + dy));
      }
      el.style.left = `${shape.x}px`;
      el.style.top = `${shape.y}px`;
      el.style.width = `${shape.width}px`;
      el.style.height = `${shape.height}px`;
    });
    const end = (): void => {
      if (drag?.moved) {
        this.ctx.changed();
        this.renderList();
      }
      drag = null;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('dblclick', () => {
      if (shape.kind !== 'image') this.startEditing(el, shape);
    });
  }

  private startEditing(el: HTMLElement, shape: Shape): void {
    if (this.editing?.shape === shape) return;
    this.finishEditing();
    this.select(shape.id);
    // Edit the source text: equations show as `$…$` while editing (TEX-006).
    const content = renderShapeContent(shape, true);
    const existing = el.querySelector<HTMLElement>('.shape-content');
    if (existing) existing.replaceWith(content);
    else el.append(content);
    if (!shape.paragraphs.length) content.innerHTML = '<p><br></p>';
    content.setAttribute('contenteditable', 'true');
    el.classList.add('editing');
    this.snapshot();
    this.editing = { shape, content };
    content.addEventListener('focusout', () => this.finishEditing(), { once: true });
    content.focus();
  }

  private finishEditing(): void {
    const editing = this.editing;
    if (!editing) return;
    this.editing = null;
    // Parse the children only: the container carries the shape's default font size.
    const frag = document.createDocumentFragment();
    frag.append(...Array.from(editing.content.childNodes).map((n) => n.cloneNode(true)));
    const blocks = domToBlocks(frag, () => undefined, { preserveWhitespace: true });
    const paragraphs = blocks.filter((b): b is Paragraph => b.type === 'paragraph').map((p) => ({ ...p, style: 'normal' as const }));
    editing.shape.paragraphs = paragraphs.length === 1 && !paragraphs[0]!.runs.length && editing.shape.kind !== 'text' ? [] : paragraphs;
    this.changed();
  }

  private onKey(e: KeyboardEvent): void {
    if (this.editing) {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.finishEditing();
        this.stageWrap.focus();
      }
      return;
    }
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      this.restore(e.shiftKey ? this.redoStack : this.undoStack, e.shiftKey ? this.undoStack : this.redoStack);
      return;
    }
    if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      this.restore(this.redoStack, this.undoStack);
      return;
    }
    if (e.key === 'F5') {
      e.preventDefault();
      this.startShow();
      return;
    }
    const shape = this.slide().shapes.find((s) => s.id === this.selected);
    if (!shape) {
      if (e.key === 'PageDown' || e.key === 'ArrowDown') this.goTo(this.current + 1);
      else if (e.key === 'PageUp' || e.key === 'ArrowUp') this.goTo(this.current - 1);
      return;
    }
    const step = e.shiftKey ? 10 : 1;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const m = moves[e.key];
    if (m) {
      e.preventDefault();
      this.snapshot();
      shape.x += m[0];
      shape.y += m[1];
      this.changed();
      this.select(shape.id);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      this.deleteShape();
    } else if (e.key === 'Enter' || e.key === 'F2') {
      const el = this.stage.querySelector<HTMLElement>(`.shape[data-id="${shape.id}"]`);
      if (el && shape.kind !== 'image') {
        e.preventDefault();
        this.startEditing(el, shape);
      }
    } else if (e.key === 'Escape') {
      this.select(null);
    }
  }

  // --- commands ----------------------------------------------------------------------

  private addSlide(): void {
    this.snapshot();
    this.pres.slides.splice(this.current + 1, 0, contentSlide(this.pres.width, this.pres.height));
    this.current++;
    this.selected = null;
    this.changed();
  }

  private duplicateSlide(): void {
    this.snapshot();
    const copy = structuredClone(this.slide());
    for (const s of copy.shapes) s.id = newShapeId();
    this.pres.slides.splice(this.current + 1, 0, copy);
    this.current++;
    this.changed();
  }

  private deleteSlide(): void {
    if (this.pres.slides.length <= 1) return;
    this.snapshot();
    this.pres.slides.splice(this.current, 1);
    this.current = Math.min(this.current, this.pres.slides.length - 1);
    this.selected = null;
    this.changed();
  }

  private moveSlide(dir: number): void {
    const to = this.current + dir;
    if (to < 0 || to >= this.pres.slides.length) return;
    this.snapshot();
    const [slide] = this.pres.slides.splice(this.current, 1);
    this.pres.slides.splice(to, 0, slide!);
    this.current = to;
    this.changed();
  }

  private addShape(shape: Shape): void {
    this.finishEditing();
    this.snapshot();
    this.slide().shapes.push(shape);
    this.changed();
    this.select(shape.id);
  }

  private deleteShape(): void {
    const shapes = this.slide().shapes;
    const i = shapes.findIndex((s) => s.id === this.selected);
    if (i < 0) return;
    this.snapshot();
    shapes.splice(i, 1);
    this.selected = null;
    this.changed();
  }

  private reorder(dir: 1 | -1): void {
    const shapes = this.slide().shapes;
    const i = shapes.findIndex((s) => s.id === this.selected);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= shapes.length) return;
    this.snapshot();
    [shapes[i], shapes[j]] = [shapes[j]!, shapes[i]!];
    this.changed();
  }

  private async addImage(): Promise<void> {
    const input = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml' });
    const file = await new Promise<File | null>((resolve) => {
      input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true });
      input.addEventListener('cancel', () => resolve(null), { once: true });
      input.click();
    });
    if (!file) return;
    const data = new Uint8Array(await file.arrayBuffer());
    const key = addResource(this.pres, data, file.type || 'image/png', file.name);
    const size = imageSize(data) ?? { width: 400, height: 300 };
    const ratio = Math.min(1, (this.pres.width * 0.6) / size.width, (this.pres.height * 0.6) / size.height);
    const width = Math.round(size.width * ratio);
    const height = Math.round(size.height * ratio);
    this.addShape({ ...textShape('', { kind: 'image', image: key, alt: file.name.replace(/\.[^.]+$/, ''), x: (this.pres.width - width) / 2, y: (this.pres.height - height) / 2, width, height }), paragraphs: [] });
  }

  /** Apply a command to the text being edited, or to the selected shape as a whole. */
  private format(command: string, value?: string): void {
    if (this.editing) {
      this.editing.content.focus();
      document.execCommand(command, false, value);
      return;
    }
    const shape = this.slide().shapes.find((s) => s.id === this.selected);
    if (!shape) return;
    this.snapshot();
    const flag = ({ bold: 'bold', italic: 'italic', underline: 'underline' } as const)[command as 'bold'];
    if (flag) {
      const all = shape.paragraphs.every((p) => p.runs.every((r) => !('text' in r) || r[flag]));
      for (const p of shape.paragraphs) for (const r of p.runs) if ('text' in r) r[flag] = all ? undefined : true;
    } else if (command.startsWith('justify')) {
      const align = ({ justifyLeft: 'left', justifyCenter: 'center', justifyRight: 'right' } as const)[command as 'justifyLeft'];
      for (const p of shape.paragraphs) {
        if (align === 'left') delete p.align;
        else p.align = align;
      }
    }
    this.changed();
    this.select(shape.id);
  }

  private setFontSize(size: number): void {
    if (this.editing) {
      const content = this.editing.content;
      content.focus();
      document.execCommand('fontSize', false, '7');
      for (const font of Array.from(content.querySelectorAll('font[size="7"]'))) {
        const span = h('span', { style: `font-size: ${size}pt` });
        span.append(...Array.from(font.childNodes));
        font.replaceWith(span);
      }
      return;
    }
    const shape = this.slide().shapes.find((s) => s.id === this.selected);
    if (!shape) return;
    this.snapshot();
    shape.fontSize = size;
    for (const p of shape.paragraphs) for (const r of p.runs) if ('text' in r) delete r.size;
    this.changed();
    this.select(shape.id);
  }

  private setTextColor(color: string): void {
    if (this.editing) {
      this.editing.content.focus();
      document.execCommand('styleWithCSS', false, 'true');
      document.execCommand('foreColor', false, color);
      document.execCommand('styleWithCSS', false, 'false');
      return;
    }
    const shape = this.slide().shapes.find((s) => s.id === this.selected);
    if (!shape) return;
    this.snapshot();
    for (const p of shape.paragraphs) for (const r of p.runs) if ('text' in r) r.color = color;
    this.changed();
    this.select(shape.id);
  }

  private setFill(color: string): void {
    const shape = this.slide().shapes.find((s) => s.id === this.selected);
    if (!shape || shape.kind === 'image') return;
    this.snapshot();
    shape.fill = color;
    if (shape.kind === 'text') shape.kind = 'rect';
    this.changed();
    this.select(shape.id);
  }

  private toolbar(): HTMLElement {
    const b = (label: string, text: string, fn: () => void) => button(label, fn, { text, title: label });
    const w = this.pres.width;
    const hh = this.pres.height;
    this.sizeSelect.addEventListener('change', () => this.setFontSize(Number(this.sizeSelect.value)));
    this.fillInput.addEventListener('change', () => this.setFill(this.fillInput.value));
    this.textColor.addEventListener('change', () => this.setTextColor(this.textColor.value));
    return h(
      'div',
      { class: 'toolbar', role: 'toolbar', 'aria-label': t('slides.label') },
      b(t('slides.present'), t('slides.presentText'), () => this.startShow()),
      h('span', { class: 'sep' }),
      b(t('slides.newSlide'), t('slides.newSlideText'), () => this.addSlide()),
      b(t('slides.duplicate'), '⧉', () => this.duplicateSlide()),
      b(t('slides.moveUp'), '↑', () => this.moveSlide(-1)),
      b(t('slides.moveDown'), '↓', () => this.moveSlide(1)),
      b(t('slides.delete'), '🗑', () => this.deleteSlide()),
      h('span', { class: 'sep' }),
      b(t('slides.addText'), 'T', () => this.addShape(textShape(t('slides.newText'), { x: w * 0.3, y: hh * 0.4, width: w * 0.4, height: 60, fontSize: 24 }))),
      b(t('slides.addRect'), '▭', () => this.addShape({ ...textShape('', { kind: 'rect', fill: '#4472c4', x: w * 0.4, y: hh * 0.4, width: 200, height: 120, anchor: 'middle' }), paragraphs: [] })),
      b(t('slides.addEllipse'), '◯', () => this.addShape({ ...textShape('', { kind: 'ellipse', fill: '#ed7d31', x: w * 0.4, y: hh * 0.4, width: 160, height: 160, anchor: 'middle' }), paragraphs: [] })),
      b(t('slides.addImage'), '🖼', () => void this.addImage()),
      h('span', { class: 'sep' }),
      b(t('common.bold'), 'B', () => this.format('bold')),
      b(t('common.italic'), 'I', () => this.format('italic')),
      b(t('common.underline'), 'U', () => this.format('underline')),
      this.sizeSelect,
      this.textColor,
      b(t('common.alignLeft'), '⇤', () => this.format('justifyLeft')),
      b(t('common.alignCenter'), '↔', () => this.format('justifyCenter')),
      b(t('common.alignRight'), '⇥', () => this.format('justifyRight')),
      b(t('common.bullets'), '•≡', () => this.format('insertUnorderedList')),
      h('span', { class: 'sep' }),
      this.fillInput,
      b(t('slides.forward'), '⬆', () => this.reorder(1)),
      b(t('slides.backward'), '⬇', () => this.reorder(-1)),
      b(t('slides.deleteShape'), '✕', () => this.deleteShape()),
    );
  }

  // --- slideshow (PRES-007) --------------------------------------------------------------

  private startShow(): void {
    this.finishEditing();
    let index = this.current;
    const show = h('div', { class: 'slideshow', tabindex: '0', role: 'dialog', 'aria-modal': 'true' });
    const draw = (): void => {
      const slide = renderSlide(this.pres.slides[index]!, this.pres, (k) => this.resolve(k));
      const vw = window.innerWidth || this.pres.width;
      const vh = window.innerHeight || this.pres.height;
      const scale = Math.min(vw / this.pres.width, vh / this.pres.height);
      slide.style.transform = `scale(${scale})`;
      const frame = h('div', { class: 'show-frame', style: `width: ${this.pres.width * scale}px; height: ${this.pres.height * scale}px` }, slide);
      show.replaceChildren(frame);
      void typesetMath(frame);
      show.setAttribute('aria-label', t('slides.position', { n: index + 1, total: this.pres.slides.length }));
    };
    const exit = (): void => {
      show.remove();
      if (document.fullscreenElement) void document.exitFullscreen?.();
      this.goTo(index);
      this.stageWrap.focus();
    };
    const go = (d: number): void => {
      index = Math.max(0, Math.min(this.pres.slides.length - 1, index + d));
      draw();
    };
    show.addEventListener('keydown', (e) => {
      if (['ArrowRight', 'ArrowDown', ' ', 'PageDown', 'Enter', 'n'].includes(e.key)) {
        e.preventDefault();
        go(1);
      } else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'p'].includes(e.key)) {
        e.preventDefault();
        go(-1);
      } else if (e.key === 'Home') go(-Infinity);
      else if (e.key === 'End') go(Infinity);
      else if (e.key === 'Escape') {
        e.preventDefault();
        exit();
      }
    });
    show.addEventListener('click', () => go(1));
    show.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      go(-1);
    });
    const onFs = (): void => {
      if (!document.fullscreenElement && show.isConnected) exit();
    };
    document.addEventListener('fullscreenchange', onFs, { once: true });
    window.addEventListener('resize', () => show.isConnected && draw());
    document.body.append(show);
    draw();
    show.focus();
    void show.requestFullscreen?.().catch(() => undefined);
  }
}
