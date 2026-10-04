/**
 * DEVSYNC-001..DEVSYNC-006: the window of the synchronisation between one's
 * own devices — its warnings first (not a backup, deletions reach every
 * device, not collaboration), then pairing by a one-time invitation (a QR
 * code accepted on the paired device), the devices, "Sync now",
 * synchronising by itself, the trash, and revoking.
 */
import { button, h } from '../app/dom';
import { t } from '../i18n';
import { listen, startSync, stopSync, currentSync, SYNC_FOLDER } from './live';
import { TRASH } from './plan';
import { INVITE_MINUTES, hostInvitation, invitationUrl, joinInvitation, newInvitation, parseInvitation, type Invitation } from './invite';
import { loadSyncState, newPairing, parsePairingCode, saveSyncState, unpaired, TOMBSTONE_DAYS } from './state';

export interface SyncDialogOptions {
  openBackup?(): void;
  openTrash?(): void;
  /** DEVSYNC-006: scan an invitation QR code (QRShare's scanner). */
  scan?(): void;
  /** An invitation link this device was opened with: joined once the warnings are read. */
  invitation?: string;
  /** Show an invitation at once (a paired device). */
  invite?: boolean;
}

/** The address of the application, where an invitation link leads. */
const appBase = (): string => new URL(location.pathname, location.origin).href;

