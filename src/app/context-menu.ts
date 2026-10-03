/**
 * Context menus (UI-021): opened by a right click, by a long press on a touch
 * screen, or by a button. On a narrow screen the menu is a sheet at the
 * bottom of the screen, with large targets.
 */
import { h } from './dom';

export interface MenuAction {
  label: string;
  /** A symbol shown before the label. */
  icon?: string;
  /** A keyboard shortcut shown after the label. */
  shortcut?: string;
  disabled?: boolean;
  run(): unknown;
}

/** A custom element (e.g. a picker); `close` closes the menu. */
export interface MenuWidget {
  widget(close: () => void): HTMLElement;
}

/** A section: a title, then its entries. */
export interface MenuSection {
  title: string;
}

export type MenuEntry = MenuAction | MenuWidget | MenuSection | 'separator';

const isAction = (e: MenuEntry): e is MenuAction => typeof e === 'object' && 'run' in e;
const isWidget = (e: MenuEntry): e is MenuWidget => typeof e === 'object' && 'widget' in e;

let open: { menu: HTMLElement; close: (focusBack: boolean) => void } | undefined;

/** Close the open menu, if any. */
export function closeContextMenu(): void {
  open?.close(false);
}

/** The menu that is open, if any. */
export const openContextMenuElement = (): HTMLElement | undefined => open?.menu;

/**
 * Show a menu at (x, y) (viewport coordinates). The focus goes to its first
 * entry, and back to `returnFocus` when it closes with Escape.
 */
export function openContextMenu(x: number, y: number, entries: MenuEntry[], opts: { label: string; returnFocus?: HTMLElement | null }): HTMLElement {
  closeContextMenu();
  const doc = document;
  // Separators and section titles only where entries follow them.
  const shown: MenuEntry[] = [];
  entries.forEach((e, i) => {
    if (isAction(e) || isWidget(e)) return void shown.push(e);
    const next = entries.slice(i + 1).find((n) => isAction(n) || isWidget(n) || (e === 'separator' ? false : n !== 'separator'));
    if (!next || !(isAction(next) || isWidget(next))) return;
    if (e === 'separator' && (!shown.length || shown[shown.length - 1] === 'separator')) return;
    shown.push(e);
  });
  const menu = h('div', { class: 'context-menu', role: 'menu', 'aria-label': opts.label });
  const sheet = typeof matchMedia === 'function' && matchMedia('(max-width: 600px), (pointer: coarse) and (max-width: 900px)').matches;
  if (sheet) menu.classList.add('sheet');
  const close = (focusBack: boolean): void => {
    if (open?.menu !== menu) return;
    open = undefined;
    menu.remove();
    backdrop?.remove();
    doc.removeEventListener('pointerdown', outside, true);
    removeEventListener('blur', blur);
    removeEventListener('resize', blur);
    if (focusBack) opts.returnFocus?.focus();
  };
  const items: HTMLElement[] = [];
  for (const e of shown) {
    if (e === 'separator') menu.append(h('div', { class: 'context-menu-sep', role: 'separator' }));
    else if (isAction(e)) {
      const item = h(
        'button',
        { type: 'button', class: 'context-menu-item', role: 'menuitem' },
        h('span', { class: 'context-menu-icon', 'aria-hidden': 'true' }, e.icon ?? ''),
        h('span', { class: 'context-menu-label' }, e.label),
        e.shortcut ? h('span', { class: 'context-menu-shortcut' }, e.shortcut) : '',
      ) as HTMLButtonElement;
      item.disabled = !!e.disabled;
      // The editor keeps its selection: the menu takes no focus from a mouse press.
      item.addEventListener('mousedown', (ev) => ev.preventDefault());
      item.addEventListener('click', () => {
        close(false);
        void e.run();
      });
      if (!e.disabled) items.push(item);
      menu.append(item);
    } else if (isWidget(e)) menu.append(e.widget(() => close(false)));
    else menu.append(h('div', { class: 'context-menu-title', role: 'presentation' }, e.title));
  }
  menu.addEventListener('keydown', (ev) => {
    const at = items.indexOf(doc.activeElement as HTMLElement);
    const go = (i: number): void => {
      ev.preventDefault();
      items[(i + items.length) % items.length]?.focus();
    };
    if (ev.key === 'ArrowDown') go(at + 1);
    else if (ev.key === 'ArrowUp') go(at < 0 ? items.length - 1 : at - 1);
    else if (ev.key === 'Home') go(0);
    else if (ev.key === 'End') go(items.length - 1);
    else if (ev.key === 'Escape' || ev.key === 'Tab') {
      ev.preventDefault();
      close(true);
    }
  });
  const backdrop = sheet ? h('div', { class: 'context-menu-backdrop' }) : undefined;
  if (backdrop) {
    backdrop.addEventListener('click', () => close(true));
    doc.body.append(backdrop);
  }
  doc.body.append(menu);
  if (!sheet) {
    // Inside the window, flipped when there is no room on the right or below.
    const { width, height } = menu.getBoundingClientRect();
    const left = x + width > innerWidth - 4 ? Math.max(4, x - width) : x;
    const top = y + height > innerHeight - 4 ? Math.max(4, y - height) : y;
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }
  const outside = (ev: Event): void => {
    if (!menu.contains(ev.target as Node) && ev.target !== backdrop) close(false);
  };
  const blur = (): void => close(false);
  // Not the press that opened the menu.
  setTimeout(() => {
    doc.addEventListener('pointerdown', outside, true);
    addEventListener('blur', blur);
    addEventListener('resize', blur);
  });
  open = { menu, close };
  (items[0] as HTMLElement | undefined)?.focus({ preventScroll: true });
  return menu;
}

