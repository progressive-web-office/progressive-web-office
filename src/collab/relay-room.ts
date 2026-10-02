/**
 * A collaboration room through Nostr relays (COLLAB-011), for when browsers
 * cannot connect directly (a company network and a mobile network, for
 * example): every message is encrypted with the secret of the invitation,
 * cut into pieces small enough for the relays, and posted as ephemeral
 * events that relays pass on without keeping them.
 */
import type { CollabRoom } from '@scelles/collab';

export interface SocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: unknown) => void) | null;
}

export interface RelayDeps {
  urls: string[];
  socket(url: string): SocketLike;
  /** A signed `["EVENT", …]` message posting `content` on `topic`. */
  event(topic: string, content: string): Promise<string>;
  /** A `["REQ", …]` message subscribing to `topic`. */
  req(subId: string, topic: string): string;
}

type Payload = string | ArrayBuffer;
interface Piece {
  /** Sender, message id, piece number and count. */
  f: string;
  i: string;
  c: number;
  t: number;
  /** The piece of the serialised message. */
  p: string;
}
interface Message {
  n: string;
  /** Text data, or binary data in base64. */
  d?: string;
  b?: string;
  to?: string;
}

/** Characters of a message per event (relays commonly accept events of 64 KiB). */
export const PIECE = 16_000;
/** A peer silent for longer has left. */
const PRESENCE_MS = 5_000;
const GONE_MS = 20_000;
/** Minimum time between two events, not to be rate-limited by the relays. */
const GAP_MS = 120;

const toB64 = (buf: ArrayBuffer): string => {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromB64 = (s: string): ArrayBuffer => {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
};

async function digest(text: string): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

/** The topic and key of a room: neither reveals the room nor the secret. */
export async function relayKeys(room: string, secret: string): Promise<{ topic: string; key: CryptoKey }> {
  const topic = `pwo-${Array.from((await digest(`topic:${room}:${secret}`)).subarray(0, 16), (b) => b.toString(16).padStart(2, '0')).join('')}`;
  const key = await crypto.subtle.importKey('raw', await digest(`key:${room}:${secret}`), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  return { topic, key };
}

async function seal(key: CryptoKey, text: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text));
  return `${toB64(iv.buffer)}.${toB64(data)}`;
}

async function open(key: CryptoKey, sealed: string): Promise<string | null> {
  const [iv, data] = sealed.split('.');
  if (!iv || !data) return null;
  try {
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(fromB64(iv)) }, key, fromB64(data)));
  } catch {
    return null; // another room, or tampered with
  }
}

export interface RelayRoom extends CollabRoom {
  leave(): void;
  /** Relays reached, and those that accepted our messages. */
  relays(): { open: number; total: number; accepting?: number };
}

