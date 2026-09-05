// Verify P0 fixes: daily level entry, hit flash, event audio, chest grants.
import { chromium } from '/data/duchess/node_modules/playwright/index.mjs';

const URL = process.env.URL || 'http://127.0.0.1:4173/';
const OUT = '/tmp/shots';
import { mkdirSync } from 'node:fs';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome-stable',
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 1400 }, deviceScaleFactor: 2 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto(URL, { waitUntil: 'networkidle' });
await sleep(800);

// Daily level should be first in the list.
await page.evaluate(() => window.linmine.game.handlers.goToLevels());
await sleep(300);
const levels = await page.evaluate(() => [...document.querySelectorAll('.levelcard__name')].map((n) => n.textContent));
console.log('levels:', JSON.stringify(levels));
await page.screenshot({ path: `${OUT}/p0-01-levels-daily.png` });

// Start a run on level 1 (deterministic), dig a few, and check the
// wave-audio bridge exists.
await page.evaluate(() => window.linmine.game.handlers.selectLevel('sunlit_shaft'));
await sleep(200);
await page.evaluate(() => window.linmine.game.handlers.beginRun());
await sleep(600);

for (let i = 0; i < 6; i++) {
  const ok = await page.evaluate(() => {
    const run = window.linmine.game.getRun();
    if (!run || run.status !== 'running') return false;
    window.linmine.game.digCell(run.player.col, run.player.row + 1);
    return true;
  });
  if (!ok) break;
  await sleep(160);
}
const state = await page.evaluate(() => {
  const run = window.linmine.game.getRun();
  return run ? { depth: run.depth, dur: run.durability, status: run.status, cash: run.cash } : null;
});
console.log('after digs:', JSON.stringify(state));
console.log('digWaveSound exposed:', await page.evaluate(() => typeof window.linmine.game.digWaveSound === 'function'));
console.log('digLandSound exposed:', await page.evaluate(() => typeof window.linmine.game.digLandSound === 'function'));
await page.screenshot({ path: `${OUT}/p0-02-run.png` });

console.log('CONSOLE ERRORS:', errors.length);
for (const e of errors.slice(0, 10)) console.log('  -', e);
await browser.close();
console.log('DONE');
