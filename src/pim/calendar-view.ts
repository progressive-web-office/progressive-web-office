/**
 * CAL-002: the calendar of the folder — month, week, day and agenda views
 * of its event notes, today marked, the events coloured by calendar — to
 * create an event (a click on a day or an hour), move it (dragged), change
 * it in a window and open its note; a click on a date opens its daily note
 * (CAL-005). Imports and exports iCalendar files (CAL-003).
 */
import { button, h } from '../app/dom';
import * as remindersModule from './reminders';
import { t, type MessageKey } from '../i18n';
import type { StorageProvider } from '../fs';
import type { EditorView } from '../app/views';
import type { AgentTool } from '../ai/tools';
import { pimAgentTools } from './agent-tools';
import { occurrences, readCalendar, writeCalendar, type CalEvent } from './ical';
import { loadContacts, loadEvents, loadPimSettings, saveEvent, type Stored, type StoredEvent } from './store';

export interface CalendarHost {
  /** The notes linking to a note (the interactions of the agents' tools). */
  backlinks?(path: string): Promise<{ from: string; context: string }[]>;
  /** CONTACT-006: add a line to the daily note of a day (written first if needed); its path. */
  appendToDaily?(date: Date, line: string): Promise<string>;
  provider: StorageProvider;
  /** Open a note of the folder. */
  open(path: string): void;
  /** Open (or create) the daily note of a day. */
  openDaily(date: Date): void;
  /** Names of the notes of the folder, to link attendees. */
  noteNames(): string[];
  /** Notes written or removed here. */
  changed(paths: string[], event?: { day: Date; path: string }): void;
  error(message: string): void;
  /** Save a file the user downloads. */
  download(name: string, text: string, type: string): void;
  /** The number of events changed (the status bar). */
  statusChanged?(): void;
  /** A message for the user (the result of a synchronisation). */
  notify?(message: string): void;
  /** Add a Nextcloud / WebDAV account. */
  addAccount?(): Promise<void>;
}

const KIND = 'calendar';

export type CalendarMode = 'month' | 'week' | 'day' | 'agenda';
const MODES: CalendarMode[] = ['month', 'week', 'day', 'agenda'];
const MODE_KEY = 'pwo.calendar.mode';

