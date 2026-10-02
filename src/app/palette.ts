/**
 * Command palette (UI-018): every button and menu entry of the screen,
 * found by typing part of its name (Ctrl+Shift+P).
 */
import { h } from './dom';
import { t } from '../i18n';

export interface PaletteCommand {
  label: string;
  /** Keyboard shortcuts doing the same (UI-018). */
  keys?: string[];
  /** Where it is (the toolbar or panel), shown beside the name. */
  where: string;
  run(): void;
}

const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Commands matching a query: every word of the query in the name, in any order; names starting with it first. */
export function filterCommands<T extends { label: string }>(commands: T[], query: string): T[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return commands;
  const scored = commands
    .map((c) => {
      const name = fold(c.label);
      if (!words.every((w) => name.includes(w))) return undefined;
      return { c, score: (name.startsWith(words[0]!) ? 0 : 1) + name.length / 1000 };
    })
    .filter((x): x is { c: T; score: number } => !!x);
  return scored.sort((a, b) => a.score - b.score).map((x) => x.c);
}

const KEY = /^(?:(?:Ctrl|Alt|Shift|Cmd|⌘|Option|⌥|Mod)\+)*(?:[A-Za-z0-9]|F\d{1,2}|Esc|Enter|Space|Tab|Delete|Backspace|Home|End|Page (?:Up|Down)|[←→↑↓]|[^\sA-Za-z0-9().]{1,2})$/;

/**
 * A tooltip such as "Comment (Ctrl+Alt+M)" or "Next page (k)": the name and
 * the shortcuts in its last parentheses (before a `;` that explains them).
 */
export function splitShortcut(title: string): { label: string; keys: string[] } {
  const m = /^(.*\S)\s*\(([^()]*)\)\s*$/.exec(title);
  if (!m) return { label: title, keys: [] };
  const keys = m[2]!.split(';')[0]!.split(/\s*,\s*/).map((k) => k.trim());
  if (!keys.length || !keys.every((k) => KEY.test(k))) return { label: title, keys: [] };
  return { label: m[1]!, keys };
}

/** The buttons and select options shown in `root`, as commands. */
export function collectCommands(root: HTMLElement): PaletteCommand[] {
  const out: PaletteCommand[] = [];
  const seen = new Set<string>();
  const visible = (el: HTMLElement): boolean => !el.closest('[hidden], dialog, .palette') && (el.offsetParent !== null || el.getClientRects().length > 0);
  // The toolbar, panel or menu around the control (not the control itself).
  const whereOf = (el: HTMLElement): string => el.parentElement?.closest<HTMLElement>('[role=toolbar], aside, header, [aria-label]')?.getAttribute('aria-label') ?? '';
  for (const b of Array.from(root.querySelectorAll<HTMLButtonElement>('button'))) {
    if (b.disabled || !visible(b)) continue;
    const raw = (b.getAttribute('aria-label') || b.title || b.textContent || '').replace(/\s+/g, ' ').trim();
    // The shortcut is in the tooltip, the name in the label (or the tooltip).
    const fromTitle = splitShortcut(b.title.replace(/\s+/g, ' ').trim());
    const label = splitShortcut(raw).label;
    if (!label || label.length < 2) continue;
    const where = whereOf(b);
    const key = `${label}\u0000${where}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label, where, ...(fromTitle.keys.length ? { keys: fromTitle.keys } : {}), run: () => b.click() });
  }
  // Entries of menus such as "Save as…".
  for (const select of Array.from(root.querySelectorAll<HTMLSelectElement>('select'))) {
    if (select.disabled || !visible(select)) continue;
    const name = select.getAttribute('aria-label') ?? '';
    for (const option of Array.from(select.options)) {
      if (!option.value || option.disabled) continue;
      out.push({
        label: `${name}: ${option.textContent?.trim() ?? option.value}`,
        where: whereOf(select),
        run: () => {
          select.value = option.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        },
      });
    }
  }
  return out;
}

/** Show the palette; resolves when it is closed. */
export function openPalette(host: HTMLElement, commands: PaletteCommand[]): Promise<void> {
  return new Promise((resolve) => {
    const before = document.activeElement as HTMLElement | null;
    const input = h('input', { type: 'search', class: 'palette-input', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'palette-list', 'aria-label': t('palette.label'), placeholder: t('palette.placeholder'), autocomplete: 'off' });
    const list = h('ul', { id: 'palette-list', role: 'listbox', class: 'palette-list', 'aria-label': t('palette.label') });
    const dialog = h('dialog', { class: 'dialog palette', 'aria-label': t('palette.label') }, input, list);
    let shown: PaletteCommand[] = [];
    let active = 0;
    const render = (): void => {
      shown = filterCommands(commands, input.value).slice(0, 50);
      active = Math.min(active, Math.max(0, shown.length - 1));
      list.replaceChildren(
        ...(shown.length
          ? shown.map((c, i) => {
              const li = h('li', { role: 'option', id: `palette-${i}`, 'aria-selected': String(i === active), class: i === active ? 'active' : '' }, h('span', { class: 'palette-name' }, c.label), h('span', { class: 'palette-keys' }, ...(c.keys ?? []).map((k) => h('kbd', {}, k))), h('small', { class: 'palette-where' }, c.where));
              li.addEventListener('mousedown', (e) => e.preventDefault());
              li.addEventListener('click', () => run(i));
              return li;
            })
          : [h('li', { class: 'hint' }, t('palette.none'))]),
      );
      if (shown.length) input.setAttribute('aria-activedescendant', `palette-${active}`);
      else input.removeAttribute('aria-activedescendant');
      list.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
    };
    const close = (): void => {
      dialog.close();
      dialog.remove();
      resolve();
    };
    const run = (i: number): void => {
      const c = shown[i];
      close();
      before?.focus?.();
      c?.run();
    };
    input.addEventListener('input', () => {
      active = 0;
      render();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        active = (active + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % Math.max(1, shown.length);
        render();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        run(active);
      }
    });
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      close();
      before?.focus?.();
    });
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) close();
    });
    host.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    render();
    input.focus();
  });
}
