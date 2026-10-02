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

/** QRShare's receive screen; `returnUrl` lets QRShare hand the received file back (SHARE-008). */
export function receiveUrl(url: string, policy: SendPolicy, returnUrl?: string, replyToOpener = false): string {
  // SHARE-012: `reply=opener` asks QRShare to send the file back to this window.
  return `${base(url)}#/receive/qr?policy=${policy}${returnUrl ? `&return=${encodeURIComponent(returnUrl)}` : ''}${returnUrl && replyToOpener ? '&reply=opener' : ''}`;
}

/** QRShare's transfer chooser waiting for a file handed over with postMessage (SHARE-007). */
export function handoffSendUrl(url: string, policy: SendPolicy, mode?: HandoffMode): string {
  return `${base(url)}#/send?handoff=1&policy=${policy}${mode ? `&mode=${mode}` : ''}`;
}

/** Send modes an app may ask QRShare for (handoff v2, SHARE-012). */
export type HandoffMode = 'animated-qr' | 'cimbar' | 'webrtc' | 'share';

export interface HandoffFeatures {
  versions: number[];
  /** Version 2 features: `mode`, `reply-opener`. */
  features: string[];
}

/** The handoff versions and features announced by QRShare's manifest; null when unknown. */
export async function handoffFeatures(url: string, fetchFn: typeof fetch = (i, init) => fetch(i, init)): Promise<HandoffFeatures | null> {
  try {
    const res = await fetchFn(new URL('manifest.webmanifest', base(url)).href, { cache: 'no-store' });
    if (!res.ok) return null;
    const manifest = (await res.json()) as { qrshare_handoff?: { versions?: unknown; features?: unknown } };
    const list = <T>(v: unknown, ok: (x: unknown) => x is T): T[] => (Array.isArray(v) ? v.filter(ok) : []);
    return {
      versions: list(manifest.qrshare_handoff?.versions, (x): x is number => typeof x === 'number'),
      features: list(manifest.qrshare_handoff?.features, (x): x is string => typeof x === 'string'),
    };
  } catch {
    return null;
  }
}

/**
 * Whether the QRShare at `url` speaks the handoff protocol v1, read from the
 * `qrshare_handoff` member of its web app manifest. Null when unknown.
 */
export async function probeHandoff(url: string, fetchFn: typeof fetch = (i, init) => fetch(i, init)): Promise<boolean | null> {
  const found = await handoffFeatures(url, fetchFn);
  return found && found.versions.includes(1);
}

/** Origin of the configured QRShare, the only one allowed to hand files back. */
export function qrshareOrigin(url: string): string {
  return new URL(url).origin;
}

/** QRShare's "Prepare a transfer" screen, where local files are selected. */
export function prepareTransferUrl(url: string): string {
  return `${base(url)}#/create/url`;
}

export type SendPlan = { kind: 'url'; text: string } | { kind: 'handoff' };

/**
 * Decide how to hand a document to QRShare: small text through the URL route
 * (SHARE-002), any other file through the postMessage handoff (SHARE-007).
 */
export async function planSend(file: File, format: DocumentFormat): Promise<SendPlan> {
  if (TEXT_FORMATS.includes(format) && file.size <= MAX_URL_TEXT_BYTES) {
    return { kind: 'url', text: new TextDecoder().decode(new Uint8Array(await file.arrayBuffer())) };
  }
  return { kind: 'handoff' };
}

export function canShareFiles(file: File): boolean {
  try {
    return typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}
