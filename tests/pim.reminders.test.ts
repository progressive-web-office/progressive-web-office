import { describe, expect, it } from 'vitest';
import { dueReminders, ReminderClock, type Due } from '../src/pim/reminders';
import type { CalEvent } from '../src/pim/ical';

// NOTIF-001: the reminders of the events, notified once while the application is open.

const at = (s: string) => new Date(s).getTime();
const events: { path: string; item: CalEvent }[] = [
  { path: 'Events/review.md', item: { uid: 'r', title: 'Review', start: '2026-10-06T14:00', allDay: false, reminders: [10, 60] } },
  { path: 'Events/standup.md', item: { uid: 's', title: 'Stand-up', start: '2026-10-05T09:00', allDay: false, recurrence: 'FREQ=DAILY', reminders: [5] } },
  { path: 'Events/holiday.md', item: { uid: 'h', title: 'Holiday', start: '2026-10-07', end: '2026-10-08', allDay: true, reminders: [1440] } },
  { path: 'Events/none.md', item: { uid: 'n', title: 'No reminder', start: '2026-10-06T13:00', allDay: false } },
];

describe('NOTIF-001 reminders', () => {
  it('finds the reminders due in a window, repeated events and whole days included', () => {
    const due = dueReminders(events, at('2026-10-06T08:00'), at('2026-10-06T14:00'));
    expect(due.map((d) => [d.title, d.start, d.minutes, new Date(d.at).toTimeString().slice(0, 5)])).toEqual([
      ['Stand-up', '2026-10-06T09:00', 5, '08:55'],
      ['Holiday', '2026-10-07', 1440, '09:00'],
      ['Review', '2026-10-06T14:00', 60, '13:00'],
      ['Review', '2026-10-06T14:00', 10, '13:50'],
    ]);
  });

  it('tells each reminder once, as the time goes on, and not those missed long ago', async () => {
    let now = at('2026-10-06T13:45');
    const told: Due[] = [];
    let reads = 0;
    const clock = new ReminderClock(async () => (reads++, events), (d) => told.push(d), () => now, 10 * 60_000);
    clock.start(60_000);
    clock.stop();
    await clock.tick();
    // 13:00 was missed by less than an hour: told; nothing else yet.
    expect(told.map((d) => d.minutes)).toEqual([60]);
    now = at('2026-10-06T13:51');
    await clock.tick();
    await clock.tick();
    expect(told.map((d) => d.minutes)).toEqual([60, 10]);
    expect(reads).toBe(1);
    clock.invalidate();
    await clock.tick();
    expect(reads).toBe(2);
    // Hours later (a computer asleep): only the last hour.
    now = at('2026-10-07T09:00');
    await clock.tick();
    expect(told.map((d) => d.title)).toEqual(['Review', 'Review', 'Stand-up']);
  });
});
