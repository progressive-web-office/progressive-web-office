/** Shared pieces of the review views (REVIEW-001..REVIEW-004): help and full screen. */
import { button, h } from '../app/dom';
import { t, type MessageKey } from '../i18n';
import { REVIEW_KEYS } from './keys';

/** The list of review shortcuts, in a dialog. */
export function showReviewHelp(host: HTMLElement = document.body): HTMLDialogElement {
  const dialog = h('dialog', { class: 'dialog review-help', 'aria-labelledby': 'review-help-title' });
  const close = (): void => {
    dialog.close();
    dialog.remove();
  };
  dialog.append(
    h('h2', { id: 'review-help-title' }, t('review.help')),
    h(
      'table',
      {},
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, t('review.keys')), h('th', { scope: 'col' }, ''))),
      h(
        'tbody',
        {},
        ...REVIEW_KEYS.map(({ action, keys }) =>
          h('tr', {}, h('td', {}, ...keys.flatMap((k, i) => [i ? ' ' : '', h('kbd', {}, k)])), h('td', {}, t(`review.action.${action}` as MessageKey))),
        ),
      ),
    ),
    h('div', { class: 'dialog-actions' }, button(t('review.close'), close)),
  );
  dialog.addEventListener('close', () => dialog.remove());
  host.append(dialog);
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  return dialog;
}

const CLASS = 'distraction-free';

export const isDistractionFree = (): boolean => document.body.classList.contains(CLASS);

/**
 * Full screen without distractions (REVIEW-004): the browser's full screen
 * when it allows it, and only the page and its comments on screen.
 */
export function toggleDistractionFree(on = !isDistractionFree(), changed?: (on: boolean) => void): void {
  document.body.classList.toggle(CLASS, on);
  if (on) {
    const leave = (): void => {
      if (document.fullscreenElement) return;
      document.removeEventListener('fullscreenchange', leave);
      document.body.classList.remove(CLASS);
      changed?.(false);
    };
    if (!document.fullscreenElement && typeof document.documentElement.requestFullscreen === 'function') {
      void document.documentElement
        .requestFullscreen()
        .then(() => document.addEventListener('fullscreenchange', leave))
        .catch(() => undefined);
    }
  } else if (document.fullscreenElement) {
    void document.exitFullscreen?.().catch(() => undefined);
  }
  changed?.(on);
}
