/** "Send to another device" dialog (SHARE-001, SHARE-002, SHARE-004, SHARE-007). */
import { button, h } from '../app/dom';
import type { DocumentFormat } from '../core/format';
import { t } from '../i18n';
import { sendFileToWindow, type WindowLike } from './handoff';
import { encodeDocumentLink, LINK_MAX_LENGTH, LINK_WARN_LENGTH } from './link';
import { canShareFiles, handoffSendUrl, loadShareSettings, planSend, probeHandoff, prepareTransferUrl, qrshareOrigin, saveShareSettings, SEND_POLICIES, sendTextUrl, type SendPolicy } from './qrshare';

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
export async function openSendDialog(
  host: HTMLElement,
  file: File,
  format: DocumentFormat,
  notify: (message: string) => void = () => undefined,
  /** The document as carried by a link (e.g. Markdown for a text document); defaults to `file`. */
  linkFile: File = file,
): Promise<boolean> {
  const plan = await planSend(file, format);
  // SHARE-009: prepared up front so that the copy runs within the click.
  const link = encodeDocumentLink(location.origin + location.pathname, linkFile.name, new Uint8Array(await linkFile.arrayBuffer()));
  const settings = loadShareSettings();
  return new Promise((resolve) => {
    const dialog = h('dialog', { class: 'dialog share-dialog', 'aria-labelledby': 'share-title' });
    const policy = h(
      'select',
      { 'aria-label': t('share.policy') },
      ...SEND_POLICIES.map((p) => h('option', { value: p, selected: p === settings.policy }, t(`share.policy.${p}`))),
    );
    const url = h('input', { type: 'url', value: settings.url, 'aria-label': t('share.url'), spellcheck: 'false' });
    // Does this QRShare accept files from apps? Checked ahead of the click,
    // which must open the window synchronously. Null while unknown.
    let supportsHandoff: boolean | null = null;
    const probe = (): void => {
      supportsHandoff = null;
      const probed = url.value.trim();
      if (plan.kind === 'handoff') void probeHandoff(probed).then((result) => (supportsHandoff = url.value.trim() === probed ? result : supportsHandoff));
    };
    url.addEventListener('change', probe);
    probe();
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
      } else if (supportsHandoff === false) {
        // An older QRShare: download and open "Prepare a transfer" right away.
        download(file);
        window.open(prepareTransferUrl(target), '_blank', 'noopener');
        notify(t('share.downloadFallback'));
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
    const kb = Math.max(1, Math.round(link.length / 1024));
    const linkField = h('input', { type: 'text', readonly: true, class: 'share-link', value: link, 'aria-label': t('share.link'), spellcheck: 'false' });
    linkField.addEventListener('focus', () => linkField.select());
    const linkSection =
      link.length > LINK_MAX_LENGTH
        ? h('p', { class: 'hint' }, t('share.linkTooLong'))
        : h(
            'div',
            { class: 'share-link-section' },
            h('p', {}, t('share.linkIntro', { size: `${kb} KB` })),
            h(
              'div',
              { class: 'git-row' },
              linkField,
              button(t('share.copyLink'), () => {
                linkField.select();
                void navigator.clipboard
                  ?.writeText(link)
                  .then(() => notify(link.length > LINK_WARN_LENGTH ? t('share.linkCopiedLong') : t('share.linkCopied')))
                  .catch(() => notify(t('share.linkCopyFailed')));
                finish(true);
              }),
            ),
            link.length > LINK_WARN_LENGTH ? h('p', { class: 'hint' }, t('share.linkLong')) : null,
          );
    dialog.append(
      h('h2', { id: 'share-title' }, t('share.dialogTitle')),
      h('p', {}, t('share.intro')),
      h('p', { class: 'share-file' }, `📄 ${file.name}`),
      h('label', { class: 'git-row' }, t('share.policy'), ' ', policy),
      h('details', {}, h('summary', {}, t('share.advanced')), h('label', { class: 'git-row' }, t('share.url'), ' ', url)),
      h('p', { class: 'hint', role: 'note' }, t('share.planUrl')),
      actions,
      linkSection,
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
