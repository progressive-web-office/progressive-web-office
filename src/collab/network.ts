/**
 * Network settings of the real-time collaboration (COLLAB-009): the relays
 * used to find each other (Nostr) and a TURN server for networks that block
 * direct connections between browsers (companies, schools, mobile data).
 */

export interface TurnServer {
  urls: string;
  username?: string;
  credential?: string;
}

export interface CollabNetwork {
  /** Relay addresses (`wss://…`); none: the default public relays. */
  relays: string[];
  turn?: TurnServer;
}

const KEY = 'pwo.collab.network';

/** Relay addresses from what the user typed: one per line or separated by commas. */
export function parseRelays(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `wss://${s}`))
    .filter((s) => {
      try {
        const url = new URL(s);
        return (url.protocol === 'wss:' || url.protocol === 'ws:') && !!url.hostname;
      } catch {
        return false;
      }
    });
}

export function loadCollabNetwork(): CollabNetwork {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<CollabNetwork>;
    const relays = Array.isArray(v.relays) ? parseRelays(v.relays.filter((r) => typeof r === 'string').join('\n')) : [];
    const turn = v.turn && typeof v.turn.urls === 'string' && v.turn.urls.trim() ? { urls: v.turn.urls.trim(), ...(v.turn.username ? { username: String(v.turn.username) } : {}), ...(v.turn.credential ? { credential: String(v.turn.credential) } : {}) } : undefined;
    return turn ? { relays, turn } : { relays };
  } catch {
    return { relays: [] };
  }
}

export function saveCollabNetwork(network: CollabNetwork): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(network));
  } catch {
    /* storage unavailable */
  }
}

/** The options of trystero's `joinRoom` for these settings. */
export function trysteroOptions(network: CollabNetwork): { relayUrls?: string[]; turnConfig?: TurnServer[] } {
  const out: { relayUrls?: string[]; turnConfig?: TurnServer[] } = {};
  if (network.relays.length) out.relayUrls = network.relays;
  if (network.turn && /^(turns?|stun):/i.test(network.turn.urls)) out.turnConfig = [network.turn];
  return out;
}
