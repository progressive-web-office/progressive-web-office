import { describe, expect, it } from 'vitest';
import type { CollabRoom } from '@scelles/collab';
import { MemoryProvider, listFiles } from '../src/fs';
import { DeviceSync } from '../src/devsync/session';
import { baseWith, loadSyncState, withPeers, type DeviceSyncState } from '../src/devsync/state';
import { planSync } from '../src/devsync/plan';

/**
 * DEVSYNC-013: a chain of devices — 1 meets 2, later 2 meets 3 while 1 is
 * off. The devices, the documents, their changes and their deletions must
 * travel along the chain, whichever device starts the synchronisation.
 */

/** Two rooms joined to each other, delivering messages asynchronously. */
function roomPair(): [CollabRoom, CollabRoom, () => void] {
  type R = { id: string; receivers: Map<string, ((d: unknown, p: string) => void)[]>; joins: ((p: string) => void)[]; other?: R };
  const make = (id: string): R => ({ id, receivers: new Map(), joins: [] });
  const a = make(`peer-${Math.random()}`);
  const b = make(`peer-${Math.random()}`);
  a.other = b;
  b.other = a;
  const room = (r: R): CollabRoom => ({
    makeAction: (ns: string) => [
      (data: unknown) => setTimeout(() => r.other!.receivers.get(ns)?.forEach((f) => f(structuredClone(data), r.id))),
      (fn: (d: unknown, p: string) => void) => r.receivers.set(ns, [...(r.receivers.get(ns) ?? []), fn]),
    ] as never,
    onPeerJoin: (fn) => r.joins.push(fn),
    onPeerLeave: () => undefined,
  });
  return [
    room(a),
    room(b),
    () => {
      a.joins.forEach((f) => f(b.id));
      b.joins.forEach((f) => f(a.id));
    },
  ];
}

interface Device {
  name: string;
  provider: MemoryProvider;
  store: { get(): DeviceSyncState; set(s: DeviceSyncState): void };
  state(): DeviceSyncState;
}

function device(name: string, files: Record<string, string> = {}): Device {
  localStorage.removeItem('pwo.devsync');
  let state: DeviceSyncState = { ...loadSyncState(), name };
  localStorage.removeItem('pwo.devsync');
  return { name, provider: new MemoryProvider(name, name, files), store: { get: () => state, set: (s) => void (state = s) }, state: () => state };
}

const idle = async (...syncs: DeviceSync[]): Promise<void> => {
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 20));
    for (const s of syncs) await (s as unknown as { queue: Promise<void> }).queue;
  }
};

/** `a` and `b` meet (the others are off); `first` starts the synchronisation. */
async function meet(a: Device, b: Device, first: Device = a): Promise<void> {
  const [ra, rb, connect] = roomPair();
  const sa = new DeviceSync(ra, a.provider, a.store);
  const sb = new DeviceSync(rb, b.provider, b.store);
  connect();
  await idle(sa, sb);
  await (first === a ? sa : sb).syncNow();
  await idle(sa, sb);
  sa.close();
  sb.close();
}

