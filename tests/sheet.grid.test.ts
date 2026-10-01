import { afterEach, describe, expect, it, vi } from 'vitest';
import { SheetEditor } from '../src/sheet/grid';
import { getCell, newWorkbook, setInput } from '../src/sheet/model';
import { readWorkbook } from '../src/sheet/io';

const ctx = () => ({ changed: vi.fn(), statusChanged: vi.fn(), choose: vi.fn() });
let ed: SheetEditor | undefined;
afterEach(() => {
  ed?.destroy();
  ed?.element.remove();
});

function mount(cells: Record<string, string> = {}) {
  const wb = newWorkbook();
  for (const [ref, v] of Object.entries(cells)) setInput(wb.sheets[0]!, ref, v);
  const c = ctx();
  ed = new SheetEditor(wb, c, 'xlsx');
  document.body.append(ed.element);
  ed.mounted();
  return { wb, c, ed };
}
const key = (el: Element, k: string, extra: KeyboardEventInit = {}) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }));

describe('SHEET-004 grid editor', () => {
  it('renders computed values with column and row headers', () => {
    const { ed } = mount({ A1: '2', B1: '=A1*21', A2: 'hello' });
    const grid = ed.element.querySelector('.grid')!;
    expect(grid.querySelector('th[data-col="1"]')?.textContent).toBe('B');
    expect(grid.querySelector('td[data-r="0"][data-c="1"]')?.textContent).toBe('42');
    expect(grid.querySelector('td[data-r="1"][data-c="0"]')?.textContent).toBe('hello');
    expect(grid.querySelector('td[data-r="0"][data-c="1"]')?.classList.contains('num')).toBe(true);
  });

  it('edits through the formula bar and recalculates dependants (SHEET-007)', () => {
    const { ed, wb, c } = mount({ A1: '2', B1: '=A1*21' });
    const bar = ed.element.querySelector<HTMLInputElement>('.formula-input')!;
    expect(bar.value).toBe('2');
    bar.value = '3';
    key(bar, 'Enter');
    expect(getCell(wb.sheets[0]!, 'A1')).toEqual({ value: 3 });
    expect(ed.element.querySelector('td[data-r="0"][data-c="1"]')?.textContent).toBe('63');
    expect(c.changed).toHaveBeenCalled();
    expect(ed.element.querySelector('.name-box')?.textContent).toBe('A2');
  });

  it('SHEET-005 navigates with arrows, Tab and Enter; typing starts editing', () => {
    const { ed, wb } = mount();
    const vp = ed.element.querySelector<HTMLElement>('.grid-viewport')!;
    key(vp, 'ArrowRight');
    key(vp, 'ArrowDown');
    expect(ed.element.querySelector('.name-box')?.textContent).toBe('B2');
    key(vp, 'Tab');
    expect(ed.element.querySelector('.name-box')?.textContent).toBe('C2');
    key(vp, 'Tab', { shiftKey: true });
    key(vp, '7');
    const input = ed.element.querySelector<HTMLInputElement>('.cell-input')!;
    expect(input.value).toBe('7');
    key(input, 'Enter');
    expect(getCell(wb.sheets[0]!, 'B2')).toEqual({ value: 7 });
    expect(ed.element.querySelector('.name-box')?.textContent).toBe('B3');
  });

  it('clears cells with Delete and supports undo / redo', () => {
    const { ed, wb } = mount({ A1: 'x' });
    const vp = ed.element.querySelector<HTMLElement>('.grid-viewport')!;
    key(vp, 'Delete');
    expect(getCell(wb.sheets[0]!, 'A1')).toBeUndefined();
    key(vp, 'z', { ctrlKey: true });
    expect(getCell(wb.sheets[0]!, 'A1')).toEqual({ value: 'x' });
    key(vp, 'y', { ctrlKey: true });
    expect(getCell(wb.sheets[0]!, 'A1')).toBeUndefined();
  });

  it('SHEET-010 adds and switches sheets through tabs', () => {
    const { ed, wb } = mount();
    ed.element.querySelector<HTMLButtonElement>('.sheet-add')!.click();
    expect(wb.sheets).toHaveLength(2);
    expect(ed.element.querySelector('.sheet-tab[aria-selected="true"]')?.textContent).toContain('Sheet2');
  });

  it('shows the sum of the selection in the status', () => {
    const { ed } = mount({ A1: '1', A2: '2' });
    const vp = ed.element.querySelector<HTMLElement>('.grid-viewport')!;
    key(vp, 'ArrowDown', { shiftKey: true });
    expect(ed.status()).toContain('Sum: 3');
  });

  it('saves the active sheet as CSV', () => {
    const { ed } = mount({ A1: '1', B1: '=A1+1' });
    const back = readWorkbook('csv', ed.save('csv'), 'x.csv');
    expect(getCell(back.sheets[0]!, 'B1')).toEqual({ value: 2 });
  });
});
