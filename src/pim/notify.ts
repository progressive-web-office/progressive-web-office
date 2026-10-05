/**
 * NOTIF-001: the reminders of events notified by the system — through the
 * service worker where there is one (phones show only those), else by the
 * page — and by the application itself, its message clicked to open the
 * event.
 */
import { t } from '../i18n';
import type { StorageProvider } from '../fs';
import { loadEvents } from './store';
import { loadReminderSettings, ReminderClock, type Due } from './reminders';

export interface ReminderHost {
  /** Where the events are: the folder open, else the browser's storage. */
  provider(): Promise<StorageProvider | null>;
  /** Open the note of an event. */
  open(path: string): void;
  /** Tell it in the application too. */
  notice(message: string): void;
}

/** What a reminder says: the event, its time (or that it is today), where. */
export function reminderText(due: Due, lang?: string): { title: string; body: string } {
  const when = due.allDay
    ? new Intl.DateTimeFormat(lang, { dateStyle: 'full' }).format(new Date(`${due.start}T00:00`))
    : new Intl.DateTimeFormat(lang, { weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(due.start));
  const body = [due.minutes ? t('remind.in', { when }) : t('remind.now', { when }), due.location].filter(Boolean).join(' · ');
  return { title: due.title, body };
}

async function systemNotify(due: Due): Promise<void> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const { title, body } = reminderText(due, document.documentElement.lang || undefined);
  const options: NotificationOptions = { body, tag: due.key, icon: 'pwa-192x192.png', badge: 'pwa-192x192.png', data: { path: due.path } };
  const registration = await navigator.serviceWorker?.getRegistration().catch(() => undefined);
  if (registration) return registration.showNotification(title, options);
  const n = new Notification(title, options);
  n.onclick = () => {
    window.focus();
    window.dispatchEvent(new CustomEvent('pwo-open-event', { detail: due.path }));
    n.close();
  };
}

let clock: ReminderClock | undefined;

/** Start (or start again, after the settings changed) the reminders; stopped when they are off. */
export function startReminders(host: ReminderHost): void {
  clock?.stop();
  clock = undefined;
  if (!loadReminderSettings().enabled) return;
  clock = new ReminderClock(
    async () => {
      const provider = await host.provider();
      return provider ? (await loadEvents(provider)).map((s) => ({ path: s.path, item: s.item })) : [];
    },
    (due) => {
      const { title, body } = reminderText(due, document.documentElement.lang || undefined);
      host.notice(`🔔 ${title} — ${body}`);
      void systemNotify(due).catch(() => undefined);
    },
  );
  clock.start();
}

/** An event was saved: read the events again at the next check. */
export function remindersChanged(): void {
  clock?.invalidate();
}

/** NOTIF-001: ask the browser to show notifications; whether it may. */
export async function askNotifications(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}
