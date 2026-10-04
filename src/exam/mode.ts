/**
 * TEACH-005: exam mode — this browser set up by the teacher for a test: no
 * network (only the application's own files), so no AI, collaboration,
 * synchronisation, repositories or servers; no pasting of what was copied
 * outside the application; and a log of what could be cheating (leaving the
 * window or the full screen, pastes and connections refused). Leaving it
 * takes the teacher's code.
 *
 * It is a deterrent in an ordinary browser, not a locked one: someone who
 * opens the developer tools or another browser gets around it. For a real
 * lockdown, use it inside a kiosk (a managed Chromebook, Safe Exam Browser).
 */

export type ExamEventKind = 'start' | 'blur' | 'hidden' | 'fullscreen-exit' | 'paste-blocked' | 'drop-blocked' | 'network-blocked' | 'wrong-code';

export interface ExamEvent {
  at: number;
  kind: ExamEventKind;
  detail?: string;
}

export interface ExamState {
  since: number;
  /** The teacher's code, hashed (PBKDF2-SHA-256). */
  salt: string;
  hash: string;
  title?: string;
  log: ExamEvent[];
}

const KEY = 'pwo.exam';
const MAX_LOG = 500;

export function loadExam(): ExamState | undefined {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as ExamState | null;
    if (raw && typeof raw.since === 'number' && typeof raw.salt === 'string' && typeof raw.hash === 'string') return { ...raw, log: Array.isArray(raw.log) ? raw.log : [] };
  } catch {
    /* none */
  }
  return undefined;
}

const save = (s: ExamState): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
};

/** Whether this browser is in exam mode (the guards themselves are installed when the application starts). */
export const inExam = (): boolean => !!loadExam();

const b64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));

async function hashCode(code: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(code), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: Uint8Array.from(atob(salt), (c) => c.charCodeAt(0)), iterations: 200_000 }, key, 256);
  return b64(new Uint8Array(bits));
}

/** Start the exam mode with the teacher's code; the application then reloads. */
export async function startExam(code: string, title?: string, now = Date.now()): Promise<ExamState> {
  const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
  const state: ExamState = { since: now, salt, hash: await hashCode(code, salt), ...(title ? { title } : {}), log: [{ at: now, kind: 'start' }] };
  save(state);
  return state;
}

/** Whether the code is the teacher's; a wrong one is logged. */
export async function checkCode(code: string): Promise<boolean> {
  const s = loadExam();
  if (!s) return true;
  const ok = (await hashCode(code, s.salt)) === s.hash;
  if (!ok) logEvent('wrong-code');
  return ok;
}

/** End the exam mode (after the code was checked): its log, for the teacher. */
export function endExam(): ExamEvent[] {
  const log = loadExam()?.log ?? [];
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
  return log;
}

export function logEvent(kind: ExamEventKind, detail?: string, now = Date.now()): void {
  const s = loadExam();
  if (!s) return;
  // The same event again within a second (blur then hidden…) is one.
  const last = s.log[s.log.length - 1];
  if (last && last.kind === kind && last.detail === detail && now - last.at < 1000) return;
  s.log = [...s.log, { at: now, kind, ...(detail ? { detail: detail.slice(0, 200) } : {}) }].slice(-MAX_LOG);
  save(s);
}

/** Only the application's own files may be fetched. */
export function allowedUrl(url: string | URL, base = location.href): boolean {
  try {
    const u = new URL(String(url), base);
    if (u.protocol === 'blob:' || u.protocol === 'data:') return true;
    return u.origin === new URL(base).origin;
  } catch {
    return false;
  }
}

const normalize = (s: string): string => s.replace(/\s+/g, ' ').trim();

/**
 * Install the guards (once, at start, before anything else runs): the
 * network kept to the application's origin, pastes kept to what was copied
 * in it, files dropped from outside refused, the window watched.
 */
export function installExamGuards(notify: (kind: ExamEventKind) => void = () => {}): void {
  if (!inExam()) return;
  const refuse = (what: string): Error => {
    logEvent('network-blocked', what);
    notify('network-blocked');
    return new TypeError(`Exam mode: no network (${what})`);
  };
  const w = window as unknown as Record<string, unknown>;
  const realFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input);
    return allowedUrl(url) ? realFetch(input, init) : Promise.reject(refuse(new URL(url, location.href).host));
  };
  for (const name of ['WebSocket', 'EventSource', 'RTCPeerConnection', 'webkitRTCPeerConnection']) {
    if (typeof w[name] !== 'function') continue;
    w[name] = function blocked(): never {
      throw refuse(name);
    };
  }
  const realOpen = window.open.bind(window);
  window.open = (url?: string | URL, target?: string, features?: string): Window | null => {
    if (url && !allowedUrl(url)) {
      refuse(String(url).slice(0, 60));
      return null;
    }
    return realOpen(url, target, features);
  };
  if (navigator.sendBeacon) navigator.sendBeacon = (url: string | URL) => (allowedUrl(url) ? true : (refuse('beacon'), false));
  const realXhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
    if (!allowedUrl(url)) throw refuse(new URL(String(url), location.href).host);
    return (realXhrOpen as (...a: unknown[]) => void).call(this, method, url, ...rest);
  } as typeof XMLHttpRequest.prototype.open;

  // What was copied in the application, the only thing that may be pasted.
  let copied = '';
  const remember = (e: ClipboardEvent): void => {
    // After the handlers of the application (this listens last, on the window).
    copied = normalize(e.clipboardData?.getData('text/plain') || window.getSelection()?.toString() || '');
  };
  window.addEventListener('copy', remember);
  window.addEventListener('cut', remember);
  const isOwn = (text: string): boolean => !!copied && normalize(text) === copied;
  window.addEventListener(
    'paste',
    (e) => {
      const data = e.clipboardData;
      if (!data) return;
      const text = data.getData('text/plain') || (data.getData('text/html') ? new DOMParser().parseFromString(data.getData('text/html'), 'text/html').body.textContent ?? '' : '');
      if (data.files.length || !isOwn(text)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        logEvent('paste-blocked');
        notify('paste-blocked');
      }
    },
    true,
  );
  // The clipboard read by a menu (Paste in the context menu).
  const clip = navigator.clipboard as (Clipboard & { read?: () => Promise<ClipboardItems> }) | undefined;
  if (clip) {
    const readText = clip.readText?.bind(clip);
    if (readText)
      clip.readText = async () => {
        const text = await readText();
        if (isOwn(text)) return text;
        logEvent('paste-blocked');
        notify('paste-blocked');
        throw new DOMException('Exam mode: pasting from outside is off', 'NotAllowedError');
      };
    if (clip.read)
      clip.read = async () => {
        throw new DOMException('Exam mode: pasting from outside is off', 'NotAllowedError');
      };
  }
  window.addEventListener(
    'drop',
    (e) => {
      if (!e.dataTransfer?.files.length && !e.dataTransfer?.types.includes('text/uri-list')) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      logEvent('drop-blocked');
      notify('drop-blocked');
    },
    true,
  );
  window.addEventListener('blur', () => logEvent('blur'));
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && logEvent('hidden'));
  document.addEventListener('fullscreenchange', () => !document.fullscreenElement && logEvent('fullscreen-exit'));
}
