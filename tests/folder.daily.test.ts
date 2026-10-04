import { beforeEach, describe, expect, it } from 'vitest';
import { dailyPath, dailyText, dateOfNote, DEFAULT_DAILY, fillTemplate, formatDate, isoWeek, loadDailySettings, saveDailySettings } from '../src/folder/daily';

// FOLDER-027: daily notes.

const day = new Date(2026, 9, 4, 9, 5); // Sunday 4 October 2026, 09:05

describe('FOLDER-027 daily notes', () => {
  beforeEach(() => localStorage.clear());

  it('writes a date in a format', () => {
    expect(formatDate(day, 'YYYY-MM-DD')).toBe('2026-10-04');
    expect(formatDate(day, 'YY/M/D')).toBe('26/10/4');
    expect(formatDate(day, 'YYYY/MM/YYYY-MM-DD')).toBe('2026/10/2026-10-04');
    expect(formatDate(day, 'dddd D MMMM YYYY', 'fr')).toBe('dimanche 4 octobre 2026');
    expect(formatDate(day, '[Week] ww, HH:mm')).toBe('Week 40, 09:05');
    expect(isoWeek(new Date(2027, 0, 1))).toBe(53);
  });

  it('names the note of a day, in its folder, a / making sub-folders', () => {
    expect(dailyPath(day, DEFAULT_DAILY)).toBe('2026-10-04.md');
    expect(dailyPath(day, { ...DEFAULT_DAILY, folder: '/Journal/', format: 'YYYY/MM/YYYY-MM-DD' })).toBe('Journal/2026/10/2026-10-04.md');
  });

  it('finds the day of a note again by its name', () => {
    expect(dateOfNote('2026-10-04.md', DEFAULT_DAILY)).toBe('2026-10-04');
    expect(dateOfNote('notes/2026-10-04.md', DEFAULT_DAILY)).toBeUndefined();
    expect(dateOfNote('Project.md', DEFAULT_DAILY)).toBeUndefined();
    expect(dateOfNote('2026-02-30.md', DEFAULT_DAILY)).toBeUndefined();
    const journal = { ...DEFAULT_DAILY, folder: 'Journal', format: 'YYYY/MM/[Day] DD.MM.YYYY' };
    expect(dateOfNote(dailyPath(day, journal), journal)).toBe('2026-10-04');
    const named = { ...DEFAULT_DAILY, format: 'dddd D MMMM YYYY' };
    expect(dateOfNote('dimanche 4 octobre 2026.md', named)).toBeUndefined(); // no month number: not a day it can read
    expect(dateOfNote('4.10.26.md', { ...DEFAULT_DAILY, format: 'D.M.YY' })).toBe('2026-10-04');
  });

  it('fills the template of a new daily note', () => {
    expect(fillTemplate('---\ndate: {{date:YYYY-MM-DD}}\n---\n# {{title}}\n\nAt {{time}}', day, '2026-10-04', DEFAULT_DAILY)).toMatch(/^---\ndate: 2026-10-04\n---\n# 2026-10-04\n\nAt \d\d:\d\d$/);
    expect(dailyText(day, { ...DEFAULT_DAILY, format: 'YYYY/MM/DD' }, undefined)).toBe('# 04\n\n');
    expect(dailyText(day, DEFAULT_DAILY, '# {{ date }}')).toBe('# 2026-10-04');
  });

  it('keeps its settings', () => {
    expect(loadDailySettings()).toEqual(DEFAULT_DAILY);
    saveDailySettings({ format: 'DD.MM.YYYY', folder: ' Journal/ ', template: 'Templates/Day.md' });
    expect(loadDailySettings()).toEqual({ format: 'DD.MM.YYYY', folder: 'Journal', template: 'Templates/Day.md' });
  });
});
