/**
 * DOC-042: a spring or a space, chosen in a dialog. A spring takes a share
 * of the free space — given in percent, kept as a weight next to the other
 * springs of its page (or line); a fixed space is a height in cm, mm, pt or
 * a percentage of the page's height.
 */
import { button, h } from '../app/dom';
import { t } from '../i18n';

export interface SpaceValue {
  /** A spring and its weight, or a fixed space. */
  stretch?: number;
  /** Points. */
  size?: number;
  /** Share of the page's text height. */
  fraction?: number;
}

const PT: Record<string, number> = { cm: 72 / 2.54, mm: 72 / 25.4, pt: 1 };
const round = (n: number, d = 2): number => Math.round(n * 10 ** d) / 10 ** d;

/** The share, in percent, of a spring of weight `w` among springs weighing `others` together. */
export const shareOf = (w: number, others: number): number => (others > 0 ? (100 * w) / (w + others) : 100);

/** The weight giving a spring `pct` percent of the free space, the others weighing `others`. */
export function weightFor(pct: number, others: number): number | undefined {
  if (others <= 0 || !(pct > 0) || pct >= 100) return undefined;
  return round((pct * others) / (100 - pct), 3);
}

export function spaceDialog(host: HTMLElement, opts: { horizontal: boolean; current: SpaceValue; others: number; isNew?: boolean }): Promise<SpaceValue | null> {
  return new Promise((resolve) => {
    const { current, others } = opts;
    const isSpring = current.stretch !== undefined || opts.horizontal;
    const springRadio = h('input', { type: 'radio', name: 'space-kind', value: 'spring', checked: isSpring });
    const fixedRadio = h('input', { type: 'radio', name: 'space-kind', value: 'fixed', checked: !isSpring });
    const weight = h('input', { type: 'number', min: '0.01', step: 'any', value: String(current.stretch ?? 1), 'aria-label': t('space.weight') });
    const pct = h('input', { type: 'number', min: '1', max: '99', step: 'any', 'aria-label': t('space.share') });
    const share = (): void => {
      pct.value = String(round(shareOf(Number(weight.value) || 1, others), 1));
    };
    share();
    pct.disabled = others <= 0;
    weight.addEventListener('input', share);
    pct.addEventListener('input', () => {
      const w = weightFor(Number(pct.value), others);
      if (w !== undefined) weight.value = String(w);
    });
    const initialUnit = current.fraction ? '%' : 'cm';
    const amount = h('input', { type: 'number', min: '0', step: 'any', 'aria-label': t('space.height'), value: String(current.fraction ? round(current.fraction * 100, 1) : round((current.size ?? PT.cm!) / PT.cm!)) });
    const unit = h('select', { 'aria-label': t('space.unit') }, ...['cm', 'mm', 'pt', '%'].map((u) => h('option', { value: u, selected: u === initialUnit }, u === '%' ? t('space.pctPage') : u)));
    let lastUnit = initialUnit;
    unit.addEventListener('change', () => {
      // The same height in the new unit (a percentage is kept as it is).
      const v = Number(amount.value);
      if (lastUnit !== '%' && unit.value !== '%' && v > 0) amount.value = String(round((v * PT[lastUnit]!) / PT[unit.value]!));
      lastUnit = unit.value;
    });
    const springBox = h(
      'fieldset',
      { class: 'space-spring' },
      h('legend', {}, h('label', {}, springRadio, ` ${t(opts.horizontal ? 'space.springH' : 'space.springV')}`)),
      h('label', { class: 'git-row' }, t('space.share'), ' ', pct, ' %'),
      h('label', { class: 'git-row' }, t('space.weight'), ' ', weight),
      h('p', { class: 'hint' }, others > 0 ? t(opts.horizontal ? 'space.shareHintH' : 'space.shareHint', { n: others }) : t(opts.horizontal ? 'space.aloneH' : 'space.alone')),
    );
    const fixedBox = opts.horizontal ? null : h('fieldset', { class: 'space-fixed' }, h('legend', {}, h('label', {}, fixedRadio, ` ${t('space.fixedKind')}`)), h('label', { class: 'git-row' }, t('space.height'), ' ', amount, ' ', unit));
    const sync = (): void => {
      for (const el of springBox.querySelectorAll<HTMLInputElement>('input[type=number]')) el.disabled = !springRadio.checked || (el === pct && others <= 0);
      amount.disabled = unit.disabled = !fixedRadio.checked;
    };
    springRadio.addEventListener('change', sync);
    fixedRadio.addEventListener('change', sync);
    sync();
    const error = h('p', { class: 'error', role: 'alert', hidden: true });
    const form = h(
      'form',
      { method: 'dialog' },
      h('h2', { id: 'space-title' }, t(opts.horizontal ? 'space.hfill' : 'space.menu')),
      springBox,
      fixedBox,
      error,
      h('div', { class: 'dialog-actions' }, button(t('common.cancel'), () => finish(null)), h('button', { type: 'submit', class: 'primary' }, opts.isNew ? t('form.add') : t('common.ok'))),
    );
    const dialog = h('dialog', { class: 'dialog space-dialog', 'aria-labelledby': 'space-title' }, form);
    const finish = (value: SpaceValue | null): void => {
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (springRadio.checked) {
        const w = Number(weight.value);
        if (!(w > 0)) return void ((error.textContent = t('space.badWeight')), (error.hidden = false));
        return finish({ stretch: round(w, 3) });
      }
      const v = Number(amount.value);
      if (!(v > 0) || (unit.value === '%' && v > 100)) return void ((error.textContent = t('space.badHeight')), (error.hidden = false));
      finish(unit.value === '%' ? { fraction: round(v / 100, 4) } : { size: round(v * PT[unit.value]!) });
    });
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(null);
    });
    host.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    (springRadio.checked ? (pct.disabled ? weight : pct) : amount).focus();
  });
}
