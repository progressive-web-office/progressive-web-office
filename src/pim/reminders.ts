/**
 * NOTIF-001: reminders of the events of the calendar, notified while the
 * application is open (in the background too): the events read again every
 * few minutes, the reminders due checked every half minute (timers of
 * pages in the background are slowed down, a check is not), each notified
 * once. Without a server, nothing is notified while the application is
 * closed (NOTIF-003).
 */
import { occurrences, type CalEvent } from './ical';

export interface Due {
  /** The same for the same reminder of the same occurrence: notified once. */
  key: string;
  title: string;
  /** The start of the occurrence, as events write it. */
  start: string;
  allDay: boolean;
  location?: string;
  /** When to notify (milliseconds). */
  at: number;
  minutes: number;
  path: string;
}

const pad = (n: number): string => String(n).padStart(2, '0');
const dayOf = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
/** Whole-day events are reminded of from 09:00 of their day. */
const startMs = (start: string): number => new Date(start.length > 10 ? start : `${start}T09:00`).getTime();

/** The reminders due in `[from, to)` (milliseconds), the earliest first. */
export function dueReminders(events: { path: string; item: CalEvent }[], from: number, to: number): Due[] {
  const out: Due[] = [];
  for (const { path, item } of events) {
    const reminders = item.reminders ?? [];
    if (!reminders.length) continue;
    const longest = Math.max(...reminders) * 60_000;
    // The occurrences whose reminders may fall in the window.
    for (const start of occurrences(item, dayOf(from - 86_400_000), dayOf(to + longest + 2 * 86_400_000))) {
      for (const minutes of reminders) {
        const at = startMs(start) - minutes * 60_000;
        if (at >= from && at < to) out.push({ key: `${item.uid}|${start}|${minutes}`, title: item.title, start, allDay: item.allDay, ...(item.location ? { location: item.location } : {}), at, minutes, path });
      }
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

export interface ReminderSettings {
  /** Notify the reminders (the browser's permission asked for). */
  enabled: boolean;
  /** The reminder of new events, in minutes before (none when undefined). */
  defaultMinutes?: number;
}

const KEY = 'pwo.reminders';

export function loadReminderSettings(): ReminderSettings {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<ReminderSettings>;
    return { enabled: s.enabled === true, ...(typeof s.defaultMinutes === 'number' ? { defaultMinutes: s.defaultMinutes } : {}) };
  } catch {
    return { enabled: false };
  }
}

export function saveReminderSettings(s: ReminderSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* not kept */
  }
}

export const REMINDER_CHOICES = [0, 5, 10, 15, 30, 60, 120, 1440];

/**
 * The clock of the reminders: `events()` read again every `reloadMs`, the
 * reminders due since the last check notified once by `notify`.
 */
export class ReminderClock {
  private events: { path: string; item: CalEvent }[] = [];
  private last = Date.now();
  private loaded = 0;
  private reading: Promise<void> = Promise.resolve();
  private readonly seen = new Set<string>();
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly read: () => Promise<{ path: string; item: CalEvent }[]>,
    private readonly notify: (due: Due) => void,
    private readonly now: () => number = Date.now,
    private readonly reloadMs = 5 * 60_000,
  ) {}

  start(everyMs = 30_000): void {
    this.stop();
    // Opened in the hour before an event: its reminder is told at once.
    this.last = this.now() - 3_600_000;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), everyMs);
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Read the events again at the next check (one was saved). */
  invalidate(): void {
    this.loaded = 0;
  }

  async tick(): Promise<void> {
    const now = this.now();
    if (now - this.loaded >= this.reloadMs) {
      // Read once at a time: the checks meanwhile wait for the same reading.
      this.loaded = now;
      this.reading = this.read().then((events) => void (this.events = events), () => undefined);
    }
    await this.reading;
    // Reminders of the last check up to now; one missed by more than an hour (a computer asleep) is not told late.
    for (const due of dueReminders(this.events, Math.max(this.last, now - 3_600_000), now + 1)) {
      // An event begun meanwhile is not reminded of.
      if (this.seen.has(due.key) || new Date(due.start.length > 10 ? due.start : `${due.start}T09:00`).getTime() < now - 5 * 60_000) continue;
      this.seen.add(due.key);
      this.notify(due);
    }
    this.last = now + 1;
  }
}
