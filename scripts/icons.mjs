// Regenerates the PWA PNG icons (public/icons/icon-*.png) by rasterising
// public/favicon.svg with a headless Chrome via Playwright. Re-run this
// script any time favicon.svg changes.
//
// Usage: node scripts/icons.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from '/data/duchess/node_modules/playwright/index.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const svgPath = path.join(root, 'public', 'favicon.svg');
const iconsDir = path.join(root, 'public', 'icons');

const SIZES = [
  { size: 180, file: 'icon-180.png' },
  { size: 192, file: 'icon-192.png' },
  { size: 512, file: 'icon-512.png' },
];

async function main() {
  const svg = readFileSync(svgPath, 'utf8');
  mkdirSync(iconsDir, { recursive: true });

  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome-stable',
    args: ['--no-sandbox'],
  });

  try {
    for (const { size, file } of SIZES) {
      const page = await browser.newPage({
        viewport: { width: size, height: size },
        deviceScaleFactor: 1,
      });

      const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  html, body { margin: 0; padding: 0; background: #f7ecd2; }
  svg { display: block; width: ${size}px; height: ${size}px; }
</style>
</head>
<body>${svg}</body>
</html>`;

      await page.setContent(html, { waitUntil: 'load' });
      const outPath = path.join(iconsDir, file);
      await page.screenshot({
        path: outPath,
        clip: { x: 0, y: 0, width: size, height: size },
      });
      await page.close();
      console.log(`wrote ${outPath} (${size}x${size})`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
