/**
 * DEVSYNC-001..DEVSYNC-005: the window of the synchronisation between one's
 * own devices — its warnings first (not a backup, deletions reach every
 * device, not collaboration), then pairing by a code or a QR code, the
 * devices, "Sync now", synchronising by itself, the trash, and revoking.
 */
import { button, h } from '../app/dom';
import { t } from '../i18n';
import { listen, startSync, stopSync, currentSync, SYNC_FOLDER } from './live';
import { TRASH } from './plan';
import { loadSyncState, newPairing, pairingCode, parsePairingCode, saveSyncState, unpaired, TOMBSTONE_DAYS } from './state';

export function syncDialog(host: HTMLElement, opts: { openBackup?(): void; openTrash?(): void } = {}): Promise<void> {
  return new Promise((resolve) => {
    const body = h('div', { class: 'devsync-body' });
    const status = h('p', { class: 'hint', role: 'status', 'aria-live': 'polite' });
    const error = h('p', { class: 'error', role: 'alert', hidden: true });
    const fail = (message: string): void => {
      error.textContent = message;
      error.hidden = false;
    };
    const warnings = (): HTMLElement =>
      h(
        'div',
        { class: 'devsync-warnings' },
        h('p', {}, t('devsync.what')),
        h('ul', {}, h('li', {}, t('devsync.notBackup')), h('li', {}, t('devsync.deletions', { days: TOMBSTONE_DAYS })), h('li', {}, t('devsync.notCollab')), h('li', {}, t('devsync.security'))),
      );
    const render = async (): Promise<void> => {
      error.hidden = true;
      const state = loadSyncState();
      if (!state.understood) {
        const ok = h('input', { type: 'checkbox' });
        const go = button(t('devsync.continue'), () => {
          if (!ok.checked) return fail(t('devsync.mustUnderstand'));
          saveSyncState({ ...loadSyncState(), understood: true });
          void render();
        }, { className: 'primary' });
        body.replaceChildren(warnings(), h('label', { class: 'devsync-understood' }, ok, ` ${t('devsync.understand')}`), opts.openBackup ? button(t('devsync.backupFirst'), () => opts.openBackup?.()) : '', h('div', { class: 'dialog-actions' }, go));
        return;
      }
      const name = h('input', { type: 'text', value: state.name, maxlength: '60', 'aria-label': t('devsync.deviceName') });
      name.addEventListener('change', () => saveSyncState({ ...loadSyncState(), name: name.value.trim() || state.name }));
      const nameRow = h('label', { class: 'git-row' }, t('devsync.deviceName'), ' ', name);
      if (!state.pairing) {
        const code = h('input', { type: 'text', 'aria-label': t('devsync.code'), placeholder: 'pwo-sync:…', spellcheck: 'false', autocomplete: 'off' });
        const join = button(t('devsync.join'), async () => {
          const pairing = parsePairingCode(code.value);
          if (!pairing) return fail(t('devsync.badCode'));
          saveSyncState({ ...loadSyncState(), pairing });
          await start();
        }, { className: 'primary' });
        const create = button(t('devsync.create'), async () => {
          saveSyncState({ ...loadSyncState(), pairing: newPairing() });
          await start();
        });
        body.replaceChildren(
          nameRow,
          h('h3', {}, t('devsync.firstDevice')),
          h('p', { class: 'hint' }, t('devsync.firstDeviceHint')),
          create,
          h('h3', {}, t('devsync.otherDevice')),
          h('p', { class: 'hint' }, t('devsync.otherDeviceHint')),
          h('div', { class: 'git-row' }, code, ' ', join),
          h('details', {}, h('summary', {}, t('devsync.reminder')), warnings()),
        );
        return;
      }
      const codeText = pairingCode(state.pairing);
      const { zoomableQr } = await import('../app/qr');
      const peers = h('ul', { class: 'devsync-peers' });
      const showPeers = (): void => {
        const online = new Set((currentSync()?.peers ?? []).map((p) => p.device));
        const known = Object.entries(loadSyncState().peers);
        peers.replaceChildren(
          ...(known.length
            ? known.map(([device, p]) => h('li', {}, `${online.has(device) ? '🟢' : '⚪'} ${p.name}`, h('span', { class: 'hint' }, ` — ${online.has(device) ? t('devsync.online') : t('devsync.lastSeen', { when: new Date(p.lastSeen).toLocaleString() })}`)))
            : [h('li', { class: 'hint' }, t('devsync.noPeer'))]),
        );
      };
      showPeers();
      const auto = h('input', { type: 'checkbox', checked: state.auto });
      auto.addEventListener('change', () => saveSyncState({ ...loadSyncState(), auto: auto.checked }));
      const now = button(t('devsync.now'), async () => {
        error.hidden = true;
        const live = currentSync() ?? (await start(false));
        if (!live) return;
        if (!live.sync.peerCount()) return void (status.textContent = t('devsync.waiting'));
        await live.sync.syncNow();
      }, { className: 'primary' });
      const copy = button(t('devsync.copy'), () => void navigator.clipboard?.writeText(codeText).then(() => (status.textContent = t('devsync.copied'))));
      const revoke = button(t('devsync.revoke'), () => {
        if (!window.confirm(t('devsync.revokeConfirm'))) return;
        stopSync();
        saveSyncState({ ...unpaired(loadSyncState()), pairing: newPairing() });
        void start();
      });
      const leave = button(t('devsync.unpair'), () => {
        if (!window.confirm(t('devsync.unpairConfirm'))) return;
        stopSync();
        saveSyncState(unpaired(loadSyncState()));
        void render();
      });
      const last = loadSyncState().lastSync;
      body.replaceChildren(
        nameRow,
        h('h3', {}, t('devsync.devices')),
        peers,
        h('p', { class: 'hint' }, last ? t('devsync.lastSync', { when: new Date(last).toLocaleString() }) : t('devsync.neverSynced')),
        h('div', { class: 'dialog-actions start' }, now),
        h('label', {}, auto, ` ${t('devsync.auto')}`),
        h('h3', {}, t('devsync.addDevice')),
        h('p', { class: 'hint' }, t('devsync.addDeviceHint')),
        h('div', { class: 'devsync-code' }, zoomableQr(() => host, codeText, t('devsync.code'), 160, 'devsync-qr'), h('code', { class: 'devsync-code-text' }, codeText), copy),
        h('p', { class: 'hint' }, t('devsync.codeSecret')),
        h('p', { class: 'hint' }, t('devsync.trashHint', { folder: `${SYNC_FOLDER}/${TRASH}`, days: TOMBSTONE_DAYS })),
        h('details', {}, h('summary', {}, t('devsync.reminder')), warnings()),
        h('div', { class: 'dialog-actions start' }, revoke, leave),
      );
      unlisten?.();
      unlisten = listen({
        peers: () => showPeers(),
        status: (s) => (status.textContent = s === 'idle' ? '' : t(s === 'scanning' ? 'devsync.scanning' : 'devsync.merging')),
        synced: (r) => {
          status.textContent = t('devsync.synced', { peer: r.peer, n: r.fetched.length, d: r.trashed.length, c: r.conflicts.length, f: r.failed.length });
          showPeers();
        },
        error: (m) => fail(m),
      });
    };
    let unlisten: (() => void) | undefined;
    const start = async (rerender = true): Promise<ReturnType<typeof currentSync>> => {
      try {
        const live = await startSync();
        if (!live) fail(t('devsync.noStorage'));
        return live;
      } catch (err) {
        fail((err as Error).message);
        return undefined;
      } finally {
        if (rerender) await render();
      }
    };
    const form = h('form', { method: 'dialog' }, h('h2', { id: 'devsync-title' }, t('devsync.title')), body, error, status, h('div', { class: 'dialog-actions' }, button(t('common.close'), () => finish())));
    const dialog = h('dialog', { class: 'dialog devsync-dialog', 'aria-labelledby': 'devsync-title' }, form);
    const finish = (): void => {
      unlisten?.();
      dialog.close();
      dialog.remove();
      resolve();
    };
    form.addEventListener('submit', (e) => e.preventDefault());
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish();
    });
    host.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    void (async () => {
      if (loadSyncState().pairing && loadSyncState().understood) await start();
      else await render();
    })();
  });
}
