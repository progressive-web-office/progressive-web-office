import { beforeEach, describe, expect, it } from 'vitest';
import { applyTheme, loadTheme, nextTheme, saveTheme } from '../src/app/theme';

describe('UI-011 light / dark / system theme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('follows the system by default and remembers the choice', () => {
    expect(loadTheme()).toBe('system');
    saveTheme('dark');
    expect(loadTheme()).toBe('dark');
    localStorage.setItem('pwo.theme', 'purple');
    expect(loadTheme()).toBe('system');
  });

  it('cycles system → light → dark → system', () => {
    expect(nextTheme('system')).toBe('light');
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('system');
  });

  it('forces a theme with data-theme and lets the system decide otherwise', () => {
    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    applyTheme('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    applyTheme('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
});
