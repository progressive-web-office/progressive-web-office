import { describe, expect, it } from 'vitest';
import { PIECE, relayRoom, type RelayDeps, type SocketLike } from '../src/collab/relay-room';
import { hybridRoom } from '../src/collab/hybrid-room';
import type { CollabRoom } from '@scelles/collab';

/** An in-memory Nostr relay hub: every URL is a relay passing events to their subscribers. */
function hub(): RelayDeps & { sent: number } {
  const subs = new Map<string, { socket: FakeSocket; subId: string; topic: string }[]>();
  class FakeSocket implements SocketLike {
    readyState = 0;
    onopen: ((ev: unknown) => void) | null = null;
    onmessage: ((ev: { data: unknown }) => void) | null = null;
    onclose: ((ev: unknown) => void) | null = null;
    constructor(readonly url: string) {
      setTimeout(() => {
        this.readyState = 1;
        this.onopen?.({});
      }, 1);
    }
    send(data: string): void {
      const msg = JSON.parse(data) as unknown[];
      const list = subs.get(this.url) ?? [];
      if (msg[0] === 'REQ') {
        list.push({ socket: this, subId: msg[1] as string, topic: (msg[2] as Record<string, string[]>)['#x']![0]! });
        subs.set(this.url, list);
      } else if (msg[0] === 'EVENT') {
        deps.sent++;
        const event = msg[1] as { tags: string[][] };
        for (const s of list) if (s.topic === event.tags[0]![1]) setTimeout(() => s.socket.onmessage?.({ data: JSON.stringify(['EVENT', s.subId, event]) }), 1);
      }
    }
    close(): void {
      this.readyState = 3;
    }
  }
  const deps = {
    sent: 0,
    urls: ['wss://a.example', 'wss://b.example'],
    socket: (url: string) => new FakeSocket(url),
    event: async (topic: string, content: string) => JSON.stringify(['EVENT', { content, tags: [['x', topic]] }]),
    req: (subId: string, topic: string) => JSON.stringify(['REQ', subId, { '#x': [topic] }]),
  };
  return deps;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(check: () => boolean, ms = 5000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('timeout');
    await wait(20);
  }
}

describe('COLLAB-011 collaboration through the relays', () => {
  it('finds the others and passes text and binary messages, once, encrypted', async () => {
    const deps = hub();
    const a = await relayRoom('room1', 'secret-one', 'alice', deps);
    const b = await relayRoom('room1', 'secret-one', 'bob', deps);
    const joined: string[] = [];
    b.onPeerJoin((id) => joined.push(id));
    await until(() => joined.includes('alice'));
    const [sendText] = a.makeAction<string>('sync');
    const [, onText] = b.makeAction<string>('sync');
    const [sendBin] = a.makeAction<ArrayBuffer>('doc-update');
    const [, onBin] = b.makeAction<ArrayBuffer>('doc-update');
    const texts: string[] = [];
    const bins: number[][] = [];
    onText((d) => texts.push(d as string));
    onBin((d) => bins.push(Array.from(new Uint8Array(d as ArrayBuffer))));
    await sendText('hello');
    await sendBin(new Uint8Array([1, 2, 255]).buffer);
    await until(() => texts.length === 1 && bins.length === 1);
    await wait(300);
    // Two relays carry each event: it is delivered once.
    expect(texts).toEqual(['hello']);
    expect(bins).toEqual([[1, 2, 255]]);
    a.leave();
    b.leave();
  });

  it('cuts big messages into pieces and puts them back together', async () => {
    const deps = hub();
    const a = await relayRoom('room2', 'secret-two', 'alice', deps);
    const b = await relayRoom('room2', 'secret-two', 'bob', deps);
    const got: string[] = [];
    b.makeAction<string>('sync')[1]((d) => got.push(d as string));
    const big = 'x'.repeat(PIECE * 2 + 123);
    await a.makeAction<string>('sync')[0](big);
    await until(() => got.length === 1, 8000);
    expect(got[0]).toBe(big);
    a.leave();
    b.leave();
  });

  it('ignores another room on the same relays', async () => {
    const deps = hub();
    const a = await relayRoom('room3', 'secret-a', 'alice', deps);
    const b = await relayRoom('room3', 'secret-b', 'bob', deps);
    const joined: string[] = [];
    b.onPeerJoin((id) => joined.push(id));
    await a.makeAction<string>('sync')[0]('hello');
    await wait(400);
    expect(joined).toEqual([]);
    a.leave();
    b.leave();
  });
});

