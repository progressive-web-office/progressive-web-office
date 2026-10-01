/** Chart dialog and image export (SHEET-020, SHEET-023). */
import { button, h } from '../app/dom';
import { t, type MessageKey } from '../i18n';
import { chartData, parseRange, renderChartSvg, type ChartData } from './chart';
import type { Chart, ChartType } from './model';

export const CHART_TYPES: { type: ChartType; label: MessageKey; icon: string }[] = [
  { type: 'column', label: 'chart.type.column', icon: '▮' },
  { type: 'bar', label: 'chart.type.bar', icon: '▬' },
  { type: 'line', label: 'chart.type.line', icon: '╱' },
  { type: 'pie', label: 'chart.type.pie', icon: '◔' },
  { type: 'scatter', label: 'chart.type.scatter', icon: '⁘' },
];

/** Insert or edit a chart; `data` computes the chart data for a draft. Resolves to null when cancelled. */
export function editChart(host: HTMLElement, initial: Chart, data: (chart: Chart) => ChartData, editing: boolean): Promise<Chart | null> {
  return new Promise((resolve) => {
    const dialog = h('dialog', { class: 'dialog chart-dialog', 'aria-labelledby': 'chart-title' });
    const type = h('select', { 'aria-label': t('chart.type') }, ...CHART_TYPES.map((c) => h('option', { value: c.type, selected: c.type === initial.type }, `${c.icon} ${t(c.label)}`)));
    const title = h('input', { type: 'text', value: initial.title ?? '', 'aria-label': t('chart.title') });
    const range = h('input', { type: 'text', value: initial.range, 'aria-label': t('chart.range'), spellcheck: 'false' });
    const headers = h('input', { type: 'checkbox', checked: initial.headers });
    const preview = h('div', { class: 'chart-preview', 'aria-label': t('chart.preview') });
    const error = h('p', { class: 'chart-error', 'aria-live': 'polite' });
    const draft = (): Chart => ({ ...initial, type: type.value as ChartType, title: title.value.trim(), range: range.value.trim().toUpperCase(), headers: headers.checked });
    const update = (): void => {
      const chart = draft();
      if (!parseRange(chart.range)) {
        error.textContent = t('chart.invalidRange');
        preview.replaceChildren();
        return;
      }
      error.textContent = '';
      preview.innerHTML = renderChartSvg(chart, data(chart), { width: 460, height: 280 });
    };
    for (const el of [type, title, range, headers]) el.addEventListener('input', update);
    const finish = (ok: boolean): void => {
      const chart = draft();
      if (ok && !parseRange(chart.range)) {
        update();
        return;
      }
      dialog.close();
      dialog.remove();
      resolve(ok ? { ...chart, ...(chart.title ? {} : { title: undefined }) } : null);
    };
    dialog.append(
      h('h2', { id: 'chart-title' }, editing ? t('chart.editTitle') : t('chart.insertTitle')),
      h(
        'div',
        { class: 'chart-form' },
        h('label', {}, t('chart.type'), type),
        h('label', {}, t('chart.title'), title),
        h('label', {}, t('chart.range'), range),
        h('label', { class: 'git-row' }, headers, ' ', t('chart.headers')),
        h('p', { class: 'hint' }, t('chart.hint')),
      ),
      preview,
      error,
      h('div', { class: 'dialog-actions' }, button(t('common.cancel'), () => finish(false)), button(editing ? t('chart.update') : t('chart.insert'), () => finish(true), { className: 'primary' })),
    );
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(false);
    });
    host.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    update();
    setTimeout(() => type.focus(), 0);
  });
}

/** Rasterise a chart SVG to PNG at twice its size. */
export async function chartPng(svg: string, width: number, height: number): Promise<Blob> {
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = width * 2;
  canvas.height = height * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
  if (!blob) throw new Error('PNG encoding failed');
  return blob;
}

export { chartData };
