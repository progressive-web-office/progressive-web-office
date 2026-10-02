/**
 * Captions and cross-references (DOC-026): choose what to number, and what a
 * reference points to.
 */
import { button, h } from '../app/dom';
import { t, type MessageKey } from '../i18n';
import type { SeqKind } from './model';

export interface CaptionChoice {
  kind: SeqKind;
  text: string;
}

function modal(host: HTMLElement, dialog: HTMLDialogElement, focus: HTMLElement): void {
  host.append(dialog);
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  setTimeout(() => focus.focus(), 0);
}

const KIND_KEYS: Record<SeqKind, MessageKey> = { figure: 'xref.figure', table: 'xref.table', equation: 'xref.equation' };

/** The word before a number, in the interface language ("Figure", "Tableau"…). */
export const seqWord = (kind: SeqKind): string => t(KIND_KEYS[kind]);

/** Ask for the kind and text of a caption; equations are numbered where they are. */
export function editCaption(host: HTMLElement, opts: { equation: boolean; inTable: boolean }): Promise<CaptionChoice | null> {
  return new Promise((resolve) => {
    const kinds: SeqKind[] = ['figure', 'table', 'equation'];
    const initial: SeqKind = opts.equation ? 'equation' : opts.inTable ? 'table' : 'figure';
    const radios = kinds.map((k) => {
      const input = h('input', { type: 'radio', name: 'caption-kind', value: k });
      input.checked = k === initial;
      if (k === 'equation' && !opts.equation) input.disabled = true;
      return h('label', { class: 'check' }, input, ` ${seqWord(k)}`);
    });
    const text = h('input', { type: 'text', class: 'caption-text', 'aria-label': t('xref.captionText'), placeholder: t('xref.captionPlaceholder') });
    const kind = (): SeqKind => (dialog.querySelector<HTMLInputElement>('input[name=caption-kind]:checked')?.value as SeqKind) ?? 'figure';
    const sync = (): void => {
      text.disabled = kind() === 'equation';
    };
    const dialog = h('dialog', { class: 'dialog caption-dialog', 'aria-labelledby': 'caption-title' });
    const finish = (ok: boolean): void => {
      dialog.close();
      dialog.remove();
      resolve(ok ? { kind: kind(), text: text.value.trim() } : null);
    };
    dialog.append(
      h('h2', { id: 'caption-title' }, t('xref.captionTitle')),
      h('fieldset', { class: 'caption-kinds' }, h('legend', {}, t('xref.numbered')), ...radios),
      text,
      h('p', { class: 'hint' }, opts.equation ? t('xref.captionHintEquation') : t('xref.captionHint')),
      h('div', { class: 'dialog-actions' }, button(t('common.cancel'), () => finish(false)), button(t('common.ok'), () => finish(true), { className: 'primary' })),
    );
    dialog.addEventListener('change', sync);
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(false);
    });
    text.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finish(true);
      }
    });
    sync();
    modal(host, dialog, text.disabled ? (dialog.querySelector('input:checked') as HTMLElement) : text);
  });
}

export interface ReferenceTarget {
  /** Anchor of the target; new for a heading that has none. */
  id: string;
  kind: SeqKind | 'heading';
  label: string;
  description: string;
  /** Position of a heading to anchor before referring to it. */
  anchorAt?: number;
}

const GROUP_KEYS: Record<ReferenceTarget['kind'], MessageKey> = { heading: 'xref.headings', figure: 'xref.figures', table: 'xref.tables', equation: 'xref.equations' };

/** Choose the target of a cross-reference. */
export function pickReference(host: HTMLElement, targets: ReferenceTarget[]): Promise<ReferenceTarget | null> {
  return new Promise((resolve) => {
    const dialog = h('dialog', { class: 'dialog xref-dialog', 'aria-labelledby': 'xref-title' });
    const finish = (target: ReferenceTarget | null): void => {
      dialog.close();
      dialog.remove();
      resolve(target);
    };
    const groups = (['figure', 'table', 'equation', 'heading'] as const)
      .map((kind) => {
        const items = targets.filter((x) => x.kind === kind);
        if (!items.length) return null;
        return h(
          'section',
          { class: 'xref-group' },
          h('h3', {}, t(GROUP_KEYS[kind])),
          h('ul', { role: 'list' }, ...items.map((x) => h('li', {}, button(x.description, () => finish(x), { className: 'xref-choice' })))),
        );
      })
      .filter((g): g is HTMLElement => !!g);
    const close = button(t('common.cancel'), () => finish(null));
    dialog.append(
      h('h2', { id: 'xref-title' }, t('xref.title')),
      ...(groups.length ? groups : [h('p', { class: 'hint' }, t('xref.none'))]),
      h('div', { class: 'dialog-actions' }, close),
    );
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(null);
    });
    modal(host, dialog, (dialog.querySelector('.xref-choice') as HTMLElement | null) ?? close);
  });
}
