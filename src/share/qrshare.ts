/**
 * Device-to-device exchange through QRShare (SHARE-001..SHARE-005).
 * QRShare (https://github.com/s-celles/QRShare, AGPL-3.0) is a separate PWA;
 * PWO only links to its public routes and to the Web Share API.
 */
import type { DocumentFormat } from '../core/format';

export type SendPolicy = 'airgap' | 'prefer-airgap' | 'any';

export const SEND_POLICIES: SendPolicy[] = ['airgap', 'prefer-airgap', 'any'];
export const DEFAULT_QRSHARE_URL = 'https://s-celles.github.io/QRShare/';

/** Text documents up to this size go through the URL route (SHARE-002). */
export const MAX_URL_TEXT_BYTES = 16 * 1024;
const TEXT_FORMATS: DocumentFormat[] = ['md', 'csv', 'tex'];

export interface ShareSettings {
  url: string;
  policy: SendPolicy;
}

const KEY = 'pwo.share';

const isHttpUrl = (url: string): boolean => {
  try {
    return ['https:', 'http:'].includes(new URL(url).protocol);
  } catch {
    return false;
  }
};

export function loadShareSettings(): ShareSettings {
  let raw: Partial<ShareSettings> = {};
  try {
    raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<ShareSettings>;
  } catch {
    /* defaults */
  }
  return {
    url: typeof raw.url === 'string' && isHttpUrl(raw.url) ? raw.url : DEFAULT_QRSHARE_URL,
    policy: SEND_POLICIES.includes(raw.policy as SendPolicy) ? (raw.policy as SendPolicy) : 'prefer-airgap',
  };
}

export function saveShareSettings(settings: ShareSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ url: isHttpUrl(settings.url) ? settings.url : DEFAULT_QRSHARE_URL, policy: settings.policy }));
  } catch {
    /* storage unavailable */
  }
}

const base = (url: string): string => url.split('#', 1)[0]!;

export function sendTextUrl(url: string, text: string, policy: SendPolicy): string {
  return `${base(url)}#/send?${new URLSearchParams({ data: text, policy }).toString()}`;
}

export function receiveUrl(url: string, policy: SendPolicy): string {
  return `${base(url)}#/receive/qr?policy=${policy}`;
}

/** QRShare's "Prepare a transfer" screen, where local files are selected. */
export function prepareTransferUrl(url: string): string {
  return `${base(url)}#/create/url`;
}

export type SendPlan = { kind: 'url'; text: string } | { kind: 'share' } | { kind: 'download' };

/** Decide how to hand a file to QRShare. */
export async function planSend(file: File, format: DocumentFormat, env: { canShareFiles: boolean }): Promise<SendPlan> {
  if (TEXT_FORMATS.includes(format) && file.size <= MAX_URL_TEXT_BYTES) {
    return { kind: 'url', text: new TextDecoder().decode(new Uint8Array(await file.arrayBuffer())) };
  }
  return env.canShareFiles ? { kind: 'share' } : { kind: 'download' };
}

export function canShareFiles(file: File): boolean {
  try {
    return typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}
