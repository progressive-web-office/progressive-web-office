/** Invitation links for real-time collaboration (COLLAB-001). */

export type CollabKind = 'document' | 'spreadsheet';

export interface CollabLink {
  kind: CollabKind;
  /** Public room name used to find each other. */
  room: string;
  /** Shared secret encrypting the connection set-up; never leaves the link. */
  secret: string;
}

const KIND_CODE: Record<CollabKind, string> = { document: 'd', spreadsheet: 's' };
const PREFIX = '#collab=';

function randomId(bytes: number): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...buf)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function newCollabLink(kind: CollabKind): CollabLink {
  return { kind, room: randomId(9), secret: randomId(18) };
}

export function collabHash(link: CollabLink): string {
  return `${PREFIX}${KIND_CODE[link.kind]}.${link.room}.${link.secret}`;
}

/** The full invitation URL for the app at `base`. */
export function collabUrl(base: string, link: CollabLink): string {
  return `${base.replace(/#.*$/, '')}${collabHash(link)}`;
}

export function decodeCollabLink(hash: string): CollabLink | null {
  if (!hash.startsWith(PREFIX)) return null;
  const m = /^([ds])\.([\w-]{8,64})\.([\w-]{16,128})$/.exec(hash.slice(PREFIX.length));
  if (!m) return null;
  return { kind: m[1] === 'd' ? 'document' : 'spreadsheet', room: m[2]!, secret: m[3]! };
}
