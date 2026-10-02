/**
 * A room that connects directly (WebRTC) and, when that fails, also through
 * the relays (COLLAB-011). Messages go both ways once the relays are used:
 * the shared document tolerates receiving an update twice.
 */
import type { CollabRoom } from '@scelles/collab';
import type { RelayRoom } from './relay-room';

type Sender = (data: never, ...rest: never[]) => unknown;
type Receiver = (data: never, peerId: string) => void;

export interface HybridRoom extends CollabRoom {
  /** Also go through the relays (once). */
  useRelays(): Promise<void>;
  mode(): 'direct' | 'relays';
  relay(): RelayRoom | undefined;
  leave(): void;
}

export function hybridRoom(direct: CollabRoom, openRelay: () => Promise<RelayRoom>): HybridRoom {
  const actions = new Map<string, { relaySend?: Sender; receivers: Receiver[] }>();
  const joins: ((id: string) => void)[] = [];
  const leaves: ((id: string) => void)[] = [];
  /** Through which ways each peer is reached. */
  const ways = new Map<string, Set<'direct' | 'relay'>>();
  let relay: RelayRoom | undefined;
  let opening: Promise<void> | undefined;

  const joined = (via: 'direct' | 'relay') => (id: string): void => {
    const set = ways.get(id) ?? new Set();
    const first = set.size === 0;
    set.add(via);
    ways.set(id, set);
    if (first) for (const fn of joins) fn(id);
  };
  const left = (via: 'direct' | 'relay') => (id: string): void => {
    const set = ways.get(id);
    if (!set?.delete(via) || set.size) return;
    ways.delete(id);
    for (const fn of leaves) fn(id);
  };
  direct.onPeerJoin(joined('direct'));
  direct.onPeerLeave(left('direct'));

  const attach = (ns: string): void => {
    const entry = actions.get(ns)!;
    if (!relay || entry.relaySend) return;
    const [send, receive] = relay.makeAction(ns);
    entry.relaySend = send as Sender;
    receive(((data: never, peer: string) => entry.receivers.forEach((fn) => fn(data, peer))) as never);
  };

  return {
    makeAction: ((ns: string) => {
      const [directSend, directReceive] = direct.makeAction(ns);
      const entry = { receivers: [] as Receiver[] } as { relaySend?: Sender; receivers: Receiver[] };
      actions.set(ns, entry);
      directReceive(((data: never, peer: string) => entry.receivers.forEach((fn) => fn(data, peer))) as never);
      attach(ns);
      return [
        async (data: never, ...rest: never[]) => {
          await (directSend as Sender)(data, ...rest);
          await entry.relaySend?.(data, ...rest);
        },
        (fn: Receiver) => void entry.receivers.push(fn),
      ];
    }) as unknown as CollabRoom['makeAction'],
    onPeerJoin: (fn) => void joins.push(fn),
    onPeerLeave: (fn) => void leaves.push(fn),
    useRelays: () =>
      (opening ??= openRelay().then((r) => {
        relay = r;
        r.onPeerJoin(joined('relay'));
        r.onPeerLeave(left('relay'));
        for (const ns of actions.keys()) attach(ns);
      })),
    mode: () => (relay ? 'relays' : 'direct'),
    relay: () => relay,
    leave: () => relay?.leave(),
  };
}
