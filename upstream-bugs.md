# Upstream bugs

Issues found in third-party dependencies. Always include exact versions for
reproducibility.

## vitepress 1.6.4 — bundles vulnerable vite 5 / esbuild (dev-only)

- Packages: `vitepress@1.6.4` → `vite@5.4.x` → `esbuild@<=0.24.2`
- Advisory: [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99)
  (esbuild dev server accepts cross-origin requests)
- Impact on this project: documentation **dev server** only (`just docs-dev`);
  the published documentation and the application are not affected.
- Environment: Node.js 22.22.0, npm 10.9.4.
- Status: no fix available in the vitepress 1.x line; revisit when vitepress 2
  is stable.

## pdfjs-dist 6.3.289 — modern build requires `Map.prototype.getOrInsertComputed`

- Package: `pdfjs-dist@6.3.289` (`build/pdf.mjs`, `build/pdf.worker.mjs`).
- Symptom: `TypeError: this[#t].getOrInsertComputed is not a function` when
  rendering a page in Chromium 141 (Playwright 1.63.0 bundled browser,
  `chromium-1194`).
- Cause: the modern build relies on the TC39 "upsert" proposal
  (`Map.prototype.getOrInsertComputed`), not yet available in all current
  browsers.
- Workaround: the application imports `pdfjs-dist/legacy/build/pdf.mjs` and
  the matching legacy worker, which include a polyfill.
- Status: expected behaviour of the modern build (it targets the newest
  browsers); revisit when the method ships in all supported browsers.
