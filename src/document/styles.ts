/**
 * DOC-053: named paragraph styles of a document — "Abstract", "Definition",
 * "Instruction"… — each a name and a look (font, size, colour, weight, slant,
 * alignment, spacing), given to paragraphs: changing the style changes every
 * paragraph that has it. Kept in OpenDocument and Word files as their
 * paragraph styles, read back from them.
 */
import { escapeXml as esc } from '../core/xml';
import type { Align } from './model';

export interface NamedStyle {
  /** Stable identifier, safe in a file (letters, digits, underscores). */
  id: string;
  name: string;
  font?: string;
  /** Points. */
  size?: number;
  /** `#rrggbb`. */
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  smallCaps?: boolean;
  align?: Align;
  /** Points. */
  spaceBefore?: number;
  spaceAfter?: number;
  indent?: number;
  firstLine?: number;
  /** Times the normal line height. */
  lineHeight?: number;
}

const HEX = /^#[0-9a-f]{6}$/i;
const ALIGNS: Align[] = ['left', 'center', 'right', 'justify'];

/** An identifier for a style name, unique among `taken`. */
export function styleId(name: string, taken: Iterable<string> = []): string {
  const used = new Set(taken);
  const base =
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'Style';
  let id = /^[A-Za-z]/.test(base) ? base : `S_${base}`;
  for (let i = 2; used.has(id); i++) id = `${base}_${i}`;
  return id;
}

/** Only well-formed styles (from a file, the network). */
export function cleanNamedStyles(data: unknown): NamedStyle[] | undefined {
  if (!Array.isArray(data)) return undefined;
  const num = (v: unknown, lo: number, hi: number): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : undefined);
  const out: NamedStyle[] = [];
  const ids = new Set<string>();
  for (const raw of data as Record<string, unknown>[]) {
    if (!raw || typeof raw.id !== 'string' || !/^[A-Za-z][\w-]{0,63}$/.test(raw.id) || ids.has(raw.id) || typeof raw.name !== 'string' || !raw.name.trim()) continue;
    ids.add(raw.id);
    const s: NamedStyle = { id: raw.id, name: raw.name.trim().slice(0, 80) };
    if (typeof raw.font === 'string' && raw.font.trim()) s.font = raw.font.trim().slice(0, 80);
    const size = num(raw.size, 1, 999);
    if (size !== undefined) s.size = size;
    if (typeof raw.color === 'string' && HEX.test(raw.color)) s.color = raw.color.toLowerCase();
    for (const k of ['bold', 'italic', 'underline', 'smallCaps'] as const) if (raw[k] === true) s[k] = true;
    if (ALIGNS.includes(raw.align as Align)) s.align = raw.align as Align;
    for (const k of ['spaceBefore', 'spaceAfter', 'indent', 'firstLine'] as const) {
      const v = num(raw[k], -500, 500);
      if (v !== undefined) s[k] = v;
    }
    const lh = num(raw.lineHeight, 0.5, 5);
    if (lh !== undefined) s.lineHeight = lh;
    out.push(s);
  }
  return out.length ? out : undefined;
}

/** The CSS of the styles, for paragraphs marked `data-named` under `scope`. */
export function namedStylesCss(styles: NamedStyle[] | undefined, scope: string): string {
  return (styles ?? [])
    .map((s) => {
      const css: string[] = [];
      if (s.font) css.push(`font-family: ${JSON.stringify(s.font)}, sans-serif`);
      if (s.size) css.push(`font-size: ${s.size}pt`);
      if (s.color) css.push(`color: ${s.color}`);
      if (s.bold) css.push('font-weight: bold');
      if (s.italic) css.push('font-style: italic');
      if (s.underline) css.push('text-decoration: underline');
      if (s.smallCaps) css.push('font-variant: small-caps');
      if (s.align) css.push(`text-align: ${s.align}`);
      if (s.spaceBefore !== undefined) css.push(`margin-top: ${s.spaceBefore}pt`);
      if (s.spaceAfter !== undefined) css.push(`margin-bottom: ${s.spaceAfter}pt`);
      if (s.indent) css.push(`margin-left: ${s.indent}pt`);
      if (s.firstLine) css.push(`text-indent: ${s.firstLine}pt`);
      if (s.lineHeight) css.push(`line-height: ${s.lineHeight * 1.2}`);
      return css.length ? `${scope} [data-named="${s.id}"] { ${css.join('; ')} }` : '';
    })
    .filter(Boolean)
    .join('\n');
}

// --- OpenDocument ------------------------------------------------------------------

