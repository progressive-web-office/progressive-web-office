/** Spreadsheet editor view: virtualized grid, formula bar, sheet tabs (SHEET-004/005/010/011/013). */
import { parseUnit, unitOfFormat } from './units';
import { setCellsUnit } from './unit-cells';
import { colorMoreButton } from '../color/more';
import { beforeMutation, sheetTools, type AgentTool } from '../ai/tools';
import type { PrintSettings } from '../print/settings';
import { t } from '../i18n';
import { button, h } from '../app/dom';
import type { EditorView, ViewContext } from '../app/views';
import { cellKey, colName, refName } from './address';
import { Calculator, formatGeneral } from './engine';
import { writeWorkbook, type SheetFormat } from './io';
import { cellInput, getCell, isError, setInput, usedSize, type CellStyle, type Chart, type Workbook } from './model';
import { chartData, parseRange, renderChartSvg } from './chart';
import { formatValue } from './number-format';
import { fillWithMath, typesetMath } from '../math/inline';
import { partsWorkbook, workbookParts, type CollabAdapter, type PeerCursor } from '../collab/parts';
import { addSheet, applyCellStyle, clearCellStyle, clearRange, copyRange, deleteCells, deleteSheet, guessHeader, insertCells, pasteText, renameSheet, sortRange, type Range } from './ops';
import { chooseSort } from './sort-dialog';
import { fillDownEnd, fillRange, fillTarget } from './fill';
import { columnValues, displayText, hiddenRows, RowMap, setColumnFilter, toggleFilter } from './filter';

const ROW_H = 24;
const DEFAULT_W = 96;
const OVERSCAN = 8;
const MIN_RENDER_ROWS = 40;
const MAX_UNDO = 100;

const CUSTOM_FORMAT = '\u0000custom';
/** UNIT-004: a unit for the cells chosen. */
const UNIT_FORMAT = '\u0000unit';
const FORMATS = (): [string, string][] => [
  ['', t('sheet.fmt.general')],
  ['0', '0'],
  ['0.00', '0.00'],
  ['#,##0.00', '1,234.56'],
  ['0%', t('sheet.fmt.percent')],
  ['0.00%', t('sheet.fmt.percent2')],
  ['yyyy-mm-dd', t('sheet.fmt.dateIso')],
  ['dd/mm/yyyy', t('sheet.fmt.dateDmy')],
  ['#,##0.00 "€"', t('sheet.fmt.euro')],
  ['"$"#,##0.00', t('sheet.fmt.dollar')],
];

/**
 * Show the formatting of a cell (SHEET-014); a fill without a text colour
 * keeps dark text, readable in dark mode. `print` sets colours and borders
 * inline, outside the grid's style sheet.
 */
function applyLook(td: HTMLElement, look: CellStyle, print = false): void {
  if (look.bold) td.style.fontWeight = 'bold';
  if (look.italic) td.style.fontStyle = 'italic';
  if (look.underline) td.style.textDecoration = 'underline';
  if (look.color) td.style.color = look.color;
  if (look.fill) {
    if (print) td.style.backgroundColor = look.fill;
    else {
      td.classList.add('filled');
      td.style.setProperty('--fill', look.fill);
    }
    if (!look.color) td.style.color = '#000000';
  }
  if (look.align) td.style.textAlign = look.align;
  if (look.border) {
    if (print) td.style.border = '1px solid #000000';
    else td.classList.add('bordered');
  }
}

export class SheetEditor implements EditorView {
  readonly element: HTMLElement;
  private readonly calc: Calculator;
  private si = 0;
  private anchor = { row: 0, col: 0 };
  private focusCell = { row: 0, col: 0 };
  /** Rows hidden by the autofilter are left out of the layout (SHEET-018). */
  private rows = new RowMap();
  private nRows = 200;
  private nCols = 26;
  private firstRow = 0;
  private lastRow = -1;
  private editor: HTMLInputElement | null = null;
  private editRef: { row: number; col: number } | null = null;
  private undoStack: { si: number; wb: Workbook }[] = [];
  private redoStack: { si: number; wb: Workbook }[] = [];
  private dragging = false;
  /** SHEET-027: the selection being filled by dragging its handle, and the range it will fill. */
  private filling?: { from: Range; to: Range };
  /** Where the other participants are (COLLAB-003). */
  private peers: PeerCursor[] = [];

  private readonly nameBox = h('span', { class: 'name-box', 'aria-label': t('sheet.selectedCell'), role: 'status' });
  private readonly formulaInput = h('input', { class: 'formula-input', type: 'text', 'aria-label': t('sheet.cellContent'), spellcheck: 'false', autocomplete: 'off' });
  /** Cell formatting buttons (SHEET-014): bold, italic, underline, border, alignments. */
  private readonly lookButtons = new Map<string, HTMLButtonElement>();
  private readonly textColor = h('input', { type: 'color', value: '#c00000', 'aria-label': t('sheet.textColor'), title: t('sheet.textColor') });
  private readonly fillColor = h('input', { type: 'color', value: '#ffff00', 'aria-label': t('sheet.fillColor'), title: t('sheet.fillColor') });
  private readonly formatSelect = h('select', { 'aria-label': t('sheet.numberFormat'), title: t('sheet.numberFormat') }, ...FORMATS().map(([v, l]) => h('option', { value: v }, l)), h('option', { value: CUSTOM_FORMAT }, t('sheet.fmt.custom')), h('option', { value: UNIT_FORMAT }, t('sheet.fmt.unit')));
  private readonly viewport = h('div', { class: 'grid-viewport', tabindex: '0', role: 'grid', 'aria-label': t('sheet.label') });
  private readonly table = h('table', { class: 'grid' });
  private readonly tabs = h('div', { class: 'sheet-tabs', role: 'tablist', 'aria-label': t('sheet.sheets') });
  /** Charts float above the grid, positioned on their anchor cell (SHEET-020). */
  private readonly chartLayer = h('div', { class: 'chart-layer' });

  constructor(
    private wb: Workbook,
    private readonly ctx: ViewContext,
    private readonly sourceFormat: SheetFormat,
  ) {
    this.calc = new Calculator(wb);
    this.viewport.append(this.table, this.chartLayer);
    this.element = h(
      'div',
      { class: 'sheet-editor' },
      this.toolbar(),
      h('div', { class: 'formula-bar' }, this.nameBox, h('span', { class: 'fx', 'aria-hidden': 'true' }, 'fx'), this.formulaInput),
      this.viewport,
      this.tabs,
    );
    this.bindEvents();
    this.renderAll();
  }

  // --- EditorView -----------------------------------------------------------------

  mounted(): void {
    this.renderBody();
  }

  focus(): void {
    this.viewport.focus();
  }

  status(): string {
    const r = this.range();
    const sheet = this.wb.sheets[this.si]!;
    if (r.r1 === r.r2 && r.c1 === r.c2) return `${sheet.name} · ${refName(r.r1, r.c1)}`;
    const nums: number[] = [];
    let count = 0;
    for (const key of sheet.cells.keys()) {
      const [row, col] = key.split(',').map(Number) as [number, number];
      if (row < r.r1 || row > r.r2 || col < r.c1 || col > r.c2) continue;
      const v = this.calc.value(this.si, [row, col]);
      if (v !== null && v !== '') count++;
      if (typeof v === 'number') nums.push(v);
    }
    const sum = nums.reduce((a, b) => a + b, 0);
    const parts = [`${sheet.name} · ${refName(r.r1, r.c1)}:${refName(r.r2, r.c2)}`, t('sheet.count', { n: count })];
    if (nums.length) parts.push(t('sheet.sum', { n: formatGeneral(sum) }), t('sheet.average', { n: formatGeneral(+(sum / nums.length).toPrecision(12)) }));
    return parts.join(' · ');
  }

