/**
 * PDF-020: Typst typesets the PDF away from the page, so that the window
 * stays responsive. The engine (WebAssembly) and the fonts are downloaded
 * once, then read from the cache, offline too.
 */
import init, * as wasm from '@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler.mjs';
import { createEngine, type TypstEngine } from './typst-engine';
import { TYPST_HASHES } from './typst-hashes';

export interface TypstRequest {
  id: number;
  wasmUrl: string;
  fontUrls: string[];
  source: string;
  files: [string, Uint8Array][];
  equations: { latex: string; typst: string }[];
}

export type TypstReply = { id: number; pdf: Uint8Array } | { id: number; error: string } | { id: number; progress: 'engine' | 'fonts' | 'typeset' };

const CACHE = 'pwo-typst';

const hex = (buf: ArrayBuffer): string => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

/** A download checked against its SHA-256, from the cache when it was made (and checked) before. */
async function cached(url: string): Promise<Uint8Array> {
  let cache: Cache | undefined;
  try {
    cache = await caches.open(CACHE);
    const hit = await cache.match(url);
    if (hit) return new Uint8Array(await hit.arrayBuffer());
  } catch {
    cache = undefined;
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  const bytes = new Uint8Array(await r.arrayBuffer());
  const expected = TYPST_HASHES[url.replace('https://cdn.jsdelivr.net/', '')];
  if (!expected || hex(await crypto.subtle.digest('SHA-256', bytes)) !== expected) throw new Error(`${url}: checksum mismatch`);
  try {
    await cache?.put(url, new Response(bytes.slice(0)));
  } catch {
    /* not kept: downloaded again next time */
  }
  return bytes;
}

let ready: Promise<void> | undefined;
let engine: { fonts: string; engine: TypstEngine } | undefined;

const post = (reply: TypstReply): void => (self as unknown as Worker).postMessage(reply, 'pdf' in reply ? [reply.pdf.buffer] : []);

self.onmessage = async (e: MessageEvent<TypstRequest>) => {
  const req = e.data;
  try {
    post({ id: req.id, progress: 'engine' });
    ready ??= cached(req.wasmUrl).then(async (bytes) => void (await init({ module_or_path: bytes })));
    // A failed download is tried again next time.
    await ready.catch((err: unknown) => {
      ready = undefined;
      throw err;
    });
    // The engine is built again only when the document needs other fonts.
    const key = req.fontUrls.join('\n');
    if (engine?.fonts !== key) {
      post({ id: req.id, progress: 'fonts' });
      const fonts = await Promise.all(req.fontUrls.map(cached));
      engine = { fonts: key, engine: await createEngine(wasm, fonts) };
    }
    post({ id: req.id, progress: 'typeset' });
    const pdf = engine.engine.typeset({ source: req.source, files: new Map(req.files), equations: req.equations });
    post({ id: req.id, pdf });
  } catch (err) {
    post({ id: req.id, error: err instanceof Error ? err.message : String(err) });
  }
};
