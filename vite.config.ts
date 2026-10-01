import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/** Content-Security-Policy injected in production builds only (PLT-008). */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data: blob:",
  // https: for git hosting APIs (GitHub, GitLab, self-hosted) and the AI provider.
  "connect-src 'self' data: blob: https:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

const csp = (): Plugin => ({
  name: 'inject-csp',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
});

/**
 * Serve (dev) and emit (build) pdf.js runtime assets under `pdfjs/`:
 * CMaps, standard fonts, ICC profiles and WebAssembly decoders, so that PDF
 * rendering works offline without any CDN (PLT-002, PLT-004).
 */
const PDFJS_DIRS = ['cmaps', 'standard_fonts', 'wasm', 'iccs'];
const pdfjsRoot = resolve(import.meta.dirname, 'node_modules/pdfjs-dist');
const pdfjsAssets = (): Plugin => ({
  name: 'pdfjs-assets',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const m = /^\/pdfjs\/([a-z_]+)\/([^/?]+)/.exec(req.url ?? '');
      if (!m || !PDFJS_DIRS.includes(m[1]!)) return next();
      const file = join(pdfjsRoot, m[1]!, m[2]!);
      if (!existsSync(file) || !statSync(file).isFile()) return next();
      if (file.endsWith('.wasm')) res.setHeader('Content-Type', 'application/wasm');
      createReadStream(file).pipe(res);
    });
  },
  generateBundle() {
    for (const dir of PDFJS_DIRS) {
      for (const name of readdirSync(join(pdfjsRoot, dir))) {
        if (name.startsWith('quickjs')) continue; // PDF JavaScript is never executed (PDF-004)
        this.emitFile({ type: 'asset', fileName: `pdfjs/${dir}/${name}`, source: readFileSync(join(pdfjsRoot, dir, name)) });
      }
    }
  },
});

const fileTypes = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.oasis.opendocument.text': ['.odt'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.oasis.opendocument.spreadsheet': ['.ods'],
  'text/csv': ['.csv', '.tsv'],
  'text/markdown': ['.md', '.markdown'],
  'application/x-mdz': ['.mdz'],
  'application/x-tex': ['.tex'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
  'application/vnd.oasis.opendocument.presentation': ['.odp'],
  'application/pdf': ['.pdf'],
};

export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
  worker: { format: 'es' },
  plugins: [
    csp(),
    pdfjsAssets(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        id: './',
        name: 'Progressive Web Office',
        short_name: 'PWO',
        description: 'Documents, spreadsheets, presentations and PDF — privately, in your browser.',
        start_url: './',
        scope: './',
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone'],
        theme_color: '#1f5fbf',
        background_color: '#ffffff',
        categories: ['productivity', 'utilities'],
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
        // PLT-006: File Handling API (Chromium). Not yet in the manifest typings.
        ...({
          file_handlers: [{ action: './', accept: fileTypes, launch_type: 'single-client' }],
          // SHARE-003: receive files from QRShare or any app (handled by public/share-target.js).
          share_target: {
            action: './share-target',
            method: 'POST',
            enctype: 'multipart/form-data',
            params: { title: 'title', text: 'text', url: 'url', files: [{ name: 'file', accept: [...Object.keys(fileTypes), 'application/zip', 'application/x-zip-compressed', 'text/plain', ...Object.values(fileTypes).flat(), '.zip'] }] },
          },
        } as object),
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,wasm,bcmap,pfb,ttf}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: 'index.html',
        // The documentation is published under /docs/ on the same origin.
        navigateFallbackDenylist: [/\/docs(\/|$)/],
        importScripts: ['share-target.js'],
      },
    }),
  ],
});
