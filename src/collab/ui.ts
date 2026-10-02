/**
 * Real-time collaboration session and its bar (COLLAB-001..COLLAB-006):
 * peer-to-peer connection, who is here, invitation link, saved versions.
 * The protocol and history come from @scelles/collab, shared with QRShare.
 */
import { CollabSession, colorOf, createIdentity, loadIdentity, saveIdentity, type CollabRoom, type Participant, type VersionEntry } from '@scelles/collab';
import { button, h } from '../app/dom';
import { showQrFullScreen, zoomableQr } from '../app/qr';
import { t } from '../i18n';
import { CollabBinding } from './binding';
import { collabHash, collabUrl, type CollabLink } from './link';
import type { CollabAdapter } from './parts';

const APP_ID = 'progressive-web-office';
const IDENTITY_KEY = 'pwo.collab.identity';
/** Restoring a version rewrites the editor content: these are the shared types. */
const SCHEMA = { parts: 'map', list: 'array' } as const;

export interface CollabHost {
  /** Element dialogs are attached to. */
  dialogHost: HTMLElement;
  /** The shared content changed the document (remote edit or restore). */
  onRemote(): void;
  /** The user left the session from the bar. */
  onLeave(): void;
  confirm(title: string, message: string, ok: string): Promise<boolean>;
}

interface Transport {
  room: CollabRoom;
  selfId: string;
  leave(): void;
  /** Relays reached, to tell "no network" from "nobody else yet" (COLLAB-009). */
  relays?(): { open: number; total: number };
}

/** COLLAB-010: what peers tell each other first, to be sure they speak the same protocol about the same kind of document. */
const PROTOCOL = 1;
interface Hello {
  app: string;
  protocol: number;
  kind: string;
}
/** Seconds without anyone before the bar explains what to check. */
const HELP_AFTER = 20;

async function connect(link: CollabLink): Promise<Transport> {
  let local = false;
  try {
    local = localStorage.getItem('pwo.collab.transport') === 'local';
  } catch {
    /* storage blocked */
  }
  if (local) {
    const { localRoom } = await import('./local-room');
    const selfId = crypto.randomUUID();
    const room = localRoom(link.room, selfId);
    return { room, selfId, leave: () => room.leave() };
  }
  // Peers find each other through Nostr relays (public ones unless set in the
  // settings); the secret encrypts the connection set-up, then everything flows
  // directly between browsers, or through the TURN server of the settings.
  const [trystero, { loadCollabNetwork, trysteroOptions }] = await Promise.all([import('trystero'), import('./network')]);
  const { joinRoom, selfId } = trystero;
  // Exported by the Nostr strategy, not declared in the package's types.
  const getRelaySockets = (trystero as unknown as { getRelaySockets?: () => Record<string, WebSocket> }).getRelaySockets ?? (() => ({}));
  const room = joinRoom({ appId: APP_ID, password: link.secret, ...trysteroOptions(loadCollabNetwork()) }, link.room);
  const relays = (): { open: number; total: number } => {
    const sockets = Object.values(getRelaySockets() as Record<string, WebSocket>);
    return { open: sockets.filter((s) => s.readyState === WebSocket.OPEN).length, total: sockets.length };
  };
  return { room: room as unknown as CollabRoom, selfId, leave: () => void room.leave(), relays };
}

export class Collaboration {
  readonly bar: HTMLElement;
  private readonly people = h('ul', { class: 'collab-people', 'aria-label': t('collab.people') });
  private readonly state = h('span', { class: 'collab-state', role: 'status', 'aria-live': 'polite' });
  private lastCursor = '';
  private cursorTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly onSelection = (): void => this.cursorMoved();
  private readonly startedAt = Date.now();
  private readonly ticker: ReturnType<typeof setInterval>;
  private readonly help = h('p', { class: 'collab-help', hidden: true });
  /** Peers that said they are another app, another protocol or another kind of document. */
  private readonly strangers = new Set<string>();
  private sendHello: ((data: string) => unknown) | undefined;

