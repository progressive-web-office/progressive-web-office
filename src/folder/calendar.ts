/**
 * FOLDER-027: a month calendar of the daily notes — a dot on each day that
 * has its note, a click opening it (or creating it), the name, folder and
 * template of the notes set beside it.
 */
import { button, h } from '../app/dom';
import { t } from '../i18n';
import { dailyPath, dateOfNote, dayKey, formatDate, loadDailySettings, saveDailySettings, type DailySettings } from './daily';

export interface CalendarHooks {
  /** The notes of the folder (paths). */
  notes(): string[];
  /** The note open now. */
  current(): string | undefined;
  /** Open the note of a day, created first when there is none. */
  openDay(date: Date): void;
}

const lang = (): string | undefined => document.documentElement.lang || undefined;

export class DailyCalendar {
  readonly element = h('div', { class: 'daily-calendar' });
  private month: Date;
  private settingsShown = false;

  constructor(private readonly hooks: CalendarHooks) {
    const now = new Date();
    this.month = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  /** Show the month of a day. */
  showMonthOf(date: Date): void {
    this.month = new Date(date.getFullYear(), date.getMonth(), 1);
    this.render();
  }

  render(): void {
    const settings = loadDailySettings();
    const days = new Map<string, string>();
    for (const path of this.hooks.notes()) {
      const key = dateOfNote(path, settings);
      if (key) days.set(key, path);
    }
    const current = this.hooks.current();
    const today = dayKey(new Date());
    const year = this.month.getFullYear();
    const month = this.month.getMonth();
    const title = new Intl.DateTimeFormat(lang(), { month: 'long', year: 'numeric' }).format(this.month);
    const move = (by: number): void => {
      this.month = new Date(year, month + by, 1);
      this.render();
    };
    // Weeks from Monday (ISO 8601).
    const first = (new Date(year, month, 1).getDay() + 6) % 7;
    const count = new Date(year, month + 1, 0).getDate();
    const names = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(lang(), { weekday: 'narrow' }).format(new Date(2024, 0, 1 + i)));
    const cells: HTMLElement[] = names.map((n) => h('span', { class: 'daily-weekday', 'aria-hidden': 'true' }, n));
    for (let i = 0; i < first; i++) cells.push(h('span', { class: 'daily-blank' }));
    for (let d = 1; d <= count; d++) {
      const date = new Date(year, month, d);
      const key = dayKey(date);
      const note = days.get(key);
      const long = new Intl.DateTimeFormat(lang(), { dateStyle: 'full' }).format(date);
      const cell = button(note ? t('daily.hasNote', { date: long }) : t('daily.newNote', { date: long }), () => this.hooks.openDay(date), {
        text: String(d),
        className: `daily-day${note ? ' has-note' : ''}${key === today ? ' today' : ''}${note && note === current ? ' current' : ''}`,
      });
      if (key === today) cell.setAttribute('aria-current', 'date');
      cells.push(cell);
    }
    const gear = button(t('daily.settings'), () => {
      this.settingsShown = !this.settingsShown;
      this.render();
    }, { text: '⚙', className: 'icon', pressed: this.settingsShown });
    this.element.replaceChildren(
      h(
        'div',
        { class: 'daily-head' },
        button(t('daily.prev'), () => move(-1), { text: '‹', className: 'icon' }),
        h('span', { class: 'daily-month', 'aria-live': 'polite' }, title),
        button(t('daily.next'), () => move(1), { text: '›', className: 'icon' }),
        button(t('daily.today'), () => {
          this.showMonthOf(new Date());
          this.hooks.openDay(new Date());
        }, { className: 'daily-today' }),
        gear,
      ),
      this.settingsShown ? this.settingsForm(settings) : '',
      h('div', { class: 'daily-grid', role: 'group', 'aria-label': title }, ...cells),
    );
  }

  private settingsForm(settings: DailySettings): HTMLElement {
    const field = (label: string, value: string, change: (v: string) => Partial<DailySettings>, placeholder = ''): HTMLElement => {
      const input = h('input', { type: 'text', value, placeholder, spellcheck: 'false' });
      input.addEventListener('change', () => {
        saveDailySettings({ ...loadDailySettings(), ...change(input.value) });
        this.render();
        this.element.querySelector<HTMLInputElement>(`input[aria-label="${CSS.escape(label)}"]`)?.focus();
      });
      input.setAttribute('aria-label', label);
      return h('label', {}, h('span', {}, label), input);
    };
    const example = dailyPath(new Date(), settings, lang());
    return h(
      'div',
      { class: 'daily-settings', role: 'group', 'aria-label': t('daily.settings') },
      field(t('daily.format'), settings.format, (v) => ({ format: v.trim() || 'YYYY-MM-DD' }), 'YYYY-MM-DD'),
      h('p', { class: 'hint' }, t('daily.formatHint')),
      field(t('daily.folder'), settings.folder, (v) => ({ folder: v }), t('daily.root')),
      field(t('daily.template'), settings.template, (v) => ({ template: v.trim() }), 'Templates/Daily.md'),
      h('p', { class: 'hint daily-example' }, t('daily.example', { path: example, title: formatDate(new Date(), settings.format, lang()).split('/').pop()! })),
    );
  }
}
