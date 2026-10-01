/**
 * A room between tabs of this browser (BroadcastChannel), with the shape of a
 * trystero room. Used by the end-to-end tests and for trying collaboration
 * offline: set `localStorage['pwo.collab.transport'] = 'local'`.
 */
import type { CollabRoom } from '@scelles/collab';

type Message = { from: string; to?: string; type: 'hello' | 'here' | 'bye' | 'action'; ns?: string; data?: unknown };

export function localRoom(name: string, selfId: string): CollabRoom & { leave(): void } {
  const channel = new BroadcastChannel(`pwo-collab-${name}`);
  const peers = new Set<string>();
  const receivers = new Map<string, ((data: never, peerId: string) => void)[]>();
  let onJoin: (id: string) => void = () => {};
  let onLeave: (id: string) => void = () => {};
  const post = (m: Omit<Message, 'from'>): void => channel.postMessage({ ...m, from: selfId });
  const join = (id: string): void => {
    if (peers.has(id)) return;
    peers.add(id);
    onJoin(id);
  };
  channel.onmessage = (e: MessageEvent<Message>) => {
    const m = e.data;
    if (m.from === selfId || (m.to && m.to !== selfId)) return;
    if (m.type === 'hello') {
      post({ type: 'here', to: m.from });
      join(m.from);
    } else if (m.type === 'here') {
      join(m.from);
    } else if (m.type === 'bye') {
      if (peers.delete(m.from)) onLeave(m.from);
    } else if (m.type === 'action' && peers.has(m.from)) {
      for (const fn of receivers.get(m.ns!) ?? []) fn(m.data as never, m.from);
    }
  };
  const leave = (): void => {
    post({ type: 'bye' });
    channel.close();
  };
  addEventListener('pagehide', leave, { once: true });
  queueMicrotask(() => post({ type: 'hello' }));
  return {
    makeAction: (ns: string) => [
      async (data: unknown) => post({ type: 'action', ns, data }),
      (fn: (data: never, peerId: string) => void) => {
        receivers.set(ns, [...(receivers.get(ns) ?? []), fn]);
      },
    ],
    onPeerJoin: (fn) => void (onJoin = fn),
    onPeerLeave: (fn) => void (onLeave = fn),
    leave,
  } as CollabRoom & { leave(): void };
}