/** How long a finger stays still to open the menu (ms), and how far it may move (px). */
export const LONG_PRESS_MS = 550;
const SLOP = 10;

/**
 * Call `show` on a right click (or the context-menu key) and on a long press
 * of a finger; `show` returns false to leave the browser's own menu.
 */
export function onContextMenu(el: HTMLElement, show: (x: number, y: number, target: HTMLElement) => boolean): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let start: { x: number; y: number } | undefined;
  let shownAt = 0;
  const cancel = (): void => {
    clearTimeout(timer);
    timer = undefined;
    start = undefined;
  };
  const contextmenu = (e: MouseEvent): void => {
    // A long press already showed it (some browsers fire contextmenu as well).
    if (Date.now() - shownAt < 1000) return void e.preventDefault();
    const fromKey = e.button !== 2 && e.clientX === 0 && e.clientY === 0;
    const target = e.target as HTMLElement;
    let { clientX: x, clientY: y } = e;
    if (fromKey) {
      // The context-menu key: at the caret.
      const r = window.getSelection()?.rangeCount ? window.getSelection()!.getRangeAt(0).getBoundingClientRect() : target.getBoundingClientRect();
      x = r.left;
      y = r.bottom;
    }
    if (show(x, y, target)) e.preventDefault();
  };
  const touchstart = (e: TouchEvent): void => {
    if (e.touches.length !== 1) return cancel();
    const t = e.touches[0]!;
    start = { x: t.clientX, y: t.clientY };
    const target = e.target as HTMLElement;
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      if (!start) return;
      if (show(start.x, start.y, target)) shownAt = Date.now();
    }, LONG_PRESS_MS);
  };
  const touchmove = (e: TouchEvent): void => {
    const t = e.touches[0];
    if (start && t && Math.hypot(t.clientX - start.x, t.clientY - start.y) > SLOP) cancel();
  };
  el.addEventListener('contextmenu', contextmenu);
  el.addEventListener('touchstart', touchstart, { passive: true });
  el.addEventListener('touchmove', touchmove, { passive: true });
  el.addEventListener('touchend', cancel);
  el.addEventListener('touchcancel', cancel);
  return () => {
    cancel();
    el.removeEventListener('contextmenu', contextmenu);
    el.removeEventListener('touchstart', touchstart);
    el.removeEventListener('touchmove', touchmove);
    el.removeEventListener('touchend', cancel);
    el.removeEventListener('touchcancel', cancel);
  };
}

/** A grid to pick the size of a table: rows × columns. */
export function tableSizePicker(label: (rows: number, cols: number) => string, pick: (rows: number, cols: number) => void, max = 8): MenuWidget {
  return {
    widget(close) {
      const caption = h('div', { class: 'table-picker-caption', 'aria-live': 'polite' }, label(3, 3));
      const grid = h('div', { class: 'table-picker', role: 'grid', 'aria-label': label(max, max) });
      const cells: HTMLButtonElement[] = [];
      const mark = (r: number, c: number): void => {
        for (const b of cells) b.classList.toggle('on', Number(b.dataset.r) <= r && Number(b.dataset.c) <= c);
        caption.textContent = label(r, c);
      };
      for (let r = 1; r <= max; r++) {
        for (let c = 1; c <= max; c++) {
          const b = h('button', { type: 'button', class: 'table-picker-cell', 'aria-label': label(r, c), 'data-r': String(r), 'data-c': String(c) }) as HTMLButtonElement;
          b.addEventListener('pointerenter', () => mark(r, c));
          b.addEventListener('focus', () => mark(r, c));
          b.addEventListener('mousedown', (e) => e.preventDefault());
          b.addEventListener('click', () => {
            close();
            pick(r, c);
          });
          cells.push(b);
          grid.append(b);
        }
      }
      grid.style.gridTemplateColumns = `repeat(${max}, 1fr)`;
      mark(3, 3);
      return h('div', { class: 'table-picker-box' }, grid, caption);
    },
  };
}
