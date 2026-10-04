import { describe, expect, it } from 'vitest';
import { DownloadConsent } from '../src/code/consent';

describe('CODE-016 download consent asked once per site, one question at a time', () => {
  it('asks once for concurrent downloads from the same site', async () => {
    const asked: string[] = [];
    const consent = new DownloadConsent();
    const ask = async (origin: string): Promise<boolean> => (asked.push(origin), true);
    const results = await Promise.all([consent.ask('https://a.org', ask), consent.ask('https://a.org', ask), consent.ask('https://a.org', ask)]);
    expect(results).toEqual([true, true, true]);
    expect(asked).toEqual(['https://a.org']);
    expect(await consent.ask('https://a.org', ask)).toBe(true);
    expect(asked).toEqual(['https://a.org']);
  });

  it('never shows two questions at once', async () => {
    let open = 0;
    let most = 0;
    const consent = new DownloadConsent();
    const ask = async (): Promise<boolean> => {
      most = Math.max(most, ++open);
      await new Promise((r) => setTimeout(r, 5));
      open--;
      return true;
    };
    await Promise.all([consent.ask('https://a.org', ask), consent.ask('https://b.org', ask), consent.ask('https://c.org', ask)]);
    expect(most).toBe(1);
  });

  it('asks again after a refusal, and survives a failing question', async () => {
    const consent = new DownloadConsent();
    expect(await consent.ask('https://a.org', async () => false)).toBe(false);
    expect(await consent.ask('https://a.org', async () => { throw new Error('closed'); })).toBe(false);
    expect(await consent.ask('https://a.org', async () => true)).toBe(true);
    expect(await consent.ask('https://b.org', undefined)).toBe(false);
  });
});