  save(format: Parameters<NonNullable<EditorView['save']>>[0]): Uint8Array {
    this.commitEdit();
    return writeWorkbook(this.wb, (format as SheetFormat) ?? this.sourceFormat, this.si);
  }

  /** Real-time collaboration: one shared part per cell and per sheet (COLLAB-002). */
  collab(): CollabAdapter {
    return {
      read: () => workbookParts(this.wb),
      write: (parts) => {
        this.wb.sheets = partsWorkbook(parts).sheets;
        this.si = Math.min(this.si, this.wb.sheets.length - 1);
        // Undoing would bring back a state that overwrites the others' edits.
        this.undoStack = [];
        this.redoStack = [];
        this.calc.invalidate();
        this.renderAll();
      },
      cursor: () => ({ si: this.si, row: this.focusCell.row, col: this.focusCell.col }),
      showPeers: (peers) => {
        this.peers = peers;
        this.renderPeers();
      },
    };
  }

  private renderPeers(): void {
    for (const td of Array.from(this.table.querySelectorAll<HTMLElement>('td.peer'))) {
      td.classList.remove('peer');
      td.style.removeProperty('--peer');
      delete td.dataset.peer;
    }
    for (const peer of this.peers) {
      const c = peer.cursor as { si?: number; row?: number; col?: number } | undefined;
      if (!c || c.si !== this.si || typeof c.row !== 'number' || typeof c.col !== 'number') continue;
      const td = this.td(c.row, c.col);
      if (!td) continue;
      td.classList.add('peer');
      td.style.setProperty('--peer', peer.color);
      td.dataset.peer = td.dataset.peer ? `${td.dataset.peer}, ${peer.name}` : peer.name;
    }
  }

  agentTools(): AgentTool[] {
    this.commitEdit();
    // Getters: undo/redo replace the workbook object.
    const self = this;
    const tools = sheetTools({
      get wb() {
        return self.wb;
      },
      calc: this.calc,
      activeSheet: () => this.si,
      refresh: () => this.changed(true),
    });
    return beforeMutation(tools, () => this.snapshot());
  }

  async printContent(settings: PrintSettings): Promise<HTMLElement> {
    this.commitEdit();
    const root = h('div', { class: 'print-sheet' });
    const indices = settings.allSheets ? this.wb.sheets.map((_, i) => i) : [this.si];
    for (const si of indices) {
      const sheet = this.wb.sheets[si]!;
      const [rows, cols] = usedSize(sheet);
      const table = h('table', { class: settings.gridlines ? 'gridlines' : undefined });
      if (settings.headings) {
        const head = h('tr', {}, h('th'));
        for (let c = 0; c < cols; c++) head.append(h('th', {}, colName(c)));
        table.append(h('thead', {}, head));
      }
      const body = h('tbody');
      for (let r = 0; r < rows; r++) {
        const tr = h('tr');
        if (settings.headings) tr.append(h('th', {}, String(r + 1)));
        for (let c = 0; c < cols; c++) {
          const cell = sheet.cells.get(cellKey(r, c));
          const v = cell ? this.calc.value(si, [r, c]) : null;
          const td = h('td', { class: typeof v === 'number' ? 'num' : undefined });
          if (cell) fillWithMath(td, formatValue(v, this.calc.format(si, [r, c])));
          if (cell?.style) applyLook(td, cell.style, true);
          tr.append(td);
        }
        body.append(tr);
      }
      table.append(body);
      const charts = (sheet.charts ?? []).map((chart) => {
        const figure = h('div', { class: 'print-chart' });
        figure.innerHTML = renderChartSvg(chart, chartData(chart, (r, c) => this.calc.value(si, [r, c])));
        return figure;
      });
      root.append(h('div', { class: 'sheet-block' }, indices.length > 1 ? h('h2', {}, sheet.name) : null, table, ...charts));
    }
    await typesetMath(root);
    return root;
  }

  print(): void {
    const sheet = this.wb.sheets[this.si]!;
    const [rows, cols] = usedSize(sheet);
    const table = h('table', { class: 'print-grid' });
    for (let r = 0; r < rows; r++) {
      const tr = h('tr');
      for (let c = 0; c < cols; c++) {
        const cell = sheet.cells.get(cellKey(r, c));
        const v = cell ? this.calc.value(this.si, [r, c]) : null;
        tr.append(h('td', { class: typeof v === 'number' ? 'num' : undefined }, cell ? formatValue(v, this.calc.format(this.si, [r, c])) : ''));
      }
      table.append(tr);
    }
    const holder = h('div', { class: 'print-only' }, h('h1', {}, sheet.name), table);
    document.body.append(holder);
    document.body.classList.add('printing-sheet');
    window.print();
    document.body.classList.remove('printing-sheet');
    holder.remove();
  }

  destroy(): void {
    /* nothing global to release */
  }

  // --- rendering -----------------------------------------------------------------

  private width(col: number): number {
    return this.wb.sheets[this.si]!.colWidths?.get(col) ?? DEFAULT_W;
  }

  private range(): Range {
    return {
      r1: Math.min(this.anchor.row, this.focusCell.row),
      r2: Math.max(this.anchor.row, this.focusCell.row),
      c1: Math.min(this.anchor.col, this.focusCell.col),
      c2: Math.max(this.anchor.col, this.focusCell.col),
    };
  }

  private updateSize(): void {
    const [rows, cols] = usedSize(this.wb.sheets[this.si]!);
    this.nRows = Math.max(this.nRows, rows + 50, this.focusCell.row + 50, 200);
    this.nCols = Math.max(cols + 5, this.focusCell.col + 5, 26);
  }

  private renderAll(): void {
    this.updateSize();
    const colgroup = h('colgroup', {}, h('col', { style: 'width: 48px' }));
    const head = h('tr', {}, h('th', { class: 'corner', 'aria-label': t('sheet.selectAll') }));
    const frozen = this.frozen();
    this.freezeButton.setAttribute('aria-pressed', String(!!this.wb.sheets[this.si]!.freeze));
    this.filterButton.setAttribute('aria-pressed', String(!!this.wb.sheets[this.si]!.filter));
    for (let c = 0; c < this.nCols; c++) {
      colgroup.append(h('col', { style: `width: ${this.width(c)}px` }));
      const th = h('th', { class: 'colhead', 'data-col': String(c), scope: 'col' }, colName(c), this.columnResizer(c));
      if (c < frozen.cols) this.freezeCell(th, -1, c, frozen);
      head.append(th);
    }
    this.table.replaceChildren(colgroup, h('thead', {}, head), h('tbody'));
    this.lastRow = -1;
    this.renderBody(true);
    this.renderTabs();
    this.renderSelection();
    this.renderCharts();
  }

  /** Frozen rows and columns of the current sheet, within its size (SHEET-017). */
  private frozen(): { rows: number; cols: number } {
    const f = this.wb.sheets[this.si]!.freeze;
    return { rows: Math.min(f?.rows ?? 0, this.nRows), cols: Math.min(f?.cols ?? 0, this.nCols) };
  }

