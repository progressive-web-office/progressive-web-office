/**
 * COLOR-001, COLOR-002: a colour chosen by its hexadecimal, RGB or CMYK
 * values (or from swatches and the colours used lately), with what printing
 * will do to it: a screen colour a press cannot print, and too much ink.
 */
import { button, h } from '../app/dom';
import { t } from '../i18n';
import { cmykToHex, hexToCmyk, hexToRgb, inPrintGamut, proofColor, rgbToHex, totalInk, type Cmyk, type Rgb } from './convert';

const RECENT_KEY = 'pwo.colors.recent';
const MAX_INK = 300;

/** Swatches: greys, then vivid and soft colours of the usual hues. */
export const SWATCHES = [
  '#000000', '#404040', '#808080', '#bfbfbf', '#ffffff',
  '#c00000', '#e46c0a', '#ffc000', '#00b050', '#0070c0', '#7030a0',
  '#f2dcdb', '#fde9d9', '#fff2cc', '#e2efda', '#ddebf7', '#e4dfec',
];

export function recentColors(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as unknown;
    return Array.isArray(list) ? list.filter((c): c is string => typeof c === 'string' && !!hexToRgb(c)).slice(0, 8) : [];
  } catch {
    return [];
  }
}

export function rememberColor(hex: string): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([hex, ...recentColors().filter((c) => c !== hex)].slice(0, 8)));
  } catch {
    /* storage unavailable */
  }
}

/** The colour chosen (lower-case `#rrggbb`), or null when cancelled. */
export function colorDialog(host: HTMLElement, opts: { title: string; current: string }): Promise<string | null> {
  return new Promise((resolve) => {
    let hex = rgbToHex(hexToRgb(opts.current) ?? [0, 0, 0]);
    const num = (label: string, max: number): HTMLInputElement => h('input', { type: 'number', min: '0', max: String(max), step: 'any', 'aria-label': label, class: 'color-num' });
    const native = h('input', { type: 'color', 'aria-label': t('color.picker') });
    const hexInput = h('input', { type: 'text', 'aria-label': t('color.hex'), spellcheck: 'false', maxlength: '7', size: 8, class: 'color-hex' });
    const rgb = [num(t('color.red'), 255), num(t('color.green'), 255), num(t('color.blue'), 255)];
    const cmyk = [num(t('color.cyan'), 100), num(t('color.magenta'), 100), num(t('color.yellow'), 100), num(t('color.black'), 100)];
    const swatch = h('span', { class: 'color-swatch-big', 'aria-hidden': 'true' });
    const printed = h('span', { class: 'color-swatch-big printed', 'aria-hidden': 'true' });
    const gamut = h('p', { class: 'color-warning', role: 'status' });
    const usePrintable = button(t('color.usePrintable'), () => update(proofColor(hex)), { className: 'color-use-printable' });
    const ink = h('p', { class: 'color-warning', role: 'status' });
    const update = (next: string, from?: 'hex' | 'rgb' | 'cmyk' | 'native'): void => {
      hex = next;
      if (from !== 'native') native.value = hex;
      if (from !== 'hex') hexInput.value = hex;
      if (from !== 'rgb') hexToRgb(hex)!.forEach((v, i) => (rgb[i]!.value = String(v)));
      const values = from === 'cmyk' ? (cmyk.map((c) => Number(c.value) || 0) as Cmyk) : hexToCmyk(hex);
      if (from !== 'cmyk') values.forEach((v, i) => (cmyk[i]!.value = String(v)));
      swatch.style.background = hex;
      const proof = proofColor(hex);
      printed.style.background = proof;
      const ok = inPrintGamut(hex);
      gamut.textContent = ok ? t('color.printable') : t('color.outOfGamut');
      gamut.classList.toggle('warn', !ok);
      printed.hidden = usePrintable.hidden = ok;
      const total = totalInk(values);
      ink.textContent = t('color.ink', { n: total });
      ink.classList.toggle('warn', total > MAX_INK);
      if (total > MAX_INK) ink.textContent += ` ${t('color.tooMuchInk', { max: MAX_INK })}`;
    };
    native.addEventListener('input', () => update(native.value, 'native'));
    hexInput.addEventListener('input', () => {
      const v = hexInput.value.trim();
      const parsed = hexToRgb(v.startsWith('#') ? v : `#${v}`);
      if (parsed && /^#?[0-9a-f]{6}$/i.test(v)) update(rgbToHex(parsed), 'hex');
    });
    for (const input of rgb) input.addEventListener('input', () => update(rgbToHex(rgb.map((c) => Number(c.value) || 0) as Rgb), 'rgb'));
    for (const input of cmyk) input.addEventListener('input', () => update(cmykToHex(cmyk.map((c) => Number(c.value) || 0) as Cmyk), 'cmyk'));
    const swatchButton = (c: string): HTMLButtonElement => {
      const b = h('button', { type: 'button', class: 'color-swatch', title: c, 'aria-label': c }) as HTMLButtonElement;
      b.style.background = c;
      b.addEventListener('click', () => update(c));
      return b;
    };
    const recent = recentColors();
    const form = h(
      'form',
      { method: 'dialog' },
      h('h2', { id: 'color-title' }, opts.title),
      h('div', { class: 'color-swatches', role: 'group', 'aria-label': t('color.swatches') }, ...SWATCHES.map(swatchButton)),
      recent.length ? h('div', { class: 'color-swatches', role: 'group', 'aria-label': t('color.recent') }, h('span', { class: 'hint' }, t('color.recent')), ...recent.map(swatchButton)) : null,
      h('div', { class: 'color-preview' }, swatch, printed, native),
      h('label', { class: 'git-row' }, t('color.hex'), ' ', hexInput),
      h('fieldset', { class: 'color-values' }, h('legend', {}, t('color.rgb')), ...rgb.map((input, i) => h('label', {}, ['R', 'G', 'B'][i]!, ' ', input))),
      h('fieldset', { class: 'color-values' }, h('legend', {}, t('color.cmyk')), ...cmyk.map((input, i) => h('label', {}, [t('color.c'), t('color.m'), t('color.y'), t('color.k')][i]!, ' ', input, ' %'))),
      gamut,
      usePrintable,
      ink,
      h('p', { class: 'hint' }, t('color.hint')),
      h('div', { class: 'dialog-actions' }, button(t('common.cancel'), () => finish(null)), h('button', { type: 'submit', class: 'primary' }, t('common.ok'))),
    );
    const dialog = h('dialog', { class: 'dialog color-dialog', 'aria-labelledby': 'color-title' }, form);
    const finish = (value: string | null): void => {
      if (value) rememberColor(value);
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      finish(hex);
    });
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(null);
    });
    update(hex);
    host.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    hexInput.focus();
    hexInput.select();
  });
}
