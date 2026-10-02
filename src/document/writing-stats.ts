/**
 * Writing goals and statistics (DOC-034): a word target per document and
 * the words written each day, kept by the browser.
 */

const STATS_KEY = 'pwo.writing.days';
const GOALS_KEY = 'pwo.writing.goals';

const read = <T>(key: string, fallback: T): T => {
  try {
    return (JSON.parse(localStorage.getItem(key) ?? 'null') as T) ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* not kept */
  }
};

export const today = (d = new Date()): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Words added to a document count for the day; deletions do not lower it. */
export function addWritten(words: number, day = today()): void {
  if (words <= 0) return;
  const days = read<Record<string, number>>(STATS_KEY, {});
  days[day] = (days[day] ?? 0) + words;
  // Keep a year.
  const keys = Object.keys(days).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - 366))) delete days[k];
  write(STATS_KEY, days);
}

/** Words written on each of the last `n` days, oldest first. */
export function lastDays(n: number, now = new Date()): { day: string; words: number }[] {
  const days = read<Record<string, number>>(STATS_KEY, {});
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (n - 1 - i));
    const key = today(d);
    return { day: key, words: days[key] ?? 0 };
  });
}

export const loadGoal = (doc: string): number | undefined => read<Record<string, number>>(GOALS_KEY, {})[doc];

export function saveGoal(doc: string, words: number | undefined): void {
  const goals = read<Record<string, number>>(GOALS_KEY, {});
  if (words && words > 0) goals[doc] = Math.round(words);
  else delete goals[doc];
  write(GOALS_KEY, goals);
}
