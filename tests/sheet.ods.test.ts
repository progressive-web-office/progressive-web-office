import { describe, expect, it } from 'vitest';
import { zipSync, strToU8, unzipSync } from 'fflate';
import { readOds } from '../src/sheet/ods-reader';
import { writeOds } from '../src/sheet/ods-writer';
import { excelToOf, ofToExcel } from '../src/sheet/openformula';
import { Calculator } from '../src/sheet/engine';
import { getCell, newSheet, newWorkbook, setInput, type Workbook } from '../src/sheet/model';
import { detectFormat } from '../src/core/format';
import { readZipText } from '../src/core/zip';
import { parseXml } from '../src/core/xml';
import { ODF_XMLNS } from '../src/document/odf';

describe('SHEET-012 OpenFormula translation', () => {
  it('converts ODF references and separators to Excel syntax', () => {
    expect(ofToExcel('of:=SUM([.A1:.B2];[.C3])')).toBe('SUM(A1:B2,C3)');
    expect(ofToExcel("of:=[$'My sheet'.$A$1]*2")).toBe("'My sheet'!$A$1*2");
    expect(ofToExcel('of:=[$Sheet2.A1:.B3]')).toBe('Sheet2!A1:B3');
    expect(ofToExcel('of:=IF([.A1]>1;"a;b";"[.x]")')).toBe('IF(A1>1,"a;b","[.x]")');
    expect(ofToExcel('=[.A1]+1')).toBe('A1+1');
  });

  it('converts Excel formulas to OpenFormula', () => {
    expect(excelToOf('SUM(A1:B2,C3)')).toBe('of:=SUM([.A1:.B2];[.C3])');
    expect(excelToOf("'My sheet'!$A$1*2")).toBe("of:=[$'My sheet'.$A$1]*2");
    expect(excelToOf('IF(A1>1,"a,b",Sheet2!A1:B3)')).toBe('of:=IF([.A1]>1;"a,b";[$Sheet2.A1:.B3])');
  });
});

const content = (body: string, styles = '') =>
  `<office:document-content ${ODF_XMLNS}><office:automatic-styles>${styles}</office:automatic-styles><office:body><office:spreadsheet>${body}</office:spreadsheet></office:body></office:document-content>`;

