// Render public/icon.svg to the PNG icons required by the web app manifest.
// Usage: node scripts/render-icons.mjs  (requires @playwright/test + Chromium)
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const svg = await readFile(new URL('../public/icon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();
const targets = [
  { file: 'pwa-192x192.png', size: 192, pad: 0 },
  { file: 'pwa-512x512.png', size: 512, pad: 0 },
  { file: 'maskable-512x512.png', size: 512, pad: 0.1, bg: '#1f5fbf' },
  { file: 'apple-touch-icon.png', size: 180, pad: 0 },
];
for (const t of targets) {
  await page.setViewportSize({ width: t.size, height: t.size });
  const inner = Math.round(t.size * (1 - 2 * t.pad));
  await page.setContent(
    `<body style="margin:0;background:${t.bg ?? 'transparent'};display:grid;place-items:center;width:${t.size}px;height:${t.size}px">` +
      svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `) +
      '</body>',
  );
  await page.screenshot({ path: new URL(`../public/${t.file}`, import.meta.url).pathname, omitBackground: !t.bg });
}
await browser.close();
