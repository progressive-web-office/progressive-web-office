// Render public/icon.svg (and public/icon-maskable.svg for the maskable icon)
// to the PNG icons required by the web app manifest, as they are: square,
// no padding nor rounding (the platforms round them if they want).
// Usage: node scripts/render-icons.mjs  (requires @playwright/test + Chromium)
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const read = (name) => readFile(new URL(`../public/${name}`, import.meta.url), 'utf8');
const icon = await read('icon.svg');
// Full-bleed background, the mark inside the safe zone of masks (72 %).
const maskable = await read('icon-maskable.svg');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();
const targets = [
  { file: 'pwa-192x192.png', size: 192, svg: icon },
  { file: 'pwa-512x512.png', size: 512, svg: icon },
  { file: 'maskable-512x512.png', size: 512, svg: maskable },
  { file: 'apple-touch-icon.png', size: 180, svg: icon },
];
for (const t of targets) {
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(`<body style="margin:0;width:${t.size}px;height:${t.size}px">${t.svg.replace('<svg ', `<svg width="${t.size}" height="${t.size}" style="display:block" `)}</body>`);
  await page.screenshot({ path: new URL(`../public/${t.file}`, import.meta.url).pathname });
}
await browser.close();
