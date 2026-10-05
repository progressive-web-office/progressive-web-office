/**
 * CONTACT-006: interactions with people, written to the daily notes and
 * read back as a timeline — the same for the card of a contact and for the
 * agents (CONTACT-007).
 */
import { t, type MessageKey } from '../i18n';
import { readText, type StorageProvider } from '../fs';
import { dateOfNote, dayKey, loadDailySettings } from '../folder/daily';
import { listOf, withValues } from './notes';
import { firstAndLast, interactionLine, kindChoice, timeline, type Interaction } from './interactions';
import { loadEvents, type Stored, type StoredContact } from './store';

export interface PeopleHost {
  provider: StorageProvider;
  /** The notes linking to a note, with the words around the link. */
  backlinks(path: string): Promise<{ from: string; context: string }[]>;
  /** Add a line to the daily note of a day (written first if needed); its path. */
  appendToDaily?(date: Date, line: string): Promise<string>;
  changed(paths: string[]): void;
}

export const noteNameOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1).replace(/\.(md|markdown)$/i, '');

/** The interactions with a contact, the latest first, and when they first met and were last in touch. */
export async function contactTimeline(host: PeopleHost, stored: Stored<StoredContact>): Promise<{ items: Interaction[]; first?: string; last?: string }> {
  const [backlinks, events] = await Promise.all([host.backlinks(stored.path).catch(() => []), loadEvents(host.provider).catch(() => [])]);
  const name = noteNameOf(stored.path).toLowerCase();
  const full = stored.item.name.toLowerCase();
  const attending = events.filter((e) => (e.item.attendees ?? []).some((a) => [name, full].includes(a.toLowerCase())));
  const settings = loadDailySettings();
  const items = timeline(
    attending.map((e) => ({ path: e.path, title: e.item.title, start: e.item.start })),
    backlinks,
    (p) => dateOfNote(p, settings),
  );
  const firstMet = listOf(stored.text, 'first met')[0];
  return { items, ...firstAndLast(items, dayKey(new Date()), firstMet) };
}

/**
 * Write an interaction with a contact into the daily note of its day, and
 * keep `first met` and `last contact` of its note up to date. The kind is
 * one of those built in or one of the user's (`🍽 Lunch`).
 */
export async function logInteraction(host: PeopleHost, stored: Stored<StoredContact>, kind: string, when: Date, summary: string): Promise<string> {
  if (!host.appendToDaily) throw new Error(t('people.noDaily'));
  const line = interactionLine(when, kindChoice(kind, (k) => t(`people.kind.${k}` as MessageKey)), noteNameOf(stored.path), summary);
  const daily = await host.appendToDaily(when, line);
  const day = dayKey(when);
  const text = await readText(host.provider, stored.path).catch(() => stored.text);
  const firstMet = listOf(text, 'first met')[0];
  const last = listOf(text, 'last contact')[0];
  const updated = withValues(text, [
    ['first met', !firstMet || day < firstMet ? day : firstMet],
    ['last contact', !last || day > last ? day : last],
  ]);
  if (updated !== text) await host.provider.write(stored.path, new Blob([updated]));
  host.changed([daily, stored.path]);
  return daily;
}
