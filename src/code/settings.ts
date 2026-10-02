/** How code cells react to each other (CODE-014), kept in this browser. */
import type { Reactivity } from './reactive';

const KEY = 'pwo.code.reactivity';
export const REACTIVITY: Reactivity[] = ['lazy', 'auto', 'off'];

export function loadReactivity(): Reactivity {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'off' || v === 'auto' || v === 'lazy' ? v : 'lazy';
  } catch {
    return 'lazy';
  }
}

export function saveReactivity(mode: Reactivity): void {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* not kept */
  }
}
