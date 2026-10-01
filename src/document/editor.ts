/** WYSIWYG editor view for text documents (DOC-003..DOC-010, DOC-013, DOC-015). */
import { documentTools, type AgentTool } from '../ai/tools';
import { findTypedMath } from '../math/inline';
import type { PrintSettings } from '../print/settings';
import { t, type MessageKey } from '../i18n';
import { button, h } from '../app/dom';
import type { EditorView, ViewContext } from '../app/views';
import { blocksToDom, domToBlocks, isSafeUrl, mathElement, sanitizeHtml } from './html';
import { writeDocumentAsync, type TextFormat } from './io';
import { decodeDataUri } from './markdown-reader';
import { bytesToBase64 } from './markdown-writer';
import { addResource, collectMath, wordCount, type Block, type RichDocument } from './model';

const STYLES: [string, MessageKey][] = [
  ['p', 'doc.style.normal'],
  ['h1', 'doc.style.h1'],
  ['h2', 'doc.style.h2'],
  ['h3', 'doc.style.h3'],
  ['h4', 'doc.style.h4'],
  ['blockquote', 'doc.style.quote'],
  ['pre', 'doc.style.code'],
];

function exec(command: string, value?: string): void {
  // execCommand is deprecated but remains the only cross-browser way to get
  // native undo/redo-aware rich text editing in contenteditable.
  document.execCommand(command, false, value);
}

export class DocumentEditor implements EditorView {
  readonly element: HTMLElement;
  private readonly page: HTMLElement;
  private readonly styleSelect: HTMLSelectElement;
  private readonly stateButtons: [string, HTMLButtonElement][] = [];
  private readonly urls = new Map<string, string>();
  private statusTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly onSelection = (): void => this.updateToolbar();

  constructor(
    private readonly doc: RichDocument,
    private readonly ctx: ViewContext,
  ) {
    this.page = h('div', {
      class: 'doc-page',
      contenteditable: 'true',
      role: 'textbox',
      'aria-multiline': 'true',
      'aria-label': t('doc.label'),
      spellcheck: 'true',
    });
    this.page.append(blocksToDom(doc.blocks, document, (key) => this.resolve(key)));
    this.styleSelect = h('select', { 'aria-label': t('doc.style'), title: t('doc.style') }, ...STYLES.map(([v, l]) => h('option', { value: v }, t(l))));
    this.styleSelect.addEventListener('change', () => {
      this.page.focus();
      exec('formatBlock', `<${this.styleSelect.value}>`);
      this.changed();
    });
    this.element = h('div', { class: 'doc-editor' }, this.toolbar(), h('div', { class: 'doc-scroll' }, this.page));
    this.page.addEventListener('input', (e) => {
      if ((e as InputEvent).data?.endsWith('$')) this.convertTypedMath();
      this.changed();
    });
    this.page.addEventListener('paste', (e) => this.onPaste(e));
    this.page.addEventListener('drop', (e) => this.onDrop(e));
    this.page.addEventListener('keydown', (e) => this.onKey(e));
    this.page.addEventListener('click', (e) => {
      const math = (e.target as HTMLElement).closest<HTMLElement>('span.math');
      if (math && this.page.contains(math)) void this.editMath(math);
    });
    document.addEventListener('selectionchange', this.onSelection);
    if (collectMath(doc.blocks).length) void this.renderEquations();
  }

  private async renderEquations(): Promise<void> {
    const { renderMath } = await import('../math/ui');
    await renderMath(this.page);
  }

  /** TEX-005: turn a just-typed `$…$` into an equation. */
  private convertTypedMath(): void {
    const sel = document.getSelection();
    const node = sel?.anchorNode;
    if (!sel?.isCollapsed || !node || node.nodeType !== Node.TEXT_NODE || !this.page.contains(node)) return;
    if (node.parentElement?.closest('code, pre, span.math')) return;
    const offset = sel.anchorOffset;
    const found = findTypedMath((node as Text).data.slice(0, offset));
    if (!found) return;
    const range = document.createRange();
    range.setStart(node, found.start);
    range.setEnd(node, offset);
    range.deleteContents();
    const el = mathElement(found.latex, found.display, document);
    range.insertNode(el);
    range.setStartAfter(el);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    void this.renderEquations();
  }

