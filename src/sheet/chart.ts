/**
 * Spreadsheet charts (SHEET-020, SHEET-021): data taken from a range of the
 * sheet, drawn as accessible SVG. Colours follow a validated categorical
 * palette in a fixed order; text stays in neutral ink.
 */
import { escapeXml as esc } from '../core/xml';
import { parseRef } from './address';
import { formatGeneral } from './engine';
import { isError, type Chart, type Value } from './model';

/** Categorical slots, in fixed order (colour-blind checked; light surface). */
export const SERIES_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
const INK = '#1c2430';
const MUTED = '#52514e';
const GRID = '#e3e6ea';
const SURFACE = '#ffffff';

export interface ChartData {
  categories: string[];
  series: { name: string; values: (number | null)[] }[];
}

export interface Range {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}

export function parseRange(text: string): Range | undefined {
  const [a, b = a] = text.replace(/\$/g, '').split(':');
  const p = a ? parseRef(a.trim()) : undefined;
  const q = b ? parseRef(b.trim()) : undefined;
  if (!p || !q) return undefined;
  return { r1: Math.min(p.row, q.row), c1: Math.min(p.col, q.col), r2: Math.max(p.row, q.row), c2: Math.max(p.col, q.col) };
}

export function defaultChart(range: string): Chart {
  return { type: 'column', range, headers: true, anchor: { row: 0, col: 0 }, width: 480, height: 300 };
}

const label = (v: Value): string => (v === null ? '' : isError(v) ? v.error : typeof v === 'number' ? formatGeneral(v) : String(v));
const num = (v: Value): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Categories and series of a chart, from computed cell values. */
export function chartData(chart: Chart, value: (row: number, col: number) => Value): ChartData {
  const r = parseRange(chart.range);
  if (!r) return { categories: [], series: [] };
  const first = chart.headers ? r.r1 + 1 : r.r1;
  const withCategories = r.c2 > r.c1;
  const dataCols = withCategories ? r.c1 + 1 : r.c1;
  const categories: string[] = [];
  for (let row = first; row <= r.r2; row++) categories.push(withCategories ? label(value(row, r.c1)) : String(row - first + 1));
  const series: ChartData['series'] = [];
  for (let col = dataCols; col <= r.c2; col++) {
    const name = chart.headers ? label(value(r.r1, col)) : '';
    const values: (number | null)[] = [];
    for (let row = first; row <= r.r2; row++) values.push(num(value(row, col)));
    series.push({ name: name || `Series ${series.length + 1}`, values });
  }
  return { categories, series };
}

/** Round axis bounds and a step of 1, 2 or 5 × 10^n. */
function niceScale(min: number, max: number, ticks = 5): { min: number; max: number; step: number } {
  if (min === max) {
    min = min > 0 ? 0 : min - 1;
    max = max > 0 ? max : max + 1;
  }
  const raw = (max - min) / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  return { min: Math.floor(min / step) * step, max: Math.ceil(max / step) * step, step };
}

const fmt = (n: number): string => formatGeneral(+n.toPrecision(10));
const round = (n: number): number => Math.round(n * 10) / 10;

