import type { CollabRoom } from '@scelles/collab';
import { describe, expect, it } from 'vitest';
import { hostInvitation, invitationUrl, joinInvitation, newInvitation, parseInvitation, verificationEmojis, type JoinRequest } from '../src/devsync/invite';

/** Rooms of one meeting place, in memory: each message reaches the others (or the one targeted). */
function place(): (id: string) => CollabRoom {
  const members = new Map<string, { receivers: Map<string, ((d: unknown, from: string) => void)[]>; join?: (id: string) => void }>();
  return (id) => {
    const me = { receivers: new Map<string, ((d: unknown, from: string) => void)[]>(), join: undefined as ((id: string) => void) | undefined };
    for (const [other, m] of members) queueMicrotask(() => (m.join?.(id), me.join?.(other)));
    members.set(id, me);
    return {
      makeAction: (ns: string) => [
        async (data: unknown, to?: string) => {
          // A "spy" reads every message, like someone with the invitation reading the relays.
          for (const [other, m] of members) if (other !== id && (!to || to === other || other.startsWith('spy'))) for (const fn of m.receivers.get(ns) ?? []) queueMicrotask(() => fn(data, id));
        },
        (fn: (d: unknown, from: string) => void) => void me.receivers.set(ns, [...(me.receivers.get(ns) ?? []), fn]),
      ],
      onPeerJoin: (fn: (id: string) => void) => void (me.join = fn),
      onPeerLeave: () => {},
    } as unknown as CollabRoom;
  };
}

const pairing = { room: 'room-of-the-devices', secret: 'the-key-of-the-documents-xyz', since: 1 };
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 10));

describe('DEVSYNC-006 adding a device by a one-time invitation', () => {
  it('puts the invitation in a link of the application, not the key of the documents', () => {
    const inv = newInvitation(1_000_000);
    const url = invitationUrl('https://example.org/app/#something', inv);
    expect(url.startsWith('https://example.org/app/#pwo-pair=')).toBe(true);
    expect(url).not.toContain(pairing.secret);
    expect(parseInvitation(url, 1_000_000)).toEqual({ ...inv, expires: Math.floor(inv.expires / 1000) * 1000 });
    expect(parseInvitation(url, inv.expires + 1)).toBe('expired');
    expect(parseInvitation('pwo-sync:abc.def')).toBeUndefined();
  });

  it('shows the same emojis on both devices, other ones for another nonce', async () => {
    const a = await verificationEmojis('secret-of-the-invitation', 'nonce-1-xxxxxxxxxxxx');
    expect(a.split(' ')).toHaveLength(4);
    expect(await verificationEmojis('secret-of-the-invitation', 'nonce-1-xxxxxxxxxxxx')).toBe(a);
    expect(await verificationEmojis('secret-of-the-invitation', 'nonce-2-xxxxxxxxxxxx')).not.toBe(a);
  });

  it('gives the pairing only when the user accepts, once', async () => {
    const inv = newInvitation();
    const at = place();
    const requests: JoinRequest[] = [];
    const done: string[] = [];
    hostInvitation(at('host'), inv, pairing, (r) => requests.push(r), (name) => done.push(name));
    const phone = await joinInvitation(at('phone'), inv, 'Phone');
    await tick();
    // Asked to everyone and again on meeting the paired device: shown once.
    expect(requests.map((r) => [r.name, r.emojis])).toEqual([['Phone', phone.emojis]]);
    requests[0]!.accept();
    expect((await phone.answer)?.secret).toBe(pairing.secret);
    expect(done).toEqual(['Phone']);
    // Used: a later device (with a photographed QR code) gets nothing.
    const thief = await joinInvitation(at('thief'), inv, 'Thief');
    await tick();
    expect(requests).toHaveLength(1);
    let answered = false;
    void thief.answer.then(() => (answered = true));
    await tick();
    expect(answered).toBe(false);
  });

  it('encrypts the pairing for the accepted device: someone holding the invitation and reading every message learns nothing', async () => {
    const inv = newInvitation();
    const at = place();
    const requests: JoinRequest[] = [];
    hostInvitation(at('host'), inv, pairing, (r) => requests.push(r), () => {});
    // A listener in the room, with the invitation (a photographed QR code): it sees every answer.
    const seen: unknown[] = [];
    const spy = at('spy');
    (spy.makeAction('pi-ans')[1] as (fn: (d: unknown) => void) => void)((d) => seen.push(d));
    const phone = await joinInvitation(at('phone'), inv, 'Phone');
    await tick();
    requests[0]!.accept();
    expect((await phone.answer)?.secret).toBe(pairing.secret);
    await tick();
    expect(seen).toHaveLength(1);
    expect(JSON.stringify(seen)).not.toContain(pairing.secret);
  });

  it('answers a refusal, and nothing after the invitation expired', async () => {
    let now = Date.now();
    const inv = newInvitation(now);
    const at = place();
    const requests: JoinRequest[] = [];
    hostInvitation(at('host'), inv, pairing, (r) => requests.push(r), () => {}, () => now);
    const one = await joinInvitation(at('one'), inv, 'One');
    await tick();
    requests[0]!.refuse();
    expect(await one.answer).toBeNull();
    now = inv.expires + 1;
    await joinInvitation(at('late'), inv, 'Late');
    await tick();
    expect(requests).toHaveLength(1);
  });
});
