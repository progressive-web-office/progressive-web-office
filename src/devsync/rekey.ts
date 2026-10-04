/**
 * DEVSYNC-010: revoking one device only. The device where the user revokes
 * makes a new pairing and gives it, in the room of the old one, to each other
 * device online now — never in clear: each answers with a fresh public key
 * (ECDH P-256) once its user accepted, and gets the new pairing encrypted for
 * that key alone. The revoked device, even online and holding the old key,
 * cannot read it. Two different answers for the same request (someone
 * answering in another device's place) stop the exchange with that device.
 * The devices offline at that moment need a new invitation.
 */
import type { CollabRoom } from '@scelles/collab';
import { b64u, ecdhAesKey, newKeyPair, publicKey, unb64u } from './invite';
import type { Pairing } from './state';

/** Asked to a device: will it take the new key? */
interface Ask { id: string; from: string; revoked: string; device: string }
/** Its answer: a fresh public key, or a refusal. */
interface KeyMsg { id: string; key?: string; refused?: boolean }
/** The new pairing, encrypted for that key. */
interface Give { id: string; key: string; iv: string; data: string }

type Action<T> = [(data: T, target?: string) => unknown, (fn: (data: T, peer: string) => void) => void];
const actions = (room: CollabRoom): { ask: Action<Ask>; key: Action<KeyMsg>; give: Action<Give> } => ({
  ask: room.makeAction('rk-ask') as unknown as Action<Ask>,
  key: room.makeAction('rk-key') as unknown as Action<KeyMsg>,
  give: room.makeAction('rk-give') as unknown as Action<Give>,
});

const INFO = 'pwo-rekey';
const KEY_RE = /^[\w-]{80,100}$/;
const ID_RE = /^[\w-]{8,64}$/;

/**
 * A device of the room: when asked, asks its user (`accept`), then takes the
 * new pairing given to it (`received`). `oldSecret` is the key of the room,
 * mixed into the encryption.
 */
export function serveRekey(room: CollabRoom, oldSecret: () => string, accept: (from: string, revoked: string) => Promise<boolean>, received: (pairing: Pairing, revokedDevice: string) => void): void {
  const { ask, key, give } = actions(room);
  const pending = new Map<string, { pair: CryptoKeyPair; peer: string; device: string }>();
  const asked = new Set<string>();
  ask[1]((data, peer) => {
    if (!data || typeof data.id !== 'string' || !ID_RE.test(data.id) || asked.has(data.id) || typeof data.from !== 'string' || typeof data.revoked !== 'string' || typeof data.device !== 'string') return;
    asked.add(data.id);
    void (async () => {
      if (!(await accept(data.from.slice(0, 80), data.revoked.slice(0, 80)))) return void key[0]({ id: data.id, refused: true }, peer);
      const pair = await newKeyPair();
      pending.set(data.id, { pair, peer, device: data.device.slice(0, 64) });
      await key[0]({ id: data.id, key: await publicKey(pair) }, peer);
    })();
  });
  give[1]((data, peer) => {
    const wait = typeof data?.id === 'string' ? pending.get(data.id) : undefined;
    if (!wait || wait.peer !== peer || typeof data.key !== 'string' || !KEY_RE.test(data.key) || typeof data.iv !== 'string' || typeof data.data !== 'string') return;
    pending.delete(data.id);
    void (async () => {
      try {
        const aes = await ecdhAesKey(wait.pair.privateKey, data.key, `${oldSecret()}|${data.id}`, INFO);
        const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64u(data.iv) }, aes, unb64u(data.data));
        const p = JSON.parse(new TextDecoder().decode(plain)) as { room?: unknown; secret?: unknown };
        if (typeof p.room === 'string' && typeof p.secret === 'string' && /^[\w-]{8,64}$/.test(p.room) && /^[\w-]{24,128}$/.test(p.secret)) received({ room: p.room, secret: p.secret, since: Date.now() }, wait.device);
      } catch {
        /* not readable: ignored */
      }
    })();
  });
}

export interface RekeyResult {
  /** Peers given the new pairing. */
  given: string[];
  refused: string[];
  /** Peers that did not answer in time, or answered twice differently. */
  failed: string[];
}

/**
 * The revoking device: gives the new pairing to these peers (never to the
 * revoked one, left out of `peers` by the caller).
 */
export function giveNewKey(room: CollabRoom, peers: string[], opts: { from: string; revoked: string; device: string; pairing: Pairing; oldSecret: string; timeoutMs?: number; settleMs?: number }): Promise<RekeyResult> {
  const { ask, key, give } = actions(room);
  const result: RekeyResult = { given: [], refused: [], failed: [] };
  const ids = new Map<string, string>(peers.map((p) => [crypto.randomUUID(), p]));
  const keys = new Map<string, Set<string>>();
  const done = new Set<string>();
  return new Promise((resolve) => {
    const finishIfDone = (): void => {
      if (done.size < ids.size) return;
      clearTimeout(timer);
      resolve(result);
    };
    const settle = (id: string, peer: string): void => {
      // Answers gathered a moment: two different keys for one request means someone answered in another's place.
      setTimeout(() => {
        if (done.has(id)) return;
        done.add(id);
        const set = keys.get(id)!;
        if (set.size !== 1) {
          result.failed.push(peer);
          return finishIfDone();
        }
        const [theirs] = [...set];
        void (async () => {
          try {
            const mine = await newKeyPair();
            const aes = await ecdhAesKey(mine.privateKey, theirs!, `${opts.oldSecret}|${id}`, INFO);
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aes, new TextEncoder().encode(JSON.stringify({ room: opts.pairing.room, secret: opts.pairing.secret }))));
            await give[0]({ id, key: await publicKey(mine), iv: b64u(iv), data: b64u(data) }, peer);
            result.given.push(peer);
          } catch {
            result.failed.push(peer);
          }
          finishIfDone();
        })();
      }, opts.settleMs ?? 400);
    };
    key[1]((data, peer) => {
      if (!data || typeof data.id !== 'string' || ids.get(data.id) !== peer || done.has(data.id)) return;
      if (data.refused === true) {
        done.add(data.id);
        result.refused.push(peer);
        return finishIfDone();
      }
      if (typeof data.key !== 'string' || !KEY_RE.test(data.key)) return;
      const first = !keys.has(data.id);
      keys.set(data.id, (keys.get(data.id) ?? new Set()).add(data.key));
      if (first) settle(data.id, peer);
    });
    const timer = setTimeout(() => {
      for (const [id, peer] of ids) {
        if (done.has(id)) continue;
        done.add(id);
        result.failed.push(peer);
      }
      resolve(result);
    }, opts.timeoutMs ?? 120_000);
    if (!ids.size) {
      clearTimeout(timer);
      resolve(result);
      return;
    }
    for (const [id, peer] of ids) void ask[0]({ id, from: opts.from, revoked: opts.revoked, device: opts.device }, peer);
  });
}
