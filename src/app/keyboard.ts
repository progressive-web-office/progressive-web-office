/**
 * UI-022: on a phone, the on-screen keyboard covers the bottom of the screen
 * without the page getting smaller (always on iOS, and in browsers that only
 * resize the visible part): the floating buttons are raised above it, from
 * the size of the visible part of the screen (Visual Viewport API).
 */

/** Below this, a difference is the browser's bars, not a keyboard. */
const MIN_KEYBOARD = 60;

export function keyboardInset(v: { innerHeight: number; height: number; offsetTop: number; scale: number }): number {
  // Zoomed in: the visible part is smaller, but no keyboard.
  if (v.scale > 1.01) return 0;
  const hidden = Math.round(v.innerHeight - v.height - v.offsetTop);
  return hidden >= MIN_KEYBOARD ? hidden : 0;
}

/** Keep `--keyboard-inset` (and the `keyboard-open` class) on `root` up to date. */
export function followKeyboard(win: Window = window, root: HTMLElement = document.documentElement): void {
  const vv = win.visualViewport;
  if (!vv) return;
  const update = (): void => {
    const inset = keyboardInset({ innerHeight: win.innerHeight, height: vv.height, offsetTop: vv.offsetTop, scale: vv.scale });
    root.style.setProperty('--keyboard-inset', `${inset}px`);
    root.classList.toggle('keyboard-open', inset > 0);
  };
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  update();
}
