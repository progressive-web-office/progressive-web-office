import { describe, expect, it } from 'vitest';
import { readXlsx } from '../src/sheet/xlsx-reader';
import { writeXlsx } from '../src/sheet/xlsx-writer';
import { Calculator } from '../src/sheet/engine';
import { getCell, newWorkbook, setInput, newSheet, type Workbook } from '../src/sheet/model';
import { detectFormat } from '../src/core/format';
import { readZip, readZipText } from '../src/core/zip';
import { parseXml } from '../src/core/xml';
import { makeZip } from './helpers';

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

function fixture(): Uint8Array {
  return makeZip({
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>',
    'xl/workbook.xml': `<workbook ${NS}><sheets><sheet name="Data" sheetId="1" r:id="rId1"/><sheet name="My Sheet" sheetId="2" r:id="rId2"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
      <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/sheet2.xml"/>
    </Relationships>`,
    'xl/sharedStrings.xml': `<sst ${NS}><si><t>Name</t></si><si><r><t>Ri</t></r><r><t>ch</t></r><rPh><t>x</t></rPh></si></sst>`,
    'xl/styles.xml': `<styleSheet ${NS}><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts>
      <cellXfs count="4"><xf numFmtId="0"/><xf numFmtId="164"/><xf numFmtId="10"/><xf numFmtId="14"/></cellXfs></styleSheet>`,
    'xl/worksheets/sheet1.xml': `<worksheet ${NS}><cols><col min="1" max="2" width="20" customWidth="1"/></cols><sheetData>
      <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="inlineStr"><is><t>inline</t></is></c></row>
      <row r="2"><c r="A2"><v>1.5</v></c><c r="B2" t="b"><v>1</v></c><c r="C2" t="e"><v>#N/A</v></c><c r="D2" s="1"><v>45322</v></c><c r="E2" s="2"><v>0.25</v></c><c r="F2" s="3"><v>45322</v></c></row>
      <row r="3"><c r="A3"><f>A2*2</f><v>3</v></c><c r="B3" t="str"><f>_xlfn.CONCAT("a","b")</f><v>ab</v></c></row>
      <row r="4"><c r="A4"><f t="shared" ref="A4:A6" si="0">A3+1</f><v>4</v></c></row>
      <row r="5"><c r="A5"><f t="shared" si="0"/><v>5</v></c></row>
      <row r="6"><c r="A6"><f t="shared" si="0"/><v>6</v></c></row>
    </sheetData></worksheet>`,
    'xl/worksheets/sheet2.xml': `<worksheet ${NS}><sheetData><row r="1"><c r="A1"><f>Data!A2+1</f></c></row></sheetData></worksheet>`,
  });
}

describe('SHEET-001 XLSX reader', () => {
  it('reads sheets, shared/inline/rich strings, types, styles, formulas and shared formulas', () => {
    const wb = readXlsx(fixture());
    expect(wb.sheets.map((s) => s.name)).toEqual(['Data', 'My Sheet']);
    const s = wb.sheets[0]!;
    expect(getCell(s, 'A1')).toEqual({ value: 'Name' });
    expect(getCell(s, 'B1')).toEqual({ value: 'Rich' });
    expect(getCell(s, 'C1')).toEqual({ value: 'inline' });
    expect(getCell(s, 'A2')).toEqual({ value: 1.5 });
    expect(getCell(s, 'B2')).toEqual({ value: true });
    expect(getCell(s, 'C2')).toEqual({ value: '#N/A' });
    expect(getCell(s, 'D2')).toEqual({ value: 45322, numFmt: 'dd/mm/yyyy' });
    expect(getCell(s, 'E2')).toEqual({ value: 0.25, numFmt: '0.00%' });
    expect(getCell(s, 'F2')).toEqual({ value: 45322, numFmt: 'yyyy-mm-dd' });
    expect(getCell(s, 'A3')).toEqual({ value: 3, formula: 'A2*2' });
    expect(getCell(s, 'B3')).toEqual({ value: 'ab', formula: 'CONCAT("a","b")' });
    expect(getCell(s, 'A5')?.formula).toBe('A4+1');
    expect(getCell(s, 'A6')?.formula).toBe('A5+1');
    expect(s.colWidths?.get(1)).toBeGreaterThan(100);
    expect(new Calculator(wb).value(1, 'A1')).toBe(2.5);
  });

  it('FILE-004 rejects packages without a workbook', () => {
    expect(() => readXlsx(makeZip({ 'a.txt': 'x' }))).toThrow(/workbook/);
  });
});

function sample(): Workbook {
  const wb = newWorkbook();
  const s = wb.sheets[0]!;
  for (const [ref, input] of Object.entries({
    A1: 'Item',
    B1: 'Price',
    A2: 'Tea & <coffee>',
    B2: '2.5',
    A3: 'Cake',
    B3: '4',
    B4: '=SUM(B2:B3)',
    C1: 'TRUE',
    C2: '2024-01-31',
    C3: '12.5%',
    D1: '=CONCAT(A3,"!")',
    D2: '=1/0',
  })) {
    setInput(s, ref, input);
  }
  s.colWidths = new Map([[0, 160]]);
  const other = newSheet('Other sheet');
  setInput(other, 'A1', "='Sheet1'!B4*2");
  wb.sheets.push(other);
  return wb;
}

describe('SHEET-009 XLSX writer', () => {
  it('writes a well-formed package detected as xlsx', () => {
    const bytes = writeXlsx(sample());
    expect(detectFormat('x', bytes)).toBe('xlsx');
    const zip = readZip(bytes);
    for (const part of Object.keys(zip).filter((p) => p.endsWith('.xml') || p.endsWith('.rels'))) {
      expect(() => parseXml(readZipText(zip, part)!), part).not.toThrow();
    }
    expect(readZipText(zip, 'xl/worksheets/sheet1.xml')).toContain('<f>SUM(B2:B3)</f><v>6.5</v>');
    expect(readZipText(zip, 'xl/worksheets/sheet1.xml')).toContain('<f>_xlfn.CONCAT(A3,&quot;!&quot;)</f>');
  });

  it('round-trips values, formulas, formats, sheets and column widths', () => {
    const wb = sample();
    const back = readXlsx(writeXlsx(wb));
    expect(back.sheets.map((s) => s.name)).toEqual(['Sheet1', 'Other sheet']);
    const s = back.sheets[0]!;
    expect(getCell(s, 'A2')).toEqual({ value: 'Tea & <coffee>' });
    expect(getCell(s, 'B4')).toEqual({ value: 6.5, formula: 'SUM(B2:B3)' });
    expect(getCell(s, 'C1')).toEqual({ value: true });
    expect(getCell(s, 'C2')).toEqual({ value: 45322, numFmt: 'yyyy-mm-dd' });
    expect(getCell(s, 'C3')).toEqual({ value: 0.125, numFmt: '0.0%' });
    expect(getCell(s, 'D2')).toEqual({ value: '#DIV/0!', formula: '1/0' });
    expect(s.colWidths?.get(0)).toBe(160);
    expect(new Calculator(back).value(1, 'A1')).toBe(13);
  });
});
