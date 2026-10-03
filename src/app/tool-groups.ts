/**
 * Toolbars in groups (UI-020): the most used tools stay in sight, the others
 * are grouped in menus that open below their button (Format, Paragraph,
 * Insert…), so that a toolbar takes one line. "Full toolbars" in the
 * settings shows every tool, as before.
 */
import { h } from './dom';

export type ToolbarMode = 'compact' | 'full';
const KEY = 'pwo.toolbar';

export function loadToolbarMode(): ToolbarMode {
  try {
    return localStorage.getItem(KEY) === 'full' ? 'full' : 'compact';
  } catch {
    return 'compact';
  }
}

export function saveToolbarMode(mode: ToolbarMode): void {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* not kept */
  }
}

let open: { panel: HTMLElement; toggle: HTMLButtonElement } | null = null;

function close(): void {
  if (!open) return;
  open.panel.hidden = true;
  open.toggle.setAttribute('aria-expanded', 'false');
  open = null;
}

function place(panel: HTMLElement, toggle: HTMLElement): void {
  // Fixed, so that a toolbar scrolling sideways (phones) does not clip it.
  const r = toggle.getBoundingClientRect();
  panel.style.top = `${Math.round(r.bottom + 4)}px`;
  panel.style.left = `${Math.round(Math.max(8, Math.min(r.left, innerWidth - panel.offsetWidth - 8)))}px`;
}

let listening = false;
function listen(): void {
  if (listening) return;
  listening = true;
  document.addEventListener('pointerdown', (e) => {
    if (open && !open.panel.contains(e.target as Node) && !open.toggle.contains(e.target as Node)) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) {
      const toggle = open.toggle;
      close();
      toggle.focus();
    }
  });
  addEventListener('resize', close);
}

/**
 * A group of tools: a menu button (compact) or the tools themselves after a
 * separator (full). A button of the menu closes it once clicked; lists and
 * colour pickers keep it open until the user clicks elsewhere.
 */
export function toolGroup(label: string, icon: string, items: (HTMLElement | null | undefined | false)[], mode: ToolbarMode = loadToolbarMode()): HTMLElement {
  const tools = items.filter((x): x is HTMLElement => !!x);
  if (mode === 'full') return h('span', { class: 'tool-group-inline', role: 'group', 'aria-label': label }, h('span', { class: 'sep' }), ...tools);
  listen();
  const panel = h('div', { class: 'tool-group-panel', role: 'group', 'aria-label': label, hidden: '' }, ...tools);
  const toggle = h('button', { type: 'button', class: 'tool-group-toggle', 'aria-haspopup': 'true', 'aria-expanded': 'false', title: label }, h('span', { 'aria-hidden': 'true' }, icon), h('span', { class: 'tool-group-label' }, label), h('span', { class: 'tool-group-caret', 'aria-hidden': 'true' }, '▾')) as HTMLButtonElement;
  toggle.setAttribute('aria-label', label);
  toggle.addEventListener('click', () => {
    if (open?.panel === panel) return close();
    close();
    panel.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    open = { panel, toggle };
    place(panel, toggle);
  });
  panel.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('button')) setTimeout(close);
  });
  return h('div', { class: 'tool-group' }, toggle, panel);
}
