/**
 * Font size field (UI-016): any size can be typed, common ones are offered
 * as suggestions, and the arrow keys step through them (and beyond the last
 * one, by 20 %).
 */
import { h } from './dom';

export const MIN_FONT_SIZE = 1;
export const MAX_FONT_SIZE = 999;

/** A typed size in points ("12", "10,5", "200 pt"), clamped and rounded to the half point; null when unreadable. */
export function parseFontSize(text: string): number | null {
  const m = /^\s*(\d+(?:[.,]\d*)?|[.,]\d+)\s*(?:pt)?\s*$/i.exec(text);
  if (!m) return null;
  const n = Number(m[1]!.replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(n * 2) / 2));
}

export interface SizeInput {
  readonly element: HTMLElement;
  /** Show the size of the selection; undefined for a mixed selection. */
  set(size: number | undefined): void;
}

let ids = 0;

export function sizeInput(opts: { label: string; suggestions: number[]; onChange: (size: number) => void; className?: string }): SizeInput {
  const listId = `font-sizes-${++ids}`;
  const field = h('input', {
    type: 'text',
    inputmode: 'decimal',
    list: listId,
    'aria-label': opts.label,
    title: opts.label,
    class: `size-input ${opts.className ?? ''}`.trim(),
    autocomplete: 'off',
    spellcheck: 'false',
  });
  const list = h('datalist', { id: listId }, ...opts.suggestions.map((n) => h('option', { value: String(n) })));
  let current: number | undefined;
  const show = (): void => {
    field.value = current === undefined ? '' : String(current);
  };
  const apply = (size: number): void => {
    current = size;
    show();
    opts.onChange(size);
  };
  const commit = (): void => {
    const size = parseFontSize(field.value);
    if (size === null) return show();
    if (size !== current) apply(size);
    else show();
  };
  const step = (dir: 1 | -1): number => {
    const from = parseFontSize(field.value) ?? current ?? opts.suggestions[0] ?? 12;
    const sorted = [...opts.suggestions].sort((a, b) => a - b);
    const next = dir > 0 ? sorted.find((n) => n > from) : [...sorted].reverse().find((n) => n < from);
    if (next !== undefined) return next;
    const scaled = dir > 0 ? Math.round(from * 1.2) : Math.round(from / 1.2);
    return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, scaled === from ? from + dir : scaled));
  };
  field.addEventListener('change', commit);
  field.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      show();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      apply(step(e.key === 'ArrowUp' ? 1 : -1));
    }
  });
  field.addEventListener('focus', () => field.select());
  return {
    element: h('span', { class: 'size-field' }, field, list),
    set(size) {
      current = size;
      if (document.activeElement !== field) show();
    },
  };
}
