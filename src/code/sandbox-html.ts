/**
 * The code sandbox document (CODE-003). It is loaded as the `srcdoc` of an
 * `<iframe sandbox="allow-scripts">`, so it runs with an opaque origin: no
 * access to the application's storage, keys or DOM. Its own policy forbids
 * every network request; the only channel is `postMessage` with the
 * application, which also hands it the worker code and the Python runtime
 * files. The code runs in a worker so that it can be stopped at any time.
 *
 * This module has no imports: vite.config.ts reads it to allow the inline
 * bootstrap script by hash in the application's Content-Security-Policy.
 */

/** Relays messages between the application and the code worker. */
export const SANDBOX_BOOTSTRAP = `
let worker;
addEventListener('message', (event) => {
  if (event.source !== parent) return;
  const message = event.data;
  if (message && message.type === 'start') {
    const url = URL.createObjectURL(new Blob([message.workerSource], { type: 'text/javascript' }));
    // Opaque-origin documents cannot start module workers from blob: URLs; dynamic import() works in a classic one.
    worker = new Worker(url);
    worker.onmessage = (e) => parent.postMessage(e.data, '*', e.data && e.data.transfer ? e.data.transfer : []);
    worker.onerror = (e) => parent.postMessage({ type: 'fatal', message: e.message || 'The sandbox could not start.' }, '*');
  } else if (worker) {
    worker.postMessage(message, message && message.transfer ? message.transfer : []);
  }
});
parent.postMessage({ type: 'ready' }, '*');
`;

/** Policy of the sandbox document: scripts only from the bootstrap and blob: URLs it creates, no network. */
export function sandboxPolicy(bootstrapHash: string): string {
  return [
    "default-src 'none'",
    `script-src '${bootstrapHash}' blob: 'wasm-unsafe-eval'`,
    'worker-src blob:',
    'connect-src blob: data:',
    'img-src blob: data:',
    "style-src 'unsafe-inline'",
  ].join('; ');
}

/** SHA-256 of the bootstrap script, in CSP source syntax. */
export async function bootstrapHash(digest: (data: Uint8Array) => Promise<ArrayBuffer | Uint8Array>): Promise<string> {
  const bytes = new Uint8Array(await digest(new TextEncoder().encode(SANDBOX_BOOTSTRAP)));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return `sha256-${btoa(binary)}`;
}

export function sandboxSrcdoc(hash: string): string {
  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    `<meta http-equiv="Content-Security-Policy" content="${sandboxPolicy(hash)}">` +
    `</head><body><script>${SANDBOX_BOOTSTRAP}</script></body></html>`
  );
}
