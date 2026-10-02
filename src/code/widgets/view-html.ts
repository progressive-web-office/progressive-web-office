/**
 * The document of a widget view (CODE-016): an `<iframe sandbox="allow-scripts">`
 * (opaque origin) whose policy forbids every network request. Its only script
 * is the view runtime, allowed by hash here and in the application's policy
 * (vite.config.ts); widget modules are loaded from blob: URLs it creates.
 */
import VIEW_RUNTIME from './view-runtime.js?raw';

export { VIEW_RUNTIME };

export function viewPolicy(hash: string): string {
  return [
    "default-src 'none'",
    `script-src '${hash}' blob: 'wasm-unsafe-eval'`,
    'connect-src blob: data:',
    'img-src blob: data:',
    'font-src blob: data:',
    'media-src blob: data:',
    "style-src 'unsafe-inline'",
  ].join('; ');
}

/** SHA-256 of the runtime, in CSP source syntax. */
export async function viewHash(): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(VIEW_RUNTIME)));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return `sha256-${btoa(binary)}`;
}

export function viewSrcdoc(hash: string, dark: boolean): string {
  return (
    `<!doctype html><html${dark ? ' class="dark" style="color-scheme:dark"' : ''}><head><meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="${viewPolicy(hash)}">` +
    '<style>html,body{margin:0;padding:0;background:transparent;font:14px system-ui,sans-serif;color:' + (dark ? '#e6e9ef' : '#1c2430') + '}' +
    '#root{padding:4px 0;overflow:auto}.pwo-error{color:#b3261e;white-space:pre-wrap}.pwo-unsupported{color:#6b7685;font-style:italic}</style>' +
    `</head><body><div id="root"></div><script>${VIEW_RUNTIME}</script></body></html>`
  );
}
