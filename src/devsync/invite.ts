/**
 * DEVSYNC-006: adding a device by a one-time invitation. The QR code (a link
 * to the application) holds a meeting place and a secret valid a few
 * minutes — never the key of the documents. The new device comes there with
 * its name and an ephemeral public key (ECDH P-256); both screens show the
 * same few emojis drawn from it; only when the user accepts on the paired
 * device does it send the pairing, encrypted for that public key alone — even
 * someone holding the invitation and reading the relays cannot read it. A
 * photographed or leaked invitation is expired or used, and nothing is given
 * without that approval.
 */
import type { CollabRoom } from '@scelles/collab';
import { randomId, type Pairing } from './state';

export interface Invitation {
  room: string;
  secret: string;
  /** Time after which it is refused (ms since the epoch). */
  expires: number;
}

/** How long an invitation can be used. */
export const INVITE_MINUTES = 5;
const HASH = '#pwo-pair=';

export const newInvitation = (now = Date.now()): Invitation => ({ room: randomId(9), secret: randomId(24), expires: now + INVITE_MINUTES * 60_000 });

/** The link of the QR code: the application, with the invitation in the fragment (never sent to a server). */
export const invitationUrl = (base: string, inv: Invitation): string => `${base.replace(/#.*$/, '')}${HASH}${inv.room}.${inv.secret}.${Math.floor(inv.expires / 1000).toString(36)}`;

/** An invitation in a link or a fragment, or undefined; `expired` when its time is over. */
export function parseInvitation(text: string, now = Date.now()): Invitation | 'expired' | undefined {
  const m = /pwo-pair=([\w-]{8,64})\.([\w-]{24,128})\.([0-9a-z]{1,12})/.exec(text.trim());
  if (!m) return undefined;
  const expires = parseInt(m[3]!, 36) * 1000;
  if (!(expires > now)) return 'expired';
  return { room: m[1]!, secret: m[2]!, expires };
}

const EMOJIS = [...'🐶🐱🦊🐻🐼🐨🐯🦁🐮🐷🐸🐵🐔🐧🐦🐢🐙🦋🐝🐞🌵🌲🌻🌹🍄🍎🍋🍌🍉🍇🍓🥕🌽🍕🍩🎂⚽🏀🎸🎺🎲🚗🚲🚀⛵🏠⏰💡🔑🔔🎁📷📚✏️🌙⭐🌈❄️🔥💧🎈🧩🪁🎩'].filter((c) => c !== '️');

/** The emojis both devices show: from the secret of the invitation and the nonce of the new device. */
export async function verificationEmojis(secret: string, nonce: string, count = 4): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`pwo-pair|${secret}|${nonce}`)));
  return Array.from(digest.subarray(0, count), (b) => EMOJIS[b % EMOJIS.length]).join(' ');
}

/** `key`: the ephemeral public key of the new device (raw P-256, base64url). */
interface Request { name: string; key: string }
/** The pairing, encrypted (AES-GCM) with the key both derive (ECDH, then HKDF). */
interface Answer { ok: boolean; key?: string; iv?: string; data?: string }

const b64u = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const ECDH = { name: 'ECDH', namedCurve: 'P-256' } as const;

/** The AES key shared by two devices: ECDH between their keys, then HKDF bound to the invitation. */
async function sharedKey(mine: CryptoKey, theirs: string, inv: Invitation): Promise<CryptoKey> {
  const pub = await crypto.subtle.importKey('raw', unb64u(theirs), ECDH, false, []);
  const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: pub }, mine, 256);
  const hkdf = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new TextEncoder().encode(inv.secret), info: new TextEncoder().encode('pwo-pair key') }, hkdf, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

const newKeyPair = (): Promise<CryptoKeyPair> => crypto.subtle.generateKey(ECDH, false, ['deriveBits']) as Promise<CryptoKeyPair>;
const publicKey = async (pair: CryptoKeyPair): Promise<string> => b64u(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)));

