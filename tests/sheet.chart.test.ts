import { describe, expect, it } from 'vitest';
import { chartData, defaultChart, parseRange, renderChartSvg } from '../src/sheet/chart';
import { Calculator } from '../src/sheet/engine';
import { setCell, type Chart, type Workbook } from '../src/sheet/model';
import { readWorkbook, writeWorkbook } from '../src/sheet/io';
import { readZip, readZipText } from '../src/core/zip';

function sales(): Workbook {
  const wb: Workbook = { sheets: [{ name: 'Ventes 2026', cells: new Map() }] };
  const s = wb.sheets[0]!;
  const rows: (string | number)[][] = [
    ['Mois', 'Ventes', 'Coûts'],
    ['Jan', 120, 80],
    ['Fév', 150, 90],
    ['Mar', 90, 95],
  ];
  rows.forEach((row, r) => row.forEach((v, c) => setCell(s, [r, c], { value: v })));
  setCell(s, [3, 1], { value: null, formula: 'B3-60' }); // computed: 90
  return wb;
}

const chart = (over: Partial<Chart> = {}): Chart => ({ ...defaultChart('A1:C4'), anchor: { row: 0, col: 4 }, ...over });
const values = (wb: Workbook) => {
  const calc = new Calculator(wb);
  return (row: number, col: number) => calc.value(0, [row, col]);
};

describe('SHEET-020 chart data', () => {
  it('reads categories from the first column and series from the others', () => {
    const wb = sales();
    expect(chartData(chart(), values(wb))).toEqual({
      categories: ['Jan', 'Fév', 'Mar'],
      series: [
        { name: 'Ventes', values: [120, 150, 90] },
        { name: 'Coûts', values: [80, 90, 95] },
      ],
    });
  });

  it('numbers rows when there is a single column, and names series without headers', () => {
    const wb = sales();
    expect(chartData(chart({ range: 'B2:B4', headers: false }), values(wb))).toEqual({ categories: ['1', '2', '3'], series: [{ name: 'Series 1', values: [120, 150, 90] }] });
  });

  it('parses ranges in either direction', () => {
    expect(parseRange('C4:A1')).toEqual({ r1: 0, c1: 0, r2: 3, c2: 2 });
    expect(parseRange('nope')).toBeUndefined();
  });
});

describe('SHEET-020 charts follow structural edits', () => {
  it('shifts the range and anchor on insertions and drops a chart whose data is deleted', async () => {
    const { insertCells, deleteCells } = await import('../src/sheet/ops');
    const wb = sales();
    wb.sheets[0]!.charts = [chart()];
    insertCells(wb, 0, 'rows', 0, 2);
    expect(wb.sheets[0]!.charts![0]).toMatchObject({ range: 'A3:C6', anchor: { row: 2, col: 4 } });
    insertCells(wb, 0, 'cols', 1, 1);
    expect(wb.sheets[0]!.charts![0]).toMatchObject({ range: 'A3:D6', anchor: { row: 2, col: 5 } });
    deleteCells(wb, 0, 'cols', 0, 6);
    expect(wb.sheets[0]!.charts).toEqual([]);
  });
});

describe('SHEET-021 chart rendering', () => {
  const svgOf = (type: Chart['type']) => {
    const wb = sales();
    const svg = renderChartSvg(chart({ type, title: 'Bilan' }), chartData(chart({ type }), values(wb)));
    const div = document.createElement('div');
    div.innerHTML = svg;
    return div.querySelector('svg')!;
  };

  it('draws grouped columns with a title, axes and a legend', () => {
    const svg = svgOf('column');
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.querySelector('title')?.textContent).toBe('Bilan');
    expect(svg.querySelectorAll('rect.bar')).toHaveLength(6);
    expect(svg.querySelectorAll('.legend text')).toHaveLength(2);
    expect(svg.textContent).toContain('Fév');
  });

  it('draws lines, pie slices and scatter points', () => {
    expect(svgOf('line').querySelectorAll('polyline.series')).toHaveLength(2);
    expect(svgOf('bar').querySelectorAll('rect.bar')).toHaveLength(6);
    expect(svgOf('pie').querySelectorAll('path.slice')).toHaveLength(3);
    expect(svgOf('scatter').querySelectorAll('circle.point')).toHaveLength(6);
  });

  it('escapes text', () => {
    const wb = sales();
    setCell(wb.sheets[0]!, [1, 0], { value: '<b>&' });
    const svg = renderChartSvg(chart({ title: '"x" <y>' }), chartData(chart(), values(wb)));
    expect(svg).toContain('&lt;b&gt;&amp;');
    expect(svg).not.toContain('<b>');
  });
});

describe('SHEET-022 charts in XLSX and ODS', () => {
  const withChart = (type: Chart['type']): Workbook => {
    const wb = sales();
    wb.sheets[0]!.charts = [chart({ type, title: 'Bilan', width: 480, height: 300 })];
    return wb;
  };

  it('writes a DrawingML chart into XLSX and reads it back', () => {
    for (const type of ['column', 'bar', 'line', 'pie', 'scatter'] as const) {
      const bytes = writeWorkbook(withChart(type), 'xlsx');
      const zip = readZip(bytes);
      const xml = readZipText(zip, 'xl/charts/chart1.xml')!;
      expect(xml).toContain(type === 'line' ? '<c:lineChart>' : type === 'pie' ? '<c:pieChart>' : type === 'scatter' ? '<c:scatterChart>' : '<c:barChart>');
      expect(xml).toContain("<c:f>'Ventes 2026'!$B$2:$B$4</c:f>");
      expect(readZipText(zip, '[Content_Types].xml')).toContain('/xl/charts/chart1.xml');
      expect(readZipText(zip, 'xl/worksheets/sheet1.xml')).toMatch(/<drawing r:id="rId\d+"\/>/);
      const back = readWorkbook('xlsx', bytes).sheets[0]!.charts;
      expect(back).toEqual([chart({ type, title: 'Bilan', width: 480, height: 300 })]);
    }
  });

  it('writes an ODF chart object into ODS and reads it back', () => {
    for (const type of ['column', 'bar', 'line', 'pie', 'scatter'] as const) {
      const bytes = writeWorkbook(withChart(type), 'ods');
      const zip = readZip(bytes);
      expect(readZipText(zip, 'content.xml')).toContain('<draw:object');
      const object = readZipText(zip, 'Object 1/content.xml')!;
      expect(object).toContain(`chart:class="chart:${{ column: 'bar', bar: 'bar', line: 'line', pie: 'circle', scatter: 'scatter' }[type]}"`);
      expect(object).toContain("table:cell-range-address=\"'Ventes 2026'.A1:'Ventes 2026'.C4\"");
      expect(readZipText(zip, 'META-INF/manifest.xml')).toContain('Object 1/');
      const back = readWorkbook('ods', bytes).sheets[0]!.charts;
      expect(back).toEqual([chart({ type, title: 'Bilan', width: 480, height: 300 })]);
    }
  });

  it('keeps sheets without charts unchanged', () => {
    const zip = readZip(writeWorkbook(sales(), 'xlsx'));
    expect(Object.keys(zip).some((p) => p.includes('chart'))).toBe(false);
    expect(readWorkbook('xlsx', writeWorkbook(sales(), 'xlsx')).sheets[0]!.charts).toBeUndefined();
  });
});
