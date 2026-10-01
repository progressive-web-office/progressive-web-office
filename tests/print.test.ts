import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultPrintSettings, loadPrintSettings, pageCss, savePrintSettings, PAPER_SIZES } from '../src/print/settings';
import { openPrintPreview } from '../src/print/preview';
import { DocumentEditor } from '../src/document/editor';
import { SheetEditor } from '../src/sheet/grid';
import { SlideEditor } from '../src/slides/editor';
import { richSample } from './fixtures';
import { newWorkbook, setInput } from '../src/sheet/model';
import { contentSlide, emptyPresentation } from '../src/slides/model';

const ctx = () => ({ changed: vi.fn(), statusChanged: vi.fn(), choose: vi.fn() });
afterEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
});

describe('PRINT-002 page settings', () => {
  it('builds @page CSS for paper size, orientation and margins', () => {
    expect(pageCss({ ...defaultPrintSettings(), paper: 'A4', orientation: 'portrait', margin: 15 })).toContain('@page { size: 210mm 297mm; margin: 15mm; }');
    expect(pageCss({ ...defaultPrintSettings(), paper: 'Letter', orientation: 'landscape', margin: 10 })).toContain('size: 279.4mm 215.9mm');
    expect(Object.keys(PAPER_SIZES)).toEqual(['A4', 'Letter', 'A3', 'A5']);
  });

  it('persists the settings', () => {
    savePrintSettings({ ...defaultPrintSettings(), paper: 'A3', gridlines: false });
    expect(loadPrintSettings()).toMatchObject({ paper: 'A3', gridlines: false });
  });
});

describe('PRINT-003..005 printable content', () => {
  it('documents print their content with keep-with-next headings', async () => {
    const ed = new DocumentEditor(richSample(), ctx());
    const content = await ed.printContent!(defaultPrintSettings());
    expect(content.querySelector('h1')?.textContent).toBe('Main title');
    expect(content.querySelector('table')).not.toBeNull();
    expect(content.classList.contains('print-document')).toBe(true);
  });

  it('spreadsheets print the used range with optional grid lines and headings', async () => {
    const wb = newWorkbook();
    setInput(wb.sheets[0]!, 'A1', 'x');
    setInput(wb.sheets[0]!, 'B2', '=1+1');
    const ed = new SheetEditor(wb, ctx(), 'xlsx');
    const withAll = await ed.printContent!({ ...defaultPrintSettings(), gridlines: true, headings: true });
    expect(withAll.querySelector('table')?.classList.contains('gridlines')).toBe(true);
    expect(Array.from(withAll.querySelectorAll('thead th')).map((t) => t.textContent)).toEqual(['', 'A', 'B']);
    expect(withAll.querySelector('tbody tr:nth-child(2) td:nth-child(3)')?.textContent).toBe('2');
    const bare = await ed.printContent!({ ...defaultPrintSettings(), gridlines: false, headings: false });
    expect(bare.querySelector('thead')).toBeNull();
  });

  it('presentations print one slide per page or handouts with notes', async () => {
    const pres = emptyPresentation();
    pres.slides.push(contentSlide(), contentSlide());
    pres.slides[1]!.notes = 'Note two';
    const ed = new SlideEditor(pres, ctx(), 'pptx');
    const one = await ed.printContent!({ ...defaultPrintSettings(), slidesPerPage: 1, notes: false });
    expect(one.querySelectorAll('.print-page')).toHaveLength(3);
    const handout = await ed.printContent!({ ...defaultPrintSettings(), slidesPerPage: 4, notes: true });
    expect(handout.querySelectorAll('.print-page')).toHaveLength(1);
    expect(handout.textContent).toContain('Note two');
  });
});

describe('PRINT-001 print preview', () => {
  it('shows a preview with page settings and prints the iframe content', async () => {
    const printed = vi.fn();
    document.addEventListener('pwo:print', printed);
    const ed = new DocumentEditor(richSample(), ctx());
    const preview = await openPrintPreview(document.body, 'document', (s) => ed.printContent!(s));
    const dialog = document.querySelector('.print-dialog')!;
    expect(dialog.querySelector('select[name="paper"]')).not.toBeNull();
    const frame = dialog.querySelector('iframe')!;
    expect(frame.contentDocument?.querySelector('h1')?.textContent).toBe('Main title');
    expect(frame.contentDocument?.querySelector('style.page-style')?.textContent).toContain('@page');
    const paper = dialog.querySelector<HTMLSelectElement>('select[name="paper"]')!;
    paper.value = 'Letter';
    paper.dispatchEvent(new Event('change'));
    await preview.refreshed;
    expect(frame.contentDocument?.querySelector('style.page-style')?.textContent).toContain('215.9mm');
    frame.contentWindow!.print = vi.fn();
    dialog.querySelector<HTMLButtonElement>('button.primary')!.click();
    expect(printed).toHaveBeenCalled();
    expect(frame.contentWindow!.print).toHaveBeenCalled();
  });
});
