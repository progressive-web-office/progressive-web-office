/** "Send to another device" dialog (SHARE-001, SHARE-002, SHARE-004, SHARE-007). */
import { button, h } from '../app/dom';
import type { DocumentFormat } from '../core/format';
import { t } from '../i18n';
import { sendFileToWindow, type WindowLike } from './handoff';
import { canShareFiles, handoffSendUrl, loadShareSettings, planSend, prepareTransferUrl, qrshareOrigin, saveShareSettings, SEND_POLICIES, sendTextUrl, type SendPolicy } from './qrshare';

/** How long to wait for QRShare to announce it is ready before falling back. */
export const HANDOFF_TIMEOUT_MS = 15_000;

function download(file: File): void {
  const url = URL.createObjectURL(file);
  const a = h('a', { href: url, download: file.name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Resolves to true when the document was handed to QRShare (or the share
 * sheet). `notify` reports the outcome of an asynchronous handoff.
 */
export async function openSendDialog(host: HTMLElement, file: File, format: DocumentFormat, notify: (message: string) => void = () => undefined): Promise<boolean> {
  const plan = await planSend(file, format);
  const settings = loadShareSettings();
  return new Promise((resolve) => {
    const dialog = h('dialog', { class: 'dialog share-dialog', 'aria-labelledby': 'share-title' });
    const policy = h(
      'select',
      { 'aria-label': t('share.policy') },
      ...SEND_POLICIES.map((p) => h('option', { value: p, selected: p === settings.policy }, t(`share.policy.${p}`))),
    );
    const url = h('input', { type: 'url', value: settings.url, 'aria-label': t('share.url'), spellcheck: 'false' });
    const finish = (value: boolean): void => {
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    // Window opening and the share sheet need the click's user activation:
    // everything up to window.open/navigator.share runs synchronously.
    const send = (): void => {
      const chosen = { url: url.value.trim(), policy: policy.value as SendPolicy };
      saveShareSettings(chosen);
      const target = loadShareSettings().url;
      if (plan.kind === 'url') {
        window.open(sendTextUrl(target, plan.text, chosen.policy), '_blank', 'noopener');
      } else {
        // Keep `opener`: QRShare announces it is ready through it (SHARE-007).
        const win = window.open(handoffSendUrl(target, chosen.policy), '_blank');
        if (!win) {
          notify(t('share.popupBlocked'));
        } else {
          void sendFileToWindow(window as unknown as WindowLike, win as unknown as WindowLike, qrshareOrigin(target), file, HANDOFF_TIMEOUT_MS).then((result) => {
            if (result === 'sent') return;
            // Older QRShare without handoff: download and open "Prepare a transfer".
            download(file);
            win.location.href = prepareTransferUrl(target);
            notify(t('share.handoffFallback'));
          });
        }
      }
      finish(true);
    };
    const actions = h('div', { class: 'dialog-actions' }, button(t('common.cancel'), () => finish(false)));
    if (canShareFiles(file)) {
      actions.append(
        button(t('share.otherApp'), () => {
          navigator.share({ files: [file], title: file.name }).catch(() => undefined);
          finish(true);
        }),
      );
    }
    actions.append(button(t('share.sendButton'), send, { className: 'primary' }));
    dialog.append(
      h('h2', { id: 'share-title' }, t('share.dialogTitle')),
      h('p', {}, t('share.intro')),
      h('p', { class: 'share-file' }, `📄 ${file.name}`),
      h('label', { class: 'git-row' }, t('share.policy'), ' ', policy),
      h('details', {}, h('summary', {}, t('share.advanced')), h('label', { class: 'git-row' }, t('share.url'), ' ', url)),
      h('p', { class: 'hint', role: 'note' }, t('share.planUrl')),
      actions,
    );
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(false);
    });
    host.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    policy.focus();
  });
}
