/**
 * DB-001: a SQLite database (`.sqlite`, `.db`) opened as a document: its
 * tables and views listed, their rows shown page by page and changed in a
 * grid, their structure, queries in SQL; saved back as a SQLite file.
 * DB-005: the conceptual model it comes from, read back from its tables.
 *
 * SQLite is downloaded code: it runs in the sandbox of the code cells
 * (CODE-003), asked for first and checked (CODE-018), never in the page.
 */
import { button, busyText, h } from '../app/dom';
import { t } from '../i18n';
import type { EditorView, ViewContext } from '../app/views';
import type { CodeRunner, DbReply } from '../code/runner';
import { ident, readSchema, SCHEMA_QUERIES, toConceptual, type TableInfo } from './schema';

type Tab = 'data' | 'structure' | 'sql';
const PAGE = 100;

export class SqliteView implements EditorView {
  readonly element: HTMLElement;
  private runner: CodeRunner | undefined;
  private tables: TableInfo[] = [];
  private selected: string | undefined;
  private tab: Tab = 'data';
  private offset = 0;
  private readOnly = false;
  private opened: Promise<boolean> | undefined;
  private readonly list = h('ul', { class: 'sqlite-tables', role: 'listbox', 'aria-label': t('sqlite.tables') });
  private readonly tabs = h('div', { class: 'datamodel-tabs', role: 'tablist', 'aria-label': t('sqlite.views') });
  private readonly main = h('div', { class: 'sqlite-main' });
  private readonly info = h('p', { class: 'hint sqlite-info', role: 'status' });
  private readonly query: HTMLTextAreaElement;
  private readonly results = h('div', { class: 'sqlite-results', 'aria-live': 'polite' });
  private rowCount = 0;