const pad = (n: number): string => String(n).padStart(2, '0');
const dayKey = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, n: number): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const startOfWeek = (d: Date): Date => addDays(d, -((d.getDay() + 6) % 7));
const parse = (s: string): Date => (s.length > 10 ? new Date(s) : new Date(`${s}T00:00`));
const lang = (): string | undefined => document.documentElement.lang || undefined;
const fmt = (d: Date, opts: Intl.DateTimeFormatOptions): string => new Intl.DateTimeFormat(lang(), opts).format(d);
const localIso = (d: Date): string => `${dayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** A colour per calendar, the same each time (its name hashed to a hue). */
export function calendarColour(name: string | undefined): string {
  if (!name) return 'var(--accent)';
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0;
  return `hsl(${hash % 360} 62% 46%)`;
}

/** An occurrence of an event in the days shown. */
interface Shown {
  stored: Stored<StoredEvent>;
  start: Date;
  end: Date;
  allDay: boolean;
}

/** Length of an event in minutes (whole days: in days × 1440). */
function lengthOf(e: CalEvent): number {
  const start = parse(e.start);
  const end = e.end ? parse(e.end) : e.allDay ? addDays(start, 1) : new Date(start.getTime() + 60 * 60_000);
  return Math.max(e.allDay ? 1440 : 15, Math.round((end.getTime() - start.getTime()) / 60_000));
}

/** NOTIF-001: a reminder in words: at the time, minutes, hours or a day before. */
export function reminderLabel(m: number): string {
  if (m === 0) return t('cal.reminderAtTime');
  if (m % 1440 === 0) return t('cal.reminderDays', { n: m / 1440 });
  if (m % 60 === 0) return t('cal.reminderHours', { n: m / 60 });
  return t('cal.reminderMinutes', { n: m });
}

export class CalendarView implements EditorView {
  readonly element = h('div', { class: 'calendar-view', role: 'application', 'aria-label': t('cal.title') });
  private mode: CalendarMode;
  private cursor = new Date();
  private events: Stored<StoredEvent>[] = [];
  /** CONTACT-004: the birthdays of the contacts, as yearly events (their notes are the contacts'). */
  private birthdays: Stored<StoredEvent>[] = [];
  private loaded = false;

  constructor(private readonly host: CalendarHost) {
    let mode: CalendarMode = 'month';
    try {
      mode = (MODES.find((m) => m === localStorage.getItem(MODE_KEY)) ?? 'month') as CalendarMode;
    } catch {
      /* the default */
    }
    this.mode = mode;
    this.element.addEventListener('keydown', (e) => this.onKey(e));
  }

  mounted(): void {
    // The servers' calendars, once the folder's events are shown.
    void this.reload().then(() => this.syncServers(true));
  }

  status(): string {
    return this.loaded ? t('cal.count', { n: this.events.length }) : t('cal.loading');
  }

  formatLabel(): string {
    return t('cal.title');
  }

  /** CAL-007: the calendar and the contacts, for AI agents. */
  agentTools(): AgentTool[] {
    return pimAgentTools({
      provider: this.host.provider,
      noteNames: () => this.host.noteNames(),
      backlinks: (path) => this.host.backlinks?.(path) ?? Promise.resolve([]),
      ...(this.host.appendToDaily ? { appendToDaily: (d: Date, l: string) => this.host.appendToDaily!(d, l) } : {}),
      changed: (paths) => {
        this.host.changed(paths);
        void this.reload();
      },
    });
  }

  destroy(): void {
    this.element.replaceChildren();
  }

  /** Read the event notes again (they changed elsewhere). */
  async reload(): Promise<void> {
    const [events, contacts] = await Promise.all([loadEvents(this.host.provider).catch(() => []), loadContacts(this.host.provider).catch(() => [])]);
    this.events = events;
    this.birthdays = contacts.flatMap((c) =>
      c.item.birthday
        ? [{ path: c.path, text: c.text, item: { uid: `birthday-${c.item.uid}`, title: `🎂 ${c.item.name}`, start: c.item.birthday.startsWith('--') ? `2000${c.item.birthday.slice(1)}` : c.item.birthday, allDay: true, recurrence: 'FREQ=YEARLY', calendar: t('people.birthday') } }]
        : [],
    );
    this.loaded = true;
    this.render();
  }

  private setMode(mode: CalendarMode): void {
    this.mode = mode;
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      /* not kept */
    }
    this.render();
  }

  private move(by: number): void {
    const c = this.cursor;
    this.cursor = this.mode === 'month' ? new Date(c.getFullYear(), c.getMonth() + by, 1) : addDays(c, by * (this.mode === 'week' ? 7 : this.mode === 'agenda' ? 30 : 1));
    this.render();
  }

  private onKey(e: KeyboardEvent): void {
    if ((e.target as HTMLElement).closest('input, textarea, select, dialog')) return;
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') this.move(-1);
    else if (e.key === 'ArrowRight' || e.key === 'PageDown') this.move(1);
    else if (e.key === 't') this.goToday();
    else if (e.key === 'n') this.edit(undefined, this.cursor);
    else if (e.key === 'm' || e.key === 'w' || e.key === 'd' || e.key === 'a') this.setMode(({ m: 'month', w: 'week', d: 'day', a: 'agenda' } as const)[e.key]);
    else return;
    e.preventDefault();
  }

  private goToday(): void {
    this.cursor = new Date();
    this.render();
  }

  /** The days shown: from (included) to (excluded). */
  private range(): [Date, Date] {
    const c = this.cursor;
    if (this.mode === 'month') {
      const first = startOfWeek(new Date(c.getFullYear(), c.getMonth(), 1));
      return [first, addDays(first, 42)];
    }
    if (this.mode === 'week') {
      const first = startOfWeek(c);
      return [first, addDays(first, 7)];
    }
    if (this.mode === 'day') {
      const d = new Date(c.getFullYear(), c.getMonth(), c.getDate());
      return [d, addDays(d, 1)];
    }
    const d = new Date(c.getFullYear(), c.getMonth(), c.getDate());
    return [d, addDays(d, 30)];
  }

  /** The occurrences of the events in the days shown, by start. */
  private shown(from: Date, to: Date): Shown[] {
    const out: Shown[] = [];
    for (const stored of [...this.events, ...this.birthdays]) {
      const e = stored.item;
      const minutes = lengthOf(e);
      // An event started before the days shown but still going on counts too.
      const since = dayKey(addDays(from, -Math.ceil(minutes / 1440)));
      for (const start of occurrences(e, since, dayKey(to))) {
        const s = parse(start);
        const end = new Date(s.getTime() + minutes * 60_000);
        if (end > from && s < to) out.push({ stored, start: s, end, allDay: e.allDay });
      }
    }
    return out.sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.getTime() - b.start.getTime() || a.stored.item.title.localeCompare(b.stored.item.title));
  }

  private title(): string {
    const [from, to] = this.range();
    if (this.mode === 'month') return fmt(this.cursor, { month: 'long', year: 'numeric' });
    if (this.mode === 'day') return fmt(from, { dateStyle: 'full' });
    return `${fmt(from, { day: 'numeric', month: 'short' })} – ${fmt(addDays(to, -1), { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }

  render(): void {
    this.host.statusChanged?.();
    const modes = h(
      'div',
      { class: 'calendar-modes', role: 'group', 'aria-label': t('cal.view') },
      ...MODES.map((m) => button(t(`cal.mode.${m}` as MessageKey), () => this.setMode(m), { pressed: m === this.mode, className: 'calendar-mode' })),
    );
    const bar = h(
      'div',
      { class: 'calendar-bar' },
      button(t('cal.today'), () => this.goToday(), { className: 'calendar-today' }),
      button(t('cal.prev'), () => this.move(-1), { text: '‹', className: 'icon' }),
      button(t('cal.next'), () => this.move(1), { text: '›', className: 'icon' }),
      h('h2', { class: 'calendar-title', 'aria-live': 'polite' }, this.title()),
      modes,
      button(t('cal.new'), () => this.edit(undefined, this.mode === 'month' ? new Date(this.cursor) : this.cursor), { icon: '＋', className: 'primary' }),
      button(t('pimsync.sync'), () => void this.syncServers(), { text: '⟳', className: 'icon calendar-sync' }),
      button(t('pimsync.servers'), () => void import('./servers').then(({ chooseCollections }) => chooseCollections(this.element, KIND, () => this.host.addAccount?.() ?? Promise.resolve())).then((saved) => (saved ? this.syncServers() : undefined)), { text: '☁', className: 'icon' }),
      button(t('cal.import'), () => this.importIcs(), { text: '⇪', className: 'icon' }),
      button(t('cal.export'), () => this.exportIcs(), { text: '⇩', className: 'icon' }),
    );
    const body = !this.loaded ? h('p', { class: 'hint calendar-loading' }, t('cal.loading')) : this.mode === 'month' ? this.monthView() : this.mode === 'agenda' ? this.agendaView() : this.timeView();
    this.element.replaceChildren(bar, body);
    this.element.dataset.mode = this.mode;
    if (this.mode === 'week' || this.mode === 'day') {
      // The working hours in view.
      const scroller = this.element.querySelector<HTMLElement>('.calendar-hours');
      if (scroller) scroller.scrollTop = 8 * 48 - 8;
    }
  }

  /** An event as a chip: its time, its title, its colour; dragged to move it, clicked to change it. */
  private chip(s: Shown, withTime = true): HTMLElement {
    const e = s.stored.item;
    const time = s.allDay || !withTime ? '' : `${fmt(s.start, { hour: '2-digit', minute: '2-digit' })} `;
    // Not a <button> from button(): that one keeps the pointer from starting a drag.
    const el = h('div', { class: `calendar-event${s.allDay ? ' all-day' : ''}`, role: 'button', tabindex: '0', title: [e.title, e.location, e.calendar].filter(Boolean).join(' · ') }, `${time}${e.title || t('cal.untitled')}`);
    // A birthday opens its contact's note; an event, its window.
    const birthday = this.birthdays.includes(s.stored);
    const open = (): void => (birthday ? this.host.open(s.stored.path) : this.edit(s.stored));
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      open();
    });
    el.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        open();
      }
    });
    if (birthday) {
      el.classList.add('birthday');
      el.title = t('people.birthdayOf', { name: e.title.replace(/^🎂 /, '') });
      el.style.setProperty('--event-colour', calendarColour(e.calendar));
      return el;
    }
    el.style.setProperty('--event-colour', calendarColour(e.calendar));
    el.draggable = true;
    el.addEventListener('dragstart', (ev) => {
      ev.dataTransfer?.setData('application/x-pwo-event', JSON.stringify({ path: s.stored.path, start: s.start.getTime() }));
      if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move';
    });
    return el;
  }

  /** Drop target: a day (month view, whole days: the time kept) or an hour (week, day views). */
  private dropOn(el: HTMLElement, at: (ev: DragEvent) => Date, wholeDay = false): void {
    el.addEventListener('dragover', (ev) => {
      if (ev.dataTransfer?.types.includes('application/x-pwo-event')) {
        ev.preventDefault();
        el.classList.add('drop');
      }
    });
    el.addEventListener('dragleave', () => el.classList.remove('drop'));
    el.addEventListener('drop', (ev) => {
      el.classList.remove('drop');
      const data = ev.dataTransfer?.getData('application/x-pwo-event');
      if (!data) return;
      ev.preventDefault();
      const { path, start } = JSON.parse(data) as { path: string; start: number };
      void this.moveEvent(path, new Date(start), at(ev), wholeDay);
    });
  }

  /** Move an event (its whole series) by the time between two starts. */
  private async moveEvent(path: string, from: Date, to: Date, wholeDay = false): Promise<void> {
    const stored = this.events.find((s) => s.path === path);
    if (!stored) return;
    const e = stored.item;
    // A whole-day event moves by whole days.
    const delta = e.allDay || wholeDay ? Math.round((new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime() - new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()) / 86_400_000) * 86_400_000 : to.getTime() - from.getTime();
    if (!delta) return;
    const shift = (s: string): string => {
      const d = new Date(parse(s).getTime() + delta);
      return e.allDay ? dayKey(d) : localIso(d);
    };
    await this.store({ ...e, start: shift(e.start), ...(e.end ? { end: shift(e.end) } : {}), ...(e.exceptions ? { exceptions: e.exceptions.map(shift) } : {}) }, stored);
  }

  private async store(event: StoredEvent, at?: Stored<StoredEvent>, body?: string): Promise<void> {
    try {
      const names = new Set(this.host.noteNames().map((n) => n.toLowerCase()));
      const saved = await saveEvent(this.host.provider, event, at, (name) => names.has(name.toLowerCase()), body);
      this.events = [...this.events.filter((s) => s.path !== saved.path && s.path !== saved.movedFrom), saved];
      this.render();
      this.host.changed([saved.path, ...(saved.movedFrom ? [saved.movedFrom] : [])], { day: parse(saved.item.start), path: saved.path });
    } catch (err) {
      this.host.error((err as Error).message);
    }
  }

  private dayHeader(d: Date, opts: Intl.DateTimeFormatOptions): HTMLElement {
    const today = dayKey(d) === dayKey(new Date());
    const b = button(t('cal.dailyNote', { date: fmt(d, { dateStyle: 'full' }) }), () => this.host.openDaily(d), { text: fmt(d, opts), className: `calendar-date${today ? ' today' : ''}` });
    if (today) b.setAttribute('aria-current', 'date');
    return b;
  }

  private monthView(): HTMLElement {
    const [from, to] = this.range();
    const shown = this.shown(from, to);
    const month = this.cursor.getMonth();
    const names = Array.from({ length: 7 }, (_, i) => h('div', { class: 'calendar-weekday', role: 'columnheader' }, fmt(addDays(from, i), { weekday: 'short' })));
    const cells: HTMLElement[] = [];
    for (let d = from; d < to; d = addDays(d, 1)) {
      const day = d;
      const next = addDays(day, 1);
      const here = shown.filter((s) => s.start < next && s.end > day);
      const cell = h(
        'div',
        { class: `calendar-cell${day.getMonth() === month ? '' : ' other-month'}${dayKey(day) === dayKey(new Date()) ? ' today' : ''}`, role: 'gridcell', 'data-day': dayKey(day) },
        this.dayHeader(day, { day: 'numeric' }),
        ...here.slice(0, 4).map((s) => this.chip(s)),
        here.length > 4
          ? button(t('cal.more', { n: here.length - 4 }), () => {
              this.cursor = day;
              this.setMode('day');
            }, { className: 'calendar-more' })
          : '',
      );
      // A click beside the events: a new event that day.
      cell.addEventListener('click', (ev) => {
        if (ev.target === cell) this.edit(undefined, new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9));
      });
      this.dropOn(cell, () => day, true);
      cells.push(cell);
    }
    return h('div', { class: 'calendar-month', role: 'grid', 'aria-label': this.title() }, h('div', { class: 'calendar-weekdays', role: 'row' }, ...names), h('div', { class: 'calendar-days' }, ...cells));
  }

  private timeView(): HTMLElement {
    const [from, to] = this.range();
    const days: Date[] = [];
    for (let d = from; d < to; d = addDays(d, 1)) days.push(d);
    const shown = this.shown(from, to);
    const head = h('div', { class: 'calendar-head' }, h('div', { class: 'calendar-gutter' }), ...days.map((d) => h('div', { class: 'calendar-head-day' }, this.dayHeader(d, { weekday: 'short', day: 'numeric' }))));
    const allDay = h(
      'div',
      { class: 'calendar-all-day' },
      h('div', { class: 'calendar-gutter' }, t('cal.allDayShort')),
      ...days.map((d) => {
        const cell = h('div', { class: 'calendar-all-day-cell' }, ...shown.filter((s) => s.allDay && s.start < addDays(d, 1) && s.end > d).map((s) => this.chip(s, false)));
        this.dropOn(cell, () => d, true);
        return cell;
      }),
    );
    const hours = h('div', { class: 'calendar-gutter calendar-hour-labels' }, ...Array.from({ length: 24 }, (_, hr) => h('div', { class: 'calendar-hour-label' }, fmt(new Date(2026, 0, 1, hr), { hour: '2-digit', minute: '2-digit' }))));
    const columns = days.map((d) => {
      const col = h('div', { class: 'calendar-column', 'data-day': dayKey(d) }, ...Array.from({ length: 24 }, () => h('div', { class: 'calendar-slot' })));
      const at = (ev: MouseEvent): Date => {
        const rect = col.getBoundingClientRect();
        // To the quarter of an hour.
        const minutes = Math.max(0, Math.min(24 * 60 - 15, Math.round(((ev.clientY - rect.top) / rect.height) * 24 * 4) * 15));
        return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, minutes);
      };
      col.addEventListener('click', (ev) => {
        if ((ev.target as HTMLElement).closest('.calendar-event')) return;
        const start = at(ev);
        start.setMinutes(start.getMinutes() - (start.getMinutes() % 30));
        this.edit(undefined, start);
      });
      this.dropOn(col, at);
      // Side by side when they overlap.
      const timed = shown.filter((s) => !s.allDay && s.start < addDays(d, 1) && s.end > d);
      const lanes: Date[] = [];
      const placed = timed.map((s) => {
        let lane = lanes.findIndex((end) => end <= s.start);
        if (lane < 0) lane = lanes.push(s.end) - 1;
        else lanes[lane] = s.end;
        return { s, lane };
      });
      for (const { s, lane } of placed) {
        const top = Math.max(0, (s.start.getTime() - d.getTime()) / 60_000);
        const bottom = Math.min(24 * 60, (s.end.getTime() - d.getTime()) / 60_000);
        const chip = this.chip(s);
        chip.classList.add('timed');
        chip.style.top = `${(top / (24 * 60)) * 100}%`;
        chip.style.height = `${(Math.max(20, bottom - top) / (24 * 60)) * 100}%`;
        chip.style.left = `${(lane / lanes.length) * 100}%`;
        chip.style.width = `${100 / lanes.length}%`;
        col.append(chip);
      }
      // The time now, on today.
      if (dayKey(d) === dayKey(new Date())) {
        const now = new Date();
        col.append(h('div', { class: 'calendar-now', style: `top: ${((now.getHours() * 60 + now.getMinutes()) / (24 * 60)) * 100}%`, 'aria-hidden': 'true' }));
      }
      return col;
    });
    return h(
      'div',
      { class: 'calendar-time', style: `--days: ${days.length}` },
      head,
      allDay,
      h('div', { class: 'calendar-hours' }, h('div', { class: 'calendar-hours-grid' }, hours, ...columns)),
    );
  }

  private agendaView(): HTMLElement {
    const [from, to] = this.range();
    const shown = this.shown(from, to);
    const groups: HTMLElement[] = [];
    for (let d = from; d < to; d = addDays(d, 1)) {
      const day = d;
      const here = shown.filter((s) => s.start < addDays(day, 1) && s.end > day);
      if (!here.length) continue;
      groups.push(
        h(
          'section',
          { class: 'calendar-agenda-day' },
          h('h3', {}, this.dayHeader(day, { weekday: 'long', day: 'numeric', month: 'long' })),
          h(
            'ul',
            { role: 'list' },
            ...here.map((s) =>
              h(
                'li',
                {},
                h('span', { class: 'calendar-agenda-time' }, s.allDay ? t('cal.allDayShort') : `${fmt(s.start, { hour: '2-digit', minute: '2-digit' })} – ${fmt(s.end, { hour: '2-digit', minute: '2-digit' })}`),
                this.chip(s, false),
                s.stored.item.location ? h('span', { class: 'hint' }, ` · ${s.stored.item.location}`) : '',
              ),
            ),
          ),
        ),
      );
    }
    return h('div', { class: 'calendar-agenda' }, ...(groups.length ? groups : [h('p', { class: 'hint' }, t('cal.noEvents'))]));
  }

  /** The window of an event: a new one (at `when`), or one of the folder. */
  edit(stored?: Stored<StoredEvent>, when = new Date()): void {
    const e: Partial<StoredEvent> = stored?.item ?? {};
    const allDay = h('input', { type: 'checkbox', checked: !!e.allDay });
    const title = h('input', { type: 'text', value: e.title ?? '', 'aria-label': t('cal.titleField'), placeholder: t('cal.titleField'), class: 'calendar-field-title' });
    const startDate = h('input', { type: 'date', value: (e.start ?? dayKey(when)).slice(0, 10), 'aria-label': t('cal.startDate') });
    const startTime = h('input', { type: 'time', value: e.start && e.start.length > 10 ? e.start.slice(11, 16) : `${pad(when.getHours())}:${pad(when.getMinutes())}`, 'aria-label': t('cal.startTime') });
    const length = stored ? lengthOf(stored.item) : 60;
    const endAt = stored ? (e.end ? parse(e.end) : new Date(parse(e.start!).getTime() + length * 60_000)) : new Date(new Date(`${startDate.value}T${startTime.value}`).getTime() + 60 * 60_000);
    // A whole-day event ends the day before its (exclusive) end.
    const endShown = e.allDay ? addDays(endAt, -1) : endAt;
    const endDate = h('input', { type: 'date', value: dayKey(endShown), 'aria-label': t('cal.endDate') });
    const endTime = h('input', { type: 'time', value: `${pad(endShown.getHours())}:${pad(endShown.getMinutes())}`, 'aria-label': t('cal.endTime') });
    const showTimes = (): void => {
      startTime.hidden = endTime.hidden = allDay.checked;
    };
    allDay.addEventListener('change', showTimes);
    showTimes();
    // Moving the start moves the end with it.
    let previousStart = new Date(`${startDate.value}T${startTime.value || '00:00'}`).getTime();
    const followStart = (): void => {
      const now = new Date(`${startDate.value}T${startTime.value || '00:00'}`).getTime();
      if (Number.isNaN(now)) return;
      const end = new Date(new Date(`${endDate.value}T${endTime.value || '00:00'}`).getTime() + now - previousStart);
      endDate.value = dayKey(end);
      endTime.value = `${pad(end.getHours())}:${pad(end.getMinutes())}`;
      previousStart = now;
    };
    startDate.addEventListener('change', followStart);
    startTime.addEventListener('change', followStart);
    const location = h('input', { type: 'text', value: e.location ?? '', 'aria-label': t('cal.location') });
    const names = h('datalist', { id: 'calendar-people' }, ...this.host.noteNames().slice(0, 500).map((n) => h('option', { value: n })));
    const attendees = h('input', { type: 'text', value: (e.attendees ?? []).join(', '), 'aria-label': t('cal.attendees'), placeholder: t('cal.attendeesHint'), list: 'calendar-people' });
    const calendars = h('datalist', { id: 'calendar-names' }, ...[...new Set(this.events.map((s) => s.item.calendar).filter((c): c is string => !!c))].map((c) => h('option', { value: c })));
    const calendar = h('input', { type: 'text', value: e.calendar ?? '', 'aria-label': t('cal.calendar'), list: 'calendar-names' });
    const repeats = ['none', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];
    const current = e.recurrence ? (/^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(;BYDAY=[A-Z]{2})?$/.exec(e.recurrence)?.[1] ?? 'custom') : 'none';
    const repeat = h(
      'select',
      { 'aria-label': t('cal.repeat') },
      ...repeats.map((r) => h('option', { value: r }, t(`cal.repeat.${r.toLowerCase()}` as MessageKey))),
      ...(current === 'custom' ? [h('option', { value: 'custom' }, `${t('cal.repeat.custom')} (${e.recurrence})`)] : []),
    );
    repeat.value = current;
    // NOTIF-001: a reminder; new events take the one of the settings.
    const { REMINDER_CHOICES, loadReminderSettings } = remindersModule;
    const firstReminder = stored ? e.reminders?.[0] : loadReminderSettings().defaultMinutes;
    const reminder = h(
      'select',
      { 'aria-label': t('cal.reminder') },
      h('option', { value: '' }, t('cal.reminderNone')),
      ...[...new Set([...REMINDER_CHOICES, ...(firstReminder !== undefined ? [firstReminder] : [])])].sort((a, b) => a - b).map((m) => h('option', { value: String(m) }, reminderLabel(m))),
    );
    reminder.value = firstReminder === undefined ? '' : String(firstReminder);
    const description = h('textarea', { rows: '4', 'aria-label': t('cal.description') });
    description.value = stored ? stored.text.slice(stored.text.indexOf('\n---\n') + 5).trim() : '';
    const dialog = h('dialog', { class: 'dialog calendar-dialog', 'aria-labelledby': 'calendar-dialog-title' });
    const close = (): void => {
      dialog.close();
      dialog.remove();
    };
    const save = (): void => {
      if (!startDate.value) {
        startDate.reportValidity();
        return;
      }
      const start = allDay.checked ? startDate.value : `${startDate.value}T${startTime.value || '09:00'}`;
      let end = allDay.checked ? dayKey(addDays(new Date(`${endDate.value || startDate.value}T00:00`), 1)) : `${endDate.value || startDate.value}T${endTime.value || startTime.value}`;
      if (end <= start) end = allDay.checked ? dayKey(addDays(new Date(`${startDate.value}T00:00`), 1)) : localIso(new Date(new Date(start).getTime() + 60 * 60_000));
      const weekday = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][new Date(`${startDate.value}T00:00`).getDay()];
      const recurrence = repeat.value === 'none' ? undefined : repeat.value === 'custom' ? e.recurrence : repeat.value === 'WEEKLY' ? `FREQ=WEEKLY;BYDAY=${weekday}` : `FREQ=${repeat.value}`;
      const people = attendees.value.split(',').map((s) => s.trim()).filter(Boolean);
      const event: StoredEvent = {
        uid: e.uid ?? '',
        title: title.value.trim() || t('cal.untitled'),
        start,
        end,
        allDay: allDay.checked,
        ...(location.value.trim() ? { location: location.value.trim() } : {}),
        ...(people.length ? { attendees: people } : {}),
        ...(calendar.value.trim() ? { calendar: calendar.value.trim() } : {}),
        ...(recurrence ? { recurrence } : {}),
        ...(recurrence && e.exceptions ? { exceptions: e.exceptions } : {}),
        ...(e.categories ? { categories: e.categories } : {}),
        ...(e.url ? { url: e.url } : {}),
        ...(reminder.value !== '' ? { reminders: [Number(reminder.value), ...(e.reminders ?? []).slice(1)] } : {}),
        ...(e.remote ? { remote: e.remote } : {}),
        ...(!stored && description.value.trim() ? { description: description.value.trim() } : {}),
      };
      close();
      void this.store(event, stored, stored ? description.value : undefined);
    };
    const remove = async (): Promise<void> => {
      if (!stored || !window.confirm(t('cal.deleteConfirm', { title: e.title ?? '' }))) return;
      close();
      try {
        await this.host.provider.remove(stored.path);
        this.events = this.events.filter((s) => s !== stored);
        this.render();
        this.host.changed([stored.path]);
      } catch (err) {
        this.host.error((err as Error).message);
      }
    };
    const field = (label: string, ...inputs: (HTMLElement | string)[]): HTMLElement => h('label', { class: 'calendar-field' }, h('span', {}, label), h('span', { class: 'calendar-inputs' }, ...inputs));
    dialog.append(
      h('h2', { id: 'calendar-dialog-title' }, stored ? t('cal.editTitle') : t('cal.newTitle')),
      title,
      h('label', { class: 'calendar-all-day-toggle' }, allDay, ` ${t('cal.allDay')}`),
      field(t('cal.start'), startDate, startTime),
      field(t('cal.end'), endDate, endTime),
      field(t('cal.repeat'), repeat),
      field(t('cal.reminder'), reminder),
      field(t('cal.location'), location),
      field(t('cal.attendees'), attendees, names),
      field(t('cal.calendar'), calendar, calendars),
      field(t('cal.description'), description),
      h(
        'div',
        { class: 'dialog-actions' },
        stored ? button(t('cal.delete'), () => void remove(), { className: 'danger' }) : '',
        stored
          ? button(t('cal.openNote'), () => {
              close();
              this.host.open(stored.path);
            })
          : '',
        button(t('common.cancel'), close),
        button(t('cal.save'), save, { className: 'primary' }),
      ),
    );
    dialog.addEventListener('cancel', (ev) => {
      ev.preventDefault();
      close();
    });
    dialog.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && (ev.target as HTMLElement).tagName === 'INPUT' && (ev.target as HTMLInputElement).type !== 'checkbox') {
        ev.preventDefault();
        save();
      }
    });
    this.element.append(dialog);
    dialog.showModal();
    title.focus();
  }

  /** CAL-006, CONTACT-005: the chosen collections of the servers synchronised with the notes; none chosen: choose them. */
  private async syncServers(auto = false): Promise<void> {
    if (this.syncing) return;
    const { loadChosen, synchroniseKind, chooseCollections, reportText, syncErrorMessage } = await import('./servers');
    if (!loadChosen().some((c) => c.kind === KIND)) {
      if (auto) return;
      if (await chooseCollections(this.element, KIND, () => this.host.addAccount?.() ?? Promise.resolve())) await this.syncServers();
      return;
    }
    this.syncing = true;
    this.element.classList.add('syncing');
    try {
      const names = new Set(this.host.noteNames().map((n) => n.toLowerCase()));
      const report = await synchroniseKind(this.host.provider, KIND, (name) => names.has(name.toLowerCase()));
      if (report) {
        if (!auto || report.received || report.sent || report.conflicts.length || report.errors.length) this.host.notify?.(reportText(report));
        if (report.received || report.removedHere || report.sent) {
          await this.reload();
          this.host.changed([]);
        }
      }
    } catch (err) {
      this.host.notify?.(syncErrorMessage(err));
    } finally {
      this.syncing = false;
      this.element.classList.remove('syncing');
    }
  }

  private syncing = false;

  /** CAL-003: the events of a .ics file as notes of the events folder. */
  private importIcs(): void {
    const input = h('input', { type: 'file', accept: '.ics,text/calendar' });
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      const events = readCalendar(await file.text());
      const known = new Map(this.events.map((s) => [s.item.uid, s]));
      for (const e of events) await this.store(e, known.get(e.uid));
      window.alert(t('cal.imported', { n: events.length, folder: loadPimSettings().events }));
    });
    input.click();
  }

  private exportIcs(): void {
    this.host.download(`${t('cal.title')}.ics`, writeCalendar(this.events.map((s) => s.item)), 'text/calendar');
  }
}