export function syncDialog(host: HTMLElement, opts: SyncDialogOptions = {}): Promise<void> {
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
    let pendingInvitation = opts.invitation;
    let inviteOnOpen = !!opts.invite;
    // The rooms of the invitations, left when the window closes.
    const leaving = new Set<() => void>();
    const leaveAll = (): void => {
      for (const leave of leaving) leave();
      leaving.clear();
    };
    /** DEVSYNC-006: the new device asks to join, shows its emojis, and waits for the paired device to accept. */
    const join = async (inv: Invitation): Promise<void> => {
      error.hidden = true;
      const { connectRoom } = await import('../collab/ui');
      const transport = await connectRoom(inv.room, inv.secret);
      const leave = (): void => transport.leave();
      leaving.add(leave);
      const asked = await joinInvitation(transport.room, inv, loadSyncState().name);
      const cancel = button(t('common.cancel'), () => {
        leave();
        leaving.delete(leave);
        void render();
      });
      body.replaceChildren(h('p', {}, t('devsync.joining')), h('p', { class: 'devsync-emojis', 'aria-label': t('devsync.emojis') }, asked.emojis), h('p', { class: 'hint' }, t('devsync.waitingAccept')), h('div', { class: 'dialog-actions start' }, cancel));
      const expired = new Promise<'expired'>((r) => setTimeout(() => r('expired'), Math.max(0, inv.expires - Date.now())));
      const answer = await Promise.race([asked.answer, expired]);
      // The answer is in: the invitation is no longer needed.
      setTimeout(leave, 1000);
      leaving.delete(leave);
      if (answer === 'expired') return void (await render(), fail(t('devsync.expired')));
      if (!answer) return void (await render(), fail(t('devsync.refused')));
      saveSyncState({ ...loadSyncState(), pairing: answer });
      status.textContent = t('devsync.joined');
      await start();
    };
    /** DEVSYNC-006: a paired device shows a one-time invitation and lets the user accept the device that comes. */
    const invite = async (area: HTMLElement): Promise<void> => {
      const pairing = loadSyncState().pairing;
      if (!pairing) return;
      const inv = newInvitation();
      const url = invitationUrl(appBase(), inv);
      const [{ connectRoom }, { zoomableQr }] = await Promise.all([import('../collab/ui'), import('../app/qr')]);
      const transport = await connectRoom(inv.room, inv.secret);
      let stopHost = (): void => {};
      const leave = (): void => {
        stopHost();
        transport.leave();
      };
      leaving.add(leave);
      const requests = h('div', { class: 'devsync-requests', 'aria-live': 'polite' });
      const end = (message: string, delay = 0): void => {
        setTimeout(leave, delay);
        leaving.delete(leave);
        clearTimeout(timer);
        area.replaceChildren(h('p', { class: 'hint' }, message), button(t('devsync.invite'), () => void invite(area)));
      };
      const timer = setTimeout(() => end(t('devsync.inviteExpired')), Math.max(0, inv.expires - Date.now()));
      stopHost = hostInvitation(
        transport.room,
        inv,
        pairing,
        (r) => {
          const row = h(
            'div',
            { class: 'devsync-request' },
            h('p', {}, t('devsync.request', { name: r.name })),
            h('p', { class: 'devsync-emojis', 'aria-label': t('devsync.emojis') }, r.emojis),
            h('div', { class: 'dialog-actions start' }, button(t('devsync.accept'), () => r.accept(), { className: 'primary' }), button(t('devsync.refuse'), () => (r.refuse(), row.remove()))),
          );
          requests.append(row);
        },
        // Leave a moment later, for the answer to reach the new device.
        (name) => end(t('devsync.added', { name }), 3000),
      );
      const copy = button(t('devsync.copy'), () => void navigator.clipboard?.writeText(url).then(() => (status.textContent = t('devsync.copied'))));
      area.replaceChildren(
        h('div', { class: 'devsync-code' }, zoomableQr(() => host, url, t('devsync.code'), 180, 'devsync-qr'), copy),
        h('p', { class: 'hint' }, t('devsync.inviteValid', { time: new Date(inv.expires).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })),
        requests,
      );
    };
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
        const code = h('input', { type: 'text', 'aria-label': t('devsync.code'), placeholder: 'https://…#pwo-pair=…', spellcheck: 'false', autocomplete: 'off' });
        const go = button(t('devsync.join'), async () => {
          const inv = parseInvitation(code.value);
          if (inv === 'expired') return fail(t('devsync.expired'));
          if (inv) return join(inv).catch((err: Error) => fail(err.message));
          // A code of the first version (the key itself), still understood.
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
          opts.scan ? h('div', { class: 'dialog-actions start' }, button(t('devsync.scan'), () => opts.scan?.(), { className: 'primary', title: t('devsync.scanTitle') })) : '',
          h('div', { class: 'git-row' }, code, ' ', go),
          h('details', {}, h('summary', {}, t('devsync.reminder')), warnings()),
        );
        // Opened by an invitation link: join at once.
        if (pendingInvitation) {
          const inv = parseInvitation(pendingInvitation);
          pendingInvitation = undefined;
          if (inv === 'expired') fail(t('devsync.expired'));
          else if (inv) await join(inv).catch((err: Error) => fail(err.message));
          else fail(t('devsync.badCode'));
        }
        return;
      }
      if (pendingInvitation) {
        pendingInvitation = undefined;
        fail(t('devsync.alreadyPaired'));
      }
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
      const inviteArea = h('div', { class: 'devsync-invite' }, button(t('devsync.invite'), () => void invite(inviteArea).catch((err: Error) => fail(err.message))));
      if (inviteOnOpen) {
        inviteOnOpen = false;
        void invite(inviteArea).catch((err: Error) => fail(err.message));
      }
      const last = loadSyncState().lastSync;
      body.replaceChildren(
        nameRow,
        h('h3', {}, t('devsync.devices')),
        peers,
        h('p', { class: 'hint' }, last ? t('devsync.lastSync', { when: new Date(last).toLocaleString() }) : t('devsync.neverSynced')),
        h('div', { class: 'dialog-actions start' }, now),
        h('label', {}, auto, ` ${t('devsync.auto')}`),
        h('h3', {}, t('devsync.addDevice')),
        h('p', { class: 'hint' }, t('devsync.addDeviceHint', { minutes: INVITE_MINUTES })),
        inviteArea,
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
      leaveAll();
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
