/**
 * QRShare app handoff protocol, version 1 (SHARE-007, SHARE-008): hand a file
 * to QRShare, or receive one from it, through `postMessage` between two
 * windows. Same protocol as QRShare's `src/share/handoff.ts`.
 */

export const HANDOFF_TYPE = 'qrshare-handoff';
export const HANDOFF_VERSION = 1;
export const MAX_HANDOFF_BYTES = 200 * 1024 * 1024;

export type HandoffMessage = { action: 'ready' } | { action: 'received' } | { action: 'file'; name: string; mimeType: string; data: ArrayBuffer };

export interface WindowLike {
  readonly opener: WindowLike | null;
  postMessage(message: unknown, targetOrigin: string, transfer?: Transferable[]): void;
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
}

const envelope = (action: string, extra: object = {}) => ({ type: HANDOFF_TYPE, version: HANDOFF_VERSION, action, ...extra });

export function parseHandoffMessage(data: unknown): HandoffMessage | null {
  if (typeof data !== 'object' || data === null) return null;
  const m = data as Record<string, unknown>;
  if (m.type !== HANDOFF_TYPE || m.version !== HANDOFF_VERSION) return null;
  if (m.action === 'ready' || m.action === 'received') return { action: m.action };
  if (m.action !== 'file' || typeof m.name !== 'string' || typeof m.mimeType !== 'string') return null;
  const buffer = m.data as ArrayBuffer | undefined;
  if (!buffer || typeof buffer !== 'object' || ArrayBuffer.isView(buffer) || typeof buffer.byteLength !== 'number' || buffer.byteLength > MAX_HANDOFF_BYTES) return null;
  const name = m.name.split(/[\\/]/).pop()?.trim() ?? '';
  if (!name || name === '.' || name === '..') return null;
  return { action: 'file', name, mimeType: m.mimeType || 'application/octet-stream', data: buffer };
}

/**
 * Receiving side: tell `self.opener` we are ready, then resolve with the first
 * valid file it sends (only from `allowedOrigins` when given).
 */
export function receiveFromOpener(self: WindowLike, allowedOrigins?: string[], timeoutMs = 30_000): Promise<{ file: File; origin: string } | null> {
  const opener = self.opener;
  if (!opener) return Promise.resolve(null);
  return new Promise((resolve) => {
    const done = (value: { file: File; origin: string } | null): void => {
      clearTimeout(timer);
      self.removeEventListener('message', onMessage);
      resolve(value);
    };
    const onMessage = (event: MessageEvent): void => {
      if (event.source !== (opener as unknown)) return;
      if (allowedOrigins && !allowedOrigins.includes(event.origin)) return;
      const message = parseHandoffMessage(event.data);
      if (message?.action !== 'file') return;
      opener.postMessage(envelope('received'), event.origin);
      done({ file: new File([message.data], message.name, { type: message.mimeType }), origin: event.origin });
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    self.addEventListener('message', onMessage);
    opener.postMessage(envelope('ready'), '*');
  });
}

/** Sending side: once `target` (opened by us) is ready on `expectedOrigin`, post the file to that origin only. */
export function sendFileToWindow(self: WindowLike, target: WindowLike, expectedOrigin: string, file: File, timeoutMs = 30_000): Promise<'sent' | 'timeout'> {
  return new Promise((resolve) => {
    let posted = false;
    const done = (value: 'sent' | 'timeout'): void => {
      clearTimeout(timer);
      self.removeEventListener('message', onMessage);
      resolve(value);
    };
    const onMessage = (event: MessageEvent): void => {
      if (event.source !== (target as unknown) || event.origin !== expectedOrigin) return;
      const message = parseHandoffMessage(event.data);
      if (message?.action === 'ready' && !posted) {
        posted = true;
        void file.arrayBuffer().then((data) => target.postMessage(envelope('file', { name: file.name, mimeType: file.type, data }), expectedOrigin, [data]));
      } else if (message?.action === 'received' && posted) {
        done('sent');
      }
    };
    const timer = setTimeout(() => done('timeout'), timeoutMs);
    self.addEventListener('message', onMessage);
  });
}
