import { describe, expect, it } from 'vitest';
import { formatOpenedAt } from '../src/app/recent-ui';

describe('FILE-008 recent files show when they were opened', () => {
  const ts = Date.UTC(2026, 9, 1, 14, 5);

  it('includes the date and the time, in the interface language', () => {
    expect(formatOpenedAt(ts, 'fr', 'UTC')).toBe('01/10/2026 14:05');
    expect(formatOpenedAt(ts, 'en', 'UTC')).toBe('10/1/26, 2:05 PM');
    expect(formatOpenedAt(ts, 'zh', 'UTC')).toMatch(/^2026\/10\/1 14:05$/);
  });
});
