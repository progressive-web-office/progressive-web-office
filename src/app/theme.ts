/** Light / dark / system theme preference (UI-011). */

export type ThemePreference = 'system' | 'light' | 'dark';
export const THEMES: ThemePreference[] = ['system', 'light', 'dark'];

const KEY = 'pwo.theme';

export function loadTheme(): ThemePreference {
  try {
    const value = localStorage.getItem(KEY);
    return THEMES.includes(value as ThemePreference) ? (value as ThemePreference) : 'system';
  } catch {
    return 'system';
  }
}

export function saveTheme(theme: ThemePreference): void {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* storage unavailable: the choice lasts for this session */
  }
}

/** `data-theme` forces a theme; without it the CSS follows `prefers-color-scheme`. */
export function applyTheme(theme: ThemePreference, root: HTMLElement = document.documentElement): void {
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.dataset.theme = theme;
}

export function nextTheme(theme: ThemePreference): ThemePreference {
  return THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]!;
}