  private constructor(
    readonly link: CollabLink,
    private readonly transport: Transport,
    readonly session: CollabSession,
    private readonly binding: CollabBinding,
    private readonly adapter: CollabAdapter,
    private readonly host: CollabHost,
  ) {
    this.bar = h(
      'section',
      { class: 'collab-bar', 'aria-label': t('collab.title') },
      h('span', { class: 'collab-icon', 'aria-hidden': 'true' }, '👥'),
      this.state,
      this.people,
      button(t('collab.invite'), () => void this.invite(), { title: t('collab.inviteTitle') }),
      button(t('collab.versions'), () => this.showVersions(), { title: t('collab.versionsTitle') }),
      button(t('collab.leave'), () => host.onLeave(), { title: t('collab.leaveTitle') }),
      this.help,
    );
    session.on('participants', () => this.renderPeople());
    session.on('peers', () => {
      this.hello();
      this.renderState();
    });
    // COLLAB-010: say who we are, and check who the others are.
    const [send, receive] = transport.room.makeAction<string>('pwo-hello');
    this.sendHello = send;
    receive((data, peerId) => this.checkHello(data, peerId));
    this.hello();
    this.ticker = setInterval(() => this.renderState(), 2000);
    document.addEventListener('selectionchange', this.onSelection);
    this.renderPeople();
    this.renderState();
  }

  /** Join (or start, when `initiator`) the session of `link` for the open editor. */
  static async start(link: CollabLink, adapter: CollabAdapter, initiator: boolean, host: CollabHost): Promise<Collaboration> {
    const transport = await connect(link);
    const session = new CollabSession(transport.room, { siteId: transport.selfId, identity: loadIdentity(IDENTITY_KEY) });
    // This device keeps the document and its history: a reload rejoins with them.
    await session.persist({ prefix: 'pwo-collab-', roomId: link.room }).catch(() => undefined);
    let self: Collaboration | undefined;
    const binding = new CollabBinding(session.doc, adapter, {
      initiator,
      onRemote: () => {
        host.onRemote();
        self?.renderState();
        self?.showPeers();
      },
    });
    self = new Collaboration(link, transport, session, binding, adapter, host);
    session.handshake();
    return self;
  }

  get url(): string {
    return collabUrl(location.href, this.link);
  }

  get hash(): string {
    return collabHash(this.link);
  }

  /** The editor changed: share the edit and where we are. */
  changed(): void {
    this.binding.push();
    this.cursorMoved();
  }

  /** Share our position (debounced). */
  cursorMoved(): void {
    clearTimeout(this.cursorTimer);
    this.cursorTimer = setTimeout(() => {
      const cursor = this.adapter.cursor?.();
      const key = JSON.stringify(cursor ?? null);
      if (key === this.lastCursor) return;
      this.lastCursor = key;
      this.session.setCursor(cursor);
    }, 120);
  }

  private others(): Participant[] {
    return this.session.participants.filter((p) => !p.self);
  }

  private showPeers(): void {
    this.adapter.showPeers?.(this.others().map((p) => ({ name: p.user.name, color: p.user.color, cursor: p.cursor })));
  }

  private hello(): void {
    const hello: Hello = { app: APP_ID, protocol: PROTOCOL, kind: this.link.kind };
    void this.sendHello?.(JSON.stringify(hello));
  }

  private checkHello(data: string, peerId: string): void {
    let hello: Partial<Hello> = {};
    try {
      hello = JSON.parse(data) as Partial<Hello>;
    } catch {
      /* not a hello */
    }
    if (hello.app === APP_ID && hello.protocol === PROTOCOL && hello.kind === this.link.kind) this.strangers.delete(peerId);
    else this.strangers.add(peerId);
    this.renderState();
  }

