/** Print preview dialog (PRINT-001, PRINT-002, PRINT-007). */
import { button, h } from '../app/dom';
import { t } from '../i18n';
import { contentWidthPx, loadPrintSettings, mmToPx, pageCss, pageSize, PAPER_SIZES, savePrintSettings, type PrintSettings } from './settings';

export type PrintKind = 'document' | 'spreadsheet' | 'presentation';

const PRINT_CSS = `
html, body { margin: 0; background: #fff; color: #000; }
body { font-family: Calibri, Carlito, 'Segoe UI', system-ui, sans-serif; font-size: 11pt; line-height: 1.4; }
@media screen {
  html { background: #6b7280; }
  .paper { background: #fff; margin: 16px auto; box-shadow: 0 2px 10px rgba(0,0,0,.4); box-sizing: content-box; }
}
@media print { .paper { width: auto !important; padding: 0 !important; } }
.print-document h1, .print-document h2, .print-document h3, .print-document h4, .print-document h5, .print-document h6 { break-after: avoid; page-break-after: avoid; }
.print-document h1 { font-size: 20pt; } .print-document h2 { font-size: 16pt; } .print-document h3 { font-size: 14pt; }
.print-document p { margin: 0 0 8pt; orphans: 2; widows: 2; }
.print-document table, .print-document img, .print-document pre, .print-document blockquote, .print-document .math.display { break-inside: avoid; page-break-inside: avoid; }
.print-document table { border-collapse: collapse; width: 100%; margin-bottom: 8pt; }
.print-document td, .print-document th { border: 1px solid #777; padding: 3px 6px; vertical-align: top; }
.print-document img { max-width: 100%; height: auto; }
.print-document pre, .print-document code { font-family: 'Liberation Mono', Consolas, monospace; font-size: 9.5pt; }
.print-document pre { white-space: pre-wrap; background: #f3f3f3; padding: 4px 8px; }
.print-document blockquote { margin: 0 0 8pt; padding-left: 12px; border-left: 3px solid #bbb; font-style: italic; }
.print-document .math.display { display: block; text-align: center; margin: 6pt 0; }
.print-document span.diagram { display: block; text-align: center; margin: 6pt 0; break-inside: avoid; page-break-inside: avoid; }
.print-sheet h2 { font-size: 12pt; margin: 0 0 6pt; }
.print-sheet table { border-collapse: collapse; font-size: 9pt; margin-bottom: 12pt; }
.print-sheet thead { display: table-header-group; }
.print-sheet tr { break-inside: avoid; page-break-inside: avoid; }
.print-sheet td, .print-sheet th { padding: 2px 5px; white-space: nowrap; }
.print-sheet table.gridlines td, .print-sheet table.gridlines th { border: 1px solid #999; }
.print-sheet th { background: #eee; font-weight: normal; color: #444; }
.print-sheet td.num { text-align: right; }
.print-sheet .sheet-block + .sheet-block { break-before: page; page-break-before: always; }
.print-page { break-after: page; page-break-after: always; }
.print-page:last-child { break-after: auto; page-break-after: auto; }
.print-slides .print-page { display: grid; gap: 6mm; align-content: start; }
.print-slides .slide-frame { position: relative; overflow: hidden; border: 1px solid #ccc; }
.print-slides .slide-frame .slide { transform-origin: 0 0; position: absolute; top: 0; left: 0; }
.print-slides .slide-notes { font-size: 10pt; white-space: pre-wrap; margin: 2mm 0 0; }
`;

export interface PreviewHandle {
  /** Resolves once the latest settings change has been rendered. */
  readonly refreshed: Promise<void>;
  close(): void;
}

function copyStyles(target: Document): void {
  for (const node of Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))) {
    target.head.append(target.importNode(node, true));
  }
}

