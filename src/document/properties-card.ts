/**
 * NOTE-001: the properties of a note shown above its page as a card — tags
 * as coloured chips, links to other notes to follow, dates, yes/no, numbers
 * — each changed in place, the front matter written back in its order; or
 * read only, the values drawn; or the whole front matter as YAML source.
 */
import { button, h } from '../app/dom';
import { t, type MessageKey } from '../i18n';
import type { DocumentMeta } from './model';
import { parseFrontMatter, writeFrontMatter } from './frontmatter';
import { changed, LINK, newProperty, readProperties, TAG_KEYS, writeProperties, type Property, type PropertyValue } from './note-properties';

export interface PropertiesHooks {
  get(): { meta: DocumentMeta; extra: string };
  set(meta: DocumentMeta, extra: string): void;
  readOnly(): boolean;
  /** Open a link: `wiki:Note` for a note of the folder, or a web address. */
  open(href: string): void;
  tagColour?(tag: string): string | undefined | null;
  /** Names of the notes, or the tags, of the folder (suggestions). */
  suggestions?(kind: 'link' | 'tag'): Promise<string[]>;
}

const KINDS: PropertyValue['kind'][] = ['text', 'list', 'date', 'number', 'bool', 'raw'];
const ICON: Record<PropertyValue['kind'], string> = { text: '≡', list: '☰', date: '📅', number: '#', bool: '☑', raw: '{ }' };
const isUrl = (s: string): boolean => /^https?:\/\/\S+$/i.test(s);
/** The wiki links and web addresses of a text, to draw them as links. */
const LINKS = /\[\[[^\]\n]+\]\]|https?:\/\/[^\s<>"]+/gi;

export type PropertiesMode = 'edit' | 'read' | 'source';
const MODES: PropertiesMode[] = ['edit', 'read', 'source'];

let uid = 0;

export class PropertiesCard {
  readonly element = h('section', { class: 'note-properties', 'aria-label': t('props.title') });
  private open = true;
  private mode: PropertiesMode = loadPropertiesMode();
  /** The text property being changed, its link shown as a field. */
  private editing: string | undefined;

  constructor(private readonly hooks: PropertiesHooks) {}

  private props(): Property[] {
    const { meta, extra } = this.hooks.get();
    return readProperties(meta, extra);
  }

  private commit(props: Property[]): void {
    const { meta, extra } = writeProperties(props);
    this.hooks.set(meta, extra);
    this.render();
  }

  private update(props: Property[], i: number, value: PropertyValue): void {
    this.commit(props.map((p, j) => (j === i ? changed(p, value) : p)));
  }

  /** Shown with its properties; with none, only when asked (`force`). */
  render(force = false): void {
    // Drawn again from an event of the card being replaced (a field losing the focus): once that is done.
    if (this.rendering) return void queueMicrotask(() => this.render(force));
    this.rendering = true;
    try {
      this.draw(force);
    } finally {
      this.rendering = false;
    }
  }

  private rendering = false;

  private draw(force: boolean): void {
    const props = this.props();
    const shown = props.filter((p) => p.key);
    this.element.hidden = !shown.length && !force && !this.element.classList.contains('adding');
    if (this.element.hidden) return this.element.replaceChildren();
    const readOnly = this.hooks.readOnly();
    // A document that cannot be changed shows its properties to read.
    const mode = readOnly && this.mode === 'edit' ? 'read' : this.mode;
    const toggle = button(`${this.open ? '▾' : '▸'} ${t('props.title')}`, () => {
      this.open = !this.open;
      this.render();
    }, { className: 'note-properties-toggle', title: t('props.count', { n: shown.length }) });
    toggle.setAttribute('aria-expanded', String(this.open));
    const modes = h(
      'div',
      { class: 'note-properties-modes', role: 'group', 'aria-label': t('props.mode') },
      ...MODES.map((m) =>
        button(t(`props.mode.${m}` as MessageKey), () => {
          this.mode = m;
          savePropertiesMode(m);
          this.render(true);
        }, { pressed: m === mode, className: 'note-properties-mode' }),
      ),
    );
    this.element.dataset.mode = mode;
    const body = !this.open
      ? []
      : mode === 'source'
        ? [this.source(readOnly)]
        : [h('div', { class: 'note-properties-rows', role: 'list' }, ...props.flatMap((p, i) => (p.key ? [this.row(props, p, i, mode === 'read')] : []))), mode === 'read' ? '' : this.adder(props)];
    this.element.replaceChildren(
      h('div', { class: 'note-properties-head' }, toggle, this.open ? '' : h('span', { class: 'hint' }, ` ${t('props.count', { n: shown.length })}`), this.open ? modes : ''),
      ...body,
    );
  }

  /** The whole front matter as YAML, taken back when it is left. */
  private source(readOnly: boolean): HTMLElement {
    const { meta, extra } = this.hooks.get();
    const yaml = writeFrontMatter(meta, extra).replace(/^---\n/, '').replace(/\n---\n*$/, '');
    const area = h('textarea', { class: 'note-properties-source', spellcheck: 'false', 'aria-label': t('props.source'), rows: String(Math.min(24, Math.max(4, yaml.split('\n').length + 1))), readonly: readOnly });
    area.value = yaml;
    area.addEventListener('change', () => {
      const text = area.value.trim();
      const f = parseFrontMatter(`---\n${text}\n---\n`);
      // Something that is not YAML keys (a text, a list alone) is not taken.
      if (text && !Object.keys(f.meta).length && !f.extra.trim()) {
        area.setCustomValidity(t('props.badSource'));
        area.reportValidity();
        return;
      }
      area.setCustomValidity('');
      this.hooks.set(f.meta, f.extra);
    });
    return area;
  }

  /** A text with its wiki links and web addresses drawn as links. */
  private rich(text: string): HTMLElement {
    const parts: (string | HTMLElement)[] = [];
    let at = 0;
    for (const m of text.matchAll(LINKS)) {
      parts.push(text.slice(at, m.index));
      const link = LINK.exec(m[0]);
      const label = link ? (link[2] ?? link[1]!).trim() : m[0];
      const href = link ? `wiki:${link[1]!.trim()}` : m[0];
      parts.push(button(label, () => this.hooks.open(href), { className: `link note-property-link${link ? ' wiki' : ''}`, title: t('props.openLink', { target: link ? link[1]!.trim() : m[0] }) }));
      at = m.index! + m[0].length;
    }
    parts.push(text.slice(at));
    return h('span', { class: 'note-property-rich' }, ...parts.filter((x) => x !== ''));
  }

  /** A value drawn to be read. */
  private shown(p: Property, id: string, tags: boolean): HTMLElement {
    const v = p.value;
    switch (v.kind) {
      case 'bool':
        return h('span', { class: `note-property-bool ${v.value ? 'yes' : 'no'}`, id, role: 'img', 'aria-label': v.value ? t('props.yes') : t('props.no'), title: v.value ? t('props.yes') : t('props.no') }, v.value ? '✓' : '✗');
      case 'number':
        return h('span', { id }, v.value.toLocaleString(document.documentElement.lang || undefined));
      case 'date':
        return h('time', { id, datetime: v.value }, readableDate(v.value));
      case 'raw':
        return h('pre', { id, class: 'note-property-raw' }, v.text);
      case 'list':
        return h('div', { class: 'note-chips', id }, ...v.items.map((item) => this.chip(item, tags)));
      case 'text':
        return h('span', { id }, this.rich(v.text));
    }
  }

  /** Show the card to add a property, even to a note with none. */
  add(): void {
    this.open = true;
    this.element.classList.add('adding');
    this.render(true);
    this.element.querySelector<HTMLInputElement>('.note-properties-new input')?.focus();
  }

  private row(props: Property[], p: Property, i: number, reading: boolean): HTMLElement {
    const id = `prop-${++uid}`;
    const tags = TAG_KEYS.test(p.key);
    const value = reading ? this.shown(p, id, tags) : this.named(this.editor(props, p, i, id, tags), id, p.key);
    return h(
      'div',
      { class: `note-property kind-${p.value.kind}`, role: 'listitem' },
      h('label', { class: 'note-property-key', for: id, title: t(`props.kind.${p.value.kind}` as MessageKey) }, h('span', { class: 'note-property-icon', 'aria-hidden': 'true' }, tags ? '🏷' : ICON[p.value.kind]), p.key),
      h('div', { class: 'note-property-value' }, value),
      reading ? '' : button(t('props.remove', { key: p.key }), () => this.commit(props.filter((_, j) => j !== i)), { text: '✕', className: 'icon note-property-remove' }),
    );
  }

  /** The field of a value, named after its property (the icon left out). */
  private named(el: HTMLElement, id: string, key: string): HTMLElement {
    const field = el.id === id ? el : el.querySelector<HTMLElement>(`#${id}`);
    if (field && field.tagName !== 'DIV' && !field.hasAttribute('aria-label')) field.setAttribute('aria-label', key);
    return el;
  }

  private editor(props: Property[], p: Property, i: number, id: string, tags: boolean): HTMLElement {
    const v = p.value;
    const set = (value: PropertyValue): void => this.update(props, i, value);
    switch (v.kind) {
      case 'bool': {
        const box = h('input', { type: 'checkbox', id, checked: v.value });
        box.addEventListener('change', () => set({ kind: 'bool', value: box.checked }));
        return box;
      }
      case 'number': {
        const input = h('input', { type: 'number', id, step: 'any', value: String(v.value) });
        input.addEventListener('change', () => input.value.trim() !== '' && Number.isFinite(Number(input.value)) && set({ kind: 'number', value: Number(input.value) }));
        return input;
      }
      case 'date': {
        const time = v.value.length > 10;
        const input = h('input', { type: time ? 'datetime-local' : 'date', id, value: v.value.replace(' ', 'T') });
        input.addEventListener('change', () => input.value && set({ kind: 'date', value: input.value }));
        return input;
      }
      case 'raw': {
        const area = h('textarea', { id, rows: String(Math.min(8, v.text.split('\n').length + 1)), spellcheck: 'false', class: 'note-property-raw' });
        area.value = v.text;
        area.addEventListener('change', () => set({ kind: 'raw', text: area.value }));
        return area;
      }
      case 'list': {
        const chips = v.items.map((item, k) => this.chip(item, tags, () => set({ ...v, items: v.items.filter((_, j) => j !== k) })));
        const input = h('input', { type: 'text', id, class: 'note-chip-input', placeholder: t('props.addItem'), 'aria-label': t('props.addTo', { key: p.key }) });
        void this.suggest(input, tags ? 'tag' : /alias/i.test(p.key) ? undefined : 'link');
        const add = (): void => {
          const typed = input.value;
          // Emptied first: the card is drawn again, and the field losing the focus must not add it twice.
          input.value = '';
          const items = typed.split(',').map((s) => s.trim().replace(tags ? /^#/ : /$^/, '')).filter(Boolean);
          if (items.length) set({ ...v, items: [...v.items, ...items.filter((x) => !v.items.includes(x))] });
        };
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add();
          } else if (e.key === 'Backspace' && !input.value && v.items.length) set({ ...v, items: v.items.slice(0, -1) });
        });
        input.addEventListener('change', add);
        return h('div', { class: 'note-chips' }, ...chips, input);
      }
      case 'text': {
        // A text with links shows them, to follow; the pencil changes it.
        if (this.editing !== p.key && v.text.match(LINKS)) {
          return h(
            'div',
            { class: 'note-property-line' },
            this.rich(v.text),
            button(t('props.edit', { key: p.key }), () => {
              this.editing = p.key;
              this.render();
              this.element.querySelector<HTMLInputElement>(`.note-property-text[data-key="${CSS.escape(p.key)}"]`)?.focus();
            }, { text: '✎', className: 'icon note-property-edit' }),
          );
        }
        const input = h('input', { type: 'text', id, value: v.text, class: 'note-property-text', 'data-key': p.key });
        input.addEventListener('change', () => {
          this.editing = undefined;
          set({ kind: 'text', text: input.value });
        });
        input.addEventListener('blur', () => {
          if (this.editing !== p.key || input.value !== v.text) return;
          this.editing = undefined;
          this.render();
        });
        void this.suggest(input, /alias|title/i.test(p.key) ? undefined : 'link');
        return input;
      }
    }
  }

  /** An item of a list: a tag (coloured), a link to a note or a web page, or plain text. */
  private chip(item: string, tag: boolean, remove?: () => void): HTMLElement {
    const link = LINK.exec(item.trim());
    const colour = tag ? this.hooks.tagColour?.(item) : undefined;
    const label = link ? (link[2] ?? link[1]!).trim() : tag ? `#${item.replace(/^#/, '')}` : item;
    const href = link ? `wiki:${link[1]!.trim()}` : isUrl(item) ? item : undefined;
    return h(
      'span',
      { class: `note-chip${tag ? ' tag' : ''}${href ? ' linked' : ''}`, ...(colour ? { style: `--tag-colour: ${colour}` } : {}) },
      href ? button(label, () => this.hooks.open(href), { className: 'link', title: t('props.openLink', { target: label }) }) : h('span', {}, label),
      remove ? button(t('props.removeItem', { item: label }), remove, { text: '×', className: 'icon note-chip-remove' }) : '',
    );
  }

  private async suggest(input: HTMLInputElement, kind: 'link' | 'tag' | undefined): Promise<void> {
    if (!kind || !this.hooks.suggestions) return;
    const names = await this.hooks.suggestions(kind).catch(() => []);
    if (!names.length) return;
    const list = h('datalist', { id: `prop-list-${++uid}` }, ...names.slice(0, 500).map((n) => h('option', { value: kind === 'link' ? `[[${n}]]` : n })));
    input.setAttribute('list', list.id);
    input.after(list);
  }

  private adder(props: Property[]): HTMLElement {
    const name = h('input', { type: 'text', placeholder: t('props.name'), 'aria-label': t('props.name'), class: 'note-property-name' });
    const kind = h('select', { 'aria-label': t('props.type') }, ...KINDS.map((k) => h('option', { value: k }, `${ICON[k]} ${t(`props.kind.${k}` as MessageKey)}`)));
    name.addEventListener('input', () => {
      // A usual key chooses its type.
      if (TAG_KEYS.test(name.value.trim()) || /^aliases$/i.test(name.value.trim())) kind.value = 'list';
      else if (/date|due|deadline|created|updated/i.test(name.value)) kind.value = 'date';
    });
    const add = (): void => {
      const key = name.value.trim().replace(/\s+/g, '-');
      if (!/^[A-Za-z_][\w-]*$/.test(key) || props.some((p) => p.key.toLowerCase() === key.toLowerCase())) {
        name.setCustomValidity(t('props.badName'));
        name.reportValidity();
        return;
      }
      this.element.classList.remove('adding');
      this.commit([...props, newProperty(key, kind.value as PropertyValue['kind'])]);
      // The value of the new property, at once.
      const last = [...this.element.querySelectorAll<HTMLElement>('.note-property')].pop();
      last?.querySelector<HTMLElement>('input, textarea')?.focus();
    };
    name.addEventListener('keydown', (e) => {
      name.setCustomValidity('');
      if (e.key === 'Enter') {
        e.preventDefault();
        add();
      }
    });
    return h('div', { class: 'note-properties-new' }, name, kind, button(t('props.add'), add, { icon: '＋' }));
  }
}

/** A date as words, in the language of the page ("15 Oct 2026"). */
function readableDate(value: string): string {
  const d = new Date(value.length > 10 ? value.replace(' ', 'T') : `${value}T00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(document.documentElement.lang || undefined, value.length > 10 ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' });
}

const SHOW_KEY = 'pwo.note.properties';
const MODE_KEY = 'pwo.note.propertiesMode';

/** How the properties are shown: to change, to read, or as YAML (the last one chosen). */
export function loadPropertiesMode(): PropertiesMode {
  try {
    const m = localStorage.getItem(MODE_KEY);
    return MODES.includes(m as PropertiesMode) ? (m as PropertiesMode) : 'edit';
  } catch {
    return 'edit';
  }
}

export function savePropertiesMode(mode: PropertiesMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* not kept */
  }
}

/** Whether the properties of notes are shown (they are, unless hidden from the View menu). */
export function loadShowProperties(): boolean {
  try {
    return localStorage.getItem(SHOW_KEY) !== '0';
  } catch {
    return true;
  }
}

export function saveShowProperties(on: boolean): void {
  try {
    localStorage.setItem(SHOW_KEY, on ? '1' : '0');
  } catch {
    /* not kept */
  }
}
