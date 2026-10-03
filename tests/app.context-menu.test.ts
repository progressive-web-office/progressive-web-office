import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeContextMenu, LONG_PRESS_MS, onContextMenu, openContextMenu, tableSizePicker } from '../src/app/context-menu';

afterEach(() => {
  closeContextMenu();
  vi.useRealTimers();
});

describe('UI-021 context menus', () => {
  it('shows actions with sections, leaving out empty sections and stray separators', () => {
    const run = vi.fn();
    const menu = openContextMenu(10, 10, ['separator', { title: 'Empty' }, { title: 'Edit' }, { label: 'Copy', run, shortcut: 'Ctrl+C' }, 'separator', 'separator', { label: 'Paste', run, disabled: true }, 'separator'], { label: 'Menu' });
    expect(menu.getAttribute('role')).toBe('menu');
    expect([...menu.children].map((c) => c.className)).toEqual(['context-menu-title', 'context-menu-item', 'context-menu-sep', 'context-menu-item']);
    expect(menu.querySelector('.context-menu-shortcut')?.textContent).toBe('Ctrl+C');
    expect(document.activeElement?.textContent).toContain('Copy');
    (menu.querySelector('.context-menu-item') as HTMLButtonElement).click();
    expect(run).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.context-menu')).toBeNull();
  });

  it('moves with the arrow keys and closes with Escape, giving the focus back', () => {
    const back = document.body.appendChild(document.createElement('button'));
    const menu = openContextMenu(0, 0, [{ label: 'A', run: () => undefined }, { label: 'B', run: () => undefined }], { label: 'Menu', returnFocus: back });
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement?.textContent).toContain('B');
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement?.textContent).toContain('A');
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('.context-menu')).toBeNull();
    expect(document.activeElement).toBe(back);
  });

  it('opens on a right click and on a long press, not on a short tap or a moving finger', () => {
    vi.useFakeTimers();
    const el = document.body.appendChild(document.createElement('div'));
    const show = vi.fn(() => true);
    onContextMenu(el, show);
    const right = new MouseEvent('contextmenu', { clientX: 5, clientY: 6, button: 2, bubbles: true, cancelable: true });
    el.dispatchEvent(right);
    expect(show).toHaveBeenCalledWith(5, 6, el);
    expect(right.defaultPrevented).toBe(true);
    const touch = (type: string, x: number, y: number): void => {
      const e = new Event(type, { bubbles: true }) as TouchEvent;
      Object.defineProperty(e, 'touches', { value: type === 'touchend' ? [] : [{ clientX: x, clientY: y }] });
      el.dispatchEvent(e);
    };
    show.mockClear();
    touch('touchstart', 20, 20);
    vi.advanceTimersByTime(100);
    touch('touchend', 20, 20);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(show).not.toHaveBeenCalled();
    touch('touchstart', 20, 20);
    touch('touchmove', 60, 20);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(show).not.toHaveBeenCalled();
    touch('touchstart', 30, 40);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(show).toHaveBeenCalledWith(30, 40, el);
    // The contextmenu event some browsers fire after a long press does not open it twice.
    el.dispatchEvent(new MouseEvent('contextmenu', { clientX: 30, clientY: 40, button: 2, bubbles: true, cancelable: true }));
    expect(show).toHaveBeenCalledTimes(1);
  });

  it('picks the size of a table in a grid', () => {
    const pick = vi.fn();
    const menu = openContextMenu(0, 0, [tableSizePicker((r, c) => `${r} × ${c}`, pick, 5)], { label: 'Menu' });
    const cells = menu.querySelectorAll<HTMLButtonElement>('.table-picker-cell');
    expect(cells).toHaveLength(25);
    cells[2 * 5 + 3]!.dispatchEvent(new Event('pointerenter'));
    expect(menu.querySelector('.table-picker-caption')?.textContent).toBe('3 × 4');
    expect(menu.querySelectorAll('.table-picker-cell.on')).toHaveLength(12);
    cells[2 * 5 + 3]!.click();
    expect(pick).toHaveBeenCalledWith(3, 4);
  });
});
