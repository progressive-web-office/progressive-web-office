/**
 * PDF-014: the user's signature kept in this browser — only when the user
 * ticked "Remember", and forgotten on request. Never sent anywhere.
 */
export interface SavedSignature {
  png: Uint8Array;
  width: number;
  height: number;
}

const KEY = 'pwo.pdf.signature';

const toB64 = (bytes: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

export function loadSignature(): SavedSignature | undefined {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { png?: unknown; width?: unknown; height?: unknown } | null;
    if (!raw || typeof raw.png !== 'string' || typeof raw.width !== 'number' || typeof raw.height !== 'number') return undefined;
    return { png: Uint8Array.from(atob(raw.png), (c) => c.charCodeAt(0)), width: raw.width, height: raw.height };
  } catch {
    return undefined;
  }
}

export function rememberSignature(sig: SavedSignature): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ png: toB64(sig.png), width: sig.width, height: sig.height }));
  } catch {
    /* storage unavailable or full: not remembered */
  }
}

export function forgetSignature(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}
