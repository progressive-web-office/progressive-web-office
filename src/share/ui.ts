/** "Send to another device" dialog (SHARE-001, SHARE-002, SHARE-004). */
import { button, h } from '../app/dom';
import type { DocumentFormat } from '../core/format';
import { t, type MessageKey } from '../i18n';
import { canShareFiles, loadShareSettings, planSend, prepareTransferUrl, saveShareSettings, SEND_POLICIES, sendTextUrl, type SendPolicy } from './qrshare';

const PLAN_TEXT: Record<'url' | 'share' | 'download', MessageKey> = {
  url: 'share.planUrl',
  share: 'share.planShare',
  download: 'share.planDownload',
};

function download(file: File): void {
  const url = URL.createObjectURL(file);
  const a = h('a', { href: url, download: file.name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Resolves to true when the document was handed to QRShare. */
export async function openSendDialog(host: HTMLElement, file: File, format: DocumentFormat): Promise<boolean> {
  const plan = await planSend(file, format, { canShareFiles: canShareFiles(file) });
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
    // Everything below runs synchronously in the click: popups and the share
    // sheet need the user gesture.
    const send = (): void => {
      const chosen = { url: url.value.trim(), policy: policy.value as SendPolicy };
      saveShareSettings(chosen);
      const target = loadShareSettings().url;
      if (plan.kind === 'url') {
        window.open(sendTextUrl(target, plan.text, chosen.policy), '_blank', 'noopener');
      } else if (plan.kind === 'share') {
        navigator.share({ files: [file], title: file.name }).catch(() => undefined);
      } else {
        download(file);
        window.open(prepareTransferUrl(target), '_blank', 'noopener');
      }
      finish(true);
    };
    dialog.append(
      h('h2', { id: 'share-title' }, t('share.dialogTitle')),
      h('p', {}, t('share.intro')),
      h('p', { class: 'share-file' }, `📄 ${file.name}`),
      h('label', { class: 'git-row' }, t('share.policy'), ' ', policy),
      h('details', {}, h('summary', {}, t('share.advanced')), h('label', { class: 'git-row' }, t('share.url'), ' ', url)),
      h('p', { class: 'hint', role: 'note' }, t(PLAN_TEXT[plan.kind])),
      h('div', { class: 'dialog-actions' }, button(t('common.cancel'), () => finish(false)), button(t('share.sendButton'), send, { className: 'primary' })),
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
