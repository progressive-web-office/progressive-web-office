import { describe, expect, it } from 'vitest';
import { newWorkbook, setInput } from '../src/sheet/model';
import { readWorkbook, writeWorkbook } from '../src/sheet/io';
import { readZip, readZipText } from '../src/core/zip';

function frozen() {
  const wb = newWorkbook();
  const s = wb.sheets[0]!;
  setInput(s, 'A1', 'Name');
  setInput(s, 'B1', 'Score');
  setInput(s, 'A2', 'x');
  s.freeze = { rows: 1, cols: 2 };
  wb.sheets.push({ name: 'Other', cells: new Map() });
  return wb;
}

describe('SHEET-017 frozen rows and columns', () => {
  it.each(['xlsx', 'ods'] as const)('round-trip through %s', async (format) => {
    const back = await readWorkbook(format, writeWorkbook(frozen(), format));
    expect(back.sheets[0]!.freeze).toEqual({ rows: 1, cols: 2 });
    expect(back.sheets[1]!.freeze).toBeUndefined();
  });

  it('writes native frozen panes', () => {
    const xlsx = readZip(writeWorkbook(frozen(), 'xlsx'));
    expect(readZipText(xlsx, 'xl/worksheets/sheet1.xml')).toContain('<pane xSplit="2" ySplit="1" topLeftCell="C2" activePane="bottomRight" state="frozen"/>');
    const ods = readZip(writeWorkbook(frozen(), 'ods'));
    const settings = readZipText(ods, 'settings.xml')!;
    expect(settings).toContain('<config:config-item config:name="HorizontalSplitMode" config:type="short">2</config:config-item>');
    expect(settings).toContain('<config:config-item config:name="VerticalSplitPosition" config:type="int">1</config:config-item>');
    expect(readZipText(ods, 'META-INF/manifest.xml')).toContain('settings.xml');
  });

  it('writes no settings without frozen panes', () => {
    const wb = newWorkbook();
    expect(readZipText(readZip(writeWorkbook(wb, 'xlsx')), 'xl/worksheets/sheet1.xml')).not.toContain('<pane');
  });
});