describe('SHEET-002 ODS reader', () => {
  it('reads typed cells, repeats, formulas, data styles and column widths', () => {
    const styles =
      '<number:percentage-style style:name="N1"><number:number number:decimal-places="1" number:min-integer-digits="1"/><number:text>%</number:text></number:percentage-style>' +
      '<number:date-style style:name="N2"><number:year number:style="long"/><number:text>-</number:text><number:month number:style="long"/><number:text>-</number:text><number:day number:style="long"/></number:date-style>' +
      '<style:style style:name="ce1" style:family="table-cell" style:data-style-name="N1"/>' +
      '<style:style style:name="ce2" style:family="table-cell" style:data-style-name="N2"/>' +
      '<style:style style:name="co1" style:family="table-column"><style:table-column-properties style:column-width="1.5in"/></style:style>';
    const body = `<table:table table:name="Data">
      <table:table-column table:style-name="co1"/><table:table-column table:number-columns-repeated="1024"/>
      <table:table-row><table:table-cell office:value-type="string"><text:p>Name<text:s text:c="2"/>x</text:p></table:table-cell><table:table-cell table:number-columns-repeated="2" office:value-type="float" office:value="7"><text:p>7</text:p></table:table-cell></table:table-row>
      <table:table-row table:number-rows-repeated="3"><table:table-cell table:number-columns-repeated="1024"/></table:table-row>
      <table:table-row>
        <table:table-cell office:value-type="percentage" office:value="0.125" table:style-name="ce1"/>
        <table:table-cell office:value-type="date" office:date-value="2024-01-31" table:style-name="ce2"/>
        <table:table-cell office:value-type="boolean" office:boolean-value="true"/>
        <table:table-cell table:formula="of:=SUM([.B1:.C1])" office:value-type="float" office:value="14"/>
        <table:table-cell office:value-type="time" office:time-value="PT12H00M00S"/>
      </table:table-row>
      <table:table-row table:number-rows-repeated="1048570"><table:table-cell table:number-columns-repeated="1024"/></table:table-row>
    </table:table><table:table table:name="Two"/>`;
    const bytes = zipSync({ mimetype: strToU8('application/vnd.oasis.opendocument.spreadsheet'), 'content.xml': strToU8(content(body, styles)) });
    const wb = readOds(bytes);
    expect(wb.sheets.map((s) => s.name)).toEqual(['Data', 'Two']);
    const s = wb.sheets[0]!;
    expect(getCell(s, 'A1')).toEqual({ value: 'Name  x' });
    expect(getCell(s, 'B1')).toEqual({ value: 7 });
    expect(getCell(s, 'C1')).toEqual({ value: 7 });
    expect(getCell(s, 'A5')).toEqual({ value: 0.125, numFmt: '0.0%' });
    expect(getCell(s, 'B5')).toEqual({ value: 45322, numFmt: 'yyyy-mm-dd' });
    expect(getCell(s, 'C5')).toEqual({ value: true });
    expect(getCell(s, 'D5')).toEqual({ value: 14, formula: 'SUM(B1:C1)' });
    expect(getCell(s, 'E5')).toEqual({ value: 0.5, numFmt: 'hh:mm:ss' });
    expect(s.cells.size).toBe(8);
    expect(s.colWidths?.get(0)).toBe(144);
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
    B3: '4',
    B4: '=SUM(B2:B3)',
    C1: 'TRUE',
    C2: '2024-01-31',
    C3: '12.5%',
    D1: '=CONCAT(A2;"!")'.replace(';', ','),
    D2: '=1/0',
    A10: 'far away',
  })) {
    setInput(s, ref, input);
  }
  s.colWidths = new Map([[0, 160]]);
  const other = newSheet('Other sheet');
  setInput(other, 'A1', "='Sheet1'!B4*2");
  wb.sheets.push(other);
  return wb;
}

describe('SHEET-009 ODS writer', () => {
  it('writes a valid ODF spreadsheet package', () => {
    const bytes = writeOds(sample());
    expect(detectFormat('x', bytes)).toBe('ods');
    expect(new TextDecoder().decode(bytes.subarray(30, 38))).toBe('mimetype');
    const zip = unzipSync(bytes);
    for (const part of ['content.xml', 'styles.xml', 'meta.xml', 'META-INF/manifest.xml']) {
      expect(() => parseXml(readZipText(zip, part)!), part).not.toThrow();
    }
    expect(readZipText(zip, 'content.xml')).toContain('table:formula="of:=SUM([.B2:.B3])"');
  });

  it('round-trips values, formulas, formats, sheets and widths', () => {
    const back = readOds(writeOds(sample()));
    expect(back.sheets.map((s) => s.name)).toEqual(['Sheet1', 'Other sheet']);
    const s = back.sheets[0]!;
    expect(getCell(s, 'A2')).toEqual({ value: 'Tea & <coffee>' });
    expect(getCell(s, 'B4')).toEqual({ value: 6.5, formula: 'SUM(B2:B3)' });
    expect(getCell(s, 'C1')).toEqual({ value: true });
    expect(getCell(s, 'C2')).toEqual({ value: 45322, numFmt: 'yyyy-mm-dd' });
    expect(getCell(s, 'C3')).toEqual({ value: 0.125, numFmt: '0.0%' });
    expect(getCell(s, 'D1')).toEqual({ value: 'Tea & <coffee>!', formula: 'CONCAT(A2,"!")' });
    expect(getCell(s, 'D2')?.formula).toBe('1/0');
    expect(getCell(s, 'A10')).toEqual({ value: 'far away' });
    expect(s.colWidths?.get(0)).toBe(160);
    expect(new Calculator(back).value(1, 'A1')).toBe(13);
  });
});
