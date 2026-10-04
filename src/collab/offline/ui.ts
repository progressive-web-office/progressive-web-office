/**
 * "Sync by QR code" dialog (COLLAB-008): guides the user through the passes
 * of an offline synchronisation, shown and scanned with QRShare (handoff
 * protocol v2), with a file of codes as a fallback.
 */
import * as Y from 'yjs';
import { loadIdentity } from '@scelles/collab';
import { commentAuthor } from '../../app/author';
import { busyText, button, h } from '../../app/dom';
import type { SyncableDocument } from '../../app/views';
import { t } from '../../i18n';
import { receiveFromWindow, sendFileToWindow, type WindowLike } from '../../share/handoff';
import { handoffFeatures, handoffSendUrl, loadShareSettings, qrshareOrigin, receiveUrl } from '../../share/qrshare';
import { readCrdt, writeCrdt } from './crdt';
import { DocumentSync, docIdOf, type PendingUpdate, type SyncPrompts } from './sync';
import { deviceKey, IdbImportLog, IdbPeerStore, loadCrdt, saveCrdt } from './store';

/** Same identity as real-time collaboration (see ../ui.ts). */
const IDENTITY_KEY = 'pwo.collab.identity';
/** File extension of a pass saved as a file. */
export const PASS_EXTENSION = 'qsyn';
const HANDOFF_TIMEOUT_MS = 15_000;

export interface OfflineSyncHost {
  root: HTMLElement;
  document: SyncableDocument;
  /** File name of the document, for the pass files. */
  name: string;
}

/** "ab12cd34…" → "AB12 CD34", enough to compare by eye. */
export const fingerprint = (hexId: string): string => `${hexId.slice(0, 4)} ${hexId.slice(4, 8)}`.toUpperCase();