  constructor(
    private bytes: Uint8Array,
    private readonly ctx: ViewContext,
    private readonly fileName: string,
  ) {
    this.query = h('textarea', { class: 'datamodel-source sqlite-query', rows: '8', spellcheck: 'false', 'aria-label': t('sqlite.query'), placeholder: 'SELECT * FROM …' });
    this.query.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        void this.runQuery();
      }
    });
    this.element = h(
      'section',
      { class: 'sqlite-view', 'aria-label': fileName },
      h('aside', { class: 'sqlite-side' }, h('h2', {}, t('sqlite.tables')), this.list),
      h('div', { class: 'sqlite-content' }, h('div', { class: 'datamodel-bar' }, this.tabs, h('div', { class: 'sqlite-actions' }, button(t('sqlite.model'), () => void this.showModel(), { icon: '◇' }))), this.info, this.main),
    );
    this.renderTabs();
  }

  mounted(): void {
    void this.open();
  }

  /** Open the database in the sandbox (SQLite asked for and downloaded the first time). */
  private open(): Promise<boolean> {
    this.opened ??= (async () => {
      this.info.replaceChildren(...busyText(t('sqlite.loading')));
      const { CodeRunner } = await import('../code/runner');
      this.runner = new CodeRunner(this.element);
      this.runner.confirmDownload = async (origin) => (await import('../code/ui')).confirmDownload(this.element, origin);
      const reply = await this.runner.db('open', this.bytes.length ? this.bytes : undefined);
      if (reply.error) {
        this.opened = undefined;
        this.info.replaceChildren(t('sqlite.cannotOpen', { error: reply.error }), ' ', button(t('sqlite.retry'), () => void this.open()));
        return false;
      }
      this.info.textContent = '';
      // Read once open (reading waits for the opening).
      setTimeout(() => void this.readTables());
      return true;
    })();
    return this.opened;
  }

  private async exec(sql: string, params?: unknown[]): Promise<DbReply> {
    if (!(await this.open())) return { error: t('sqlite.notOpen') };
    return this.runner!.db('exec', sql, params);
  }

  private async rows(sql: string): Promise<unknown[][]> {
    const r = await this.exec(sql);
    if (r.error) throw new Error(r.error);
    return r.results?.[0]?.values ?? [];
  }

  private async readTables(): Promise<void> {
    try {
      const [tables, columns, foreignKeys, unique] = await Promise.all([this.rows(SCHEMA_QUERIES.tables), this.rows(SCHEMA_QUERIES.columns), this.rows(SCHEMA_QUERIES.foreignKeys), this.rows(SCHEMA_QUERIES.unique)]);
      this.tables = readSchema({ tables, columns, foreignKeys, unique });
    } catch (err) {
      this.info.textContent = (err as Error).message;
      return;
    }
    if (!this.selected || !this.tables.some((x) => x.name === this.selected)) this.selected = this.tables[0]?.name;
    if (!this.tables.length && this.tab === 'data') this.tab = 'sql';
    this.renderList();
    this.renderTabs();
    this.ctx.statusChanged();
    await this.render();
  }

  private renderList(): void {
    this.list.replaceChildren(
      ...this.tables.map((x) => {
        const item = h('li', { role: 'option', 'aria-selected': String(x.name === this.selected), tabindex: x.name === this.selected ? '0' : '-1' }, h('span', { 'aria-hidden': 'true' }, x.kind === 'view' ? '👁 ' : '▦ '), x.name);
        const choose = (): void => {
          this.selected = x.name;
          this.offset = 0;
          if (this.tab === 'sql') this.tab = 'data';
          this.renderList();
          this.renderTabs();
          void this.render();
        };
        item.addEventListener('click', choose);
        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            choose();
          } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const next = (e.key === 'ArrowDown' ? item.nextElementSibling : item.previousElementSibling) as HTMLElement | null;
            next?.click();
            setTimeout(() => (this.list.querySelector('[aria-selected="true"]') as HTMLElement | null)?.focus());
          }
        });
        return item;
      }),
      ...(this.tables.length ? [] : [h('li', { class: 'hint' }, t('sqlite.noTables'))]),
    );
  }

  private renderTabs(): void {
    const tabs: Tab[] = ['data', 'structure', 'sql'];
    this.tabs.replaceChildren(
      ...tabs.map((x) => {
        const b = h('button', { type: 'button', role: 'tab', 'aria-selected': String(x === this.tab), tabindex: x === this.tab ? '0' : '-1' }, t(`sqlite.tab.${x}`));
        b.addEventListener('click', () => {
          this.tab = x;
          this.renderTabs();
          void this.render();
        });
        return b;
      }),
    );
  }

  private current(): TableInfo | undefined {
    return this.tables.find((x) => x.name === this.selected);
  }

  private async render(): Promise<void> {
    if (this.tab === 'sql') {
      this.main.replaceChildren(
        h('p', { class: 'hint' }, t('sqlite.queryHint')),
        this.query,
        h(
          'div',
          { class: 'datamodel-sql-bar' },
          button(t('sqlite.run'), () => void this.runQuery(), { className: 'primary', icon: '▶' }),
          // DB-004: the SQL of a data model (or any script) run on this database.
          button(t('sqlite.runFile'), () => this.runFile(), { icon: '📄' }),
        ),
        this.results,
      );
      return;
    }
    const table = this.current();
    if (!table) {
      this.main.replaceChildren(h('p', { class: 'hint' }, t('sqlite.noTables')));
      return;
    }
    if (this.tab === 'structure') return this.renderStructure(table);
    await this.renderData(table);
  }

  private renderStructure(table: TableInfo): void {
    const fkOf = (c: string): string | undefined => {
      const fk = table.foreignKeys.find((f) => f.columns.includes(c));
      return fk ? `${fk.table} (${fk.to[fk.columns.indexOf(c)] ?? ''})` : undefined;
    };
    this.main.replaceChildren(
      h(
        'table',
        { class: 'notes-table sqlite-structure', 'aria-label': t('sqlite.structureOf', { table: table.name }) },
        h('thead', {}, h('tr', {}, ...(['column', 'type', 'key', 'notNull', 'default', 'references'] as const).map((k) => h('th', { scope: 'col' }, t(`sqlite.col.${k}`))))),
        h(
          'tbody',
          {},
          ...table.columns.map((c) =>
            h('tr', {}, h('th', { scope: 'row' }, c.name), h('td', {}, c.type), h('td', {}, c.pk ? '🔑' : table.unique.some((u) => u.includes(c.name)) ? t('sqlite.unique') : ''), h('td', {}, c.notNull ? '✓' : ''), h('td', {}, c.default ?? ''), h('td', {}, fkOf(c.name) ?? '')),
          ),
        ),
      ),
      h('pre', { class: 'datamodel-sql', tabindex: '0', 'aria-label': t('sqlite.createOf', { table: table.name }) }, table.sql),
    );
  }

  /** A value as shown in a cell. */
  private shown(v: unknown): Node {
    if (v === null || v === undefined) return h('span', { class: 'sqlite-null' }, 'NULL');
    if (v instanceof Uint8Array) return h('span', { class: 'sqlite-null' }, t('sqlite.blob', { n: v.length }));
    return document.createTextNode(String(v));
  }

  private async renderData(table: TableInfo): Promise<void> {
    const name = ident(table.name);
    // Rows are changed by their rowid: views and tables WITHOUT ROWID are read only.
    const editable = !this.readOnly && table.kind === 'table' && !/without\s+rowid/i.test(table.sql);
    let reply: DbReply;
    try {
      this.rowCount = Number((await this.rows(`SELECT count(*) FROM ${name}`))[0]?.[0] ?? 0);
      if (this.offset >= this.rowCount && this.rowCount) this.offset = Math.floor((this.rowCount - 1) / PAGE) * PAGE;
      reply = await this.exec(`SELECT ${editable ? 'rowid AS "__rowid", ' : ''}* FROM ${name} LIMIT ${PAGE} OFFSET ${this.offset}`);
      if (reply.error) throw new Error(reply.error);
    } catch (err) {
      this.main.replaceChildren(h('p', { class: 'hint error' }, (err as Error).message));
      return;
    }
    const result = reply.results?.[0];
    const columns = table.columns.map((c) => c.name);
    const values = result?.values ?? [];
    const body = values.map((row) => {
      const rowid = editable ? row[0] : undefined;
      const cells = editable ? row.slice(1) : row;
      return h(
        'tr',
        {},
        ...cells.map((v, i) => {
          const column = columns[i] ?? result?.columns[i + (editable ? 1 : 0)] ?? '';
          const cell = h('td', { 'data-column': column }, this.shown(v));
          if (editable && !(v instanceof Uint8Array)) {
            cell.tabIndex = 0;
            cell.classList.add('editable');
            cell.title = t('sqlite.editCell', { column });
            const edit = (): void => this.editCell(cell, table, column, rowid, v);
            cell.addEventListener('dblclick', edit);
            cell.addEventListener('keydown', (e) => {
              if ((e.key === 'Enter' || e.key === 'F2') && e.target === cell) {
                e.preventDefault();
                edit();
              }
            });
          }
          return cell;
        }),
        ...(editable ? [h('td', { class: 'sqlite-row-actions' }, button(t('sqlite.deleteRow'), () => void this.deleteRow(table, rowid), { text: '🗑' }))] : []),
      );
    });
    const pages = h(
      'div',
      { class: 'datamodel-sql-bar' },
      h('span', {}, this.rowCount ? t('sqlite.rows', { from: this.offset + 1, to: Math.min(this.offset + PAGE, this.rowCount), n: this.rowCount }) : t('sqlite.noRows')),
      button(t('sqlite.previous'), () => {
        this.offset = Math.max(0, this.offset - PAGE);
        void this.render();
      }, { text: '‹' }),
      button(t('sqlite.next'), () => {
        if (this.offset + PAGE < this.rowCount) this.offset += PAGE;
        void this.render();
      }, { text: '›' }),
      ...(editable ? [button(t('sqlite.addRow'), () => void this.addRow(table), { icon: '＋' })] : [h('span', { class: 'hint' }, t('sqlite.readOnlyTable'))]),
    );
    const grid = h(
      'div',
      { class: 'notes-view-scroll' },
      h(
        'table',
        { class: 'notes-table sqlite-grid', 'aria-label': table.name },
        h('thead', {}, h('tr', {}, ...columns.map((c) => h('th', { scope: 'col' }, h('span', { class: 'sqlite-th' }, c))), ...(editable ? [h('th', { scope: 'col', 'aria-label': t('sqlite.actions') })] : []))),
        h('tbody', {}, ...body),
      ),
    );
    this.main.replaceChildren(pages, grid);
  }

  /** The value typed, as the column takes it: NULL when emptied (if allowed), a number for a numeric column. */
  private typed(table: TableInfo, column: string, text: string): unknown {
    const c = table.columns.find((x) => x.name === column);
    if (text === '' && !c?.notNull) return null;
    if (/int|real|floa|doub|num|dec/i.test(c?.type ?? '') && /^-?\d+(\.\d+)?(e-?\d+)?$/i.test(text.trim())) return Number(text);
    return text;
  }

  private editCell(cell: HTMLElement, table: TableInfo, column: string, rowid: unknown, value: unknown): void {
    if (cell.querySelector('input')) return;
    const input = h('input', { type: 'text', 'aria-label': t('sqlite.editCell', { column }) });
    input.value = value === null || value === undefined ? '' : String(value);
    cell.replaceChildren(input);
    input.focus();
    input.select();
    let done = false;
    const finish = async (save: boolean): Promise<void> => {
      if (done) return;
      done = true;
      if (save && input.value !== (value === null || value === undefined ? '' : String(value))) {
        const r = await this.exec(`UPDATE ${ident(table.name)} SET ${ident(column)} = ? WHERE rowid = ?`, [this.typed(table, column, input.value), rowid]);
        if (r.error) this.ctx.notify?.(r.error);
        else this.ctx.changed();
      }
      await this.render();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void finish(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        void finish(false);
      }
    });
    input.addEventListener('blur', () => void finish(true));
  }

  private async addRow(table: TableInfo): Promise<void> {
    const r = await this.exec(`INSERT INTO ${ident(table.name)} DEFAULT VALUES`);
    if (r.error) return this.ctx.notify?.(t('sqlite.addFailed', { error: r.error }));
    this.ctx.changed();
    this.offset = Math.floor(this.rowCount / PAGE) * PAGE;
    await this.render();
  }

  private async deleteRow(table: TableInfo, rowid: unknown): Promise<void> {
    if (!window.confirm(t('sqlite.deleteConfirm'))) return;
    const r = await this.exec(`DELETE FROM ${ident(table.name)} WHERE rowid = ?`, [rowid]);
    if (r.error) return this.ctx.notify?.(r.error);
    this.ctx.changed();
    await this.render();
  }

  /** Run the SQL written: its results as tables; the structure read again when it changed. */
  async runQuery(sql = this.query.value): Promise<void> {
    if (!sql.trim()) return;
    if (this.readOnly && !/^\s*(select|with|pragma|explain)\b/i.test(sql)) {
      this.results.replaceChildren(h('p', { class: 'hint error' }, t('sqlite.readOnly')));
      return;
    }
    this.results.replaceChildren(h('p', { class: 'hint' }, ...busyText(t('code.running'))));
    const r = await this.exec(sql);
    if (r.error) {
      this.results.replaceChildren(h('p', { class: 'hint error' }, r.error));
      return;
    }
    const sets = r.results ?? [];
    const changed = !/^\s*(select|explain)\b/i.test(sql) || (r.changes ?? 0) > 0;
    this.results.replaceChildren(
      ...sets.map((set, i) =>
        h(
          'div',
          { class: 'notes-view-scroll' },
          h(
            'table',
            { class: 'notes-table', 'aria-label': t('sqlite.result', { n: i + 1 }) },
            h('thead', {}, h('tr', {}, ...set.columns.map((c) => h('th', { scope: 'col' }, c)))),
            h('tbody', {}, ...set.values.slice(0, 1000).map((row) => h('tr', {}, ...row.map((v) => h('td', {}, this.shown(v)))))),
          ),
        ),
      ),
      ...(sets.length ? [] : [h('p', { class: 'hint' }, t('sqlite.done', { n: r.changes ?? 0 }))]),
    );
    if (changed) {
      this.ctx.changed();
      const tab = this.tab;
      await this.readTables();
      this.tab = tab;
      this.renderTabs();
    }
  }

  /** Run a .sql file chosen on the device: the tables of a data model, data to load. */
  private runFile(): void {
    const input = h('input', { type: 'file', accept: '.sql,text/plain,application/sql', hidden: true });
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;
      void file.text().then((sql) => {
        this.query.value = sql;
        return this.runQuery(sql);
      });
    });
    this.element.append(input);
    input.click();
  }

  /** DB-005: the conceptual model the tables come from, as a `.mcd` file beside the database. */
  private async showModel(): Promise<void> {
    if (!(await this.open())) return;
    const text = toConceptual(this.tables);
    const name = `${this.fileName.replace(/\.(sqlite3?|db)$/i, '')}.mcd`;
    if (this.ctx.writeFolderFile && this.ctx.folderWritable?.()) {
      await this.ctx.writeFolderFile(name, new TextEncoder().encode(text));
      this.ctx.notify?.(t('sqlite.modelSaved', { name }));
      return;
    }
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = h('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async save(): Promise<Uint8Array> {
    if (!(await this.open())) return this.bytes;
    const r = await this.runner!.db('export');
    if (r.error || !r.bytes) throw new Error(r.error ?? t('sqlite.notOpen'));
    this.bytes = new Uint8Array(r.bytes);
    return this.bytes;
  }

  status(): string {
    return t('sqlite.status', { n: this.tables.filter((x) => x.kind === 'table').length });
  }

  formatLabel(): string {
    return 'SQLite';
  }

  setReadOnly(readOnly: boolean): void {
    this.readOnly = readOnly;
    void this.render();
  }

  destroy(): void {
    this.runner?.destroy();
    this.element.remove();
  }
}
