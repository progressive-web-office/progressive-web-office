/**
 * CONTACT-006: the interactions with a person — the events it attends, the
 * lines of the daily notes naming it (a call, a meeting, an e-mail written
 * there, by the user or an agent), the other notes linking to it — as a
 * timeline, with when they first met and when they were last in touch.
 */

export const INTERACTION_KINDS = ['meeting', 'call', 'email', 'message', 'other'] as const;
export type BuiltInKind = (typeof INTERACTION_KINDS)[number];
export const KIND_ICON: Record<BuiltInKind, string> = { meeting: '🤝', call: '📞', email: '✉️', message: '💬', other: '•' };

/** A kind of interaction as written in the daily notes: its icon and its name. */
export interface KindChoice {
  icon: string;
  label: string;
}

const pad = (n: number): string => String(n).padStart(2, '0');
/** A word with no letter nor digit: an icon (an emoji, a sign). */
const isIcon = (word: string): boolean => !/[\p{L}\p{N}]/u.test(word);

/**
 * The kind the user (or an agent) wrote: one of the kinds built in, by its
 * id or its name (`call`, `Appel`), or a kind of their own — `🍽 Lunch`, its
 * icon first, or `Lunch`. Nothing written: Other.
 */
export function kindChoice(text: string, labelOf: (kind: BuiltInKind) => string): KindChoice {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const icon = words.length > 1 && isIcon(words[0]!) ? words.shift()! : undefined;
  const label = words.join(' ');
  const fold = (s: string): string => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const builtIn = INTERACTION_KINDS.find((k) => fold(k) === fold(label) || fold(labelOf(k)) === fold(label)) ?? (label ? undefined : 'other');
  if (builtIn) return { icon: KIND_ICON[builtIn], label: labelOf(builtIn) };
  return { icon: icon ?? KIND_ICON.other, label };
}

/**
 * The line of a daily note telling an interaction:
 * `- 14:05 📞 Call — [[Ada Lovelace]]: about the review`.
 */
export function interactionLine(when: Date, kind: KindChoice, noteName: string, summary = ''): string {
  const text = summary.replace(/\s+/g, ' ').trim();
  return `- ${pad(when.getHours())}:${pad(when.getMinutes())} ${kind.icon} ${kind.label} — [[${noteName}]]${text ? `: ${text}` : ''}`;
}

/** A kind as written, `🍽 Lunch` or `Lunch`: its icon (Other's when none) and its name. */
export function splitKind(text: string): KindChoice {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const icon = words.length > 1 && isIcon(words[0]!) ? words.shift()! : KIND_ICON.other;
  return { icon, label: words.join(' ') };
}

/**
 * The kinds found in lines of daily notes telling interactions — those the
 * user made up are offered again, as the ones built in — the most used first.
 */
export function kindsInLines(lines: string[]): KindChoice[] {
  const count = new Map<string, { kind: KindChoice; n: number }>();
  for (const line of lines) {
    const m = /^[-*]\s+\d{1,2}:\d{2}\s+(.+?)\s+—\s+\[\[/u.exec(line.trim());
    if (!m) continue;
    const kind = splitKind(m[1]!);
    const key = kind.label.toLowerCase();
    const seen = count.get(key);
    if (seen) seen.n++;
    else count.set(key, { kind, n: 1 });
  }
  return [...count.values()].sort((a, b) => b.n - a.n || a.kind.label.localeCompare(b.kind.label)).map((c) => c.kind);
}

export interface Interaction {
  /** `YYYY-MM-DD`, or `YYYY-MM-DDTHH:mm`. */
  when?: string;
  kind: 'event' | 'daily' | 'note';
  label: string;
  path: string;
  context?: string;
}

/** The time a line of a daily note starts with (`- 14:05 …`). */
const timeOf = (context: string): string | undefined => /^[-*]\s+(\d{1,2}):(\d{2})\b/.exec(context.trim())?.slice(1, 3).map((n) => n.padStart(2, '0')).join(':');

/**
 * The interactions with a person, the latest first: its events, the daily
 * notes naming it (their day, and the time the line starts with), and the
 * other notes linking to it (their day when their name starts with one).
 */
export function timeline(
  events: { path: string; title: string; start: string }[],
  backlinks: { from: string; context: string }[],
  dayOfNote: (path: string) => string | undefined,
): Interaction[] {
  const eventPaths = new Set(events.map((e) => e.path));
  const name = (p: string): string => p.slice(p.lastIndexOf('/') + 1).replace(/\.(md|markdown)$/i, '');
  const out: Interaction[] = events.map((e) => ({ when: e.start, kind: 'event' as const, label: e.title, path: e.path }));
  for (const b of backlinks) {
    if (eventPaths.has(b.from)) continue;
    const day = dayOfNote(b.from);
    if (day) {
      const time = timeOf(b.context);
      out.push({ when: time ? `${day}T${time}` : day, kind: 'daily', label: name(b.from), path: b.from, context: b.context });
    } else {
      const dated = /^(\d{4}-\d{2}-\d{2})/.exec(name(b.from))?.[1];
      out.push({ ...(dated ? { when: dated } : {}), kind: 'note', label: name(b.from), path: b.from, context: b.context });
    }
  }
  return out.sort((a, b) => (b.when ?? '').localeCompare(a.when ?? '') || a.label.localeCompare(b.label));
}

/** When they first met and were last in touch — what happened until today, the future left out. */
export function firstAndLast(items: Interaction[], today: string, firstMet?: string): { first?: string; last?: string } {
  const past = items.map((i) => i.when).filter((w): w is string => !!w && w.slice(0, 10) <= today).sort();
  const first = [firstMet, past[0]].filter((x): x is string => !!x).sort()[0];
  return { ...(first ? { first: first.slice(0, 10) } : {}), ...(past.length ? { last: past[past.length - 1]!.slice(0, 10) } : {}) };
}
