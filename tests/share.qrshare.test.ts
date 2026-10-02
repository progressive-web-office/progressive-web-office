import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_QRSHARE_URL,
  handoffFeatures,
  handoffSendUrl,
  probeHandoff,
  loadShareSettings,
  planSend,
  prepareTransferUrl,
  receiveUrl,
  saveShareSettings,
  sendTextUrl,
} from '../src/share/qrshare';

describe('SHARE-002/SHARE-005 QRShare URLs', () => {
  it('builds the send route with data and policy', () => {
    expect(sendTextUrl('https://s-celles.github.io/QRShare/', '# Hi & bye', 'airgap')).toBe('https://s-celles.github.io/QRShare/#/send?data=%23+Hi+%26+bye&policy=airgap');
  });

  it('ignores an existing hash in the configured URL', () => {
    expect(receiveUrl('https://example.org/qr/#/about', 'prefer-airgap')).toBe('https://example.org/qr/#/scan/auto?policy=prefer-airgap');
    expect(prepareTransferUrl('https://example.org/qr/')).toBe('https://example.org/qr/#/create/url');
  });

  it('builds the handoff and receive-with-return routes (SHARE-007, SHARE-008)', () => {
    expect(handoffSendUrl('https://example.org/qr/', 'any')).toBe('https://example.org/qr/#/send?handoff=1&policy=any');
    expect(receiveUrl('https://example.org/qr/', 'airgap', 'https://pwo.example/app/?handoff=qrshare')).toBe(
      'https://example.org/qr/#/scan/auto?policy=airgap&return=https%3A%2F%2Fpwo.example%2Fapp%2F%3Fhandoff%3Dqrshare',
    );
  });
});

describe('SHARE-001/SHARE-002 choosing how to send', () => {
  const file = (text: string, name = 'a.md') => new File([text], name);

  it('sends small text documents through the URL route', async () => {
    expect(await planSend(file('# Hi'), 'md')).toEqual({ kind: 'url', text: '# Hi' });
    expect(await planSend(file('a,b\n1,2'), 'csv')).toEqual({ kind: 'url', text: 'a,b\n1,2' });
  });

  it('hands binary or large files over with postMessage (SHARE-007)', async () => {
    expect(await planSend(file('PK..', 'a.docx'), 'docx')).toEqual({ kind: 'handoff' });
    expect(await planSend(file('x'.repeat(20_000)), 'md')).toEqual({ kind: 'handoff' });
  });
});

describe('SHARE-004 settings', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to the public QRShare and "prefer air-gapped"', () => {
    expect(loadShareSettings()).toEqual({ url: DEFAULT_QRSHARE_URL, policy: 'prefer-airgap' });
  });

  it('remembers the policy and URL, rejecting non-http URLs', () => {
    saveShareSettings({ url: 'https://qr.example.org/', policy: 'airgap' });
    expect(loadShareSettings()).toEqual({ url: 'https://qr.example.org/', policy: 'airgap' });
    saveShareSettings({ url: 'javascript:alert(1)', policy: 'any' });
    expect(loadShareSettings()).toEqual({ url: DEFAULT_QRSHARE_URL, policy: 'any' });
  });
});

describe('SHARE-007 detecting QRShare handoff support', () => {
  const fetchJson = (body: unknown, ok = true) => (async () => new Response(JSON.stringify(body), { status: ok ? 200 : 404 })) as typeof fetch;

  it('reads the protocol versions from the QRShare manifest', async () => {
    const urls: string[] = [];
    const fetchFn = (async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return new Response(JSON.stringify({ qrshare_handoff: { versions: [1] } }));
    }) as typeof fetch;
    expect(await probeHandoff('https://example.org/qr/#/about', fetchFn)).toBe(true);
    expect(urls).toEqual(['https://example.org/qr/manifest.webmanifest']);
  });

  it('reports older QRShare versions as unsupported', async () => {
    expect(await probeHandoff('https://example.org/qr/', fetchJson({ name: 'QRShare' }))).toBe(false);
    expect(await probeHandoff('https://example.org/qr/', fetchJson({ qrshare_handoff: { versions: [2] } }))).toBe(false);
  });

  it('is unknown when the manifest cannot be read (offline, CORS)', async () => {
    expect(await probeHandoff('https://example.org/qr/', (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch)).toBeNull();
    expect(await probeHandoff('https://example.org/qr/', fetchJson({}, false))).toBeNull();
  });
});

describe('SHARE-012 QRShare handoff protocol v2', () => {
  const fetchJson = (body: unknown) => (async () => new Response(JSON.stringify(body))) as typeof fetch;

  it('asks for a send mode and for the file back in the same window', () => {
    expect(handoffSendUrl('https://example.org/qr/', 'airgap', 'animated-qr')).toBe('https://example.org/qr/#/send?handoff=1&policy=airgap&mode=animated-qr');
    expect(receiveUrl('https://example.org/qr/', 'airgap', 'https://pwo.example/app/', true)).toBe(
      'https://example.org/qr/#/scan/auto?policy=airgap&return=https%3A%2F%2Fpwo.example%2Fapp%2F&reply=opener',
    );
  });

  it('reads the versions and features from the manifest', async () => {
    expect(await handoffFeatures('https://example.org/qr/', fetchJson({ qrshare_handoff: { versions: [1, 2], features: ['mode', 'reply-opener'] } }))).toEqual({
      versions: [1, 2],
      features: ['mode', 'reply-opener'],
    });
    expect(await handoffFeatures('https://example.org/qr/', fetchJson({ qrshare_handoff: { versions: [1] } }))).toEqual({ versions: [1], features: [] });
    expect(await handoffFeatures('https://example.org/qr/', fetchJson({ qrshare_handoff: { versions: 'x', features: [3] } }))).toEqual({ versions: [], features: [] });
    expect(await handoffFeatures('https://example.org/qr/', (async () => { throw new TypeError('offline'); }) as typeof fetch)).toBeNull();
  });
});