const kb = (bytes: number): string => (bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`);

function ask(host: HTMLElement, title: string, body: (HTMLElement | string)[], yes: string, no: string): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = h('dialog', { class: 'dialog sync-ask', 'aria-label': title });
    const finish = (value: boolean): void => {
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    dialog.append(h('h2', {}, title), ...body, h('div', { class: 'dialog-actions' }, button(no, () => finish(false)), button(yes, () => finish(true), { className: 'primary' })));
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(false);
    });
    host.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  });
}

function prompts(host: HTMLElement): SyncPrompts {
  return {
    trust: (peer) => ask(host, t('sync.trustTitle'), [h('p', {}, t('sync.trust', { name: peer.name, fingerprint: fingerprint(peer.id) }))], t('sync.trustYes'), t('sync.trustNo')),
    review: (u: PendingUpdate) =>
      ask(
        host,
        t('sync.reviewTitle'),
        [
          h('p', {}, t('sync.review', { who: u.peer ? u.peer.name : t('sync.unknownDevice', { fingerprint: fingerprint(u.from) }), insertions: u.summary.insertions, deletions: u.summary.deletions, size: kb(u.summary.bytes) })),
          u.trust === 'unknown' ? h('p', { class: 'hint' }, t('sync.unknownWarning')) : '',
        ],
        t('sync.apply'),
        t('sync.refuse'),
      ),
  };
}

function download(bytes: Uint8Array, name: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/octet-stream' }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Open the dialog for the open text document. */
export async function openOfflineSync(host: OfflineSyncHost): Promise<void> {
  const current = host.document.read();
  let id = current.meta.identifier;
  let note = '';
  let ydoc: Y.Doc | null = id ? await loadCrdt(id) : null;
  if (!id) {
    id = crypto.randomUUID();
    host.document.write({ ...current, meta: { ...current.meta, identifier: id } });
    note = t('sync.madeSyncable');
  }
  // Without the history of this document, merging our own copy would duplicate its content: join instead.
  let joining = !ydoc && !note;
  if (!ydoc) ydoc = new Y.Doc();
  if (!joining) {
    writeCrdt(ydoc, { ...host.document.read() });
    await saveCrdt(id, current.meta.title || host.name, ydoc);
  } else {
    note = t('sync.join');
  }
  const docId = id;
  const doc = ydoc;
  const sync = new DocumentSync({ doc, docId, key: await deviceKey(), name: commentAuthor() || loadIdentity(IDENTITY_KEY).name, peers: new IdbPeerStore(), log: new IdbImportLog() });
  const settings = loadShareSettings();
  const features = await handoffFeatures(settings.url);
  const canScan = !!features?.features.includes('reply-opener');
  const stem = host.name.replace(/\.[^.]+$/, '') || 'document';

  const dialog = h('dialog', { class: 'dialog sync-dialog', 'aria-labelledby': 'sync-title' });
  const joinNote = note ? h('p', { class: 'hint', role: 'note' }, note) : h('span');
  const status = h('p', { class: 'sync-status', role: 'status', 'aria-live': 'polite' });
  const actions = h('div', { class: 'sync-actions' });
  const files = h('div', { class: 'sync-files' });
  const logList = h('ul', { class: 'sync-log', role: 'list' });
  let abort: AbortController | null = null;
  let scanner: Window | null = null;

  const close = (): void => {
    abort?.abort();
    scanner?.close();
    dialog.close();
    dialog.remove();
  };

  const renderLog = async (): Promise<void> => {
    const entries = (await new IdbImportLog().list(docId)).slice(-5).reverse();
    logList.replaceChildren(
      ...entries.map((e) =>
        h('li', {}, t('sync.logEntry', { date: new Date(e.at).toLocaleString(), who: e.peerName ?? t('sync.unknownDevice', { fingerprint: fingerprint(e.peer) }), result: t(`sync.result.${e.result}`) })),
      ),
    );
  };

  /** After a received pass: apply the merged document and go on. */
  const handle = async (bytes: Uint8Array): Promise<void> => {
    const from = docIdOf(bytes);
    if (from && from !== docId) {
      status.textContent = t('sync.otherDocument');
      return idle();
    }
    try {
      const result = await sync.handle(bytes, prompts(dialog));
      if (result.changed) {
        const merged = readCrdt(doc);
        host.document.write({ ...merged, meta: { ...merged.meta, identifier: docId } });
      }
      await saveCrdt(docId, host.document.read().meta.title || host.name, doc);
      await renderLog();
      if (result.reply) return offerShow(result.reply, result.awaitsReply, result.changed);
      finish(result.changed);
    } catch (err) {
      await renderLog();
      status.textContent = t('sync.invalid', { message: (err as Error).message });
      idle();
    }
  };

  const fileButtons = (pass?: Uint8Array): void => {
    const input = h('input', { type: 'file', accept: `.${PASS_EXTENSION},application/octet-stream`, hidden: true });
    input.addEventListener('change', () => {
      const f = input.files?.[0];
      if (f) void f.arrayBuffer().then((b) => handle(new Uint8Array(b)));
      input.value = '';
    });
    files.replaceChildren(
      ...(pass ? [button(t('sync.saveFile'), () => download(pass, `${stem}.${PASS_EXTENSION}`))] : []),
      button(t('sync.importFile'), () => input.click()),
      input,
    );
  };

  /** Show a pass with QRShare; the click opens its window. */
  const show = (pass: Uint8Array): boolean => {
    const target = settings.url;
    const win = window.open(handoffSendUrl(target, settings.policy, 'animated-qr'), '_blank');
    if (!win) {
      status.textContent = t('share.popupBlocked');
      return false;
    }
    const file = new File([pass as BlobPart], `${stem}.${PASS_EXTENSION}`, { type: 'application/octet-stream' });
    void sendFileToWindow(window as unknown as WindowLike, win as unknown as WindowLike, qrshareOrigin(target), file, HANDOFF_TIMEOUT_MS).then((r) => {
      if (r === 'timeout') status.textContent = t('sync.handoffFailed');
    });
    return true;
  };

  /** Scan the other device with QRShare, which sends the codes back to this window. */
  const scan = (): void => {
    const back = new URL(location.pathname, location.origin).href;
    scanner = window.open(receiveUrl(settings.url, settings.policy, back, true), '_blank');
    if (!scanner) {
      status.textContent = t('share.popupBlocked');
      return;
    }
    abort = new AbortController();
    status.replaceChildren(...busyText(t('sync.waitingScan')));
    actions.replaceChildren(button(t('common.cancel'), () => (abort?.abort(), idle())));
    void receiveFromWindow(window as unknown as WindowLike, scanner as unknown as WindowLike, qrshareOrigin(settings.url), { signal: abort.signal }).then(async (file) => {
      scanner = null;
      if (file) await handle(new Uint8Array(await file.arrayBuffer()));
    });
  };

  const scanButton = (label: string): HTMLButtonElement => {
    const b = button(label, scan, { className: 'primary' });
    b.disabled = !canScan;
    return b;
  };

  const offerShow = (pass: Uint8Array, awaitsReply: boolean, changed = false): void => {
    status.textContent = changed ? t('sync.mergedShow') : t('sync.readyShow', { size: kb(pass.length) });
    actions.replaceChildren(
      button(
        t('sync.show'),
        () => {
          if (!show(pass)) return;
          if (awaitsReply) {
            status.textContent = t('sync.showingThenScan');
            actions.replaceChildren(scanButton(t('sync.scanAnswer')));
          } else {
            finish(changed, true);
          }
        },
        { className: 'primary' },
      ),
    );
    fileButtons(pass);
  };

  const finish = (changed: boolean, shown = false): void => {
    status.textContent = shown ? t('sync.doneShown') : changed ? t('sync.doneChanged') : t('sync.done');
    actions.replaceChildren(button(t('common.close'), close, { className: 'primary' }));
    fileButtons();
  };

  const idle = (): void => {
    const buttons: HTMLElement[] = [];
    if (!joining) {
      buttons.push(
        button(t('sync.start'), () => void sync.start().then((pass) => offerShow(pass, true)), { className: 'primary' }),
        button(t('sync.everything'), () => void sync.everything().then((pass) => offerShow(pass, false))),
      );
    }
    buttons.push(scanButton(t('sync.scan')));
    if (joining) {
      // No device has the history (e.g. cleared storage): start it from this copy.
      buttons.push(
        button(t('sync.restart'), () =>
          void (async () => {
            writeCrdt(doc, host.document.read());
            await saveCrdt(docId, host.document.read().meta.title || host.name, doc);
            joining = false;
            joinNote.remove();
            idle();
          })(),
        ),
      );
    }
    actions.replaceChildren(...buttons);
    fileButtons();
  };

  dialog.append(
    h('h2', { id: 'sync-title' }, t('sync.title')),
    h('p', {}, t('sync.intro')),
    joinNote,
    canScan ? '' : h('p', { class: 'hint', role: 'note' }, t('sync.noReplyOpener')),
    status,
    actions,
    files,
    h('details', {}, h('summary', {}, t('sync.log')), logList),
    h('div', { class: 'dialog-actions' }, button(t('common.close'), close)),
  );
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  idle();
  void renderLog();
  host.root.append(dialog);
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}
