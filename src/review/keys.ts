/**
 * Keyboard shortcuts shared by the review views of PDF files and text
 * documents (REVIEW-002): single keys, without modifiers, to read and comment.
 */

export type ReviewAction =
  | 'next'
  | 'prev'
  | 'first'
  | 'last'
  | 'zoomIn'
  | 'zoomOut'
  | 'fitWidth'
  | 'fitPage'
  | 'perRow1'
  | 'perRow2'
  | 'perRow3'
  | 'perRow4'
  | 'flow'
  | 'comment'
  | 'nextComment'
  | 'prevComment'
  | 'find'
  | 'fullscreen'
  | 'help';

/** The shortcuts, in the order of the help, with the keys shown for each. */
export const REVIEW_KEYS: readonly { action: ReviewAction; keys: string[] }[] = [
  { action: 'next', keys: ['k', 'n', 'Page Down', 'Space', '→'] },
  { action: 'prev', keys: ['j', 'p', 'Page Up', 'Shift+Space', '←'] },
  { action: 'first', keys: ['g', 'Home'] },
  { action: 'last', keys: ['G', 'End'] },
  { action: 'zoomIn', keys: ['+'] },
  { action: 'zoomOut', keys: ['-'] },
  { action: 'fitWidth', keys: ['w'] },
  { action: 'fitPage', keys: ['h', '0'] },
  { action: 'perRow1', keys: ['1'] },
  { action: 'perRow2', keys: ['2'] },
  { action: 'perRow3', keys: ['3'] },
  { action: 'perRow4', keys: ['4'] },
  { action: 'flow', keys: ['s'] },
  { action: 'comment', keys: ['c'] },
  { action: 'nextComment', keys: [']'] },
  { action: 'prevComment', keys: ['['] },
  { action: 'find', keys: ['/'] },
  { action: 'fullscreen', keys: ['f'] },
  { action: 'help', keys: ['?'] },
];

const SIMPLE: Record<string, ReviewAction> = {
  k: 'next',
  n: 'next',
  PageDown: 'next',
  ArrowRight: 'next',
  j: 'prev',
  p: 'prev',
  PageUp: 'prev',
  ArrowLeft: 'prev',
  g: 'first',
  Home: 'first',
  G: 'last',
  End: 'last',
  '+': 'zoomIn',
  '=': 'zoomIn',
  '-': 'zoomOut',
  w: 'fitWidth',
  h: 'fitPage',
  '0': 'fitPage',
  '1': 'perRow1',
  '2': 'perRow2',
  '3': 'perRow3',
  '4': 'perRow4',
  s: 'flow',
  c: 'comment',
  ']': 'nextComment',
  '[': 'prevComment',
  '/': 'find',
  f: 'fullscreen',
  '?': 'help',
};

export interface KeyLike {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

/** Palette commands for the review actions (UI-018, REVIEW-002). */
export function reviewCommands(label: (action: ReviewAction) => string, where: string, run: (action: ReviewAction) => void): { label: string; where: string; keys: string[]; run(): void }[] {
  return REVIEW_KEYS.map(({ action, keys }) => ({ label: label(action), where, keys: keys.slice(0, 2), run: () => run(action) }));
}

/** The review action of a key press, if any. */
export function reviewAction(e: KeyLike): ReviewAction | undefined {
  if (e.ctrlKey || e.metaKey || e.altKey) return undefined;
  if (e.key === ' ') return e.shiftKey ? 'prev' : 'next';
  return SIMPLE[e.key];
}

/** Whether a key press comes from a field where it is typed. */
export function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== 'function') return false;
  if (el.closest('input, textarea, select, [contenteditable="true"]:not(.reviewing)')) return true;
  return false;
}

/** The first page (1-based) of the spread of `perRow` pages showing `page`. */
export const spreadStart = (page: number, perRow: number): number => Math.floor((page - 1) / perRow) * perRow + 1;
