/**
 * LOCK-001, LOCK-002: passkeys (WebAuthn) as the key of the lock. The
 * passkey is asked with the user's verification (fingerprint, face, PIN of
 * the device), and its PRF extension gives a secret of 32 bytes, the same
 * each time for the same salt, never kept: the data key is wrapped by a key
 * derived from it. No server is involved: the secret itself is the proof.
 */
import { b64, unb64 } from './crypto';

const b64url = (bytes: Uint8Array): string => b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (text: string): Uint8Array => unb64(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4));
const buf = (bytes: Uint8Array): ArrayBuffer => bytes.slice().buffer;

type PrfOutputs = { enabled?: boolean; results?: { first?: ArrayBuffer } };

export class NoPrfError extends Error {
  constructor() {
    super('This passkey gives no secret (PRF) to encrypt with.');
    this.name = 'NoPrfError';
  }
}

/** Whether passkeys can be used here at all. */
export const passkeysAvailable = (): boolean => typeof PublicKeyCredential !== 'undefined' && !!navigator.credentials?.create;

/** Ask the passkey `ids` (any of them) for its secret with each one's salt; which one answered, and its secret. */
export async function passkeySecret(passkeys: { id: string; salt: string }[]): Promise<{ id: string; secret: Uint8Array }> {
  const evalByCredential: Record<string, { first: ArrayBuffer }> = {};
  for (const p of passkeys) evalByCredential[p.id] = { first: buf(unb64(p.salt)) };
  const credential = (await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: passkeys.map((p) => ({ type: 'public-key' as const, id: buf(unb64url(p.id)) })),
      userVerification: 'required',
      timeout: 120_000,
      extensions: { prf: { evalByCredential } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error('No passkey');
  const prf = (credential.getClientExtensionResults() as { prf?: PrfOutputs }).prf;
  const first = prf?.results?.first;
  if (!first) throw new NoPrfError();
  return { id: b64url(new Uint8Array(credential.rawId)), secret: new Uint8Array(first) };
}

/**
 * A new passkey for the lock, and its secret: made with the PRF asked at
 * once, else asked right after (some authenticators answer only then).
 */
export async function newPasskey(label: string): Promise<{ id: string; salt: string; secret: Uint8Array }> {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const credential = (await navigator.credentials.create({
    publicKey: {
      rp: { name: 'Progressive Web Office' },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: label, displayName: label },
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
      timeout: 120_000,
      extensions: { prf: { eval: { first: buf(salt) } } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error('No passkey');
  const id = b64url(new Uint8Array(credential.rawId));
  const prf = (credential.getClientExtensionResults() as { prf?: PrfOutputs }).prf;
  if (prf?.enabled === false) throw new NoPrfError();
  const first = prf?.results?.first;
  if (first) return { id, salt: b64(salt), secret: new Uint8Array(first) };
  const asked = await passkeySecret([{ id, salt: b64(salt) }]);
  return { id, salt: b64(salt), secret: asked.secret };
}
