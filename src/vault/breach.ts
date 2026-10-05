/**
 * VAULT-004: whether a password appears in known breaches, by k-anonymity:
 * only the first 5 characters of its SHA-1 hash leave the device (with
 * padding, so the size of the answer says nothing), the rest is compared
 * here. Asked only after the user agreed.
 */
export const BREACH_ORIGIN = 'https://api.pwnedpasswords.com';

export async function breachCount(password: string, fetchFn: typeof fetch = (i, init) => fetch(i, init)): Promise<number> {
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(password))), (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  const response = await fetchFn(`${BREACH_ORIGIN}/range/${hash.slice(0, 5)}`, { headers: { 'Add-Padding': 'true' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  for (const line of (await response.text()).split('\n')) {
    const [suffix, count] = line.trim().split(':');
    if (suffix === hash.slice(5)) return Number(count) || 0;
  }
  return 0;
}
