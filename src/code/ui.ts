/** Code cell controls and dialogs (CODE-001, CODE-004). */
import { t } from '../i18n';
import { button, h } from '../app/dom';
import type { CodeLang } from '../document/model';

export const LANG_LABEL: Record<CodeLang, string> = { python: 'Python', javascript: 'JavaScript' };

/** Add the Run / Edit bar to every cell under `root` that has none. */
export function decorateCells(root: HTMLElement): void {
  for (const cell of Array.from(root.querySelectorAll<HTMLElement>('.code-cell'))) {
    if (cell.querySelector(':scope > .code-cell-bar')) continue;
    const lang = (cell.dataset.lang ?? 'python') as CodeLang;
    const action = (name: string, text: string, label: string): HTMLButtonElement => {
      const b = button(label, () => undefined, { text, title: label, className: `code-cell-${name}` });
      b.dataset.action = name;
      b.contentEditable = 'false';
      return b;
    };
    cell.prepend(
      h(
        'span',
        { class: 'code-cell-bar', contenteditable: 'false' },
        h('span', { class: 'code-cell-lang' }, LANG_LABEL[lang] ?? lang),
        action('run', '▶', t('code.run')),
        action('run-all', '⏩', t('code.runAll')),
        action('stop', '■', t('code.stop')),
        action('edit', '✎', t('code.edit')),
      ),
    );
  }
}

/** Show progress or the result text in the cell's output area. */
export function setCellStatus(cell: HTMLElement, text: string): void {
  let output = cell.querySelector<HTMLElement>(':scope > .code-cell-output');
  if (!output) {
    output = h('span', { class: 'code-cell-output' });
    cell.append(output);
  }
  output.classList.remove('error');
  output.classList.add('pending');
  output.textContent = text;
  cell.querySelector(':scope > .code-cell-figures')?.remove();
}

export interface CellValue {
  lang: CodeLang;
  code: string;
}

function modal(host: HTMLElement, titleId: string): { dialog: HTMLDialogElement; show(): void; close(): void } {
  const dialog = h('dialog', { class: 'dialog code-dialog', 'aria-labelledby': titleId });
  return {
    dialog,
    show() {
      host.append(dialog);
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    },
    close() {
      dialog.close();
      dialog.remove();
    },
  };
}

/** Insert or edit a cell. Resolves to null when cancelled. */
export function editCell(host: HTMLElement, initial?: CellValue): Promise<CellValue | null> {
  return new Promise((resolve) => {
    const m = modal(host, 'code-title');
    const lang = h('select', { 'aria-label': t('code.language') }, ...(['python', 'javascript'] as CodeLang[]).map((l) => h('option', { value: l }, LANG_LABEL[l])));
    lang.value = initial?.lang ?? 'python';
    const source = h('textarea', { class: 'code-source', rows: '14', wrap: 'off', spellcheck: 'false', 'aria-label': t('code.source') });
    source.value = initial?.code ?? '';
    // Tab inserts spaces instead of leaving the field (Python indentation).
    source.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      source.setRangeText('    ', source.selectionStart, source.selectionEnd, 'end');
    });
    const finish = (ok: boolean): void => {
      m.close();
      resolve(ok ? { lang: lang.value as CodeLang, code: source.value.replace(/\s+$/, '') } : null);
    };
    m.dialog.append(
      h('h2', { id: 'code-title' }, initial ? t('code.editTitle') : t('code.insertTitle')),
      h('label', { class: 'code-lang-label' }, `${t('code.language')} `, lang),
      source,
      h('p', { class: 'hint' }, t('code.hint')),
      h(
        'div',
        { class: 'dialog-actions' },
        button(t('common.cancel'), () => finish(false)),
        button(initial ? t('code.update') : t('code.insert'), () => finish(true), { className: 'primary' }),
      ),
    );
    m.dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(false);
    });
    m.show();
    setTimeout(() => source.focus(), 0);
  });
}

/** CODE-004: explain what running the document's code means before the first run. */
export function confirmRun(host: HTMLElement): Promise<boolean> {
  return new Promise((resolve) => {
    const m = modal(host, 'code-trust-title');
    const finish = (ok: boolean): void => {
      m.close();
      resolve(ok);
    };
    m.dialog.append(
      h('h2', { id: 'code-trust-title' }, t('code.trustTitle')),
      h('p', {}, t('code.trustSandbox')),
      h('p', {}, t('code.trustPackages')),
      h('p', {}, t('code.trustAdvice')),
      h(
        'div',
        { class: 'dialog-actions' },
        button(t('common.cancel'), () => finish(false)),
        button(t('code.trustRun'), () => finish(true), { className: 'primary' }),
      ),
    );
    m.dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(false);
    });
    m.show();
  });
}
