import { describe, expect, it } from 'vitest';
import type { CollabRoom } from '@scelles/collab';
import { giveNewKey, serveRekey } from '../src/devsync/rekey';
import type { Pairing } from '../src/devsync/state';

/** Rooms of one hub: a message goes to its target, or to all the others; `spy` sees everything. */
function hub() {
  type Fn = (d: unknown, p: string) => void;
  const rooms = new Map<string, Map<string, Fn[]>>();
  const seen: unknown[] = [];
  const room = (id: string): CollabRoom => {
    const receivers = new Map<string, Fn[]>();
    rooms.set(id, receivers);
    return {
      makeAction: (ns: string) => [
        (data: unknown, target?: string) =>
          setTimeout(() => {
            seen.push(structuredClone(data));
            for (const [other, r] of rooms) if (other !== id && (!target || target === other)) r.get(ns)?.forEach((f) => f(structuredClone(data), id));
          }),
        (fn: Fn) => receivers.set(ns, [...(receivers.get(ns) ?? []), fn]),
      ] as never,
      onPeerJoin: () => undefined,
      onPeerLeave: () => undefined,
    } as unknown as CollabRoom;
  };
  /** Send as if from another peer (an impostor on the relays). */
  const forge = (from: string, ns: string, data: unknown, target: string) => setTimeout(() => rooms.get(target)?.get(ns)?.forEach((f) => f(data, from)));
  return { room, seen, forge };
}

const OLD = 'old-secret-of-the-room-0123456789';
const NEW: Pairing = { room: 'new-room-1234', secret: 'the-new-secret-nobody-else-reads', since: 1 };

describe('DEVSYNC-010 revoking one device', () => {
  it('gives the new key to the devices that accept, never readable by the others', async () => {
    const h = hub();
    const laptop = h.room('laptop');
    const phone = h.room('phone');
    const tablet = h.room('tablet');
    const lost = h.room('lost');
    const got: Record<string, Pairing> = {};
    let forget = '';
    serveRekey(phone, () => OLD, async (from, revoked) => from === 'Laptop' && revoked === 'Lost phone', (p, device) => {
      got.phone = p;
      forget = device;
    });
    serveRekey(tablet, () => OLD, async () => false, (p) => (got.tablet = p));
    // The revoked device listens too, with the old key.
    serveRekey(lost, () => OLD, async () => true, (p) => (got.lost = p));
    const result = await giveNewKey(laptop, ['phone', 'tablet'], { from: 'Laptop', revoked: 'Lost phone', device: 'lost-1', pairing: NEW, oldSecret: OLD, settleMs: 20, timeoutMs: 2000 });
    await new Promise((r) => setTimeout(r, 50));
    expect(result).toEqual({ given: ['phone'], refused: ['tablet'], failed: [] });
    expect(got.phone).toMatchObject({ room: NEW.room, secret: NEW.secret });
    expect(forget).toBe('lost-1');
    expect(got.tablet).toBeUndefined();
    expect(got.lost).toBeUndefined();
    // Nothing that went through the room shows the new secret.
    expect(JSON.stringify(h.seen)).not.toContain(NEW.secret);
    expect(JSON.stringify(h.seen)).not.toContain(NEW.room);
  });

  it('stops when someone answers in the place of a device, and when nobody answers', async () => {
    const h = hub();
    const laptop = h.room('laptop');
    const phone = h.room('phone');
    // The phone is slow to accept; an impostor answers for it with its own key.
    let release: (v: boolean) => void = () => {};
    serveRekey(phone, () => OLD, () => new Promise((r) => (release = r)), () => undefined);
    h.room('silent');
    const run = giveNewKey(laptop, ['phone', 'silent'], { from: 'Laptop', revoked: 'Lost', device: 'lost-1', pairing: NEW, oldSecret: OLD, settleMs: 60, timeoutMs: 400 });
    await new Promise((r) => setTimeout(r, 10));
    const ask = h.seen.find((m) => (m as { revoked?: string }).revoked) as { id: string };
    // Two different keys for the request to the phone.
    h.forge('phone', 'rk-key', { id: ask.id, key: 'A'.repeat(87) }, 'laptop');
    release(true);
    const result = await run;
    expect(result.given).toEqual([]);
    expect(result.failed.sort()).toEqual(['phone', 'silent']);
  });
});
