/**
 * FOLDER-027: daily notes — one note per day, named after its date in a
 * format the user chooses (`YYYY-MM-DD` by default; a `/` in it makes
 * sub-folders), in a folder, made from a template — found again by their
 * name to show them on a calendar.
 */

export interface DailySettings {
  /** Tokens: YYYY YY MMMM MMM MM M DD D dddd ddd ww HH mm; `[text]` is kept as written. */
  format: string;
  /** Folder of the daily notes, from the root of the open folder ('' for the root). */
  folder: string;
  /** A note used as the template of the new daily notes ('' for none). */
  template: string;
}

const KEY = 'pwo.notes.daily';
export const DEFAULT_DAILY: DailySettings = { format: 'YYYY-MM-DD', folder: '', template: '' };

export function loadDailySettings(): DailySettings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<DailySettings>;
    return {
      format: typeof saved.format === 'string' && saved.format.trim() ? saved.format : DEFAULT_DAILY.format,
      folder: typeof saved.folder === 'string' ? cleanFolder(saved.folder) : '',
      template: typeof saved.template === 'string' ? saved.template : '',
    };
  } catch {
    return { ...DEFAULT_DAILY };
  }
}

export function saveDailySettings(settings: DailySettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...settings, folder: cleanFolder(settings.folder) }));
  } catch {
    /* not kept */
  }
}

const cleanFolder = (folder: string): string => folder.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');

const TOKEN = /\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|DD|D|dddd|ddd|ww|HH|mm/g;
const pad = (n: number, width = 2): string => String(n).padStart(width, '0');

/** The ISO week of a date (1–53). */
export function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - start.getTime()) / 86_400_000 + 1) / 7);
}

/** A date written in a format, the names of months and days in `lang`. */
export function formatDate(date: Date, format: string, lang?: string): string {
  const name = (opts: Intl.DateTimeFormatOptions): string => new Intl.DateTimeFormat(lang, opts).format(date);
  return format.replace(TOKEN, (token, literal: string | undefined) => {
    if (literal !== undefined) return literal;
    switch (token) {
      case 'YYYY':
        return pad(date.getFullYear(), 4);
      case 'YY':
        return pad(date.getFullYear() % 100);
      case 'MMMM':
        return name({ month: 'long' });
      case 'MMM':
        return name({ month: 'short' });
      case 'MM':
        return pad(date.getMonth() + 1);
      case 'M':
        return String(date.getMonth() + 1);
      case 'DD':
        return pad(date.getDate());
      case 'D':
        return String(date.getDate());
      case 'dddd':
        return name({ weekday: 'long' });
      case 'ddd':
        return name({ weekday: 'short' });
      case 'ww':
        return pad(isoWeek(date));
      case 'HH':
        return pad(date.getHours());
      case 'mm':
        return pad(date.getMinutes());
      default:
        return token;
    }
  });
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The day a note is for, read from its path (from the root of the open
 * folder) by the format and the folder; `undefined` for another note.
 */
export function dateOfNote(path: string, settings: DailySettings): string | undefined {
  const folder = cleanFolder(settings.folder);
  if (folder && !path.startsWith(`${folder}/`)) return undefined;
  const rest = (folder ? path.slice(folder.length + 1) : path).replace(/\.(md|markdown)$/i, '');
  if (rest === path) return undefined;
  const groups: string[] = [];
  let source = '';
  let at = 0;
  for (const m of settings.format.matchAll(TOKEN)) {
    source += escape(settings.format.slice(at, m.index));
    at = m.index! + m[0].length;
    if (m[1] !== undefined) {
      source += escape(m[1]);
      continue;
    }
    const kind = m[0];
    groups.push(kind);
    source += kind === 'YYYY' ? '(\\d{4})' : kind === 'YY' || kind === 'MM' || kind === 'DD' || kind === 'ww' || kind === 'HH' || kind === 'mm' ? '(\\d{2})' : kind === 'M' || kind === 'D' ? '(\\d{1,2})' : '([^/]+?)';
  }
  source += escape(settings.format.slice(at));
  const m = new RegExp(`^${source}$`, 'u').exec(rest);
  if (!m) return undefined;
  let year: number | undefined;
  let month: number | undefined;
  let day: number | undefined;
  groups.forEach((kind, i) => {
    const v = m[i + 1]!;
    if (kind === 'YYYY') year = Number(v);
    else if (kind === 'YY') year = 2000 + Number(v);
    else if (kind === 'MM' || kind === 'M') month = Number(v);
    else if (kind === 'DD' || kind === 'D') day = Number(v);
  });
  if (year === undefined || month === undefined || day === undefined) return undefined;
  const d = new Date(year, month - 1, day);
  if (d.getMonth() !== month - 1 || d.getDate() !== day) return undefined;
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

/** The path of the note of a day. */
export function dailyPath(date: Date, settings: DailySettings, lang?: string): string {
  const folder = cleanFolder(settings.folder);
  return `${folder ? `${folder}/` : ''}${formatDate(date, settings.format, lang)}.md`;
}

/** A template with its fields filled: `{{title}}`, `{{date}}`, `{{date:FORMAT}}`, `{{time}}`. */
export function fillTemplate(template: string, date: Date, title: string, settings: DailySettings, lang?: string): string {
  return template.replace(/\{\{\s*(title|date|time)(?::([^}]*))?\s*\}\}/g, (_, field: string, format: string | undefined) =>
    field === 'title' ? title : field === 'time' ? formatDate(new Date(), format?.trim() || 'HH:mm', lang) : formatDate(date, format?.trim() || settings.format, lang),
  );
}

/** The text of a new daily note: its template filled, or its title. */
export function dailyText(date: Date, settings: DailySettings, template: string | undefined, lang?: string): string {
  const title = formatDate(date, settings.format, lang).split('/').pop()!;
  return template ? fillTemplate(template, date, title, settings, lang) : `# ${title}\n\n`;
}

/** Local `YYYY-MM-DD` of a date. */
export const dayKey = (date: Date): string => `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
