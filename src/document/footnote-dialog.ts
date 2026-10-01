/**
 * Footnote editor (DOC-022): the note is written in inline Markdown
 * (**bold**, *italic*, `code`, [links](https://…), $equations$), a blank line
 * starting a new paragraph.
 */
import { button, h } from '../app/dom';
import { t } from '../i18n';
import { readMarkdown } from './markdown-reader';
import { writeMarkdown } from './markdown-writer';
import { emptyDocument, normalizeRuns, splitParagraphs, type Run } from './model';

export function noteToMarkdown(runs: Run[]): string {
  const blocks = runs.length ? splitParagraphs(runs).map((part) => ({ type: 'paragraph' as const, style: 'normal' as const, runs: part })) : [];
  return writeMarkdown({ ...emptyDocument(), blocks }, { frontMatter: false }).trim();
}

export function markdownToNote(md: string): Run[] {
  const doc = readMarkdown(md.trim());
  const runs: Run[] = [];
  for (const b of doc.blocks) {
    if (b.type !== 'paragraph' || !b.runs.length) continue;
    if (runs.length) runs.push({ text: '\n\n' });
    runs.push(...b.runs.filter((r) => 'text' in r || 'math' in r));
  }
  return normalizeRuns(runs);
}

export function editFootnote(host: HTMLElement, initial: Run[] | undefined): Promise<Run[] | null> {
  return new Promise((resolve) => {
    const text = h('textarea', { class: 'footnote-source', rows: '4', 'aria-label': t('note.text'), spellcheck: 'true' });
    text.value = initial ? noteToMarkdown(initial) : '';
    const dialog = h('dialog', { class: 'dialog footnote-dialog', 'aria-labelledby': 'note-title' });
    const finish = (ok: boolean): void => {
      dialog.close();
      dialog.remove();
      resolve(ok ? markdownToNote(text.value) : null);
    };
    dialog.append(
      h('h2', { id: 'note-title' }, initial ? t('note.edit') : t('note.insert')),
      text,
      h('p', { class: 'hint' }, t('note.hint')),
      h('div', { class: 'dialog-actions' }, button(t('common.cancel'), () => finish(false)), button(initial ? t('common.ok') : t('note.insertButton'), () => finish(true), { className: 'primary' })),
    );
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(false);
    });
    text.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        finish(true);
      }
    });
    host.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    setTimeout(() => text.focus(), 0);
  });
}