export async function openPrintPreview(
  host: HTMLElement,
  kind: PrintKind,
  build: (settings: PrintSettings) => HTMLElement | Promise<HTMLElement>,
): Promise<PreviewHandle> {
  let settings = loadPrintSettings();
  const frame = h('iframe', { class: 'print-frame', title: t('print.preview') });
  const frameWrap = h('div', { class: 'print-frame-wrap' }, frame);
  const form = h('form', { class: 'print-settings' });
  const dialog = h('dialog', { class: 'dialog print-dialog', 'aria-labelledby': 'print-title' });

  const select = (name: string, label: string, options: [string, string][], value: string): HTMLLabelElement => {
    const el = h('select', { name }, ...options.map(([v, l]) => h('option', { value: v, selected: v === value }, l)));
    return h('label', {}, label, el);
  };
  const check = (name: string, label: string, value: boolean): HTMLLabelElement => h('label', { class: 'check' }, h('input', { type: 'checkbox', name, checked: value }), ` ${label}`);

  form.append(
    select('paper', t('print.paper'), Object.keys(PAPER_SIZES).map((p) => [p, p]), settings.paper),
    select('orientation', t('print.orientation'), [['portrait', t('print.portrait')], ['landscape', t('print.landscape')]], settings.orientation),
    h('label', {}, t('print.margins'), h('input', { type: 'number', name: 'margin', min: '0', max: '50', step: '1', value: String(settings.margin) })),
  );
  if (kind === 'spreadsheet') form.append(check('gridlines', t('print.gridlines'), settings.gridlines), check('headings', t('print.headings'), settings.headings), check('allSheets', t('print.allSheets'), settings.allSheets));
  if (kind === 'presentation') form.append(select('slidesPerPage', t('print.slidesPerPage'), ['1', '2', '4', '6'].map((n) => [n, n]), String(settings.slidesPerPage)), check('notes', t('print.notes'), settings.notes));
  form.append(h('p', { class: 'hint' }, t('print.pdfHint')));

  let current: Promise<void> = Promise.resolve();
  const render = async (): Promise<void> => {
    const doc = frame.contentDocument;
    if (!doc) return;
    if (!doc.head.querySelector('style.base-style')) {
      copyStyles(doc);
      const base = doc.createElement('style');
      base.className = 'base-style';
      base.textContent = PRINT_CSS;
      doc.head.append(base);
    }
    let pageStyle = doc.head.querySelector<HTMLStyleElement>('style.page-style');
    if (!pageStyle) {
      pageStyle = doc.createElement('style');
      pageStyle.className = 'page-style';
      doc.head.append(pageStyle);
    }
    pageStyle.textContent = pageCss(settings);
    const content = await build(settings);
    const paper = doc.createElement('div');
    paper.className = 'paper';
    paper.style.width = `${contentWidthPx(settings)}px`;
    paper.style.padding = `${mmToPx(settings.margin)}px`;
    paper.style.minHeight = `${mmToPx(pageSize(settings)[1] - 2 * settings.margin)}px`;
    paper.append(doc.importNode(content, true));
    doc.body.replaceChildren(paper);
    const [w] = pageSize(settings);
    frame.style.width = `${mmToPx(w) + 48}px`;
  };
  const refresh = (): void => {
    const data = new FormData(form);
    settings = {
      ...settings,
      paper: (data.get('paper') as PrintSettings['paper']) ?? settings.paper,
      orientation: (data.get('orientation') as PrintSettings['orientation']) ?? settings.orientation,
      margin: Math.max(0, Math.min(50, Number(data.get('margin') ?? settings.margin) || 0)),
    };
    if (kind === 'spreadsheet') {
      settings.gridlines = data.get('gridlines') === 'on';
      settings.headings = data.get('headings') === 'on';
      settings.allSheets = data.get('allSheets') === 'on';
    }
    if (kind === 'presentation') {
      settings.slidesPerPage = Number(data.get('slidesPerPage') ?? 1) as PrintSettings['slidesPerPage'];
      settings.notes = data.get('notes') === 'on';
    }
    savePrintSettings(settings);
    current = render();
  };
  form.addEventListener('change', refresh);
  form.addEventListener('submit', (e) => e.preventDefault());

  const close = (): void => {
    dialog.close();
    dialog.remove();
  };
  const print = (): void => {
    document.dispatchEvent(new CustomEvent('pwo:print', { detail: { kind, settings } }));
    const win = frame.contentWindow;
    win?.focus();
    win?.print();
  };
  dialog.append(
    h('div', { class: 'print-head' }, h('h2', { id: 'print-title' }, t('print.title')), button(t('common.dismiss'), close, { text: '×', className: 'icon' })),
    h('div', { class: 'print-body' }, form, frameWrap),
    h('div', { class: 'dialog-actions' }, button(t('common.cancel'), close), button(t('print.print'), print, { className: 'primary' })),
  );
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  host.append(dialog);
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  current = render();
  await current;
  return {
    get refreshed() {
      return current;
    },
    close,
  };
}