/** The name of the style in an OpenDocument file. */
export const odfStyleName = (s: NamedStyle): `PWO_${string}` => `PWO_${s.id}`;

/** The `<style:style>` of a named style, in `office:styles`. */
export function odfNamedStyle(s: NamedStyle): string {
  const pp: string[] = [];
  if (s.align) pp.push(`fo:text-align="${s.align === 'right' ? 'end' : s.align === 'left' ? 'start' : s.align}"`);
  if (s.spaceBefore !== undefined) pp.push(`fo:margin-top="${s.spaceBefore}pt"`);
  if (s.spaceAfter !== undefined) pp.push(`fo:margin-bottom="${s.spaceAfter}pt"`);
  if (s.indent) pp.push(`fo:margin-left="${s.indent}pt"`);
  if (s.firstLine) pp.push(`fo:text-indent="${s.firstLine}pt"`);
  if (s.lineHeight) pp.push(`fo:line-height="${Math.round(s.lineHeight * 100)}%"`);
  const tp: string[] = [];
  if (s.font) tp.push(`style:font-name="${esc(s.font)}" fo:font-family="${esc(s.font)}"`);
  if (s.size) tp.push(`fo:font-size="${s.size}pt"`);
  if (s.color) tp.push(`fo:color="${s.color}"`);
  if (s.bold) tp.push('fo:font-weight="bold" style:font-weight-asian="bold" style:font-weight-complex="bold"');
  if (s.italic) tp.push('fo:font-style="italic" style:font-style-asian="italic" style:font-style-complex="italic"');
  if (s.underline) tp.push('style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"');
  if (s.smallCaps) tp.push('fo:font-variant="small-caps"');
  return (
    `<style:style style:name="${odfStyleName(s)}" style:display-name="${esc(s.name)}" style:family="paragraph" style:parent-style-name="Standard" style:class="text">` +
    (pp.length ? `<style:paragraph-properties ${pp.join(' ')}/>` : '') +
    (tp.length ? `<style:text-properties ${tp.join(' ')}/>` : '') +
    '</style:style>'
  );
}

