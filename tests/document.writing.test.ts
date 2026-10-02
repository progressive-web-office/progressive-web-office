import { beforeEach, describe, expect, it } from 'vitest';
import { addWritten, lastDays, loadGoal, saveGoal } from '../src/document/writing-stats';

describe('DOC-034 writing goals and statistics', () => {
  beforeEach(() => localStorage.clear());
  it('adds the words written each day and lists the last days', () => {
    addWritten(120, '2026-10-01');
    addWritten(30, '2026-10-02');
    addWritten(-50, '2026-10-02');
    addWritten(20, '2026-10-02');
    expect(lastDays(3, new Date(2026, 9, 2))).toEqual([
      { day: '2026-09-30', words: 0 },
      { day: '2026-10-01', words: 120 },
      { day: '2026-10-02', words: 50 },
    ]);
  });
  it('keeps a word goal per document', () => {
    saveGoal('Thesis', 5000);
    expect(loadGoal('Thesis')).toBe(5000);
    saveGoal('Thesis', undefined);
    expect(loadGoal('Thesis')).toBeUndefined();
  });
});