/** The documents of a device (not its trash), with their content. */
async function docs(d: Device): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const path of await listFiles(d.provider, '', { skip: (e) => e.name.startsWith('.') })) out[path] = await (await d.provider.read(path)).text();
  return out;
}
const trash = async (d: Device): Promise<string[]> => (await listFiles(d.provider, '.pwo-trash', { skip: () => false }).catch(() => [])).map((p) => p.replace(/^\.pwo-trash\/\d{4}-\d{2}-\d{2}\//, ''));

/** Wait a little, so that a change is newer than the last synchronisation. */
const later = (): Promise<void> => new Promise((r) => setTimeout(r, 5));

describe('DEVSYNC-013 a chain of devices: 1 meets 2, then 2 meets 3 while 1 is off', () => {
  it('tells 3 about 1 through 2, and 1 about 3 at its next meeting with 2', async () => {
    const [one, two, three] = [device('Laptop'), device('Phone'), device('Tablet')];
    await meet(one, two);
    await meet(two, three);
    const seen = three.state().peers[one.state().device];
    expect(seen).toMatchObject({ name: 'Laptop', via: 'Phone' });
    // When 2 last saw 1, not when 3 heard of it.
    expect(seen!.lastSeen).toBe(two.state().peers[one.state().device]!.lastSeen);
    expect(three.state().peers[three.state().device]).toBeUndefined();

    await meet(one, two);
    expect(one.state().peers[three.state().device]).toMatchObject({ name: 'Tablet', via: 'Phone' });
    expect(one.state().peers[one.state().device]).toBeUndefined();
    // A device met directly afterwards is no longer "via" another.
    await meet(one, three);
    expect(one.state().peers[three.state().device]!.via).toBeUndefined();
  });

  it('brings a document made on 1 to 3 through 2', async () => {
    const [one, two, three] = [device('Laptop', { 'notes/a.md': 'A' }), device('Phone'), device('Tablet')];
    await meet(one, two);
    await meet(three, two, three);
    expect(await docs(three)).toEqual({ 'notes/a.md': 'A' });
  });

  for (const first of ['2', '3'] as const) {
    it(`relays an edit made on 1 to 3 without losing it, ${first} starting`, async () => {
      const [one, two, three] = [device('Laptop', { 'notes/a.md': 'v1' }), device('Phone'), device('Tablet')];
      await meet(one, two);
      await meet(two, three);
      await later();
      await one.provider.write('notes/a.md', new Blob(['v2']));
      await meet(one, two);
      expect(await docs(two)).toEqual({ 'notes/a.md': 'v2' });
      await meet(two, three, first === '2' ? two : three);
      expect(await docs(two)).toEqual({ 'notes/a.md': 'v2' });
      expect(await docs(three)).toEqual({ 'notes/a.md': 'v2' });
      // And back to 1: nothing changes, no conflict copy.
      await meet(one, two);
      expect(await docs(one)).toEqual({ 'notes/a.md': 'v2' });
    });

    it(`relays a deletion made on 1 to 3 without bringing the file back, ${first} starting`, async () => {
      const [one, two, three] = [device('Laptop', { 'notes/a.md': 'A', 'notes/b.md': 'B' }), device('Phone'), device('Tablet')];
      await meet(one, two);
      await meet(two, three);
      await one.provider.remove('notes/a.md');
      await meet(one, two);
      await meet(two, three, first === '2' ? two : three);
      expect(await docs(two)).toEqual({ 'notes/b.md': 'B' });
      expect(await docs(three)).toEqual({ 'notes/b.md': 'B' });
      expect(await trash(three)).toContain('notes/a.md');
      await meet(one, two, two);
      expect(await docs(one)).toEqual({ 'notes/b.md': 'B' });
    });

    it(`relays an edit made on 3 back to 1, ${first} starting`, async () => {
      const [one, two, three] = [device('Laptop', { 'notes/a.md': 'v1' }), device('Phone'), device('Tablet')];
      await meet(one, two);
      await meet(two, three);
      await later();
      await three.provider.write('notes/a.md', new Blob(['v3']));
      await meet(two, three, first === '2' ? two : three);
      await meet(one, two, one);
      expect(await docs(one)).toEqual({ 'notes/a.md': 'v3' });
      expect(await docs(two)).toEqual({ 'notes/a.md': 'v3' });
    });
  }

  it('does not bring back on 3 a file deleted on 2, when 3 never met 2 since it had it', async () => {
    // 3 got the file from 1 directly; 2 deleted it before ever meeting 3.
    const [one, two, three] = [device('Laptop', { 'notes/a.md': 'A' }), device('Phone'), device('Tablet')];
    await meet(one, two);
    await meet(one, three);
    await two.provider.remove('notes/a.md');
    await meet(three, two, three);
    expect(await docs(two)).toEqual({});
    expect(await docs(three)).toEqual({});
  });

  it('keeps a file changed on 3 that 1 deleted meanwhile, on every device', async () => {
    const [one, two, three] = [device('Laptop', { 'notes/a.md': 'v1' }), device('Phone'), device('Tablet')];
    await meet(one, two);
    await meet(two, three);
    await one.provider.remove('notes/a.md');
    await later();
    await three.provider.write('notes/a.md', new Blob(['v3']));
    await meet(one, two);
    await meet(two, three, three);
    await meet(one, two, one);
    for (const d of [one, two, three]) expect(await docs(d)).toEqual({ 'notes/a.md': 'v3' });
  });
});

describe('DEVSYNC-013 the devices told by another one', () => {
  const state = (device: string, peers: DeviceSyncState['peers'] = {}, revoked?: string[]): DeviceSyncState => ({ device, name: device, understood: true, auto: false, peers, base: {}, known: {}, deleted: {}, ...(revoked ? { revoked } : {}) });

  it('keeps the newest sighting, never this device, a revoked one or a date to come', () => {
    const now = 1_000_000;
    const s = withPeers(state('me', { old: { name: 'Old', lastSeen: 500 } }, ['gone']), { device: 'two', name: 'Phone' }, {
      me: { name: 'Me', lastSeen: 900 },
      old: { name: 'Old', lastSeen: 400 },
      three: { name: 'Tablet', lastSeen: 800 },
      gone: { name: 'Revoked', lastSeen: 900 },
      future: { name: 'Clock', lastSeen: now + 10_000 },
      bad: { name: 3, lastSeen: 'x' },
    }, now);
    expect(s.peers).toEqual({
      two: { name: 'Phone', lastSeen: now },
      old: { name: 'Old', lastSeen: 500 },
      three: { name: 'Tablet', lastSeen: 800, via: 'Phone' },
      future: { name: 'Clock', lastSeen: now, via: 'Phone' },
    });
  });

  it('merges with the base of the last merge with that device; the single base of former versions only for one device', () => {
    const one = { ...state('me', { two: { name: 'Phone', lastSeen: 1 } }), base: { a: 'h1' } };
    expect(baseWith(one, 'two')).toEqual({ a: 'h1' });
    const many = { ...one, peers: { ...one.peers, three: { name: 'Tablet', lastSeen: 1 } } };
    expect(baseWith(many, 'two')).toEqual({});
    expect(baseWith({ ...many, bases: { two: { a: 'h2' } } }, 'two')).toEqual({ a: 'h2' });
  });

  it('drops a file deleted elsewhere when it is the content deleted there, even never merged before', () => {
    const h = (c: string): string => c.repeat(64);
    const local = { device: 'l', name: 'L', files: { 'a.md': { hash: h('a'), mtime: 1 }, 'b.md': { hash: h('c'), mtime: 1 } }, deleted: {} };
    const remote = { device: 'r', name: 'R', files: {}, deleted: { 'a.md': 5, 'b.md': 5 }, deletedHash: { 'a.md': h('a'), 'b.md': h('b') } };
    // a.md unchanged since deleted there: it goes; b.md changed since: it stays.
    expect(planSync(local, remote, {})).toEqual([{ kind: 'trash', path: 'a.md' }]);
  });
});

