/** Display formatting of cell values with a subset of number format codes. */
import { formatGeneral } from './engine';
import { isError, serialToDate, type Value } from './model';

/** Remove quoted literals, escapes and bracketed sections. */
function stripLiterals(fmt: string): string {
  return fmt.replace(/"[^"]*"/g, '').replace(/\\./g, '').replace(/\[[^\]]*\]/g, '');
}

export function isDateFormat(fmt: string | undefined): boolean {
  if (!fmt) return false;
  const core = stripLiterals(fmt.split(';')[0]!);
  return /[ydhs]/i.test(core) || (/m/i.test(core) && !/[0#?]/.test(core));
}

const pad = (n: number, w = 2): string => String(n).padStart(w, '0');

function formatDate(serial: number, fmt: string): string {
  const d = serialToDate(serial);
  const core = fmt.split(';')[0]!.replace(/\[[^\]]*\]/g, '').replace(/"([^"]*)"/g, '$1').replace(/\\(.)/g, '$1');
  const hasTime = /h/i.test(core);
  // "m" after "h" or before "s" means minutes.
  return core.replace(/yyyy|yy|mmmm|mmm|mm|m|dddd|ddd|dd|d|hh|h|ss|s|am\/pm/gi, (tok, offset: number) => {
    const t = tok.toLowerCase();
    const before = core.slice(0, offset).toLowerCase();
    const after = core.slice(offset + tok.length).toLowerCase();
    const minute = (t === 'mm' || t === 'm') && hasTime && (/h[^a-z]*$/.test(before) || /^[^a-z]*s/.test(after));
    switch (t) {
      case 'yyyy':
        return String(d.getUTCFullYear());
      case 'yy':
        return pad(d.getUTCFullYear() % 100);
      case 'mmmm':
        return d.toLocaleString('en', { month: 'long', timeZone: 'UTC' });
      case 'mmm':
        return d.toLocaleString('en', { month: 'short', timeZone: 'UTC' });
      case 'mm':
        return minute ? pad(d.getUTCMinutes()) : pad(d.getUTCMonth() + 1);
      case 'm':
        return minute ? String(d.getUTCMinutes()) : String(d.getUTCMonth() + 1);
      case 'dddd':
        return d.toLocaleString('en', { weekday: 'long', timeZone: 'UTC' });
      case 'ddd':
        return d.toLocaleString('en', { weekday: 'short', timeZone: 'UTC' });
      case 'dd':
        return pad(d.getUTCDate());
      case 'd':
        return String(d.getUTCDate());
      case 'hh':
        return pad(d.getUTCHours());
      case 'h':
        return String(d.getUTCHours());
      case 'ss':
        return pad(d.getUTCSeconds());
      case 's':
        return String(d.getUTCSeconds());
      default:
        return d.getUTCHours() < 12 ? 'AM' : 'PM';
    }
  });
}

function formatNumber(n: number, fmt: string): string {
  const sections = fmt.split(';');
  let section = sections[0]!;
  if (n < 0 && sections[1]) {
    section = sections[1];
    n = Math.abs(n);
  } else if (n === 0 && sections[2]) {
    section = sections[2];
  }
  // Currency/locale tags like [$€-40C] -> €
  section = section.replace(/\[\$([^\]-]*)(-[^\]]*)?\]/g, '"$1"').replace(/\[[^\]]*\]/g, '');
  const m = /[#0?][#0?,.]*%?/.exec(stripLiterals(section).length ? section.replace(/"[^"]*"/g, (q) => ' '.repeat(q.length)) : '');
  if (!m) return formatGeneral(n);
  const pattern = m[0];
  const unquote = (s: string): string => s.replace(/"([^"]*)"/g, '$1').replace(/\\(.)/g, '$1').replace(/_./g, ' ').replace(/\*./g, '');
  const prefix = unquote(section.slice(0, m.index));
  const suffix = unquote(section.slice(m.index + pattern.length));
  const percent = pattern.endsWith('%');
  const numPart = percent ? pattern.slice(0, -1) : pattern;
  const [intPat = '', decPat = ''] = numPart.split('.');
  const decimals = decPat.replace(/[^0#?]/g, '').length;
  const thousands = intPat.includes(',');
  let value = percent ? n * 100 : n;
  const negative = value < 0;
  value = Math.abs(value);
  let [int, dec = ''] = value.toFixed(decimals).split('.');
  if (thousands) int = int!.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const minInt = (intPat.match(/0/g) ?? []).length;
  if (int === '0' && minInt === 0 && decimals) int = '';
  const body = `${int}${decimals ? `.${dec}` : ''}${percent ? '%' : ''}`;
  return `${negative ? '-' : ''}${prefix}${body}${suffix}`;
}

/** Text displayed for a computed value. */
export function formatValue(value: Value, numFmt?: string): string {
  if (value === null) return '';
  if (isError(value)) return value.error;
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'string') return value;
  if (!numFmt || /^general$/i.test(numFmt) || numFmt === '@') return formatGeneral(value);
  if (isDateFormat(numFmt)) return formatDate(value, numFmt);
  return formatNumber(value, numFmt);
}