/** A room that only records what happens. */
function mockRoom(): CollabRoom & { sent: [string, unknown][]; join(id: string): void; leaveOf(id: string): void; deliver(ns: string, data: unknown, from: string): void } {
  const recv = new Map<string, ((d: never, p: string) => void)[]>();
  const joins: ((id: string) => void)[] = [];
  const leaves: ((id: string) => void)[] = [];
  const room = {
    sent: [] as [string, unknown][],
    makeAction: (ns: string) => [
      async (d: unknown) => void room.sent.push([ns, d]),
      (fn: (d: never, p: string) => void) => void recv.set(ns, [...(recv.get(ns) ?? []), fn]),
    ],
    onPeerJoin: (fn: (id: string) => void) => void joins.push(fn),
    onPeerLeave: (fn: (id: string) => void) => void leaves.push(fn),
    join: (id: string) => joins.forEach((f) => f(id)),
    leaveOf: (id: string) => leaves.forEach((f) => f(id)),
    deliver: (ns: string, d: unknown, from: string) => (recv.get(ns) ?? []).forEach((f) => f(d as never, from)),
  };
  return room as never;
}

describe('COLLAB-011 direct connection, and the relays when it fails', () => {
  it('adds the relays to a room nobody joined, and counts each peer once', async () => {
    const direct = mockRoom();
    const relay = mockRoom();
    const room = hybridRoom(direct, async () => relay as never);
    const joins: string[] = [];
    const leaves: string[] = [];
    room.onPeerJoin((id) => joins.push(id));
    room.onPeerLeave((id) => leaves.push(id));
    const [send, receive] = room.makeAction<string>('sync');
    const got: string[] = [];
    receive((d) => got.push(d as string));
    await send('before');
    expect(direct.sent).toEqual([['sync', 'before']]);
    expect(room.mode()).toBe('direct');
    await room.useRelays();
    expect(room.mode()).toBe('relays');
    await send('after');
    expect(relay.sent).toEqual([['sync', 'after']]);
    expect(direct.sent).toEqual([['sync', 'before'], ['sync', 'after']]);
    // Received through either.
    relay.deliver('sync', 'r', 'bob');
    direct.deliver('sync', 'd', 'bob');
    expect(got).toEqual(['r', 'd']);
    // Bob through both: one join, one leave once gone from both.
    relay.join('bob');
    direct.join('bob');
    expect(joins).toEqual(['bob']);
    direct.leaveOf('bob');
    expect(leaves).toEqual([]);
    relay.leaveOf('bob');
    expect(leaves).toEqual(['bob']);
  });
});

describe('COLLAB-011 relays that refuse the messages', () => {
  it('counts the relays that accepted them', async () => {
    const deps = hub();
    const socket = deps.socket;
    // The second relay refuses every event.
    deps.socket = (url: string) => {
      const s = socket(url);
      const send = s.send.bind(s);
      s.send = (data: string) => {
        const msg = JSON.parse(data) as unknown[];
        if (msg[0] === 'EVENT') setTimeout(() => s.onmessage?.({ data: JSON.stringify(['OK', 'id', url.includes('a.'), url.includes('a.') ? '' : 'blocked']) }), 1);
        if (msg[0] !== 'EVENT' || url.includes('a.')) send(data);
      };
      return s;
    };
    const a = await relayRoom('room4', 'secret-four', 'alice', deps);
    expect(a.relays().accepting).toBeUndefined();
    await until(() => a.relays().accepting !== undefined && a.relays().open === 2);
    expect(a.relays()).toEqual({ open: 2, total: 2, accepting: 1 });
    a.leave();
  });
});
