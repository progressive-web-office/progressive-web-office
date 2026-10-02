/** A minimal Nostr relay for the tests (NIP-01 REQ / EVENT / CLOSE, ephemeral events). */
import { WebSocketServer, type WebSocket } from 'ws';

interface Sub {
  socket: WebSocket;
  id: string;
  filters: { kinds?: number[]; [tag: string]: unknown }[];
}

export interface TestRelay {
  url: string;
  events: number;
  close(): Promise<void>;
}

export async function startRelay(): Promise<TestRelay> {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await new Promise<void>((r) => server.once('listening', () => r()));
  const subs: Sub[] = [];
  const relay: TestRelay = {
    url: `ws://127.0.0.1:${(server.address() as { port: number }).port}`,
    events: 0,
    close: () =>
      new Promise((r) => {
        for (const client of server.clients) client.terminate();
        server.close(() => r());
      }),
  };
  const matches = (event: { kind: number; tags: string[][] }, filter: Sub['filters'][number]): boolean => {
    if (filter.kinds && !filter.kinds.includes(event.kind)) return false;
    for (const [key, values] of Object.entries(filter)) {
      if (!key.startsWith('#')) continue;
      const tag = key.slice(1);
      if (!event.tags.some(([name, value]) => name === tag && (values as string[]).includes(value!))) return false;
    }
    return true;
  };
  server.on('connection', (socket) => {
    socket.on('message', (raw) => {
      let msg: unknown[];
      try {
        msg = JSON.parse(String(raw)) as unknown[];
      } catch {
        return;
      }
      if (msg[0] === 'REQ') {
        subs.push({ socket, id: msg[1] as string, filters: msg.slice(2) as Sub['filters'] });
        socket.send(JSON.stringify(['EOSE', msg[1]]));
      } else if (msg[0] === 'CLOSE') {
        const i = subs.findIndex((s) => s.socket === socket && s.id === msg[1]);
        if (i >= 0) subs.splice(i, 1);
      } else if (msg[0] === 'EVENT') {
        const event = msg[1] as { id: string; kind: number; tags: string[][] };
        relay.events++;
        socket.send(JSON.stringify(['OK', event.id, true, '']));
        for (const s of subs) if (s.filters.some((f) => matches(event, f)) && s.socket.readyState === 1) s.socket.send(JSON.stringify(['EVENT', s.id, event]));
      }
    });
    socket.on('close', () => {
      for (let i = subs.length - 1; i >= 0; i--) if (subs[i]!.socket === socket) subs.splice(i, 1);
    });
  });
  return relay;
}