export async function relayRoom(room: string, secret: string, selfId: string, deps: RelayDeps): Promise<RelayRoom> {
  const { topic, key } = await relayKeys(room, secret);
  const receivers = new Map<string, ((data: never, peerId: string) => void)[]>();
  const joins: ((id: string) => void)[] = [];
  const leaves: ((id: string) => void)[] = [];
  const seen = new Map<string, number>();
  const partial = new Map<string, { parts: string[]; got: number; at: number }>();
  const done = new Set<string>();
  const sockets = deps.urls.map((url) => deps.socket(url));
  const subId = `pwo${Math.random().toString(36).slice(2, 14)}`;
  let closed = false;

  // Posting: one event at a time, spaced, to every relay that is open.
  const queue: { content: string; latest?: string }[] = [];
  let sending = false;
  const pump = async (): Promise<void> => {
    if (sending) return;
    sending = true;
    while (queue.length && !closed) {
      const { content } = queue.shift()!;
      const event = await deps.event(topic, content);
      for (const s of sockets) if (s.readyState === 1) s.send(event);
      await new Promise((r) => setTimeout(r, GAP_MS));
    }
    sending = false;
  };
  /** Messages of which only the latest matters (where people are, that we are here). */
  const LATEST = new Set(['aware', '__here']);
  const post = async (message: Message): Promise<void> => {
    const text = JSON.stringify(message);
    const id = Math.random().toString(36).slice(2, 12);
    const total = Math.max(1, Math.ceil(text.length / PIECE));
    const pieces: string[] = [];
    for (let c = 0; c < total; c++) {
      const piece: Piece = { f: selfId, i: id, c, t: total, p: text.slice(c * PIECE, (c + 1) * PIECE) };
      pieces.push(await seal(key, JSON.stringify(piece)));
    }
    const latest = total === 1 && LATEST.has(message.n) && !message.to ? message.n : undefined;
    if (latest) {
      // Replace a waiting message of the same kind rather than queue another one.
      const waiting = queue.findIndex((q) => q.latest === latest);
      if (waiting >= 0) {
        queue[waiting] = { content: pieces[0]!, latest };
        return;
      }
    }
    for (const content of pieces) queue.push(latest ? { content, latest } : { content });
    void pump();
  };

  const alive = (peer: string): void => {
    const known = seen.has(peer);
    seen.set(peer, Date.now());
    if (known) return;
    for (const fn of joins) fn(peer);
    // Answer a newcomer at once, so that it finds us without waiting.
    void post({ n: '__here' });
  };
  const deliver = (message: Message, from: string): void => {
    if (message.to && message.to !== selfId) return;
    if (message.n === '__here') return;
    const data = message.b !== undefined ? fromB64(message.b) : message.d;
    for (const fn of receivers.get(message.n) ?? []) fn(data as never, from);
  };
  const onEvent = async (content: string): Promise<void> => {
    const text = await open(key, content);
    if (!text) return;
    let piece: Piece;
    try {
      piece = JSON.parse(text) as Piece;
    } catch {
      return;
    }
    if (piece.f === selfId || typeof piece.i !== 'string' || piece.t < 1 || piece.c >= piece.t) return;
    alive(piece.f);
    const id = `${piece.f}/${piece.i}`;
    if (done.has(id)) return; // the same event from another relay
    const entry = partial.get(id) ?? { parts: new Array<string>(piece.t), got: 0, at: Date.now() };
    if (entry.parts[piece.c] === undefined) {
      entry.parts[piece.c] = piece.p;
      entry.got++;
    }
    partial.set(id, entry);
    if (entry.got < piece.t) return;
    partial.delete(id);
    done.add(id);
    try {
      deliver(JSON.parse(entry.parts.join('')) as Message, piece.f);
    } catch {
      /* not a message */
    }
  };

  /** Whether each relay accepted our last event (its `OK` answer). */
  const accepted = new Map<number, boolean>();
  const onMessage = (i: number) => (ev: { data: unknown }): void => {
    if (typeof ev.data !== 'string') return;
    try {
      const msg = JSON.parse(ev.data) as unknown[];
      if (msg[0] === 'OK') accepted.set(i, msg[2] === true);
      const event = msg[2] as { content?: unknown } | undefined;
      if (msg[0] === 'EVENT' && msg[1] === subId && typeof event?.content === 'string') void onEvent(event.content);
    } catch {
      /* not for us */
    }
  };
  /** Connect to relay `i`, subscribe once open, and come back after a disconnection. */
  const connect = (i: number, retry = 2_000): void => {
    const s = i < sockets.length && sockets[i] && sockets[i]!.readyState < 2 ? sockets[i]! : deps.socket(deps.urls[i]!);
    sockets[i] = s;
    s.onopen = () => {
      s.send(deps.req(subId, topic));
      // Subscribed: say we are here.
      void post({ n: '__here' });
    };
    s.onmessage = onMessage(i);
    s.onclose = () => {
      if (!closed) setTimeout(() => connect(i, Math.min(retry * 2, 60_000)), retry);
    };
  };
  deps.urls.forEach((_, i) => connect(i));

  // Presence: say we are here; forget the silent.
  const presence = setInterval(() => {
    void post({ n: '__here' });
    const now = Date.now();
    for (const [peer, at] of seen) {
      if (now - at > GONE_MS) {
        seen.delete(peer);
        for (const fn of leaves) fn(peer);
      }
    }
    for (const [id, p] of partial) if (now - p.at > GONE_MS) partial.delete(id);
    if (done.size > 2000) done.clear();
  }, PRESENCE_MS);

  return {
    makeAction: ((ns: string) => [
      async (data: Payload, target?: string | string[] | null) => {
        const to = typeof target === 'string' ? target : undefined;
        await post({ n: ns, ...(typeof data === 'string' ? { d: data } : { b: toB64(data) }), ...(to ? { to } : {}) });
      },
      (fn: (data: never, peerId: string) => void) => {
        receivers.set(ns, [...(receivers.get(ns) ?? []), fn]);
      },
    ]) as unknown as CollabRoom['makeAction'],
    onPeerJoin: (fn) => void joins.push(fn),
    onPeerLeave: (fn) => void leaves.push(fn),
    relays: () => ({
      open: sockets.filter((s) => s.readyState === 1).length,
      total: sockets.length,
      // Known once a relay has answered.
      ...(accepted.size ? { accepting: [...accepted].filter(([i, ok]) => ok && sockets[i]?.readyState === 1).length } : {}),
    }),
    leave: () => {
      closed = true;
      clearInterval(presence);
      for (const s of sockets) {
        s.onclose = null;
        s.close();
      }
    },
  };
}
