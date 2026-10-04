/** TEACH-004: the "Bode and Nyquist plots" dialog — a transfer function, the plots seen before they go in. */
import { button, h } from '../app/dom';
import { t } from '../i18n';
import { autoRange, bodeSvg, closedLoop, frequencyResponse, margins, nyquistSvg, parseTransfer, poleZeroSvg, stepResponse, stepSvg, type PlotLabels } from './control';

export interface ControlPlot {
  svg: string;
  alt: string;
}

/** Named values typed as `K = 2, tau = 0.5`. */
function parseValues(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of text.split(/[;\n]|,(?=\s*[A-Za-z_])/)) {
    const m = /^\s*([A-Za-z_]\w*)\s*=\s*(-?[\d.]+(?:[eE][+-]?\d+)?)\s*$/.exec(part.replace(/(\d),(\d)/g, '$1.$2'));
    if (m && m[1] !== 's' && m[1] !== 'p') out[m[1]!] = Number(m[2]);
    else if (part.trim()) throw new Error(t('control.badValues', { part: part.trim() }));
  }
  return out;
}

export function chooseControlPlots(host: HTMLElement): Promise<ControlPlot[] | null> {
  return new Promise((resolve) => {
    const expr = h('input', { type: 'text', value: '10/((s+1)(s+10))', spellcheck: 'false', autocomplete: 'off' });
    const values = h('input', { type: 'text', placeholder: 'K = 2, tau = 0.5', spellcheck: 'false', autocomplete: 'off' });
    const kind = h('select', {}, ...(['bode', 'nyquist', 'both', 'step', 'poles', 'all'] as const).map((k) => h('option', { value: k }, t(`control.kind.${k}`))));
    // TEACH-006: the closed loop with unity feedback, G/(1+G).
    const closed = h('input', { type: 'checkbox' });
    const duration = h('input', { type: 'number', min: '0', step: 'any', placeholder: t('control.auto') });
    const from = h('input', { type: 'number', step: '1', placeholder: t('control.auto') });
    const to = h('input', { type: 'number', step: '1', placeholder: t('control.auto') });
    const showMargins = h('input', { type: 'checkbox', checked: true });
    const preview = h('div', { class: 'control-preview', 'aria-live': 'polite' });
    const info = h('p', { class: 'hint control-info' });
    const problem = h('p', { class: 'error', role: 'alert', hidden: '' });
    let plots: ControlPlot[] = [];
    const labels = (title: string): PlotLabels => ({
      title,
      frequency: t('control.frequency'),
      magnitude: t('control.magnitude'),
      phase: t('control.phase'),
      real: t('control.real'),
      imaginary: t('control.imaginary'),
      gainMargin: (db, w) => t('control.gm', { db, w }),
      phaseMargin: (deg, w) => t('control.pm', { deg, w }),
    });
    const draw = (): void => {
      try {
        const open = parseTransfer(expr.value, parseValues(values.value));
        const tf = closed.checked ? closedLoop(open) : open;
        const auto = autoRange(tf);
        const lo = from.value.trim() === '' ? auto[0] : Math.round(Number(from.value));
        const hi = to.value.trim() === '' ? auto[1] : Math.round(Number(to.value));
        if (!(hi > lo) || hi - lo > 12) throw new Error(t('control.badRange'));
        const pts = frequencyResponse(tf, [lo, hi]);
        const m = margins(pts);
        const g = expr.value.replace(/^\s*[A-Za-z]\s*\(\s*[sp]\s*\)\s*=\s*/, '');
        const name = closed.checked ? t('control.closedName', { g }) : `H(s) = ${g}`;
        const k = kind.value;
        const want = (x: string): boolean => k === x || k === 'all' || (k === 'both' && (x === 'bode' || x === 'nyquist'));
        plots = [];
        if (want('bode')) plots.push({ svg: bodeSvg(pts, [lo, hi], m, labels(t('control.bodeTitle', { h: name })), showMargins.checked), alt: t('control.bodeAlt', { h: name }) });
        if (want('step')) {
          const tEnd = duration.value.trim() === '' ? undefined : Number(duration.value);
          const r = stepResponse(tf, tEnd && tEnd > 0 ? tEnd : undefined);
          plots.push({
            svg: stepSvg(r, { title: t('control.stepTitle', { h: name }), time: t('control.time'), output: t('control.output'), final: (v) => t('control.final', { v }), overshoot: (v) => t('control.overshoot', { v }), rise: (v) => t('control.rise', { v }), settling: (v) => t('control.settling', { v }) }),
            alt: t('control.stepAlt', { h: name }),
          });
        }
        if (want('poles')) plots.push({ svg: poleZeroSvg(tf, { title: t('control.polesTitle', { h: name }), real: t('control.real'), imaginary: t('control.imaginary') }), alt: t('control.polesAlt', { h: name }) });
        if (want('nyquist')) plots.push({ svg: nyquistSvg(pts, labels(t('control.nyquistTitle', { h: name }))), alt: t('control.nyquistAlt', { h: name }) });
        // The pictures are built here from numbers, the text in them escaped.
        preview.innerHTML = plots.map((p) => p.svg).join('');
        info.textContent = [
          m.phaseMargin !== undefined ? t('control.pm', { deg: m.phaseMargin.toFixed(1), w: m.crossover!.toPrecision(3) }) : t('control.noCrossover'),
          m.gainMargin !== undefined ? t('control.gm', { db: m.gainMargin.toFixed(1), w: m.phaseCrossover!.toPrecision(3) }) : t('control.infiniteGm'),
        ].join(' · ');
        problem.hidden = true;
      } catch (err) {
        plots = [];
        preview.replaceChildren();
        info.textContent = '';
        problem.textContent = t('control.error', { message: (err as Error).message });
        problem.hidden = false;
      }
    };
    for (const el of [expr, values, from, to]) el.addEventListener('input', draw);
    for (const el of [kind, showMargins, closed]) el.addEventListener('change', draw);
    duration.addEventListener('input', draw);
    const dialog = h('dialog', { class: 'dialog control-dialog', 'aria-labelledby': 'control-title' });
    const finish = (v: ControlPlot[] | null): void => {
      dialog.close();
      dialog.remove();
      resolve(v);
    };
    const field = (label: string, control: HTMLElement): HTMLElement => h('label', { class: 'field' }, label, control);
    dialog.append(
      h('h2', { id: 'control-title' }, t('control.title')),
      field(t('control.expression'), expr),
      h('p', { class: 'hint' }, t('control.hint')),
      h('div', { class: 'control-row' }, field(t('control.values'), values), field(t('control.plot'), kind)),
      h('label', { class: 'check' }, closed, ` ${t('control.closed')}`),
      h('div', { class: 'control-row' }, field(t('control.from'), from), field(t('control.to'), to), field(t('control.duration'), duration), h('label', { class: 'check' }, showMargins, ` ${t('control.margins')}`)),
      problem,
      info,
      preview,
      h('div', { class: 'dialog-actions' }, button(t('common.cancel'), () => finish(null)), button(t('control.insert'), () => plots.length && finish(plots), { className: 'primary' })),
    );
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(null);
    });
    host.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    draw();
    expr.focus();
  });
}