  /** Keep a cell of a frozen row (below the column headings) or column (right of the row headings) in view. */
  private freezeCell(el: HTMLElement, row: number, col: number, frozen: { rows: number; cols: number }): void {
    if (row >= 0 && row < frozen.rows) {
      el.classList.add('frz-r');
      el.style.top = `${(row + 1) * ROW_H}px`;
      if (row === frozen.rows - 1) el.classList.add('frz-last-r');
    }
    if (col >= 0 && col < frozen.cols) {
      let left = 48;
      for (let c = 0; c < col; c++) left += this.width(c);
      el.classList.add('frz-c');
      el.style.left = `${left}px`;
      if (col === frozen.cols - 1) el.classList.add('frz-last-c');
    }
  }

  private renderBody(force = false): void {
    const vh = this.viewport.clientHeight;
    const visible = vh > 0 ? Math.ceil(vh / ROW_H) : MIN_RENDER_ROWS;
    const frozen = this.frozen();
    if (force) this.rows = new RowMap([...hiddenRows(this.wb, this.si, this.calc)].sort((a, b) => a - b));
    const rows_ = this.rows;
    const firstIndex = Math.max(rows_.index(frozen.rows), Math.floor(this.viewport.scrollTop / ROW_H) - OVERSCAN);
    const first = rows_.rowAt(firstIndex);
    const last = Math.min(this.nRows - 1, rows_.rowAt(firstIndex + visible + OVERSCAN * 2));
    if (!force && first === this.firstRow && last === this.lastRow) return;
    this.firstRow = first;
    this.lastRow = last;
    const sheet = this.wb.sheets[this.si]!;
    const filter = sheet.filter;
    const tbody = this.table.tBodies[0]!;
    let hasMath = false;
    const rows: HTMLTableRowElement[] = [];
    const row = (r: number): HTMLTableRowElement => {
      const head = h('th', { class: 'rowhead', 'data-row': String(r), scope: 'row' }, String(r + 1));
      this.freezeCell(head, r, -1, frozen);
      const tr = h('tr', { style: `height: ${ROW_H}px` }, head);
      for (let c = 0; c < this.nCols; c++) {
        const cell = sheet.cells.get(cellKey(r, c));
        const td = h('td', { 'data-r': String(r), 'data-c': String(c) });
        if (r < frozen.rows || c < frozen.cols) this.freezeCell(td, r, c, frozen);
        if (cell) {
          const v = this.calc.value(this.si, [r, c]);
          if (fillWithMath(td, formatValue(v, this.calc.format(this.si, [r, c])))) hasMath = true;
          if (typeof v === 'number') td.classList.add('num');
          else if (typeof v === 'boolean') td.classList.add('bool');
          else if (isError(v)) td.classList.add('err');
          if (cell.style) applyLook(td, cell.style);
        }
        if (filter && r === filter.range.r1 && c >= filter.range.c1 && c <= filter.range.c2) {
          const on = !!filter.columns[c];
          const b = h('button', { type: 'button', class: `filter-btn${on ? ' on' : ''}`, 'data-filter-col': String(c), 'aria-label': t('filter.column', { name: colName(c) }), 'aria-pressed': String(on), title: t('filter.column', { name: colName(c) }), tabindex: '-1' }, on ? '▼' : '▾');
          td.classList.add('filter-head');
          td.append(b);
        }
        tr.append(td);
      }
      return tr;
    };
    // SHEET-017: frozen rows are always there, above the scrolling ones.
    for (let r = 0; r < frozen.rows; r++) rows.push(row(r));
    rows.push(h('tr', { class: 'spacer', style: `height: ${(rows_.index(first) - rows_.index(frozen.rows)) * ROW_H}px`, 'aria-hidden': 'true' }));
    for (let r = first; r <= last; r++) if (!rows_.isHidden(r)) rows.push(row(r));
    rows.push(h('tr', { class: 'spacer', style: `height: ${Math.max(0, rows_.index(this.nRows) - 1 - rows_.index(last)) * ROW_H}px`, 'aria-hidden': 'true' }));
    tbody.replaceChildren(...rows);
    if (hasMath) void typesetMath(tbody);
    this.renderSelection();
  }

  private renderSelection(): void {
    const r = this.range();
    for (const td of Array.from(this.table.querySelectorAll<HTMLElement>('td.sel, td.active'))) td.classList.remove('sel', 'active');
    for (const th of Array.from(this.table.querySelectorAll<HTMLElement>('th.hl'))) th.classList.remove('hl');
    for (let row = Math.max(r.r1, this.firstRow); row <= Math.min(r.r2, this.lastRow); row++) {
      for (let col = r.c1; col <= r.c2; col++) this.td(row, col)?.classList.add('sel');
      this.table.querySelector(`th[data-row="${row}"]`)?.classList.add('hl');
    }
    for (let col = r.c1; col <= r.c2; col++) this.table.querySelector(`th[data-col="${col}"]`)?.classList.add('hl');
    const active = this.td(this.focusCell.row, this.focusCell.col);
    active?.classList.add('active');
    // SHEET-027: the fill handle, at the bottom right of the selection.
    this.table.querySelector('.fill-handle')?.remove();
    if (!this.readOnly) this.td(r.r2, r.c2)?.append(h('span', { class: 'fill-handle', title: t('sheet.fillHandle'), 'aria-hidden': 'true' }));
    if (active) this.viewport.setAttribute('aria-activedescendant', (active.id = `cell-${this.focusCell.row}-${this.focusCell.col}`));
    this.nameBox.textContent = refName(this.focusCell.row, this.focusCell.col);
    const cell = getCell(this.wb.sheets[this.si]!, [this.focusCell.row, this.focusCell.col]);
    if (document.activeElement !== this.formulaInput) this.formulaInput.value = cellInput(cell);
    // A format not in the list (from a file or a template) is shown as it is, to be changed again.
    const fmt = cell?.numFmt ?? '';
    this.formatSelect.querySelector('option.current-format')?.remove();
    if (!FORMATS().some(([v]) => v === fmt)) this.formatSelect.insertBefore(h('option', { value: fmt, class: 'current-format' }, fmt), this.formatSelect.lastElementChild);
    this.formatSelect.value = fmt;
    // SHEET-014: the toolbar shows the formatting of the active cell.
    const look = cell?.style ?? {};
    for (const [key, b] of this.lookButtons) b.setAttribute('aria-pressed', String(key.startsWith('align:') ? look.align === key.slice(6) : !!look[key as 'bold']));
    this.renderPeers();
    this.ctx.statusChanged();
  }

  private td(row: number, col: number): HTMLElement | null {
    return this.table.querySelector(`td[data-r="${row}"][data-c="${col}"]`);
  }

