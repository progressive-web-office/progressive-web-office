import { describe, expect, it } from 'vitest';
import type { CollabRoom } from '@scelles/collab';
import { MemoryProvider } from '../src/fs';
import { DeviceSync } from '../src/devsync/session';
import { loadSyncState, type DeviceSyncState } from '../src/devsync/state';
import { exportTemplates, importTemplates, templatePath, type Mirrored, type TemplateStore } from '../src/devsync/templates-mirror';
import type { DocumentFormat } from '../src/core/format';

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

/** A template store in memory, as the browser's database. */
function memoryStore(): TemplateStore & { items: Map<string, { name: string; format: DocumentFormat; data: Uint8Array }> } {
  const items = new Map<string, { name: string; format: DocumentFormat; data: Uint8Array }>();
  return {
    items,
    list: async () => [...items].map(([id, v]) => ({ id, name: v.name, format: v.format })),
    load: async (id) => items.get(id)?.data,
    save: async (name, format, data) => {
      items.set(`${name}:${format}`, { name, format, data });
      return `${name}:${format}`;
    },
    remove: async (id) => void items.delete(id),
  };
}

function device(name: string) {
  localStorage.removeItem('pwo.devsync');
  let state: DeviceSyncState = { ...loadSyncState(), name };
  localStorage.removeItem('pwo.devsync');
  const files = new MemoryProvider(name, name, {});
  const store = memoryStore();
  let mirrored: Mirrored = {};
  const hooks = {
    before: async () => void (mirrored = await exportTemplates(files, store, mirrored)),
    after: async () => void (mirrored = await importTemplates(files, store, mirrored)),
  };
  return { files, store, hooks, stateStore: { get: () => state, set: (s: DeviceSyncState) => void (state = s) } };
}

const settle = async (...syncs: DeviceSync[]) => {
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 30));
    for (const s of syncs) await (s as unknown as { queue: Promise<void> }).queue;
  }
};
const odt = (text: string) => new TextEncoder().encode(`PK fake odt ${text}`);

describe('DEVSYNC-012 templates synchronised', () => {
  it('a template saved, changed and deleted on one device follows on the other', async () => {
    const laptop = device('Laptop');
    const phone = device('Phone');
    const [r1, r2, connect] = roomPair();
    const s1 = new DeviceSync(r1, laptop.files, laptop.stateStore, {}, 60_000, laptop.hooks);
    const s2 = new DeviceSync(r2, phone.files, phone.stateStore, {}, 60_000, phone.hooks);
    connect();
    await settle(s1, s2);

    await laptop.store.save('Letter', 'odt', odt('v1'));
    await s1.syncNow();
    await settle(s1, s2);
    expect([...phone.store.items.keys()]).toEqual(['Letter:odt']);
    expect(new TextDecoder().decode(phone.store.items.get('Letter:odt')!.data)).toContain('v1');
    expect(await phone.files.read(templatePath('Letter', 'odt'))).toBeTruthy();

    // Changed on the phone: the laptop gets the new version.
    await phone.store.save('Letter', 'odt', odt('v2'));
    await s2.syncNow();
    await settle(s1, s2);
    expect(new TextDecoder().decode(laptop.store.items.get('Letter:odt')!.data)).toContain('v2');

    // Deleted on the laptop: deleted on the phone.
    await laptop.store.remove('Letter:odt');
    await s1.syncNow();
    await settle(s1, s2);
    expect([...phone.store.items.keys()]).toEqual([]);
    expect([...laptop.store.items.keys()]).toEqual([]);
    s1.close();
    s2.close();
  });
});
