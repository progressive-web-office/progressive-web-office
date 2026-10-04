/**
 * FORM-005: the format of a text field of a PDF form — a number, an integer,
 * a date, an e-mail address, a phone number or a pattern of one's own —
 * checked while filling it here, and written in the file as the JavaScript
 * actions of PDF forms (keystroke, format, validate) for the other readers.
 * The validate script starts with a comment holding the format, read back
 * when the file is opened again.
 */

export type FieldFormat =
  | { kind: 'number'; decimals: number }
  | { kind: 'integer' }
  | { kind: 'date'; pattern: string }
  | { kind: 'email' }
  | { kind: 'phone' }
  | { kind: 'regex'; pattern: string; message?: string };

export type FormatKind = FieldFormat['kind'];
export const FORMAT_KINDS: FormatKind[] = ['number', 'integer', 'date', 'email', 'phone', 'regex'];
export const DATE_PATTERNS = ['dd/mm/yyyy', 'mm/dd/yyyy', 'yyyy-mm-dd', 'dd.mm.yyyy', 'dd-mm-yyyy', 'dd/mm/yy'];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9][0-9 .()/-]{5,}$/;

/** A pattern of one's own, or null when it is not a valid regular expression. */
export function userRegex(pattern: string): RegExp | null {
  try {
    // Anchored: the whole value must match.
    return new RegExp(`^(?:${pattern})$`, 'u');
  } catch {
    return null;
  }
}

/** The day, month and year of a date written as the pattern says, or null. */
export function parseDate(pattern: string, value: string): { d: number; m: number; y: number } | null {
  const order: ('d' | 'm' | 'y')[] = [];
  let re = '';
  for (let i = 0; i < pattern.length; ) {
    const rest = pattern.slice(i);
    const token = /^(yyyy|yy|mm|dd)/.exec(rest)?.[1];
    if (token) {
      order.push(token[0] as 'd' | 'm' | 'y');
      re += token === 'yyyy' ? '(\\d{4})' : '(\\d{1,2})';
      i += token.length;
    } else {
      re += pattern[i]!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      i++;
    }
  }
  const m = new RegExp(`^${re}$`).exec(value.trim());
  if (!m) return null;
  const parts = { d: 0, m: 0, y: 0 };
  order.forEach((k, i) => (parts[k] = Number(m[i + 1])));
  if (pattern.includes('yy') && !pattern.includes('yyyy')) parts.y += 2000;
  const date = new Date(parts.y, parts.m - 1, parts.d);
  return date.getFullYear() === parts.y && date.getMonth() === parts.m - 1 && date.getDate() === parts.d ? parts : null;
}

/** Whether a value suits the format; an empty value always does (required is another rule). */
export function checkValue(format: FieldFormat | undefined, value: string): boolean {
  const v = value.trim();
  if (!format || !v) return true;
  switch (format.kind) {
    case 'number':
      return new RegExp(`^-?\\d+(?:[.,]\\d{0,${Math.max(0, format.decimals)}})?$`).test(v);
    case 'integer':
      return /^-?\d+$/.test(v);
    case 'date':
      return !!parseDate(format.pattern, v);
    case 'email':
      return EMAIL.test(v);
    case 'phone':
      return PHONE.test(v);
    case 'regex':
      return userRegex(format.pattern)?.test(v) ?? true;
  }
}

/** The pattern a browser input can check by itself (`pattern` attribute), when there is one. */
export function inputPattern(format: FieldFormat | undefined): string | undefined {
  if (!format) return undefined;
  if (format.kind === 'integer') return '-?\\d+';
  if (format.kind === 'regex' && userRegex(format.pattern)) return format.pattern;
  return undefined;
}

const MARK = /\/\*\s*pwo-format:\s*(\{.*?\})\s*\*\//;
const jsString = (s: string): string => JSON.stringify(s);

/**
 * The JavaScript actions of a field with this format, as PDF readers know
 * them: K (each keystroke), F (how the value is shown), V (whether it is
 * valid). The standard AFNumber / AFDate functions where they exist.
 */
export function formatActions(format: FieldFormat, invalid: string): { K?: string; F?: string; V: string } {
  const mark = `/* pwo-format: ${JSON.stringify(format)} */`;
  const reject = (test: string): string => `${mark}\nif (event.value && !(${test})) { app.alert(${jsString(invalid)}); event.rc = false; }`;
  switch (format.kind) {
    case 'number':
      return { K: `AFNumber_Keystroke(${format.decimals}, 1, 0, 0, "", true);`, F: `AFNumber_Format(${format.decimals}, 1, 0, 0, "", true);`, V: mark };
    case 'integer':
      return { K: 'AFNumber_Keystroke(0, 1, 0, 0, "", true);', F: 'AFNumber_Format(0, 1, 0, 0, "", true);', V: mark };
    case 'date':
      return { K: `AFDate_KeystrokeEx(${jsString(format.pattern)});`, F: `AFDate_FormatEx(${jsString(format.pattern)});`, V: mark };
    case 'email':
      return { V: reject(`${EMAIL}.test(event.value)`) };
    case 'phone':
      return { V: reject(`${PHONE}.test(event.value)`) };
    case 'regex':
      return { V: reject(`new RegExp(${jsString(`^(?:${format.pattern})$`)}).test(event.value)`) };
  }
}

/** The format of a field from its scripts: ours by its comment, else the standard number and date functions. */
export function parseFormatScripts(scripts: { K?: string; F?: string; V?: string }): FieldFormat | undefined {
  const mark = MARK.exec(scripts.V ?? '')?.[1];
  if (mark) {
    try {
      const f = JSON.parse(mark) as FieldFormat;
      if (FORMAT_KINDS.includes(f.kind)) return f;
    } catch {
      /* not ours after all */
    }
  }
  const js = `${scripts.K ?? ''}\n${scripts.F ?? ''}`;
  const num = /AFNumber_(?:Keystroke|Format)\(\s*(\d+)/.exec(js);
  if (num) return Number(num[1]) === 0 ? { kind: 'integer' } : { kind: 'number', decimals: Number(num[1]) };
  const date = /AFDate_(?:Keystroke|Format)Ex\(\s*"([^"]+)"/.exec(js);
  if (date) return { kind: 'date', pattern: date[1]! };
  return undefined;
}