export function renderChartSvg(chart: Chart, data: ChartData, size: { width: number; height: number } = chart): string {
  const W = Math.max(160, size.width);
  const H = Math.max(120, size.height);
  const title = chart.title?.trim() ?? '';
  const parts: string[] = [];
  const color = (i: number): string => SERIES_COLORS[i % SERIES_COLORS.length]!;
  const top = title ? 34 : 14;
  const legendItems = chart.type === 'pie' ? data.categories : data.series.length > 1 ? data.series.map((s) => s.name) : [];
  const legendH = legendItems.length ? 24 : 0;
  const bottom = H - legendH - (chart.type === 'pie' ? 10 : 28);

  if (title) parts.push(`<text x="${W / 2}" y="22" text-anchor="middle" font-size="14" font-weight="600" fill="${INK}">${esc(title)}</text>`);
  if (legendItems.length) {
    let x = 12;
    const items = legendItems.map((name, i) => {
      const item = `<g transform="translate(${x},${H - 16})"><rect width="10" height="10" y="-9" rx="2" fill="${color(i)}"/><text x="14" font-size="11" fill="${MUTED}">${esc(name)}</text></g>`;
      x += 24 + Math.min(140, name.length * 6.5);
      return item;
    });
    parts.push(`<g class="legend">${items.join('')}</g>`);
  }

  const values = data.series.flatMap((s) => s.values).filter((v): v is number => v !== null);
  if (!values.length || !data.categories.length) {
    parts.push(`<text x="${W / 2}" y="${H / 2}" text-anchor="middle" font-size="12" fill="${MUTED}">—</text>`);
  } else if (chart.type === 'pie') {
    const s = data.series[0]!;
    const total = s.values.reduce<number>((a, v) => a + Math.max(0, v ?? 0), 0) || 1;
    const cx = W / 2;
    const cy = (top + bottom) / 2;
    const radius = Math.max(20, Math.min(W / 2 - 20, (bottom - top) / 2));
    let angle = -Math.PI / 2;
    s.values.forEach((v, i) => {
      const share = Math.max(0, v ?? 0) / total;
      if (share <= 0) return;
      const end = angle + share * 2 * Math.PI;
      const large = end - angle > Math.PI ? 1 : 0;
      const p = (a: number) => `${round(cx + radius * Math.cos(a))},${round(cy + radius * Math.sin(a))}`;
      const d = share >= 0.9999 ? `M${round(cx - radius)},${round(cy)}a${radius},${radius} 0 1,0 ${radius * 2},0a${radius},${radius} 0 1,0 ${-radius * 2},0` : `M${round(cx)},${round(cy)}L${p(angle)}A${radius},${radius} 0 ${large} 1 ${p(end)}Z`;
      const tip = `${data.categories[i]}: ${fmt(v ?? 0)} (${Math.round(share * 100)} %)`;
      parts.push(`<path class="slice" d="${d}" fill="${color(i)}" stroke="${SURFACE}" stroke-width="2"><title>${esc(tip)}</title></path>`);
      angle = end;
    });
  } else {
    const scatter = chart.type === 'scatter';
    const horizontal = chart.type === 'bar';
    // Scatter x values: the first column when numeric, otherwise positions 1…n.
    const numericX = data.categories.every((c) => c.trim() !== '' && Number.isFinite(Number(c)));
    const xOf = (i: number): number => (numericX ? Number(data.categories[i]) : i + 1);
    const xs = scatter ? data.categories.map((_, i) => xOf(i)) : [];
    const yScale = niceScale(Math.min(0, ...values), Math.max(0, ...values));
    const xScale = scatter && xs.length ? niceScale(Math.min(...xs), Math.max(...xs)) : undefined;
    const left = 12 + Math.max(...[yScale.min, yScale.max].map((v) => fmt(v).length)) * 7;
    const right = W - 14;
    const n = data.categories.length;
    const grid: string[] = [];
    // Value axis: horizontal grid lines (vertical ones for horizontal bars).
    for (let v = yScale.min; v <= yScale.max + yScale.step / 2; v += yScale.step) {
      const t = (v - yScale.min) / (yScale.max - yScale.min);
      if (horizontal) {
        const x = round(left + t * (right - left));
        grid.push(`<line x1="${x}" y1="${top}" x2="${x}" y2="${bottom}" stroke="${GRID}"/><text x="${x}" y="${bottom + 16}" text-anchor="middle" font-size="10" fill="${MUTED}">${fmt(v)}</text>`);
      } else {
        const y = round(bottom - t * (bottom - top));
        grid.push(`<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="${GRID}"/><text x="${left - 6}" y="${y + 3}" text-anchor="end" font-size="10" fill="${MUTED}">${fmt(v)}</text>`);
      }
    }
    parts.push(`<g class="axis">${grid.join('')}</g>`);
    const yPos = (v: number): number => round(bottom - ((v - yScale.min) / (yScale.max - yScale.min)) * (bottom - top));
    const xPos = (v: number): number => round(left + ((v - yScale.min) / (yScale.max - yScale.min)) * (right - left));
    const band = horizontal ? (bottom - top) / n : (right - left) / n;
    const step = Math.max(1, Math.ceil((n * 40) / Math.max(40, horizontal ? bottom - top : right - left)));
    // Category axis labels (thinned when crowded).
    if (!scatter) {
      const labels = data.categories.map((c, i) => {
        if (i % step) return '';
        const text = esc(c.length > 14 ? `${c.slice(0, 13)}…` : c);
        return horizontal
          ? `<text x="${left - 6}" y="${round(top + band * (i + 0.5) + 3)}" text-anchor="end" font-size="10" fill="${MUTED}">${text}</text>`
          : `<text x="${round(left + band * (i + 0.5))}" y="${bottom + 16}" text-anchor="middle" font-size="10" fill="${MUTED}">${text}</text>`;
      });
      parts.push(`<g class="categories">${labels.join('')}</g>`);
    } else if (xScale) {
      const xt: string[] = [];
      for (let v = xScale.min; v <= xScale.max + xScale.step / 2; v += xScale.step) {
        const x = round(left + ((v - xScale.min) / (xScale.max - xScale.min)) * (right - left));
        xt.push(`<text x="${x}" y="${bottom + 16}" text-anchor="middle" font-size="10" fill="${MUTED}">${fmt(v)}</text>`);
      }
      parts.push(`<g class="categories">${xt.join('')}</g>`);
    }
    if (chart.type === 'column' || horizontal) {
      const k = data.series.length;
      const inner = band * 0.72;
      const barW = Math.max(1, inner / k - 2);
      data.series.forEach((s, si) => {
        s.values.forEach((v, i) => {
          if (v === null) return;
          const offset = band * 0.14 + si * (barW + 2);
          const tip = `<title>${esc(`${s.name} — ${data.categories[i]}: ${fmt(v)}`)}</title>`;
          if (horizontal) {
            const x0 = xPos(Math.max(0, yScale.min));
            const x1 = xPos(v);
            parts.push(`<rect class="bar" x="${Math.min(x0, x1)}" y="${round(top + band * i + offset)}" width="${round(Math.abs(x1 - x0))}" height="${round(barW)}" rx="2" fill="${color(si)}">${tip}</rect>`);
          } else {
            const y0 = yPos(Math.max(0, yScale.min));
            const y1 = yPos(v);
            parts.push(`<rect class="bar" x="${round(left + band * i + offset)}" y="${Math.min(y0, y1)}" width="${round(barW)}" height="${round(Math.abs(y1 - y0))}" rx="2" fill="${color(si)}">${tip}</rect>`);
          }
        });
      });
    } else if (chart.type === 'line') {
      data.series.forEach((s, si) => {
        const pts = s.values.map((v, i) => (v === null ? null : `${round(left + band * (i + 0.5))},${yPos(v)}`)).filter(Boolean);
        parts.push(`<polyline class="series" points="${pts.join(' ')}" fill="none" stroke="${color(si)}" stroke-width="2" stroke-linejoin="round"/>`);
        s.values.forEach((v, i) => {
          if (v !== null) parts.push(`<circle cx="${round(left + band * (i + 0.5))}" cy="${yPos(v)}" r="4" fill="${color(si)}" stroke="${SURFACE}" stroke-width="2"><title>${esc(`${s.name} — ${data.categories[i]}: ${fmt(v)}`)}</title></circle>`);
        });
      });
    } else if (scatter && xScale) {
      data.series.forEach((s, si) => {
        s.values.forEach((v, i) => {
          const x = xOf(i);
          if (v === null) return;
          const cx = round(left + ((x - xScale.min) / (xScale.max - xScale.min)) * (right - left));
          parts.push(`<circle class="point" cx="${cx}" cy="${yPos(v)}" r="4" fill="${color(si)}" stroke="${SURFACE}" stroke-width="2"><title>${esc(`${s.name}: (${fmt(x)}, ${fmt(v)})`)}</title></circle>`);
        });
      });
    }
    // Baseline.
    parts.push(horizontal ? `<line x1="${xPos(Math.max(0, yScale.min))}" y1="${top}" x2="${xPos(Math.max(0, yScale.min))}" y2="${bottom}" stroke="${MUTED}"/>` : `<line x1="${left}" y1="${yPos(Math.max(0, yScale.min))}" x2="${right}" y2="${yPos(Math.max(0, yScale.min))}" stroke="${MUTED}"/>`);
  }

  const name = esc(title || data.series.map((s) => s.name).join(', ') || 'Chart');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" class="sheet-chart-svg" role="img" aria-label="${name}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="system-ui, sans-serif">` +
    `<title>${name}</title><rect width="${W}" height="${H}" fill="${SURFACE}"/>${parts.join('')}</svg>`
  );
}
