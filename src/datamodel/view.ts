/**
 * DB-002..DB-004: a data model (a `.mcd` file) at its three levels — the
 * conceptual model written as text beside its diagram, the logical model
 * derived from it, the SQL of the tables for SQLite, PostgreSQL or MySQL —
 * kept in step as the text changes.
 */
import { button, h } from '../app/dom';
import { t, type MessageKey } from '../i18n';
import type { EditorView, ViewContext } from '../app/views';
import { drawModel } from './diagram';
import { DIALECTS, parseModel, toLogical, toSql, type ConceptualModel, type Dialect, type LogicalModel, type ModelError } from './model';

type Level = 'conceptual' | 'logical' | 'physical';
const LEVELS: Level[] = ['conceptual', 'logical', 'physical'];
const DIALECT_KEY = 'pwo.datamodel.dialect';

export class DataModelView implements EditorView {
  readonly element: HTMLElement;
  private text: string;
  private level: Level = 'conceptual';
  private dialect: Dialect;
  private model: ConceptualModel = { entities: [], associations: [] };
  private errors: ModelError[] = [];
  private logical: LogicalModel = { relations: [] };
  private readonly editor: HTMLTextAreaElement;
  private readonly tabs: HTMLElement;
  private readonly panels: Record<Level, HTMLElement>;
  private readonly problems = h('ul', { class: 'datamodel-errors', 'aria-live': 'polite', 'aria-label': t('dm.errors') });
  private readonly diagram = h('div', { class: 'datamodel-diagram-box' });
  private readonly relations = h('div', { class: 'datamodel-relations' });
  private readonly sql = h('pre', { class: 'datamodel-sql', tabindex: '0', 'aria-label': t('dm.sql') });
  private readonly dialectSelect: HTMLSelectElement;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    bytes: Uint8Array,
    private readonly ctx: ViewContext,
    private readonly fileName: string,
  ) {
    this.text = new TextDecoder().decode(bytes);
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(DIALECT_KEY);
    } catch {
      /* not kept */
    }
    this.dialect = DIALECTS.includes(saved as Dialect) ? (saved as Dialect) : 'sqlite';
    this.editor = h('textarea', { class: 'datamodel-source', spellcheck: 'false', 'aria-label': t('dm.source'), rows: '20' });
    this.editor.value = this.text;
    this.editor.addEventListener('input', () => {
      this.text = this.editor.value;
      this.ctx.changed();
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.update(), 200);
    });
    // Tab indents, as in a code editor (Escape then Tab leaves the field).
    let escaped = false;
    this.editor.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // A new line under an entity or an association is indented as its lines.
        const before = this.editor.value.slice(0, this.editor.selectionStart);
        const line = before.slice(before.lastIndexOf('\n') + 1);
        if (/^(entity|entité|entite|association)\s/i.test(line) || /^\s+\S/.test(line)) {
          e.preventDefault();
          this.editor.setRangeText(`\n${/^\s+/.exec(line)?.[0] ?? '  '}`, this.editor.selectionStart, this.editor.selectionEnd, 'end');
          this.editor.dispatchEvent(new Event('input'));
        }
        escaped = false;
      } else if (e.key === 'Escape') escaped = true;
      else if (e.key === 'Tab' && !escaped && !e.shiftKey) {
        e.preventDefault();
        this.editor.setRangeText('  ', this.editor.selectionStart, this.editor.selectionEnd, 'end');
        this.editor.dispatchEvent(new Event('input'));
      } else escaped = false;
    });
    this.dialectSelect = h('select', { 'aria-label': t('dm.dialect') }, ...DIALECTS.map((d) => h('option', { value: d, selected: d === this.dialect }, t(`dm.dialect.${d}` as MessageKey))));
    this.dialectSelect.addEventListener('change', () => {
      this.dialect = this.dialectSelect.value as Dialect;
      try {
        localStorage.setItem(DIALECT_KEY, this.dialect);
      } catch {
        /* not kept */
      }
      this.renderSql();
    });
    this.tabs = h('div', { class: 'datamodel-tabs', role: 'tablist', 'aria-label': t('dm.levels') });
    this.panels = {
      conceptual: h('div', { class: 'datamodel-panel datamodel-conceptual', role: 'tabpanel', id: 'dm-conceptual', 'aria-labelledby': 'dm-tab-conceptual' }, h('div', { class: 'datamodel-edit' }, h('p', { class: 'hint' }, t('dm.sourceHint')), this.editor, this.problems), this.diagram),
      logical: h('div', { class: 'datamodel-panel', role: 'tabpanel', id: 'dm-logical', 'aria-labelledby': 'dm-tab-logical', hidden: true }, h('p', { class: 'hint' }, t('dm.logicalHint')), this.relations),
      physical: h(
        'div',
        { class: 'datamodel-panel', role: 'tabpanel', id: 'dm-physical', 'aria-labelledby': 'dm-tab-physical', hidden: true },
        h(
          'div',
          { class: 'datamodel-sql-bar' },
          h('label', {}, h('span', {}, t('dm.dialect')), this.dialectSelect),
          button(t('dm.copySql'), () => void this.copySql(), { icon: '⧉' }),
          button(t('dm.saveSql'), () => void this.saveSql(), { icon: '💾' }),
        ),
        this.sql,
      ),
    };
    this.element = h(
      'section',
      { class: 'datamodel-view', 'aria-label': this.fileName },
      h('div', { class: 'datamodel-bar' }, this.tabs, button(t('dm.exportSvg'), () => this.exportSvg(), { icon: '⇩' })),
      ...LEVELS.map((l) => this.panels[l]),
    );
    this.renderTabs();
    this.update();
  }

  private renderTabs(): void {
    this.tabs.replaceChildren(
      ...LEVELS.map((l) => {
        const tab = h('button', { type: 'button', role: 'tab', id: `dm-tab-${l}`, 'aria-controls': `dm-${l}`, 'aria-selected': String(l === this.level), tabindex: l === this.level ? '0' : '-1' }, t(`dm.level.${l}` as MessageKey));
        tab.addEventListener('click', () => this.show(l));
        tab.addEventListener('keydown', (e) => {
          const i = LEVELS.indexOf(l);
          const next = e.key === 'ArrowRight' ? LEVELS[(i + 1) % 3] : e.key === 'ArrowLeft' ? LEVELS[(i + 2) % 3] : undefined;
          if (!next) return;
          e.preventDefault();
          this.show(next);
          this.tabs.querySelector<HTMLElement>(`#dm-tab-${next}`)?.focus();
        });
        return tab;
      }),
    );
  }

  private show(level: Level): void {
    this.level = level;
    for (const l of LEVELS) this.panels[l].hidden = l !== level;
    this.renderTabs();
  }

  /** Read the text again: the three levels follow. */
  private update(): void {
    const { model, errors } = parseModel(this.text);
    this.model = model;
    this.errors = errors;
    this.logical = toLogical(model);
    this.problems.replaceChildren(
      ...errors.map((e) => {
        const item = h('li', {}, button(t(`dm.error.${e.code}` as MessageKey, { line: e.line, name: e.name ?? '' }), () => this.goToLine(e.line), { className: 'link' }));
        return item;
      }),
    );
    this.diagram.replaceChildren(drawModel(model, t('dm.diagramOf', { name: this.fileName })));
    this.relations.replaceChildren(
      ...this.logical.relations.map((r) =>
        h(
          'p',
          { class: 'datamodel-relation' },
          h('strong', {}, r.name),
          ' (',
          ...r.columns.flatMap((c, i) => {
            const name = c.primary ? h('u', { title: t('dm.primaryKey') }, c.name) : h('span', {}, c.name);
            const shown = c.references ? [h('span', { class: 'datamodel-fk', title: t('dm.foreignKey', { relation: c.references.relation }) }, '#', name)] : [name];
            return i ? [', ', ...shown] : shown;
          }),
          ')',
        ),
      ),
      ...(this.logical.relations.length ? [h('p', { class: 'hint' }, t('dm.legend'))] : []),
    );
    this.renderSql();
    this.ctx.statusChanged();
  }

  private renderSql(): void {
    this.sql.textContent = this.logical.relations.length ? toSql(this.logical, this.dialect) : '';
  }

  private goToLine(line: number): void {
    const lines = this.editor.value.split('\n');
    const start = lines.slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0);
    this.show('conceptual');
    this.editor.focus();
    this.editor.setSelectionRange(start, start + (lines[line - 1]?.length ?? 0));
  }

  private sqlName(): string {
    return `${this.fileName.replace(/\.mcd$/i, '')}.${this.dialect}.sql`;
  }

  private async copySql(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.sql.textContent ?? '');
      this.ctx.notify?.(t('dm.copied'));
    } catch {
      this.ctx.notify?.(t('dm.copyFailed'));
    }
  }

  /** The SQL as a file beside the model (it runs with SQLite as any .sql file), else downloaded. */
  private async saveSql(): Promise<void> {
    const bytes = new TextEncoder().encode(this.sql.textContent ?? '');
    const name = this.sqlName();
    if (this.ctx.writeFolderFile && this.ctx.folderWritable?.()) {
      await this.ctx.writeFolderFile(name, bytes);
      this.ctx.notify?.(t('dm.saved', { name }));
      return;
    }
    this.download(name, bytes, 'application/sql');
  }

  private exportSvg(): void {
    const svg = drawModel(this.model, this.fileName);
    this.download(`${this.fileName.replace(/\.mcd$/i, '')}.svg`, new TextEncoder().encode(new XMLSerializer().serializeToString(svg)), 'image/svg+xml');
  }

  private download(name: string, bytes: Uint8Array, type: string): void {
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
    const a = h('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  save(): Uint8Array {
    return new TextEncoder().encode(this.text);
  }

  status(): string {
    return t('dm.status', { entities: this.model.entities.length, associations: this.model.associations.length, errors: this.errors.length });
  }

  formatLabel(): string {
    return t('dm.format');
  }

  setReadOnly(readOnly: boolean): void {
    this.editor.readOnly = readOnly;
  }

  focus(): void {
    this.editor.focus();
  }

  destroy(): void {
    clearTimeout(this.timer);
    this.element.remove();
  }
}