export interface JoinRequest {
  peer: string;
  name: string;
  emojis: string;
  accept(): void;
  refuse(): void;
}

type Action<T> = [(data: T, target?: string) => unknown, (fn: (data: T, peer: string) => void) => void];
const actions = (room: CollabRoom): { req: Action<Request>; ans: Action<Answer> } => ({
  req: room.makeAction('pi-req') as unknown as Action<Request>,
  ans: room.makeAction('pi-ans') as unknown as Action<Answer>,
});

/**
 * The paired device: waits in the room of the invitation for new devices,
 * each shown to the user to accept or refuse. The first accepted one gets the
 * pairing; the invitation is then used. Returns the function stopping it.
 */
export function hostInvitation(room: CollabRoom, inv: Invitation, pairing: Pairing, onRequest: (r: JoinRequest) => void, onDone: (name: string) => void, now = (): number => Date.now()): () => void {
  const { req, ans } = actions(room);
  let used = false;
  // A device asks to everyone, then again to each device arriving: shown once.
  const seen = new Set<string>();
  req[1]((data, peer) => {
    if (used || now() > inv.expires || typeof data?.name !== 'string' || typeof data.key !== 'string' || !/^[\w-]{80,100}$/.test(data.key)) return;
    const theirs = data.key;
    if (seen.has(`${peer}|${theirs}`)) return;
    seen.add(`${peer}|${theirs}`);
    const name = data.name.slice(0, 80);
    void verificationEmojis(inv.secret, theirs).then((emojis) =>
      onRequest({
        peer,
        name,
        emojis,
        accept: () => {
          if (used || now() > inv.expires) return;
          used = true;
          void (async () => {
            // Encrypted for the public key whose emojis the user compared, and nobody else.
            const mine = await newKeyPair();
            const aes = await sharedKey(mine.privateKey, theirs, inv);
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aes, new TextEncoder().encode(JSON.stringify({ room: pairing.room, secret: pairing.secret }))));
            await ans[0]({ ok: true, key: await publicKey(mine), iv: b64u(iv), data: b64u(data) }, peer);
            onDone(name);
          })();
        },
        refuse: () => void ans[0]({ ok: false }, peer),
      }),
    );
  });
  return () => {
    used = true;
  };
}

/**
 * The new device: asks to join, with its name and a fresh public key;
 * resolves to the pairing when accepted, or null when refused. `emojis` are to
 * be shown now, for the user to compare with the paired device.
 */
export async function joinInvitation(room: CollabRoom, inv: Invitation, name: string): Promise<{ emojis: string; answer: Promise<Pairing | null> }> {
  const { req, ans } = actions(room);
  const mine = await newKeyPair();
  const key = await publicKey(mine);
  const emojis = await verificationEmojis(inv.secret, key);
  const answer = new Promise<Pairing | null>((resolve) => {
    ans[1]((data) => {
      if (data && data.ok === false) return resolve(null);
      if (!data?.ok || typeof data.key !== 'string' || typeof data.iv !== 'string' || typeof data.data !== 'string') return;
      void (async () => {
        try {
          const aes = await sharedKey(mine.privateKey, data.key!, inv);
          const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64u(data.iv!) }, aes, unb64u(data.data!));
          const p = JSON.parse(new TextDecoder().decode(plain)) as { room?: unknown; secret?: unknown };
          if (typeof p.room === 'string' && typeof p.secret === 'string' && /^[\w-]{8,64}$/.test(p.room) && /^[\w-]{24,128}$/.test(p.secret)) resolve({ room: p.room, secret: p.secret, since: Date.now() });
        } catch {
          /* not for this device: ignored */
        }
      })();
    });
  });
  const ask = (peer?: string): unknown => req[0]({ name, key }, peer);
  // Asked to whoever is there, and again to each device arriving.
  room.onPeerJoin((peer) => void ask(peer));
  void ask();
  return { emojis, answer };
}
