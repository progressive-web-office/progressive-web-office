import { describe, expect, it } from 'vitest';
import { keyboardInset, followKeyboard } from '../src/app/keyboard';

describe('UI-022 the floating buttons above the on-screen keyboard', () => {
  it('measures the height the keyboard hides at the bottom of the screen', () => {
    expect(keyboardInset({ innerHeight: 800, height: 800, offsetTop: 0, scale: 1 })).toBe(0);
    expect(keyboardInset({ innerHeight: 800, height: 480, offsetTop: 0, scale: 1 })).toBe(320);
    // The page scrolled up inside the visible part.
    expect(keyboardInset({ innerHeight: 800, height: 480, offsetTop: 100, scale: 1 })).toBe(220);
    // Zoomed in with two fingers: not a keyboard.
    expect(keyboardInset({ innerHeight: 800, height: 400, offsetTop: 0, scale: 2 })).toBe(0);
    // A few pixels (browser bars): nothing.
    expect(keyboardInset({ innerHeight: 800, height: 790, offsetTop: 0, scale: 1 })).toBe(0);
  });

  it('keeps the inset in a CSS variable as the visible part of the screen changes', () => {
    const listeners: Record<string, () => void> = {};
    const vv = { height: 800, offsetTop: 0, scale: 1, addEventListener: (type: string, fn: () => void) => void (listeners[type] = fn) };
    const win = { innerHeight: 800, visualViewport: vv } as unknown as Window;
    const root = document.createElement('div');
    followKeyboard(win, root);
    expect(root.style.getPropertyValue('--keyboard-inset')).toBe('0px');
    vv.height = 500;
    listeners.resize!();
    expect(root.style.getPropertyValue('--keyboard-inset')).toBe('300px');
    expect(root.classList.contains('keyboard-open')).toBe(true);
  });
});