/** A named style from the properties of an OpenDocument style. */
export function namedFromOdf(id: string, name: string, pp: Element | undefined, tp: Element | undefined, pt: (v: string | null) => number | undefined): NamedStyle {
  const s: NamedStyle = { id, name };
  const a = (el: Element | undefined, n: string): string | null => (el ? (el.getAttributeNS('urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0', n) ?? el.getAttributeNS('urn:oasis:names:tc:opendocument:xmlns:style:1.0', n)) : null);
  const align = a(pp, 'text-align');
  if (align === 'center' || align === 'justify') s.align = align;
  else if (align === 'end' || align === 'right') s.align = 'right';
  else if (align === 'start' || align === 'left') s.align = 'left';
  const set = (k: 'spaceBefore' | 'spaceAfter' | 'indent' | 'firstLine', v: string | null): void => {
    const n = pt(v);
    if (n !== undefined) s[k] = n;
  };
  set('spaceBefore', a(pp, 'margin-top'));
  set('spaceAfter', a(pp, 'margin-bottom'));
  set('indent', a(pp, 'margin-left'));
  set('firstLine', a(pp, 'text-indent'));
  const lh = a(pp, 'line-height');
  if (lh?.endsWith('%')) s.lineHeight = Number(lh.slice(0, -1)) / 100;
  const font = (a(tp, 'font-family') ?? a(tp, 'font-name'))?.replace(/^['"]|['"]$/g, '');
  if (font) s.font = font;
  const size = pt(a(tp, 'font-size'));
  if (size) s.size = size;
  const color = a(tp, 'color');
  if (color && HEX.test(color) && color.toLowerCase() !== '#000000') s.color = color.toLowerCase();
  const weight = a(tp, 'font-weight');
  if (weight === 'bold' || Number(weight) >= 600) s.bold = true;
  if (a(tp, 'font-style') === 'italic') s.italic = true;
  const u = a(tp, 'text-underline-style');
  if (u && u !== 'none') s.underline = true;
  if (a(tp, 'font-variant') === 'small-caps') s.smallCaps = true;
  return cleanNamedStyles([s])?.[0] ?? { id, name };
}

// --- Word ----------------------------------------------------------------------------

/** The `<w:style>` of a named style, in styles.xml. */
export function docxNamedStyle(s: NamedStyle): string {
  const ppr: string[] = [];
  if (s.spaceBefore !== undefined || s.spaceAfter !== undefined || s.lineHeight) {
    const attrs = [s.spaceBefore !== undefined ? `w:before="${Math.round(s.spaceBefore * 20)}"` : '', s.spaceAfter !== undefined ? `w:after="${Math.round(s.spaceAfter * 20)}"` : '', s.lineHeight ? `w:line="${Math.round(s.lineHeight * 240)}" w:lineRule="auto"` : ''].filter(Boolean);
    ppr.push(`<w:spacing ${attrs.join(' ')}/>`);
  }
  if (s.indent || s.firstLine) ppr.push(`<w:ind${s.indent ? ` w:left="${Math.round(s.indent * 20)}"` : ''}${s.firstLine ? (s.firstLine > 0 ? ` w:firstLine="${Math.round(s.firstLine * 20)}"` : ` w:hanging="${Math.round(-s.firstLine * 20)}"`) : ''}/>`);
  if (s.align) ppr.push(`<w:jc w:val="${s.align === 'justify' ? 'both' : s.align}"/>`);
  const rpr: string[] = [];
  if (s.font) rpr.push(`<w:rFonts w:ascii="${esc(s.font)}" w:hAnsi="${esc(s.font)}" w:cs="${esc(s.font)}"/>`);
  if (s.bold) rpr.push('<w:b/>');
  if (s.italic) rpr.push('<w:i/>');
  if (s.smallCaps) rpr.push('<w:smallCaps/>');
  if (s.underline) rpr.push('<w:u w:val="single"/>');
  if (s.color) rpr.push(`<w:color w:val="${s.color.slice(1).toUpperCase()}"/>`);
  if (s.size) rpr.push(`<w:sz w:val="${Math.round(s.size * 2)}"/>`);
  return `<w:style w:type="paragraph" w:customStyle="1" w:styleId="${s.id}"><w:name w:val="${esc(s.name)}"/><w:basedOn w:val="Normal"/><w:qFormat/>${ppr.length ? `<w:pPr>${ppr.join('')}</w:pPr>` : ''}${rpr.length ? `<w:rPr>${rpr.join('')}</w:rPr>` : ''}</w:style>`;
}

/** A named style from a Word `<w:style>`. */
export function namedFromDocx(id: string, name: string, el: Element): NamedStyle {
  const s: NamedStyle = { id, name };
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const first = (parent: Element | undefined, tag: string): Element | undefined => parent?.getElementsByTagNameNS(W, tag)[0];
  const val = (e: Element | undefined, n = 'val'): string | null => e?.getAttributeNS(W, n) ?? e?.getAttribute(`w:${n}`) ?? null;
  const on = (e: Element | undefined): boolean => !!e && !/^(0|false|off)$/.test(val(e) ?? '');
  const ppr = first(el, 'pPr');
  const rpr = first(el, 'rPr');
  const spacing = first(ppr, 'spacing');
  const twip = (v: string | null): number | undefined => (v !== null && Number.isFinite(Number(v)) ? Number(v) / 20 : undefined);
  const before = twip(val(spacing, 'before'));
  if (before !== undefined) s.spaceBefore = before;
  const after = twip(val(spacing, 'after'));
  if (after !== undefined) s.spaceAfter = after;
  const line = val(spacing, 'line');
  if (line && (val(spacing, 'lineRule') ?? 'auto') === 'auto') s.lineHeight = Number(line) / 240;
  const ind = first(ppr, 'ind');
  const left = twip(val(ind, 'left') ?? val(ind, 'start'));
  if (left) s.indent = left;
  const fl = twip(val(ind, 'firstLine'));
  const hanging = twip(val(ind, 'hanging'));
  if (fl) s.firstLine = fl;
  else if (hanging) s.firstLine = -hanging;
  const jc = val(first(ppr, 'jc'));
  if (jc === 'center') s.align = 'center';
  else if (jc === 'both' || jc === 'distribute') s.align = 'justify';
  else if (jc === 'right' || jc === 'end') s.align = 'right';
  const font = val(first(rpr, 'rFonts'), 'ascii');
  if (font) s.font = font;
  const sz = val(first(rpr, 'sz'));
  if (sz && Number(sz) > 0) s.size = Number(sz) / 2;
  const color = val(first(rpr, 'color'));
  if (color && /^[0-9a-f]{6}$/i.test(color) && color !== '000000') s.color = `#${color.toLowerCase()}`;
  if (on(first(rpr, 'b'))) s.bold = true;
  if (on(first(rpr, 'i'))) s.italic = true;
  if (on(first(rpr, 'smallCaps'))) s.smallCaps = true;
  const u = val(first(rpr, 'u'));
  if (u && u !== 'none') s.underline = true;
  return cleanNamedStyles([s])?.[0] ?? { id, name };
}
