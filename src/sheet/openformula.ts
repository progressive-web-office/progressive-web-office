/** OpenFormula (ODF) <-> Excel A1 formula syntax conversion (SHEET-012). */
import { quoteSheet } from './address';
import { tokenize, type RefPart, type RefToken } from './formula';
import { colName } from './address';

/** Split on a separator outside single-quoted segments. */
function splitOutsideQuotes(s: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (const ch of s) {
    if (ch === "'") quoted = !quoted;
    if (ch === sep && !quoted) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function convertRef(inner: string): string {
  const parts = splitOutsideQuotes(inner, ':').map((p) => {
    const dot = (() => {
      let quoted = false;
      for (let i = p.length - 1; i >= 0; i--) {
        if (p[i] === "'") quoted = !quoted;
        if (p[i] === '.' && !quoted) return i;
      }
      return -1;
    })();
    let sheet = dot >= 0 ? p.slice(0, dot) : '';
    const cell = dot >= 0 ? p.slice(dot + 1) : p;
    sheet = sheet.replace(/^\$/, '');
    if (sheet.startsWith("'") && sheet.endsWith("'")) sheet = sheet.slice(1, -1).replace(/''/g, "'");
    return { sheet, cell };
  });
  const sheet = parts[0]?.sheet;
  const prefix = sheet ? `${quoteSheet(sheet)}!` : '';
  return prefix + parts.map((p) => p.cell).join(':');
}

/** `of:=SUM([.A1:.B2];[$S.C3])` -> `SUM(A1:B2,S!C3)` */
export function ofToExcel(formula: string): string {
  const src = formula.replace(/^(?:of:)?=/, '');
  let out = '';
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (ch === '"') {
      let j = i + 1;
      while (j < src.length && !(src[j] === '"' && src[j + 1] !== '"')) j += src[j] === '"' ? 2 : 1;
      out += src.slice(i, j + 1);
      i = j + 1;
    } else if (ch === '[') {
      let j = i + 1;
      let quoted = false;
      while (j < src.length && (src[j] !== ']' || quoted)) {
        if (src[j] === "'") quoted = !quoted;
        j++;
      }
      out += convertRef(src.slice(i + 1, j));
      i = j + 1;
    } else if (ch === ';') {
      out += ',';
      i++;
    } else if (/^COM\.MICROSOFT\./i.test(src.slice(i, i + 14)) && !/[A-Za-z0-9_.]/.test(src[i - 1] ?? '')) {
      // SHEET-025: functions LibreOffice writes with Excel's namespace (IFS, XLOOKUP…).
      i += 14;
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

function partText(p: RefPart): string {
  return `${p.col !== undefined ? `${p.absCol ? '$' : ''}${colName(p.col)}` : ''}${p.row !== undefined ? `${p.absRow ? '$' : ''}${p.row + 1}` : ''}`;
}

function ofSheet(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`;
}

/** SHEET-025: functions OpenDocument files name in Excel's namespace, as LibreOffice does. */
const OF_MICROSOFT = new Set(['IFS', 'SWITCH', 'TEXTJOIN', 'MAXIFS', 'MINIFS', 'XLOOKUP', 'CEILING.MATH', 'FLOOR.MATH', 'RANK.EQ', 'MODE.SNGL', 'PERCENTILE.INC', 'QUARTILE.INC']);

/** `SUM(A1:B2,S!C3)` -> `of:=SUM([.A1:.B2];[$S.C3])` */
export function excelToOf(formula: string): string {
  let tokens;
  try {
    tokens = tokenize(formula);
  } catch {
    return `of:=${formula}`;
  }
  let out = '';
  let last = 0;
  for (const tok of tokens) {
    if (tok.type === 'ref') {
      const t = tok as RefToken;
      const sheet = t.sheet !== undefined ? `$${ofSheet(t.sheet)}` : '';
      out += formula.slice(last, tok.start) + `[${sheet}.${partText(t.a)}${t.b ? `:.${partText(t.b)}` : ''}]`;
      last = tok.end;
    } else if (tok.type === ',') {
      out += formula.slice(last, tok.start) + ';';
      last = tok.end;
    } else if (tok.type === 'name' && OF_MICROSOFT.has(tok.value)) {
      out += `${formula.slice(last, tok.start)}COM.MICROSOFT.${tok.value}`;
      last = tok.end;
    }
  }
  return `of:=${out}${formula.slice(last)}`;
}
