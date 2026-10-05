/**
 * NOTE-003: a view of the notes of the folder (a `.view.yaml` file) shown as
 * a table, cards or a board. A cell of the table changed, or a card moved to
 * another column of the board, writes the property into the note itself:
 * the notes stay the only source, the view keeps only how to show them.
 */
import { button, h } from '../app/dom';
import { t } from '../i18n';
import type { EditorView, ViewContext } from '../app/views';
import type { NoteTables } from '../code/note-tables';
import { withValues } from '../pim/notes';
import { applyView, editable, knownColumns, newNoteValues, noteRecords, readViewSpec, valuesOf, VIEW_LAYOUTS, writeViewSpec, type NoteRecord, type ViewLayout, type ViewSpec } from './note-views';

/** What a view of notes reads and writes in the folder it belongs to. */
export interface NoteStore {
  /** The path of the view file in the folder. */
  path: string;
  tables(): Promise<NoteTables>;
  read(path: string): Promise<string>;
  /** Write a note (made when new), the index of the notes following. */
  write(path: string, text: string): Promise<void>;
  open(path: string): void;
}

const LINK = /^\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]$/;
const pad = (n: number): string => String(n).padStart(2, '0');
const todayKey = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export class NotesView implements EditorView {
  readonly element: HTMLElement;
  private spec: ViewSpec;
  private text: string;
  private records: NoteRecord[] = [];
  private readonly bar = h('div', { class: 'notes-view-bar', role: 'toolbar', 'aria-label': t('views.toolbar') });
  private readonly body = h('div', { class: 'notes-view-body' });
  private readonly info = h('p', { class: 'hint notes-view-info', role: 'status' });
  private source: HTMLElement | undefined;
  private readOnly = false;
  private count = 0;

  constructor(
    bytes: Uint8Array,
    private readonly ctx: ViewContext,
    private readonly fileName: string,
  ) {
    this.text = new TextDecoder().decode(bytes);
    this.spec = readViewSpec(this.text);
    this.element = h('section', { class: 'notes-view', 'aria-label': this.title() }, this.bar, this.info, this.body);
  }

  private get store(): NoteStore | undefined {
    return this.ctx.noteStore?.();
  }

  private title(): string {
    return this.spec.title ?? this.fileName.replace(/\.view\.ya?ml$/i, '');
  }

  mounted(): void {
    void this.reload();
  }

  status(): string {
    return t('views.count', { n: this.count });
  }

  formatLabel(): string {
    return t('views.format');
  }

  save(): Uint8Array {
    return new TextEncoder().encode(this.text);
  }

  setReadOnly(readOnly: boolean): void {
    this.readOnly = readOnly;
    this.render();
  }

  destroy(): void {
    this.element.remove();
  }

  /** The view changed: its file too (saved with the document). */
  private change(spec: ViewSpec): void {
    this.spec = spec;
    this.text = writeViewSpec(spec);
    this.ctx.changed();
    this.render();
  }

  async reload(attempt = 0): Promise<void> {
    const store = this.store;
    if (!store) {
      this.records = [];
      this.render();
      // Opened from the folder: the shell tells where the file is just after showing it.
      if (attempt < 20 && this.element.isConnected) setTimeout(() => void this.reload(attempt + 1), 100);
      return;
    }
    try {
      this.records = noteRecords(await store.tables());
    } catch (err) {
      this.ctx.notify?.((err as Error).message);
    }
    this.render();
  }

  private render(): void {
    this.renderBar();
    const store = this.store;
    if (!store) {
      this.info.textContent = t('views.noFolder');
      this.body.replaceChildren();
      this.count = 0;
      this.ctx.statusChanged();
      return;
    }
    const result = applyView(this.spec, this.records, todayKey(), store.path);
    this.count = result.rows.length;
    this.info.textContent = result.invalid.length ? t('views.invalid', { list: result.invalid.join(' · ') }) : '';
    this.info.classList.toggle('error', result.invalid.length > 0);
    if (this.spec.layout === 'board') this.body.replaceChildren(this.board(result.groups));
    else if (!result.rows.length) this.body.replaceChildren(h('p', { class: 'hint' }, t('views.empty')));
    else this.body.replaceChildren(this.spec.layout === 'cards' ? this.cards(result.rows) : this.table(result.rows));
    this.ctx.statusChanged();
  }

  private renderBar(): void {
    const layouts = h(
      'div',
      { class: 'notes-view-layouts', role: 'group', 'aria-label': t('views.layout') },
      ...VIEW_LAYOUTS.map((l) =>
        button(t(`views.layout.${l}`), () => this.change({ ...this.spec, layout: l as ViewLayout }), { pressed: this.spec.layout === l, icon: { table: '▦', cards: '▤', board: '▥' }[l] }),
      ),
    );
    const known = knownColumns(this.records).filter((c) => !['name', 'path', 'folder', 'modified', 'tasks'].includes(c));
    const group = h(
      'select',
      { 'aria-label': t('views.group'), title: t('views.group') },
      h('option', { value: '' }, t('views.groupNone')),
      ...[...new Set([...(this.spec.group ? [this.spec.group] : []), ...known])].map((c) => h('option', { value: c, selected: c === this.spec.group }, c)),
    );
    group.addEventListener('change', () => {
      const { group: _old, ...rest } = this.spec;
      this.change(group.value ? { ...rest, group: group.value, layout: 'board' } : { ...rest, layout: this.spec.layout === 'board' ? 'table' : this.spec.layout });
    });
    this.bar.replaceChildren(
      h('h2', {}, this.title()),
      layouts,
      h('label', { class: 'notes-view-group' }, h('span', {}, t('views.group')), group),
      button(t('views.columns'), () => this.chooseColumns(), { icon: '☷' }),
      button(t('views.edit'), () => this.toggleSource(), { icon: '✎', pressed: !!this.source }),
      ...(this.readOnly ? [] : [button(t('views.newNote'), () => void this.newNote(), { icon: '＋', className: 'primary' })]),
      button(t('views.refresh'), () => void this.reload(), { text: '⟳' }),
    );
  }

  // --- the values ---------------------------------------------------------------

  /** A value as shown: a link to its note, a tag, text. */
  private value(v: string | number, column: string): Node {
    const s = String(v);
    const link = LINK.exec(s);
    if (link) {
      const target = this.records.find((r) => r.name.toLowerCase() === link[1]!.trim().toLowerCase());
      return target ? button(link[2] ?? link[1]!, () => this.store?.open(target.path), { className: 'link' }) : h('span', { class: 'notes-view-unresolved' }, link[2] ?? link[1]!);
    }
    if (column.toLowerCase() === 'tags') return h('span', { class: 'note-chip tag' }, `#${s.replace(/^#/, '')}`);
    return document.createTextNode(s);
  }

  private values(r: NoteRecord, column: string): Node[] {
    const vs = valuesOf(r, column);
    if (column.toLowerCase() === 'name') return [button(r.name, () => this.store?.open(r.path), { className: 'link notes-view-name' })];
    return vs.flatMap((v, i) => (i ? [document.createTextNode(column.toLowerCase() === 'tags' ? ' ' : ', '), this.value(v, column)] : [this.value(v, column)]));
  }

  /** Write a property of a note, then show it. */
  private async setValue(r: NoteRecord, column: string, value: string | string[] | undefined): Promise<void> {
    const store = this.store;
    if (!store) return;
    try {
      const text = await store.read(r.path);
      const key = r.keys.get(column.toLowerCase()) ?? column;
      const updated = withValues(text, [[key, value]]);
      if (updated !== text) await store.write(r.path, updated);
      // Shown at once; the index follows.
      const k = column.toLowerCase();
      const list = value === undefined ? [] : Array.isArray(value) ? value : [value];
      if (list.length) r.props.set(k, list);
      else r.props.delete(k);
      if (k === 'tags') r.tags = [];
      r.keys.set(k, key);
    } catch (err) {
      this.ctx.notify?.((err as Error).message);
    }
    this.render();
  }

  /** Change a cell in place: Enter keeps it, Escape leaves it. */
  private editCell(cell: HTMLElement, r: NoteRecord, column: string): void {
    if (this.readOnly || !editable(column) || cell.querySelector('input')) return;
    const vs = valuesOf(r, column).map(String);
    const isList = vs.length > 1 || column.toLowerCase() === 'tags';
    const input = h('input', { type: 'text', value: vs.join(', '), 'aria-label': t('views.cellEdit', { column, name: r.name }) });
    const keep = h('div', { class: 'notes-view-cell-edit' }, input);
    cell.replaceChildren(keep);
    input.focus();
    input.select();
    let done = false;
    const finish = (save: boolean): void => {
      if (done) return;
      done = true;
      if (!save) return this.render();
      const raw = input.value.trim();
      const next = !raw ? undefined : isList ? raw.split(',').map((s) => (column.toLowerCase() === 'tags' ? s.trim().replace(/^#/, '') : s.trim())).filter(Boolean) : raw;
      void this.setValue(r, column, next);
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finish(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        finish(false);
      }
    });
    input.addEventListener('blur', () => finish(true));
  }

  // --- table -------------------------------------------------------------------

  private table(rows: NoteRecord[]): HTMLElement {
    const sortKey = this.spec.sort[0] ?? 'name';
    const desc = sortKey.startsWith('-');
    const sorted = desc ? sortKey.slice(1) : sortKey;
    const head = h(
      'tr',
      {},
      ...this.spec.columns.map((c) =>
        h(
          'th',
          { scope: 'col', 'aria-sort': c === sorted ? (desc ? 'descending' : 'ascending') : 'none' },
          button(t('views.sortBy', { column: c }), () => this.change({ ...this.spec, sort: [c === sorted && !desc ? `-${c}` : c] }), { text: `${c}${c === sorted ? (desc ? ' ▼' : ' ▲') : ''}` }),
        ),
      ),
    );
    const body = rows.map((r) =>
      h(
        'tr',
        {},
        ...this.spec.columns.map((c, i) => {
          const cell = h(i === 0 ? 'th' : 'td', { ...(i === 0 ? { scope: 'row' } : {}), 'data-column': c }, ...this.values(r, c));
          if (!this.readOnly && editable(c) && c.toLowerCase() !== 'name') {
            cell.tabIndex = 0;
            cell.classList.add('editable');
            cell.title = t('views.cellEdit', { column: c, name: r.name });
            cell.addEventListener('dblclick', () => this.editCell(cell, r, c));
            cell.addEventListener('keydown', (e) => {
              if ((e.key === 'Enter' || e.key === 'F2') && e.target === cell) {
                e.preventDefault();
                this.editCell(cell, r, c);
              }
            });
          }
          return cell;
        }),
      ),
    );
    return h('div', { class: 'notes-view-scroll' }, h('table', { class: 'notes-table', 'aria-label': this.title() }, h('thead', {}, head), h('tbody', {}, ...body)));
  }

  // --- cards -------------------------------------------------------------------

  private card(r: NoteRecord, skip?: string): HTMLElement {
    const fields = this.spec.columns.filter((c) => c.toLowerCase() !== 'name' && c !== skip && valuesOf(r, c).length);
    return h(
      'article',
      { class: 'notes-card', 'aria-label': r.name },
      h('h3', {}, button(r.name, () => this.store?.open(r.path), { className: 'link notes-view-name' })),
      fields.length ? h('dl', {}, ...fields.flatMap((c) => [h('dt', {}, c), h('dd', {}, ...this.values(r, c))])) : '',
    );
  }

  private cards(rows: NoteRecord[]): HTMLElement {
    return h('div', { class: 'notes-cards' }, ...rows.map((r) => this.card(r)));
  }

  // --- board -------------------------------------------------------------------

  private board(groups: { value: string; rows: NoteRecord[] }[]): HTMLElement {
    const prop = this.spec.group;
    if (!prop) return h('p', { class: 'hint' }, t('views.boardNeedsGroup'));
    const values = groups.map((g) => g.value);
    const column = (g: { value: string; rows: NoteRecord[] }): HTMLElement => {
      const list = h('div', { class: 'notes-board-cards' });
      for (const r of g.rows) {
        const card = this.card(r, prop);
        if (!this.readOnly) {
          card.draggable = true;
          card.addEventListener('dragstart', (e) => {
            e.dataTransfer?.setData('text/x-pwo-note', r.path);
            if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
            card.classList.add('dragging');
          });
          card.addEventListener('dragend', () => card.classList.remove('dragging'));
          // From the keyboard: move to another column.
          const move = h('select', { 'aria-label': t('views.moveTo', { name: r.name }), class: 'notes-board-move' }, ...values.map((v) => h('option', { value: v, selected: v === g.value }, v || t('views.noValue'))));
          move.addEventListener('change', () => void this.setValue(r, prop, move.value || undefined));
          card.append(move);
        }
        list.append(card);
      }
      const col = h(
        'section',
        { class: 'notes-board-column', 'aria-label': g.value || t('views.noValue'), 'data-value': g.value },
        h('h3', {}, h('span', {}, g.value || t('views.noValue')), h('span', { class: 'notes-board-count' }, String(g.rows.length))),
        list,
        ...(this.readOnly ? [] : [button(t('views.newIn', { value: g.value || t('views.noValue') }), () => void this.newNote(g.value), { text: `＋ ${t('views.newNote')}`, className: 'notes-board-add' })]),
      );
      col.addEventListener('dragover', (e) => {
        if (!e.dataTransfer?.types.includes('text/x-pwo-note')) return;
        e.preventDefault();
        col.classList.add('drop');
      });
      col.addEventListener('dragleave', () => col.classList.remove('drop'));
      col.addEventListener('drop', (e) => {
        e.preventDefault();
        col.classList.remove('drop');
        const path = e.dataTransfer?.getData('text/x-pwo-note');
        const r = this.records.find((x) => x.path === path);
        if (r && String(valuesOf(r, prop)[0] ?? '') !== g.value) void this.setValue(r, prop, g.value || undefined);
      });
      return col;
    };
    return h('div', { class: 'notes-board', 'aria-label': t('views.boardOf', { group: prop }) }, ...groups.map(column));
  }

  // --- changing the view ------------------------------------------------------------

  /** Which columns, in which order. */
  private chooseColumns(): void {
    const all = [...new Set([...this.spec.columns, ...knownColumns(this.records)])];
    const chosen = new Set(this.spec.columns);
    const dialog = h('dialog', { class: 'dialog notes-view-dialog', 'aria-labelledby': 'notes-view-columns' });
    const close = (): void => {
      dialog.close();
      dialog.remove();
    };
    const extra = h('input', { type: 'text', 'aria-label': t('views.otherColumn'), placeholder: t('views.otherColumn') });
    const boxes = all.map((c) => {
      const box = h('input', { type: 'checkbox', checked: chosen.has(c), value: c });
      return h('label', { class: 'notes-view-column' }, box, h('span', {}, c));
    });
    const apply = (): void => {
      const picked = boxes.map((b) => b.querySelector('input')!).filter((i) => i.checked).map((i) => i.value);
      const other = extra.value.trim();
      // The columns kept in their order, the new ones after.
      const columns = [...this.spec.columns.filter((c) => picked.includes(c)), ...picked.filter((c) => !this.spec.columns.includes(c)), ...(other && !picked.includes(other) ? [other] : [])];
      close();
      this.change({ ...this.spec, columns: columns.length ? columns : ['name'] });
    };
    dialog.append(
      h('h2', { id: 'notes-view-columns' }, t('views.columnsTitle')),
      h('div', { class: 'notes-view-columns' }, ...boxes),
      extra,
      h('div', { class: 'dialog-actions' }, button(t('common.cancel'), close), button(t('views.apply'), apply, { className: 'primary' })),
    );
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      close();
    });
    this.element.append(dialog);
    dialog.showModal();
  }

  /** The view as written in its file, to change everything (filters above all). */
  private toggleSource(): void {
    if (this.source) {
      this.source.remove();
      this.source = undefined;
      this.renderBar();
      return;
    }
    const area = h('textarea', { rows: '10', spellcheck: 'false', 'aria-label': t('views.source') });
    area.value = this.text;
    this.source = h(
      'div',
      { class: 'notes-view-source' },
      h('p', { class: 'hint' }, t('views.sourceHint')),
      area,
      h('div', { class: 'dialog-actions' }, button(t('views.apply'), () => {
        this.text = area.value.endsWith('\n') ? area.value : `${area.value}\n`;
        this.spec = readViewSpec(this.text);
        this.element.setAttribute('aria-label', this.title());
        this.ctx.changed();
        this.render();
      }, { className: 'primary' })),
    );
    this.info.after(this.source);
    this.renderBar();
    area.focus();
  }

  /** A note made from the view: in its folder, with what its filters ask for. */
  private async newNote(group?: string): Promise<void> {
    const store = this.store;
    if (!store) return;
    const name = window.prompt(t('views.newName'))?.trim().replace(/[\\/:*?"<>|]/g, '-');
    if (!name) return;
    const folder = this.spec.from ?? store.path.slice(0, Math.max(0, store.path.lastIndexOf('/')));
    const path = `${folder ? `${folder}/` : ''}${name}.md`;
    try {
      if (await store.read(path).then(() => true, () => false)) return this.ctx.notify?.(t('views.exists', { name }));
      await store.write(path, withValues('', newNoteValues(this.spec, group || undefined), `# ${name}\n`));
      await this.reload();
    } catch (err) {
      this.ctx.notify?.((err as Error).message);
    }
  }
}
