import { describe, expect, it } from 'vitest';
import type { CollabRoom } from '@scelles/collab';
import { MemoryProvider } from '../src/fs';
import { DeviceSync } from '../src/devsync/session';
import { loadSyncState, type DeviceSyncState } from '../src/devsync/state';
import { listTrash, restoreFromTrash, safePath } from '../src/devsync/engine';

/** Two rooms joined to each other, delivering messages asynchronously. */
function roomPair(): [CollabRoom, CollabRoom, () => void] {
  type R = { id: string; receivers: Map<string, ((d: unknown, p: string) => void)[]>; joins: ((p: string) => void)[]; other?: R };
  const make = (id: string): R => ({ id, receivers: new Map(), joins: [] });
  const a = make('peer-a');
  const b = make('peer-b');
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
  return [room(a), room(b), () => {
    a.joins.forEach((f) => f(b.id));
    b.joins.forEach((f) => f(a.id));
  }];
}

function device(name: string, files: Record<string, string>) {
  localStorage.removeItem('pwo.devsync');
  let state: DeviceSyncState = { ...loadSyncState(), name };
  localStorage.removeItem('pwo.devsync');
  const provider = new MemoryProvider(name, name, files);
  return { provider, store: { get: () => state, set: (s: DeviceSyncState) => void (state = s) }, state: () => state };
}

const settle = async (s: DeviceSync, t: DeviceSync) => {
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 30));
    await (s as unknown as { queue: Promise<void> }).queue;
    await (t as unknown as { queue: Promise<void> }).queue;
  }
};
const names = async (p: MemoryProvider, dir = '') => (await import('../src/fs')).listFiles(p, dir, { skip: () => false }).then((l) => l.sort());

describe('DEVSYNC-002, DEVSYNC-003 two devices of one person', () => {
  it('end up with the same documents, a deletion going to the trash, a conflict kept twice', async () => {
    const laptop = device('Laptop', { 'Documents/a.md': 'A', 'Documents/shared.md': 'v1' });
    const phone = device('Phone', { 'Documents/b.md': 'B' });
    const [r1, r2, connect] = roomPair();
    const s1 = new DeviceSync(r1, laptop.provider, laptop.store);
    const s2 = new DeviceSync(r2, phone.provider, phone.store);
    const peers: string[] = [];
    (s2 as unknown as { events: { peers: (p: { name: string }[]) => void } }).events.peers = (p) => peers.push(...p.map((x) => x.name));
    connect();
    await settle(s1, s2);
    expect(peers).toContain('Laptop');
    expect(laptop.state().peers).toMatchObject({ [phone.state().device]: { name: 'Phone' } });

    await s1.syncNow();
    await settle(s1, s2);
    expect(await names(laptop.provider)).toEqual(['Documents/a.md', 'Documents/b.md', 'Documents/shared.md']);
    expect(await names(phone.provider)).toEqual(['Documents/a.md', 'Documents/b.md', 'Documents/shared.md']);

    // Deleted on the phone: deleted on the laptop too, kept in its trash.
    await phone.provider.remove('Documents/a.md');
    await s2.syncNow();
    await settle(s1, s2);
    expect(await names(laptop.provider)).toContain('Documents/b.md');
    expect((await names(laptop.provider)).filter((n) => !n.startsWith('.pwo-trash'))).not.toContain('Documents/a.md');
    expect((await names(laptop.provider)).some((n) => /^\.pwo-trash\/\d{4}-\d{2}-\d{2}\/Documents\/a\.md$/.test(n))).toBe(true);

    // DEVSYNC-009: restored from the trash on the laptop, it comes back on the phone too.
    const [trashed] = await listTrash(laptop.provider);
    expect(trashed?.original).toBe('Documents/a.md');
    await restoreFromTrash(laptop.provider, trashed!.path);
    await s1.syncNow();
    await settle(s1, s2);
    expect(await (await phone.provider.read('Documents/a.md')).text()).toBe('A');
    // And it stays on the laptop after the phone synchronises in turn.
    await s2.syncNow();
    await settle(s1, s2);
    expect(await (await laptop.provider.read('Documents/a.md')).text()).toBe('A');

    // Changed on both: both versions kept, on both devices.
    await laptop.provider.write('Documents/shared.md', new Blob(['laptop']));
    await new Promise((r) => setTimeout(r, 5));
    await phone.provider.write('Documents/shared.md', new Blob(['phone']));
    await s1.syncNow();
    await settle(s1, s2);
    const visible = async (p: MemoryProvider) => (await names(p)).filter((n) => !n.startsWith('.'));
    expect(await visible(laptop.provider)).toEqual(await visible(phone.provider));
    const conflict = (await visible(laptop.provider)).find((n) => n.includes('(conflict'));
    expect(conflict).toMatch(/shared \(conflict Laptop .*\)\.md$/);
    expect(await (await laptop.provider.read('Documents/shared.md')).text()).toBe('phone');
    expect(await (await phone.provider.read(conflict!)).text()).toBe('laptop');
  });

  it('refuses paths outside the documents', () => {
    expect(safePath('../etc/passwd')).toBeUndefined();
    expect(safePath('/abs')).toBeUndefined();
    expect(safePath('a/../../b')).toBeUndefined();
    expect(safePath('.pwo-trash/x')).toBeUndefined();
    expect(safePath('Documents/ok.md')).toBe('Documents/ok.md');
  });

  it('tells a new name of the device to the others (DEVSYNC-008)', async () => {
    const [ra, rb, join] = roomPair();
    const a = device('Laptop', {});
    const b = device('Phone', {});
    const sa = new DeviceSync(ra, a.provider, a.store);
    const sb = new DeviceSync(rb, b.provider, b.store);
    join();
    await new Promise((r) => setTimeout(r, 30));
    expect(Object.values(b.state().peers).map((p) => p.name)).toEqual(['Laptop']);
    a.store.set({ ...a.state(), name: 'Office laptop' });
    sa.announce();
    await new Promise((r) => setTimeout(r, 30));
    expect(Object.values(b.state().peers).map((p) => p.name)).toEqual(['Office laptop']);
    sb.close();
    sa.close();
  });
});
