/**
 * VAULT-003: one-time codes (TOTP, RFC 6238) of the entries of a vault, from
 * an `otpauth://totp/…` address (as the password managers keep it in an
 * `otp` field) or a secret in base32, computed on the device.
 */

export interface TotpParams {
  secret: Uint8Array;
  digits: number;
  period: number;
  algorithm: 'SHA-1' | 'SHA-256' | 'SHA-512';
}

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32(text: string): Uint8Array | undefined {
  const s = text.toUpperCase().replace(/[\s=-]/g, '');
  if (!s || [...s].some((c) => !B32.includes(c))) return undefined;
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const c of s) {
    value = (value << 5) | B32.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** The parameters of an `otpauth://totp/…` address or of a base32 secret; undefined when it is neither. */
export function parseTotp(value: string): TotpParams | undefined {
  const v = value.trim();
  if (/^otpauth:\/\//i.test(v)) {
    let url: URL;
    try {
      url = new URL(v);
    } catch {
      return undefined;
    }
    if (url.host.toLowerCase() !== 'totp') return undefined;
    const secret = base32(url.searchParams.get('secret') ?? '');
    if (!secret) return undefined;
    const alg = (url.searchParams.get('algorithm') ?? 'SHA1').toUpperCase().replace(/^SHA(\d)/, 'SHA-$1');
    return {
      secret,
      digits: Number(url.searchParams.get('digits') ?? 6) || 6,
      period: Number(url.searchParams.get('period') ?? 30) || 30,
      algorithm: alg === 'SHA-256' || alg === 'SHA-512' ? alg : 'SHA-1',
    };
  }
  const secret = base32(v);
  return secret ? { secret, digits: 6, period: 30, algorithm: 'SHA-1' } : undefined;
}

/** The code at a time (milliseconds), and the seconds it is still valid. */
export async function totp(p: TotpParams, now = Date.now()): Promise<{ code: string; remaining: number }> {
  const counter = Math.floor(now / 1000 / p.period);
  const msg = new Uint8Array(8);
  new DataView(msg.buffer).setBigUint64(0, BigInt(counter));
  const key = await crypto.subtle.importKey('raw', p.secret.slice().buffer, { name: 'HMAC', hash: p.algorithm }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
  const offset = mac[mac.length - 1]! & 15;
  const bin = ((mac[offset]! & 127) << 24) | (mac[offset + 1]! << 16) | (mac[offset + 2]! << 8) | mac[offset + 3]!;
  const code = String(bin % 10 ** p.digits).padStart(p.digits, '0');
  return { code, remaining: p.period - (Math.floor(now / 1000) % p.period) };
}
