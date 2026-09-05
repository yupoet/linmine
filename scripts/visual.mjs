// Headless visual verification + automation harness for lin-mine.
// Uses the cached Chromium from /data/duchess/node_modules (Playwright).
import { chromium } from '/data/duchess/node_modules/playwright/index.mjs';

const URL = process.env.URL || 'http://127.0.0.1:4173/';
const OUT = '/tmp/shots';
import { mkdirSync } from 'node:fs';
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome-stable',
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 1400 }, deviceScaleFactor: 2 });

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

// Skin under test: written before navigation so index.html's boot script picks
// it up on the very first paint. Defaults to candy, like the game itself.
const THEME = process.env.THEME === 'ember' ? 'ember' : 'candy';
await page.addInitScript((theme) => {
  try { localStorage.setItem('linmine.theme', theme); } catch (err) { /* private mode */ }
}, THEME);
console.log('theme:', THEME);

await page.goto(URL, { waitUntil: 'networkidle' });
await sleep(800);

// The mirror key only drives the first paint; the loaded profile is the real
// source of truth, so push the skin through the app once the handle exists.
await page.evaluate((theme) => {
  window.linmine.game.handlers.setTheme(theme);
  window.linmine.game.handlers.goToTitle();
}, THEME);
await sleep(300);

// Boot handle should exist.
const hasHandle = await page.evaluate(() => !!window.linmine?.game);
console.log('hasHandle:', hasHandle);

await page.screenshot({ path: `${OUT}/01-title.png` });

// Go to levels, pick level 1, begin a run.
await page.evaluate(() => window.linmine.game.handlers.goToLevels());
await sleep(300);
await page.screenshot({ path: `${OUT}/02-levels.png` });

await page.evaluate(() => window.linmine.game.handlers.selectLevel('sunlit_shaft'));
await sleep(300);
await page.screenshot({ path: `${OUT}/03-draft.png` });

await page.evaluate(() => window.linmine.game.handlers.beginRun());
await sleep(600);
await page.screenshot({ path: `${OUT}/04-run-start.png` });

// Drive a sequence of real digs via the app path, screenshot mid-way.
async function dig(col, row) {
  await page.evaluate(([c, r]) => window.linmine.game.digCell(c, r), [col, row]);
  await sleep(120);
}

// Probe: read the current run state.
const state0 = await page.evaluate(() => {
  const run = window.linmine.game.getRun();
  return run ? { col: run.player.col, row: run.player.row, depth: run.depth, dur: run.durability, status: run.status } : null;
});
console.log('run start:', JSON.stringify(state0));

// Dig the block directly under the miner to fall, then a few around.
const plan = [];
for (let i = 0; i < 12; i++) {
  const s = await page.evaluate(() => {
    const run = window.linmine.game.getRun();
    if (!run || run.status !== 'running') return null;
    const c = run.player.col;
    // dig straight down (the block beneath the miner), which is always legal
    const target = { col: c, row: run.player.row + 1 };
    return { c, row: run.player.row, dur: run.durability, depth: run.depth, status: run.status, target };
  });
  if (!s) { console.log('run ended early:', JSON.stringify(await page.evaluate(() => { const r = window.linmine.game.getRun(); return r ? { status: r.status, depth: r.depth } : null; }))); break; }
  plan.push(s.target);
  await dig(s.target.col, s.target.row);
  if (i === 5) await page.screenshot({ path: `${OUT}/05-run-mid.png` });
}
await page.screenshot({ path: `${OUT}/06-run-after.png` });

const state1 = await page.evaluate(() => {
  const run = window.linmine.game.getRun();
  return run ? { depth: run.depth, dur: run.durability, status: run.status, cash: run.cash } : null;
});
console.log('run after digs:', JSON.stringify(state1));

console.log('CONSOLE ERRORS:', errors.length);
for (const e of errors.slice(0, 20)) console.log('  -', e);

await browser.close();
console.log('DONE');
