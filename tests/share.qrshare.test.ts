import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_QRSHARE_URL,
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
    expect(receiveUrl('https://example.org/qr/#/about', 'prefer-airgap')).toBe('https://example.org/qr/#/receive/qr?policy=prefer-airgap');
    expect(prepareTransferUrl('https://example.org/qr/')).toBe('https://example.org/qr/#/create/url');
  });
});

describe('SHARE-001/SHARE-002 choosing how to send', () => {
  const file = (text: string, name = 'a.md') => new File([text], name);

  it('sends small text documents through the URL route', async () => {
    expect(await planSend(file('# Hi'), 'md', { canShareFiles: true })).toEqual({ kind: 'url', text: '# Hi' });
    expect(await planSend(file('a,b\n1,2'), 'csv', { canShareFiles: false })).toEqual({ kind: 'url', text: 'a,b\n1,2' });
  });

  it('uses the Web Share API for binary or large files when available', async () => {
    expect(await planSend(file('PK..', 'a.docx'), 'docx', { canShareFiles: true })).toEqual({ kind: 'share' });
    expect(await planSend(file('x'.repeat(20_000)), 'md', { canShareFiles: true })).toEqual({ kind: 'share' });
  });

  it('falls back to a download and the "prepare a transfer" screen', async () => {
    expect(await planSend(file('PK..', 'a.xlsx'), 'xlsx', { canShareFiles: false })).toEqual({ kind: 'download' });
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
