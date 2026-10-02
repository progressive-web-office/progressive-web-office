import { beforeEach, describe, expect, it } from 'vitest';
import { loadCollabNetwork, parseRelays, saveCollabNetwork, trysteroOptions } from '../src/collab/network';

describe('COLLAB-009 network of the real-time collaboration', () => {
  beforeEach(() => localStorage.clear());

  it('reads relay addresses, one per line or separated by commas', () => {
    expect(parseRelays('nos.lol\nwss://relay.example.org/nostr, ws://localhost:7000\n\n')).toEqual(['wss://nos.lol', 'wss://relay.example.org/nostr', 'ws://localhost:7000']);
    expect(parseRelays('https://not-a-relay.org\nwss://')).toEqual([]);
  });

  it('keeps the relays and the TURN server', () => {
    expect(loadCollabNetwork()).toEqual({ relays: [] });
    saveCollabNetwork({ relays: ['wss://nos.lol'], turn: { urls: 'turn:turn.example.org:3478', username: 'ann', credential: 'secret' } });
    expect(loadCollabNetwork()).toEqual({ relays: ['wss://nos.lol'], turn: { urls: 'turn:turn.example.org:3478', username: 'ann', credential: 'secret' } });
  });

  it('gives the options of the connection', () => {
    expect(trysteroOptions({ relays: [] })).toEqual({});
    expect(trysteroOptions({ relays: ['wss://nos.lol'], turn: { urls: 'turns:t.example.org:443' } })).toEqual({ relayUrls: ['wss://nos.lol'], turnConfig: [{ urls: 'turns:t.example.org:443' }] });
    // An address that is not a STUN/TURN server is left out.
    expect(trysteroOptions({ relays: [], turn: { urls: 'https://t.example.org' } })).toEqual({});
  });
});