  /** COLLAB-009: where the connection is, and what to check when nobody comes. */
  private renderState(): void {
    const n = this.others().length;
    const relays = this.transport.relays?.();
    const offline = !!relays && relays.total > 0 && relays.open === 0;
    let text: string;
    if (this.strangers.size) text = t('collab.incompatible');
    else if (this.binding.isReady) text = n ? t('collab.connected', { n }) : offline ? t('collab.noRelay') : t('collab.alone');
    else if (n || this.session.peerCount) text = t('collab.waiting');
    else text = offline ? t('collab.noRelay') : t('collab.searching');
    this.state.textContent = text;
    this.bar.classList.toggle('waiting', !this.binding.isReady || offline || this.strangers.size > 0);
    const late = (Date.now() - this.startedAt) / 1000 > HELP_AFTER && !n && !this.session.peerCount;
    this.help.hidden = !late && !this.strangers.size;
    this.help.textContent = this.strangers.size ? t('collab.incompatibleHelp') : late ? t(offline ? 'collab.noRelayHelp' : 'collab.nobodyHelp') : '';
  }

  private renderPeople(): void {
    this.people.replaceChildren(
      ...this.session.participants.map((p) => {
        const label = p.self ? `${p.user.name} (${t('collab.you')})` : p.user.name;
        const chip = p.self
          ? button(label, () => void this.rename(), { className: 'collab-person self', title: t('collab.renameTitle') })
          : h('span', { class: 'collab-person', title: p.user.name }, label);
        chip.style.setProperty('--person', p.user.color);
        return h('li', {}, chip);
      }),
    );
    this.renderState();
    this.showPeers();
  }

  private async rename(): Promise<void> {
    const current = this.session.participants.find((p) => p.self)?.user ?? loadIdentity(IDENTITY_KEY);
    const input = h('input', { type: 'text', value: current.name, maxlength: '60', 'aria-label': t('collab.name') });
    const name = await this.dialog(t('collab.renameTitle'), [h('label', {}, t('collab.name'), input), button(t('collab.randomName'), () => (input.value = createIdentity().name))], () => input.value.trim());
    if (!name) return;
    // A name with a colour word takes that colour; any other name keeps the current one.
    const color = colorOf(name);
    const identity = { name, color: color === colorOf('') ? current.color : color };
    saveIdentity(identity, IDENTITY_KEY);
    this.session.setIdentity(identity);
  }

