import { describe, expect, it } from 'vitest';
import { HANDOFF_TYPE, parseHandoffMessage, receiveFromOpener, sendFileToWindow, type WindowLike } from '../src/share/handoff';

/** Window double: postMessage delivers a message event to this window, coming from its peer. */
class FakeWindow implements WindowLike {
  opener: FakeWindow | null = null;
  peer: FakeWindow | null = null;
  sent: { data: unknown; targetOrigin: string }[] = [];
  private listeners = new Set<(event: MessageEvent) => void>();
  constructor(public origin: string) {}
  addEventListener(_t: 'message', l: (event: MessageEvent) => void): void {
    this.listeners.add(l);
  }
  removeEventListener(_t: 'message', l: (event: MessageEvent) => void): void {
    this.listeners.delete(l);
  }
  postMessage(data: unknown, targetOrigin: string): void {
    this.sent.push({ data, targetOrigin });
    const from = this.peer;
    queueMicrotask(() => {
      if (targetOrigin !== '*' && targetOrigin !== this.origin) return;
      for (const l of [...this.listeners]) l({ data, origin: from?.origin ?? 'null', source: from } as unknown as MessageEvent);
    });
  }
}

const pair = (a: string, b: string) => {
  const app = new FakeWindow(a);
  const other = new FakeWindow(b);
  other.opener = app;
  app.peer = other;
  other.peer = app;
  return { app, other };
};

describe('SHARE-007 QRShare app handoff protocol (v1)', () => {
  it('validates messages', () => {
    expect(parseHandoffMessage({ type: HANDOFF_TYPE, version: 1, action: 'ready' })).toEqual({ action: 'ready' });
    expect(parseHandoffMessage({ type: HANDOFF_TYPE, version: 2, action: 'ready' })).toBeNull();
    expect(parseHandoffMessage({ type: HANDOFF_TYPE, version: 1, action: 'file', name: '../x.md', mimeType: '', data: new ArrayBuffer(2) })).toMatchObject({ name: 'x.md', mimeType: 'application/octet-stream' });
  });

  it('hands a file to QRShare (PWO is the opener)', async () => {
    const { app, other: qrshare } = pair('https://pwo.example', 'https://qrshare.example');
    const sending = sendFileToWindow(app, qrshare, 'https://qrshare.example', new File(['PK'], 'a.xlsx'), 500);
    const got = await receiveFromOpener(qrshare, undefined, 500);
    expect(await sending).toBe('sent');
    expect(got?.file.name).toBe('a.xlsx');
  });

  it('receives a file from QRShare only from the allowed origin', async () => {
    const { app: qrshare, other: pwo } = pair('https://qrshare.example', 'https://pwo.example');
    const sending = sendFileToWindow(qrshare, pwo, 'https://pwo.example', new File(['# Hi'], 'n.md', { type: 'text/markdown' }), 500);
    const got = await receiveFromOpener(pwo, ['https://qrshare.example'], 500);
    expect(await sending).toBe('sent');
    expect(await got?.file.text()).toBe('# Hi');

    const { app: evil, other: pwo2 } = pair('https://evil.example', 'https://pwo.example');
    void sendFileToWindow(evil, pwo2, 'https://pwo.example', new File(['x'], 'x.md'), 200);
    expect(await receiveFromOpener(pwo2, ['https://qrshare.example'], 200)).toBeNull();
  });
});