  /** Insert a new equation at the caret, or edit an existing one (MATH-001). */
  private async editMath(existing?: HTMLElement): Promise<void> {
    const sel = document.getSelection();
    const range = !existing && sel?.rangeCount && this.page.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null;
    const { editEquation } = await import('../math/ui');
    const value = await editEquation(this.element, existing ? { latex: existing.dataset.latex ?? '', display: existing.dataset.display === 'true' } : undefined);
    if (!value) return;
    const el = mathElement(value.latex, value.display, document);
    if (existing) {
      existing.replaceWith(el);
    } else if (range) {
      range.deleteContents();
      range.insertNode(el);
      range.setStartAfter(el);
      range.collapse(true);
      sel?.removeAllRanges();
      sel?.addRange(range);
    } else {
      const p = document.createElement('p');
      p.append(el);
      this.page.append(p);
    }
    this.changed();
    await this.renderEquations();
  }

  mounted(): void {
    try {
      document.execCommand('styleWithCSS', false, 'false');
      document.execCommand('defaultParagraphSeparator', false, 'p');
    } catch {
      /* not supported (tests) */
    }
  }

  focus(): void {
    this.page.focus();
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
      setBlocks: (blocks) => {
        this.page.replaceChildren(blocksToDom(blocks, document, (key) => this.resolve(key)));
        if (collectMath(blocks).length) void this.renderEquations();
        this.changed();
      },
    });
  }

  printContent(_settings?: PrintSettings): HTMLElement {
    const root = h('div', { class: 'print-document' });
    for (const node of Array.from(this.page.childNodes)) root.append(node.cloneNode(true));
    for (const el of Array.from(root.querySelectorAll('[contenteditable]'))) el.removeAttribute('contenteditable');
    return root;
  }

  destroy(): void {
    document.removeEventListener('selectionchange', this.onSelection);
    clearTimeout(this.statusTimer);
    if (typeof URL.revokeObjectURL === 'function') for (const url of this.urls.values()) if (url.startsWith('blob:')) URL.revokeObjectURL(url);
  }

  // ---------------------------------------------------------------------------

  private currentBlocks(): Block[] {
    const blocks = domToBlocks(this.page, (img) => this.lookup(img), { preserveWhitespace: true });
    return blocks.length ? blocks : [{ type: 'paragraph', style: 'normal', runs: [] }];
  }

  private resolve(key: string): { url: string } | undefined {
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

  /** Map an <img> in the editor (or pasted content) to a resource key. */
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
    clearTimeout(this.statusTimer);
    this.statusTimer = setTimeout(() => this.ctx.statusChanged(), 300);
  }

  private toolbar(): HTMLElement {
    const toggle = (cmd: string, label: string, text: string, key: string): HTMLButtonElement => {
      const b = button(
        label,
        () => {
          exec(cmd);
          this.changed();
          this.updateToolbar();
        },
        { text, title: `${label} (${key})`, pressed: false, className: `fmt-${cmd}` },
      );
      this.stateButtons.push([cmd, b]);
      return b;
    };
    const cmd = (label: string, text: string, command: string, value?: string): HTMLButtonElement =>
      button(
        label,
        () => {
          exec(command, value);
          this.changed();
        },
        { text, title: label },
      );
    return h(
      'div',
      { class: 'toolbar', role: 'toolbar', 'aria-label': t('doc.formatting') },
      cmd(t('common.undo'), '↶', 'undo'),
      cmd(t('common.redo'), '↷', 'redo'),
      h('span', { class: 'sep' }),
      this.styleSelect,
      h('span', { class: 'sep' }),
      toggle('bold', t('common.bold'), 'B', 'Ctrl+B'),
      toggle('italic', t('common.italic'), 'I', 'Ctrl+I'),
      toggle('underline', t('common.underline'), 'U', 'Ctrl+U'),
      toggle('strikeThrough', t('common.strike'), 'S', 'Ctrl+Shift+X'),
      button(t('doc.inlineCode'), () => this.inlineCode(), { text: '</>', title: t('doc.inlineCode') }),
      h('span', { class: 'sep' }),
      toggle('insertUnorderedList', t('common.bullets'), '•≡', 'Ctrl+Shift+8'),
      toggle('insertOrderedList', t('common.numbering'), '1≡', 'Ctrl+Shift+7'),
      h('span', { class: 'sep' }),
      toggle('justifyLeft', t('common.alignLeft'), '⇤', 'Ctrl+L'),
      toggle('justifyCenter', t('common.alignCenter'), '↔', 'Ctrl+E'),
      toggle('justifyRight', t('common.alignRight'), '⇥', 'Ctrl+R'),
      toggle('justifyFull', t('common.justify'), '☰', 'Ctrl+J'),
      h('span', { class: 'sep' }),
      button(t('doc.insertLink'), () => this.insertLink(), { text: '🔗', title: t('doc.insertLinkTitle') }),
      button(t('common.insertImage'), () => void this.pickImage(), { text: '🖼', title: t('common.insertImage') }),
      button(t('doc.insertTable'), () => this.insertTable(), { text: '▦', title: t('doc.insertTableTitle') }),
      button(t('doc.insertEquation'), () => void this.editMath(), { text: '∑', title: t('doc.insertEquationTitle') }),
      button(t('doc.insertRule'), () => {
        exec('insertHorizontalRule');
        this.changed();
      }, { text: '―', title: t('doc.insertRule') }),
    );
  }

  private updateToolbar(): void {
    const sel = document.getSelection();
    if (!sel?.anchorNode || !this.page.contains(sel.anchorNode)) return;
    for (const [cmd, b] of this.stateButtons) {
      let state = false;
      try {
        state = document.queryCommandState(cmd);
      } catch {
        /* ignore */
      }
      b.setAttribute('aria-pressed', String(state));
    }
    let node: Node | null = sel.anchorNode;
    while (node && node !== this.page) {
      if (node.nodeType === 1) {
        const tag = (node as Element).localName;
        const match = STYLES.find(([v]) => v === tag);
        if (match) {
          this.styleSelect.value = match[0];
          return;
        }
      }
      node = node.parentNode;
    }
    this.styleSelect.value = 'p';
  }

  private inlineCode(): void {
    const text = document.getSelection()?.toString() ?? '';
    if (!text) return;
    const code = document.createElement('code');
    code.textContent = text;
    exec('insertHTML', code.outerHTML);
    this.changed();
  }

  private insertLink(): void {
    const url = window.prompt(t('doc.linkPrompt'), 'https://');
    if (!url || url === 'https://') return;
    if (!isSafeUrl(url)) {
      window.alert(t('doc.linkRefused'));
      return;
    }
    if (document.getSelection()?.isCollapsed) {
      const a = document.createElement('a');
      a.href = url;
      a.textContent = url;
      exec('insertHTML', a.outerHTML);
    } else {
      exec('createLink', url);
    }
    this.changed();
  }

  private insertTable(): void {
    const table = document.createElement('table');
    const body = table.createTBody();
    for (let r = 0; r < 3; r++) {
      const row = body.insertRow();
      for (let c = 0; c < 3; c++) row.insertCell().append(document.createElement('br'));
    }
    exec('insertHTML', `${table.outerHTML}<p><br></p>`);
    this.changed();
  }

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

  private async insertImageFile(file: File): Promise<void> {
    if (!file.type.startsWith('image/')) return;
    const data = new Uint8Array(await file.arrayBuffer());
    const key = addResource(this.doc, data, file.type, file.name);
    const info = this.resolve(key);
    if (!info) return;
    const img = document.createElement('img');
    img.src = info.url;
    img.alt = file.name.replace(/\.[^.]+$/, '');
    img.dataset.resource = key;
    this.page.focus();
    exec('insertHTML', img.outerHTML);
    this.changed();
  }

  private onPaste(e: ClipboardEvent): void {
    const data = e.clipboardData;
    if (!data) return;
    const images = Array.from(data.files).filter((f) => f.type.startsWith('image/'));
    if (images.length) {
      e.preventDefault();
      void Promise.all(images.map((f) => this.insertImageFile(f)));
      return;
    }
    const html = data.getData('text/html');
    e.preventDefault();
    if (html) {
      // Only the supported subset survives; pasted data: images become resources.
      exec('insertHTML', sanitizeHtml(html, (img) => this.lookup(img)));
    } else {
      exec('insertText', data.getData('text/plain'));
    }
    this.changed();
  }

  private onDrop(e: DragEvent): void {
    const files = Array.from(e.dataTransfer?.files ?? []).filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    e.preventDefault();
    e.stopPropagation();
    void Promise.all(files.map((f) => this.insertImageFile(f)));
  }

  private onKey(e: KeyboardEvent): void {
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'Tab') {
      const inList = (document.getSelection()?.anchorNode?.parentElement?.closest('li') ?? null) !== null;
      if (inList) {
        e.preventDefault();
        exec(e.shiftKey ? 'outdent' : 'indent');
        this.changed();
      }
    } else if (mod && e.key.toLowerCase() === 'm') {
      e.preventDefault();
      void this.editMath();
    } else if (mod && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      this.insertLink();
    } else if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      exec('redo');
    } else if (mod && e.shiftKey && e.key.toLowerCase() === 'x') {
      e.preventDefault();
      exec('strikeThrough');
      this.changed();
    }
  }
}