  /** Show the invitation: QR code, link, and ways to send it (COLLAB-001). */
  async invite(): Promise<void> {
    const url = this.url;
    const status = h('span', { class: 'hint', role: 'status', 'aria-live': 'polite' });
    const say = (text: string): void => {
      status.textContent = text;
    };
    const field = h('input', { type: 'text', value: url, readonly: true, 'aria-label': t('collab.link'), class: 'collab-link' });
    field.addEventListener('focus', () => field.select());
    const qr = zoomableQr(() => this.host.dialogHost, url, t('collab.qrAlt'), 200, 'collab-qr');
    const subject = t('collab.mailSubject');
    const body = t('collab.mailBody', { url });
    const ways: HTMLElement[] = [
      button(t('collab.copy'), () => {
        field.select();
        void navigator.clipboard?.writeText(url).then(
          () => say(t('collab.copied')),
          () => say(t('collab.copyManually')),
        );
      }, { className: 'primary', title: t('collab.copyTitle') }),
    ];
    if (typeof navigator.share === 'function') {
      ways.push(button(t('collab.shareSheet'), () => void navigator.share({ title: subject, text: t('collab.shareText'), url }).catch(() => undefined), { title: t('collab.shareSheetTitle') }));
    }
    ways.push(
      h('a', { class: 'button-like', href: `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, title: t('collab.emailTitle') }, t('collab.email')),
      button(t('collab.qrshare'), () => void this.sendWithQrShare(url), { title: t('collab.qrshareTitle') }),
      button(t('collab.bigQr'), () => showQrFullScreen(this.host.dialogHost, url, t('collab.qrAlt')), { title: t('collab.bigQrTitle') }),
    );
    await this.dialog(
      t('collab.inviteTitle'),
      [
        h('p', {}, t('collab.inviteHelp')),
        h(
          'div',
          { class: 'collab-invite' },
          h('figure', { class: 'collab-qr-figure' }, qr, h('figcaption', { class: 'hint' }, t('collab.qrCaption'))),
          h('div', { class: 'collab-invite-side' }, field, h('div', { class: 'collab-ways' }, ...ways), status),
        ),
        h('p', { class: 'hint collab-warning' }, '⚠ ', t('collab.anyoneWithLink')),
        h('details', { class: 'collab-privacy' }, h('summary', {}, t('collab.privacyTitle')), h('p', { class: 'hint' }, t('collab.privacy'))),
      ],
      () => true,
      t('common.close'),
      false,
    );
  }

  /** Hand the link to QRShare: animated/static QR, nearby devices, air-gapped transfer. */
  private async sendWithQrShare(url: string): Promise<void> {
    const { loadShareSettings, sendTextUrl } = await import('../share/qrshare');
    const settings = loadShareSettings();
    window.open(sendTextUrl(settings.url, url, settings.policy), '_blank', 'noopener');
  }

  private showVersions(): void {
    const label = h('input', { type: 'text', placeholder: t('collab.versionLabel'), 'aria-label': t('collab.versionLabel'), maxlength: '80' });
    const list = h('ul', { class: 'collab-versions', 'aria-label': t('collab.versions') });
    const render = (entries: VersionEntry[]): void => {
      list.replaceChildren(
        ...(entries.length
          ? [...entries].reverse().map((v) =>
              h(
                'li',
                {},
                h('span', { class: 'collab-version-label' }, v.label),
                h('span', { class: 'hint' }, [v.author, v.savedAt ? new Date(v.savedAt).toLocaleString() : ''].filter(Boolean).join(' · ')),
                button(t('collab.restore'), () => void this.restore(v), { title: t('collab.restoreTitle', { label: v.label }) }),
              ),
            )
          : [h('li', { class: 'hint' }, t('collab.noVersions'))]),
      );
    };
    const off = this.session.on('versions', render);
    render(this.session.versions);
    const form = h('form', { class: 'grist-row' }, label, h('button', { type: 'submit', class: 'primary' }, t('collab.saveVersion')));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = label.value.trim();
      if (!text) return;
      this.binding.push();
      this.session.saveVersion(text);
      label.value = '';
    });
    void this.dialog(t('collab.versionsTitle'), [h('p', { class: 'hint' }, t('collab.versionsHelp')), form, list], () => true, t('common.close'), false).then(off);
  }

  private async restore(v: VersionEntry): Promise<void> {
    if (!(await this.host.confirm(t('collab.restore'), t('collab.restoreConfirm', { label: v.label }), t('collab.restore')))) return;
    this.binding.push();
    // Keep the current state too, so the restore can itself be undone.
    this.session.saveVersion(t('collab.beforeRestore', { label: v.label }), { auto: true });
    this.session.restoreVersion(v.id, SCHEMA);
  }

  private dialog<T>(title: string, body: Node[], ok: () => T, okLabel = t('common.ok'), cancel = true): Promise<T | null> {
    return new Promise((resolve) => {
      const dialog = h('dialog', { class: 'dialog collab-dialog', 'aria-label': title });
      const finish = (value: T | null): void => {
        dialog.close();
        dialog.remove();
        resolve(value);
      };
      dialog.addEventListener('cancel', (e) => {
        e.preventDefault();
        finish(null);
      });
      dialog.append(h('h2', {}, title), ...body, h('div', { class: 'dialog-actions' }, ...(cancel ? [button(t('common.cancel'), () => finish(null))] : []), button(okLabel, () => finish(ok()), { className: 'primary' })));
      this.host.dialogHost.append(dialog);
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    });
  }

  destroy(): void {
    clearInterval(this.ticker);
    clearTimeout(this.cursorTimer);
    document.removeEventListener('selectionchange', this.onSelection);
    this.adapter.showPeers?.([]);
    this.binding.destroy();
    this.session.destroy();
    this.transport.leave();
    this.bar.remove();
  }
}