  private renderTabs(): void {
    const tabs = this.wb.sheets.map((s, i) => {
      const tab = button(s.name, () => this.switchSheet(i), { className: 'sheet-tab', title: t('sheet.renameTitle') });
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(i === this.si));
      tab.addEventListener('dblclick', () => this.renameSheetPrompt(i));
      return tab;
    });
    const remove = this.wb.sheets.length > 1 ? button(t('sheet.deleteSheet'), () => this.deleteSheetConfirm(), { text: '🗑', className: 'sheet-del', title: t('sheet.deleteSheetTitle') }) : null;
    // A sheet renamed without a double click (keyboard, command palette).
    const rename = button(t('sheet.renameSheet'), () => this.renameSheetPrompt(this.si), { text: '✎', className: 'sheet-rename', title: t('sheet.renameSheet') });
    this.tabs.replaceChildren(...tabs, button(t('sheet.addSheet'), () => this.addSheet(), { text: '+', className: 'sheet-add' }), rename, ...(remove ? [remove] : []));
  }

  // --- changes & history -----------------------------------------------------------

  private snapshot(): void {
    this.undoStack.push({ si: this.si, wb: structuredClone(this.wb) });
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
    this.redoStack = [];
  }

  private changed(full = false): void {
    this.calc.invalidate();
    if (full) this.renderAll();
    else {
      this.renderBody(true);
      this.renderCharts();
    }
    this.ctx.changed();
  }

  // --- charts (SHEET-020, SHEET-023) -------------------------------------------------

  private chartDataOf(chart: Chart): ReturnType<typeof chartData> {
    return chartData(chart, (r, c) => this.calc.value(this.si, [r, c]));
  }

  private cellPosition(row: number, col: number): { x: number; y: number } {
    let x = 48;
    for (let c = 0; c < col; c++) x += this.width(c);
    return { x, y: (this.table.tHead?.offsetHeight || ROW_H) + this.rows.index(row) * ROW_H };
  }

  private cellAt(x: number, y: number): { row: number; col: number } {
    const head = this.table.tHead?.offsetHeight || ROW_H;
    let col = 0;
    let left = 48;
    while (left + this.width(col) / 2 < x && col < 16_000) left += this.width(col++);
    return { row: this.rows.rowAt(Math.max(0, Math.round((y - head) / ROW_H))), col };
  }

  private renderCharts(): void {
    const charts = this.wb.sheets[this.si]!.charts ?? [];
    this.chartLayer.replaceChildren(...charts.map((chart, i) => this.chartElement(chart, i)));
  }

  private chartElement(chart: Chart, index: number): HTMLElement {
    const pos = this.cellPosition(chart.anchor.row, chart.anchor.col);
    const name = chart.title || t('chart.untitled');
    const el = h('div', {
      class: 'sheet-chart',
      tabindex: '0',
      role: 'figure',
      'aria-label': `${t('chart.label')}: ${name}`,
      style: `left: ${pos.x}px; top: ${pos.y}px; width: ${chart.width}px; height: ${chart.height}px`,
    });
    // Our own SVG: every text from the sheet is escaped by renderChartSvg.
    const figure = h('div', { class: 'sheet-chart-figure' });
    figure.innerHTML = renderChartSvg(chart, this.chartDataOf(chart));
    const tools = h(
      'div',
      { class: 'sheet-chart-tools' },
      button(t('chart.edit'), () => void this.editChartAt(index), { text: '✎', title: t('chart.edit') }),
      button(t('chart.copyImage'), (e) => void this.copyChartImage(chart, e.currentTarget as HTMLButtonElement), { text: '⧉', title: t('chart.copyImageTitle') }),
      button(t('chart.delete'), () => this.removeChart(index), { text: '🗑', title: t('chart.delete') }),
    );
    const handle = h('span', { class: 'sheet-chart-resize', 'aria-hidden': 'true' });
    el.append(figure, tools, handle);
    el.addEventListener('keydown', (e) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && !this.readOnly) {
        e.preventDefault();
        this.removeChart(index);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        void this.editChartAt(index);
      }
      e.stopPropagation();
    });
    // Drag to move (snapping to cells) and resize from the corner.
    el.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      const resizing = e.target === handle;
      e.preventDefault();
      el.focus();
      el.setPointerCapture(e.pointerId);
      const start = { x: e.clientX, y: e.clientY };
      let dx = 0;
      let dy = 0;
      const move = (ev: PointerEvent): void => {
        dx = ev.clientX - start.x;
        dy = ev.clientY - start.y;
        if (resizing) {
          el.style.width = `${Math.max(160, chart.width + dx)}px`;
          el.style.height = `${Math.max(120, chart.height + dy)}px`;
        } else {
          el.style.transform = `translate(${dx}px, ${dy}px)`;
        }
      };
      const up = (): void => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        if (Math.abs(dx) < 3 && Math.abs(dy) < 3) {
          el.style.transform = '';
          return;
        }
        this.snapshot();
        const target = this.wb.sheets[this.si]!.charts![index]!;
        if (resizing) {
          target.width = Math.max(160, Math.round(chart.width + dx));
          target.height = Math.max(120, Math.round(chart.height + dy));
        } else {
          target.anchor = this.cellAt(pos.x + dx, pos.y + dy);
        }
        this.renderCharts();
        this.ctx.changed();
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
    });
    return el;
  }

  /** Default data: the selection, or the block of filled cells around the active cell. */
  private chartRangeGuess(): string {
    const r = this.dataRange();
    return `${refName(r.r1, r.c1)}:${refName(r.r2, r.c2)}`;
  }

  /** The selection, or the block of filled cells around the active cell when one cell is selected. */
  private dataRange(): Range {
    let r = this.range();
    if (r.r1 === r.r2 && r.c1 === r.c2) {
      const sheet = this.wb.sheets[this.si]!;
      const filled = (row: number, col: number): boolean => row >= 0 && col >= 0 && sheet.cells.has(cellKey(row, col));
      let grew = true;
      while (grew) {
        grew = false;
        for (let c = r.c1; c <= r.c2 && !grew; c++) if (filled(r.r1 - 1, c)) (r = { ...r, r1: r.r1 - 1 }), (grew = true);
        for (let c = r.c1; c <= r.c2 && !grew; c++) if (filled(r.r2 + 1, c)) (r = { ...r, r2: r.r2 + 1 }), (grew = true);
        for (let row = r.r1; row <= r.r2 && !grew; row++) if (filled(row, r.c1 - 1)) (r = { ...r, c1: r.c1 - 1 }), (grew = true);
        for (let row = r.r1; row <= r.r2 && !grew; row++) if (filled(row, r.c2 + 1)) (r = { ...r, c2: r.c2 + 1 }), (grew = true);
      }
    }
    return r;
  }

  /**
   * SHEET-026: the width of a column dragged at the right edge of its header
   * (a double click fits it to its content); the columns selected all take it.
   */
  private columnResizer(c: number): HTMLElement {
    const grip = h('span', { class: 'col-resizer', role: 'separator', 'aria-orientation': 'vertical', 'aria-label': t('sheet.colWidthOf', { col: colName(c) }), title: t('sheet.colWidthDrag') });
    grip.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      grip.setPointerCapture?.(e.pointerId);
      const start = e.clientX;
      const from = this.width(c);
      const col = this.table.querySelectorAll('colgroup col')[c + 1] as HTMLElement | undefined;
      let now = from;
      const move = (ev: PointerEvent): void => {
        now = Math.max(16, Math.min(1200, Math.round(from + ev.clientX - start)));
        if (col) col.style.width = `${now}px`;
      };
      const up = (): void => {
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', up);
        if (now !== from) this.setColumnWidths(this.columnsOf(c), now);
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
    });
    grip.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      this.setColumnWidths(this.columnsOf(c), 'fit');
    });
    grip.addEventListener('click', (e) => e.stopPropagation());
    return grip;
  }

  /** The column, or all the columns selected when it is one of them. */
  private columnsOf(c: number): number[] {
    const r = this.range();
    return c >= r.c1 && c <= r.c2 ? Array.from({ length: r.c2 - r.c1 + 1 }, (_, i) => r.c1 + i) : [c];
  }

  /** SHEET-026: "Column width…": in pixels, or fitted to the content. */
  private askColumnWidth(): void {
    const r = this.range();
    const cols = Array.from({ length: r.c2 - r.c1 + 1 }, (_, i) => r.c1 + i);
    const answer = window.prompt(t('sheet.colWidthPrompt'), String(this.width(cols[0]!)))?.trim();
    if (!answer) return;
    if (/^(auto|fit|ajust|自动)/i.test(answer)) return this.setColumnWidths(cols, 'fit');
    const px = Math.round(Number(answer.replace(',', '.')));
    if (px >= 16 && px <= 1200) this.setColumnWidths(cols, px);
  }

  private setColumnWidths(cols: number[], width: number | 'fit'): void {
    const sheet = this.wb.sheets[this.si]!;
    this.commitEdit();
    this.snapshot();
    sheet.colWidths ??= new Map();
    for (const c of cols) {
      const w = width === 'fit' ? this.fitWidth(c) : width;
      if (w === DEFAULT_W) sheet.colWidths.delete(c);
      else sheet.colWidths.set(c, w);
    }
    this.changed(true);
  }

  /** The width that shows the longest value of the column (its rows shown). */
  private fitWidth(c: number): number {
    const probe = this.table.querySelector<HTMLElement>('tbody td') ?? this.table;
    const font = getComputedStyle(probe).font || '13px sans-serif';
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return DEFAULT_W;
    ctx.font = font;
    let max = ctx.measureText(colName(c)).width;
    for (const td of Array.from(this.table.querySelectorAll<HTMLElement>(`td[data-c="${c}"]`))) max = Math.max(max, ctx.measureText(td.textContent ?? '').width);
    return Math.max(32, Math.min(1200, Math.ceil(max + 16)));
  }

  /** Freeze the rows above and the columns left of the active cell, or unfreeze (SHEET-017). */
  private toggleFreeze(): void {
    const sheet = this.wb.sheets[this.si]!;
    this.commitEdit();
    this.snapshot();
    if (sheet.freeze) delete sheet.freeze;
    else {
      const { row, col } = this.focusCell;
      // From A1, the usual case: the first row.
      sheet.freeze = row === 0 && col === 0 ? { rows: 1, cols: 0 } : { rows: row, cols: col };
    }
    this.changed(true);
  }

  /** Turn the autofilter on for the data around the selection, or off (SHEET-018). */
  private readonly filterButton = button(t('filter.button'), () => this.toggleAutoFilter(), { text: '⊻', title: t('filter.title') });

  private toggleAutoFilter(): void {
    const sheet = this.wb.sheets[this.si]!;
    const range = this.dataRange();
    if (!sheet.filter && range.r2 <= range.r1) return;
    this.structural(() => toggleFilter(this.wb, this.si, range));
    this.viewport.focus();
  }

  /** The values shown in a column of the filter. */
  private async filterColumn(col: number): Promise<void> {
    const filter = this.wb.sheets[this.si]!.filter;
    if (!filter) return;
    this.commitEdit();
    const heading = displayText(this.wb, this.si, this.calc, filter.range.r1, col).trim();
    const { chooseFilterValues } = await import('./filter-dialog');
    const chosen = await chooseFilterValues(this.element, t('filter.titleColumn', { name: heading || colName(col) }), columnValues(this.wb, this.si, this.calc, col), filter.columns[col]);
    if (chosen !== null) this.structural(() => setColumnFilter(this.wb, this.si, col, chosen));
    this.viewport.focus();
  }

  private readonly freezeButton = button(t('freeze.button'), () => this.toggleFreeze(), { text: '❄', title: t('freeze.title') });

  /** Sort the rows of the data around the selection by a column (SHEET-016). */
  private async sort(): Promise<void> {
    this.commitEdit();
    const range = this.dataRange();
    if (range.r2 <= range.r1) return;
    const sheet = this.wb.sheets[this.si]!;
    const col = Math.min(Math.max(this.focusCell.col, range.c1), range.c2);
    const opts = await chooseSort(this.element, range, { col, header: guessHeader(this.wb, this.si, this.calc, range) }, (c) => {
      const v = sheet.cells.has(cellKey(range.r1, c)) ? this.calc.value(this.si, [range.r1, c]) : '';
      return typeof v === 'string' ? v : '';
    });
    if (!opts) return this.viewport.focus();
    this.structural(() => sortRange(this.wb, this.si, this.calc, range, opts));
    this.viewport.focus();
  }

  private async insertChart(): Promise<void> {
    this.commitEdit();
    const range = this.chartRangeGuess();
    const r = parseRange(range)!;
    const sheet = this.wb.sheets[this.si]!;
    const firstRowText = Array.from({ length: r.c2 - r.c1 + 1 }, (_, i) => this.calc.value(this.si, [r.r1, r.c1 + i])).slice(r.c2 > r.c1 ? 1 : 0).some((v) => typeof v === 'string');
    const draft: Chart = { type: 'column', range, headers: firstRowText, anchor: { row: r.r1, col: r.c2 + 2 }, width: 480, height: 300 };
    const { editChart } = await import('./chart-ui');
    const chart = await editChart(this.element, draft, (c) => this.chartDataOf(c), false);
    if (!chart) return;
    this.snapshot();
    (sheet.charts ??= []).push(chart);
    this.renderCharts();
    this.ctx.changed();
  }

  private async editChartAt(index: number): Promise<void> {
    const current = this.wb.sheets[this.si]!.charts?.[index];
    if (!current) return;
    const { editChart } = await import('./chart-ui');
    const chart = await editChart(this.element, current, (c) => this.chartDataOf(c), true);
    if (!chart) return;
    this.snapshot();
    this.wb.sheets[this.si]!.charts![index] = chart;
    this.renderCharts();
    this.ctx.changed();
  }

  private removeChart(index: number): void {
    const charts = this.wb.sheets[this.si]!.charts;
    if (!charts?.[index]) return;
    this.snapshot();
    charts.splice(index, 1);
    if (!charts.length) delete this.wb.sheets[this.si]!.charts;
    this.renderCharts();
    this.ctx.changed();
    this.viewport.focus();
  }

  /** SHEET-023: copy the chart as a PNG image, to paste it into a document or a slide. */
  private async copyChartImage(chart: Chart, b: HTMLButtonElement): Promise<void> {
    const { chartPng } = await import('./chart-ui');
    const blob = await chartPng(renderChartSvg(chart, this.chartDataOf(chart)), chart.width, chart.height);
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      b.textContent = '✓';
      setTimeout(() => (b.textContent = '⧉'), 1500);
    } catch {
      // No clipboard access: download the image instead.
      const url = URL.createObjectURL(blob);
      const a = h('a', { href: url, download: `${chart.title || 'chart'}.png` });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    }
  }

  private restore(from: { si: number; wb: Workbook }[], to: { si: number; wb: Workbook }[]): void {
    const state = from.pop();
    if (!state) return;
    to.push({ si: this.si, wb: structuredClone(this.wb) });
    this.wb.sheets = state.wb.sheets;
    this.si = Math.min(state.si, this.wb.sheets.length - 1);
    this.changed(true);
  }

  private setActiveInput(text: string): void {
    const sheet = this.wb.sheets[this.si]!;
    const ref: [number, number] = [this.focusCell.row, this.focusCell.col];
    if (cellInput(getCell(sheet, ref)) === text) return;
    this.snapshot();
    setInput(sheet, ref, text);
    this.changed();
  }

  // --- selection & editing ---------------------------------------------------------

  private select(row: number, col: number, extend = false): void {
    row = Math.max(0, row);
    col = Math.max(0, col);
    if (this.rows.isHidden(row)) row = this.rows.rowAt(this.rows.index(row));
    this.focusCell = { row, col };
    if (!extend) this.anchor = { row, col };
    if (row >= this.nRows - 10 || col >= this.nCols - 2) this.renderAll();
    this.scrollIntoView(row, col);
    this.renderSelection();
  }

  private scrollIntoView(row: number, col: number): void {
    const vp = this.viewport;
    if (!vp.clientHeight) return;
    const top = this.rows.index(row) * ROW_H;
    const headH = ROW_H;
    // SHEET-017: frozen rows and columns are always visible and cover the top and left.
    const frozen = this.frozen();
    const frozenH = frozen.rows * ROW_H;
    let frozenW = 0;
    for (let c = 0; c < frozen.cols; c++) frozenW += this.width(c);
    if (row >= frozen.rows && top - frozenH < vp.scrollTop) vp.scrollTop = top - frozenH;
    else if (top + ROW_H > vp.scrollTop + vp.clientHeight - headH) vp.scrollTop = top + ROW_H - vp.clientHeight + headH;
    let left = 0;
    for (let c = 0; c < col; c++) left += this.width(c);
    if (col >= frozen.cols && left - frozenW < vp.scrollLeft) vp.scrollLeft = left - frozenW;
    else if (col < frozen.cols) {
      /* always in view */
    } else if (left < vp.scrollLeft) vp.scrollLeft = left;
    else if (left + this.width(col) > vp.scrollLeft + vp.clientWidth - 48) vp.scrollLeft = left + this.width(col) - vp.clientWidth + 48;
    this.renderBody();
  }

  /** FILE-017: no edits while read-only. */
  private readOnly = false;

  setReadOnly(readOnly: boolean): void {
    this.commitEdit();
    this.readOnly = readOnly;
    this.element.classList.toggle('read-only', readOnly);
  }

  private startEdit(initial?: string): void {
    if (this.readOnly) return;
    this.commitEdit();
    const { row, col } = this.focusCell;
    const td = this.td(row, col);
    const input = h('input', { class: 'cell-input', type: 'text', 'aria-label': t('sheet.editCell', { ref: refName(row, col) }), spellcheck: 'false', autocomplete: 'off' });
    input.value = initial ?? cellInput(getCell(this.wb.sheets[this.si]!, [row, col]));
    if (td) {
      input.style.top = `${td.offsetTop}px`;
      input.style.left = `${td.offsetLeft}px`;
      input.style.minWidth = `${td.offsetWidth}px`;
      input.style.height = `${td.offsetHeight}px`;
    }
    input.addEventListener('keydown', (e) => this.onEditorKey(e));
    input.addEventListener('input', () => (this.formulaInput.value = input.value));
    input.addEventListener('blur', () => {
      if (this.editor === input) this.commitEdit();
    });
    this.viewport.append(input);
    this.editor = input;
    this.editRef = { row, col };
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }

  private commitEdit(): void {
    const input = this.editor;
    if (!input || !this.editRef) return;
    this.editor = null;
    const ref = this.editRef;
    this.editRef = null;
    const saved = this.focusCell;
    this.focusCell = ref;
    this.setActiveInput(input.value);
    this.focusCell = saved;
    input.remove();
  }

  private cancelEdit(): void {
    this.editor?.remove();
    this.editor = null;
    this.editRef = null;
    this.viewport.focus();
    this.renderSelection();
  }

  private onEditorKey(e: KeyboardEvent): void {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      this.commitEdit();
      const { row, col } = this.focusCell;
      if (e.key === 'Enter') this.select(this.rows.step(row, e.shiftKey ? -1 : 1), col);
      else this.select(row, col + (e.shiftKey ? -1 : 1));
      this.viewport.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.cancelEdit();
    }
  }

  private onGridKey(e: KeyboardEvent): void {
    if (e.target !== this.viewport) return;
    const mod = e.ctrlKey || e.metaKey;
    const { row, col } = this.focusCell;
    const page = Math.max(1, Math.floor(this.viewport.clientHeight / ROW_H) - 1) || 20;
    const moves: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
      PageUp: [-page, 0],
      PageDown: [page, 0],
    };
    const move = moves[e.key];
    if (move) {
      e.preventDefault();
      this.select(this.rows.step(row, move[0]), col + move[1], e.shiftKey);
      return;
    }
    if (mod) {
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        this.restore(this.undoStack, this.redoStack);
      } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
        e.preventDefault();
        this.restore(this.redoStack, this.undoStack);
      } else if (e.key === 'Home') {
        e.preventDefault();
        this.select(0, 0);
      } else if ((k === 'd' || k === 'r') && !e.shiftKey && !e.altKey) {
        // SHEET-027: fill down / right from the first row / column of the selection.
        e.preventDefault();
        this.fillSelection(k === 'd' ? 'down' : 'right');
      } else if (k === 'b' || k === 'i' || k === 'u') {
        // SHEET-014: character formatting of the selection.
        e.preventDefault();
        this.toggleLook(({ b: 'bold', i: 'italic', u: 'underline' } as const)[k]);
      } else if (e.key === ' ') {
        e.preventDefault();
        this.commitEdit();
        this.snapshot();
        clearCellStyle(this.wb, this.si, this.range());
        this.changed();
      }
      return;
    }
    switch (e.key) {
      case 'Tab':
        e.preventDefault();
        this.select(row, col + (e.shiftKey ? -1 : 1));
        return;
      case 'Enter':
        e.preventDefault();
        this.select(row + (e.shiftKey ? -1 : 1), col);
        return;
      case 'Home':
        e.preventDefault();
        this.select(row, 0, e.shiftKey);
        return;
      case 'F2':
        e.preventDefault();
        this.startEdit();
        return;
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        if (this.readOnly) return;
        this.snapshot();
        clearRange(this.wb, this.si, this.range());
        this.changed();
        return;
      default:
        if (e.key.length === 1 && !e.altKey) {
          e.preventDefault();
          this.startEdit(e.key);
        }
    }
  }

  // --- toolbar & sheet actions -------------------------------------------------------

  private toolbar(): HTMLElement {
    const act = (label: string, text: string, fn: () => void) => button(label, fn, { text, title: label });
    this.formatSelect.addEventListener('change', () => {
      if (this.formatSelect.value === UNIT_FORMAT) return void this.chooseUnit();
      if (this.formatSelect.value !== CUSTOM_FORMAT) return this.applyFormat(this.formatSelect.value);
      // SHEET-014: any number format code (0.000, # ##0 "kg", dd/mm/yyyy hh:mm…).
      const cell = getCell(this.wb.sheets[this.si]!, [this.focusCell.row, this.focusCell.col]);
      const code = window.prompt(t('sheet.fmt.customPrompt'), cell?.numFmt ?? '0.000');
      if (code?.trim()) this.applyFormat(code.trim());
      this.renderSelection();
    });
    return h(
      'div',
      { class: 'toolbar', role: 'toolbar', 'aria-label': t('sheet.label') },
      act(t('common.undo'), '↶', () => this.restore(this.undoStack, this.redoStack)),
      act(t('common.redo'), '↷', () => this.restore(this.redoStack, this.undoStack)),
      h('span', { class: 'sep' }),
      act(t('sheet.insertRow'), `+${t('sheet.rowShort')}`, () => this.structural(() => insertCells(this.wb, this.si, 'rows', this.range().r1, 1))),
      act(t('sheet.deleteRows'), `−${t('sheet.rowShort')}`, () => {
        const r = this.range();
        this.structural(() => deleteCells(this.wb, this.si, 'rows', r.r1, r.r2 - r.r1 + 1));
      }),
      act(t('sheet.insertCol'), `+${t('sheet.colShort')}`, () => this.structural(() => insertCells(this.wb, this.si, 'cols', this.range().c1, 1))),
      act(t('sheet.colWidth'), '↔', () => this.askColumnWidth()),
      act(t('sheet.deleteCols'), `−${t('sheet.colShort')}`, () => {
        const r = this.range();
        this.structural(() => deleteCells(this.wb, this.si, 'cols', r.c1, r.c2 - r.c1 + 1));
      }),
      h('span', { class: 'sep' }),
      this.formatSelect,
      ...this.lookTools(),
      act(t('sheet.autoSum'), 'Σ', () => this.autoSum()),
      act(t('sheet.insertChart'), '📊', () => void this.insertChart()),
      act(t('sort.button'), '⇅', () => void this.sort()),
      this.filterButton,
      this.freezeButton,
    );
  }

  /** Change the formatting of the selection (SHEET-014). */
  private setLook(patch: Partial<Record<keyof CellStyle, unknown>>): void {
    this.commitEdit();
    this.snapshot();
    applyCellStyle(this.wb, this.si, this.range(), patch);
    this.changed();
  }

  /** Toggle a formatting of the selection, following the active cell. */
  private toggleLook(key: 'bold' | 'italic' | 'underline' | 'border'): void {
    const cell = getCell(this.wb.sheets[this.si]!, [this.focusCell.row, this.focusCell.col]);
    this.setLook({ [key]: !cell?.style?.[key] });
  }

  private lookTools(): HTMLElement[] {
    const toggle = (key: 'bold' | 'italic' | 'underline' | 'border', label: string, text: string): HTMLButtonElement => {
      const b = button(label, () => this.toggleLook(key), { text, title: label, pressed: false });
      this.lookButtons.set(key, b);
      return b;
    };
    const align = (value: 'left' | 'center' | 'right', label: string, text: string): HTMLButtonElement => {
      const b = button(label, () => {
        const cell = getCell(this.wb.sheets[this.si]!, [this.focusCell.row, this.focusCell.col]);
        this.setLook({ align: cell?.style?.align === value ? undefined : value });
      }, { text, title: label, pressed: false });
      this.lookButtons.set(`align:${value}`, b);
      return b;
    };
    this.textColor.addEventListener('change', () => this.setLook({ color: this.textColor.value }));
    this.fillColor.addEventListener('change', () => this.setLook({ fill: this.fillColor.value }));
    return [
      h('span', { class: 'sep' }),
      toggle('bold', t('common.bold'), 'B'),
      toggle('italic', t('common.italic'), 'I'),
      toggle('underline', t('common.underline'), 'U'),
      h('label', { class: 'color-pick', title: t('sheet.textColor') }, 'A', this.textColor),
      colorMoreButton(this.textColor, t('sheet.textColor')),
      h('label', { class: 'color-pick fill', title: t('sheet.fillColor') }, '▧', this.fillColor),
      colorMoreButton(this.fillColor, t('sheet.fillColor')),
      toggle('border', t('sheet.border'), '▦'),
      align('left', t('common.alignLeft'), '⇤'),
      align('center', t('common.alignCenter'), '↔'),
      align('right', t('common.alignRight'), '⇥'),
      button(t('sheet.clearFormat'), () => {
        this.commitEdit();
        this.snapshot();
        clearCellStyle(this.wb, this.si, this.range());
        this.changed();
      }, { text: '⌫', title: t('sheet.clearFormat') }),
      h('span', { class: 'sep' }),
    ];
  }

  private structural(fn: () => void): void {
    this.commitEdit();
    this.snapshot();
    fn();
    this.changed(true);
  }

  /** UNIT-004: the cells chosen in a unit: quantities converted, numbers given it, formulas shown in it. */
  private chooseUnit(): void {
    this.commitEdit();
    const sheet = this.wb.sheets[this.si]!;
    const cell = getCell(sheet, [this.focusCell.row, this.focusCell.col]);
    const current = unitOfFormat(this.calc.format(this.si, [this.focusCell.row, this.focusCell.col])) ?? '';
    const unit = window.prompt(t('sheet.fmt.unitPrompt'), current || (cell ? '' : 'mm'))?.trim();
    if (!unit) return this.renderSelection();
    if (!parseUnit(unit)) {
      window.alert(t('sheet.fmt.unitUnknown', { unit }));
      return this.renderSelection();
    }
    this.snapshot();
    const result = setCellsUnit(sheet, this.range(), unit);
    if (result.refused) window.alert(t('sheet.fmt.unitRefused', { n: result.refused, unit }));
    this.changed();
  }

  private applyFormat(fmt: string): void {
    const sheet = this.wb.sheets[this.si]!;
    const r = this.range();
    this.snapshot();
    for (const [key, cell] of sheet.cells) {
      const [row, col] = key.split(',').map(Number) as [number, number];
      if (row < r.r1 || row > r.r2 || col < r.c1 || col > r.c2) continue;
      if (fmt) cell.numFmt = fmt;
      else delete cell.numFmt;
    }
    this.changed();
  }

  private autoSum(): void {
    const { row, col } = this.focusCell;
    const sheet = this.wb.sheets[this.si]!;
    let top = row - 1;
    while (top >= 0 && typeof this.calc.value(this.si, [top, col]) === 'number') top--;
    if (top === row - 1) return;
    this.snapshot();
    setInput(sheet, [row, col], `=SUM(${refName(top + 1, col)}:${refName(row - 1, col)})`);
    this.changed();
  }

  private switchSheet(i: number): void {
    this.commitEdit();
    this.si = i;
    this.anchor = { row: 0, col: 0 };
    this.focusCell = { row: 0, col: 0 };
    this.viewport.scrollTop = 0;
    this.viewport.scrollLeft = 0;
    this.renderAll();
  }

  private addSheet(): void {
    this.snapshot();
    const i = addSheet(this.wb);
    this.ctx.changed();
    this.switchSheet(i);
  }

  private renameSheetPrompt(i: number): void {
    const name = window.prompt(t('sheet.namePrompt'), this.wb.sheets[i]!.name);
    if (name === null) return;
    try {
      this.snapshot();
      renameSheet(this.wb, i, name);
      this.changed(true);
    } catch (err) {
      this.undoStack.pop();
      window.alert((err as Error).message);
    }
  }

  private deleteSheetConfirm(): void {
    if (!window.confirm(t('sheet.deleteConfirm', { name: this.wb.sheets[this.si]!.name }))) return;
    this.snapshot();
    deleteSheet(this.wb, this.si);
    this.si = Math.max(0, this.si - 1);
    this.changed(true);
  }

  // --- events ---------------------------------------------------------------------

  private bindEvents(): void {
    this.viewport.addEventListener('keydown', (e) => this.onGridKey(e));
    this.viewport.addEventListener('scroll', () => this.renderBody());
    this.viewport.addEventListener('mousedown', (e) => {
      const t = e.target as HTMLElement;
      if (t.classList.contains('cell-input')) return;
      // SHEET-018: a column's filter button.
      const filterBtn = t.closest<HTMLElement>('.filter-btn');
      if (filterBtn) {
        e.preventDefault();
        void this.filterColumn(Number(filterBtn.dataset.filterCol));
        return;
      }
      if (t.classList.contains('fill-handle')) {
        e.preventDefault();
        this.commitEdit();
        const from = this.range();
        this.filling = { from, to: from };
        return;
      }
      const td = t.closest('td');
      if (td?.dataset.r) {
        e.preventDefault();
        this.commitEdit();
        this.viewport.focus();
        this.select(Number(td.dataset.r), Number(td.dataset.c), e.shiftKey);
        this.dragging = true;
        return;
      }
      const th = t.closest('th');
      if (th?.dataset.col) {
        e.preventDefault();
        const c = Number(th.dataset.col);
        this.anchor = { row: 0, col: e.shiftKey ? this.anchor.col : c };
        this.focusCell = { row: this.nRows - 1, col: c };
        this.renderSelection();
        this.viewport.focus();
      } else if (th?.dataset.row) {
        e.preventDefault();
        const r = Number(th.dataset.row);
        this.anchor = { row: e.shiftKey ? this.anchor.row : r, col: 0 };
        this.focusCell = { row: r, col: this.nCols - 1 };
        this.renderSelection();
        this.viewport.focus();
      }
    });
    this.viewport.addEventListener('mousemove', (e) => {
      if (this.filling && e.buttons & 1) {
        const td = (e.target as HTMLElement).closest('td');
        if (td?.dataset.r) {
          this.filling.to = fillTarget(this.filling.from, Number(td.dataset.r), Number(td.dataset.c));
          this.renderFillPreview();
        }
        return;
      }
      if (!this.dragging || !(e.buttons & 1)) return;
      const td = (e.target as HTMLElement).closest('td');
      if (td?.dataset.r) {
        this.focusCell = { row: Number(td.dataset.r), col: Number(td.dataset.c) };
        this.renderSelection();
      }
    });
    window.addEventListener('mouseup', () => {
      this.dragging = false;
      if (!this.filling) return;
      const { from, to } = this.filling;
      this.filling = undefined;
      this.renderFillPreview();
      this.fill(from, to);
    });
    this.viewport.addEventListener('dblclick', (e) => {
      // SHEET-027: a double click on the handle fills down as far as the data beside.
      if ((e.target as HTMLElement).classList.contains('fill-handle')) {
        const from = this.range();
        const end = fillDownEnd(this.wb, this.si, from);
        if (end > from.r2) this.fill(from, { ...from, r2: end });
        return;
      }
      if ((e.target as HTMLElement).closest('td')) this.startEdit();
    });
    this.viewport.addEventListener('copy', (e) => this.onCopy(e, false));
    this.viewport.addEventListener('cut', (e) => this.onCopy(e, true));
    this.viewport.addEventListener('paste', (e) => {
      if (e.target !== this.viewport || this.readOnly) return;
      const text = e.clipboardData?.getData('text/plain');
      if (!text) return;
      e.preventDefault();
      this.snapshot();
      const r = pasteText(this.wb, this.si, this.focusCell, text);
      this.anchor = { row: r.r1, col: r.c1 };
      this.focusCell = { row: r.r2, col: r.c2 };
      this.changed();
    });
    this.formulaInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.setActiveInput(this.formulaInput.value);
        this.formulaInput.blur();
        this.select(this.focusCell.row + 1, this.focusCell.col);
        this.viewport.focus();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.formulaInput.blur();
        this.renderSelection();
        this.viewport.focus();
      }
    });
  }

  // --- SHEET-027: filling ---------------------------------------------------------

  /** Fill `to` from `from`, continuing series, and select what was filled. */
  private fill(from: Range, to: Range, series = true): void {
    if (this.readOnly) return;
    this.snapshot();
    if (!fillRange(this.wb, this.si, from, to, { series })) {
      this.undoStack.pop();
      return;
    }
    this.anchor = { row: to.r1, col: to.c1 };
    this.focusCell = { row: to.r2, col: to.c2 };
    this.changed();
  }

  /** Ctrl+D / Ctrl+R: the first row (column) of the selection copied down (right) over the rest. */
  private fillSelection(direction: 'down' | 'right'): void {
    this.commitEdit();
    const r = this.range();
    if (direction === 'down' ? r.r1 === r.r2 : r.c1 === r.c2) return;
    const from = direction === 'down' ? { ...r, r2: r.r1 } : { ...r, c2: r.c1 };
    this.fill(from, r, false);
  }

  /** Fill a series from the selection: its filled cells are the start, the empty ones below (or right) are filled. */
  private fillSeries(): void {
    this.commitEdit();
    const r = this.range();
    const sheet = this.wb.sheets[this.si]!;
    const rowFilled = (row: number): boolean => {
      for (let c = r.c1; c <= r.c2; c++) if (sheet.cells.has(cellKey(row, c))) return true;
      return false;
    };
    const colFilled = (col: number): boolean => {
      for (let row = r.r1; row <= r.r2; row++) if (sheet.cells.has(cellKey(row, col))) return true;
      return false;
    };
    if (r.r2 > r.r1 || r.c1 === r.c2) {
      let last = r.r1;
      while (last < r.r2 && rowFilled(last + 1)) last++;
      if (last < r.r2) this.fill({ ...r, r2: last }, r);
    } else {
      let last = r.c1;
      while (last < r.c2 && colFilled(last + 1)) last++;
      if (last < r.c2) this.fill({ ...r, c2: last }, r);
    }
  }

  private renderFillPreview(): void {
    for (const td of Array.from(this.table.querySelectorAll<HTMLElement>('td.fill-preview'))) td.classList.remove('fill-preview');
    if (!this.filling) return;
    const { to } = this.filling;
    for (let row = Math.max(to.r1, this.firstRow); row <= Math.min(to.r2, this.lastRow); row++) {
      for (let col = to.c1; col <= to.c2; col++) this.td(row, col)?.classList.add('fill-preview');
    }
  }

  commands(): import('../app/palette').PaletteCommand[] {
    const where = t('sheet.label');
    return [
      { label: t('sheet.fillDown'), keys: ['Ctrl+D'], where, run: () => this.fillSelection('down') },
      { label: t('sheet.fillRight'), keys: ['Ctrl+R'], where, run: () => this.fillSelection('right') },
      { label: t('sheet.fillSeries'), where, run: () => this.fillSeries() },
    ];
  }

  private onCopy(e: ClipboardEvent, cut: boolean): void {
    if (e.target !== this.viewport || !e.clipboardData) return;
    e.preventDefault();
    e.clipboardData.setData('text/plain', copyRange(this.wb, this.si, this.calc, this.range()));
    if (cut && !this.readOnly) {
      this.snapshot();
      clearRange(this.wb, this.si, this.range());
      this.changed();
    }
  }
}
