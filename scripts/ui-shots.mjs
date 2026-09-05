// Deterministic DOM-only screenshots for CSS regression on the UI layer.
// Not part of the shipped app: hides the WebGL canvas, pins the run seed and
// forces calm motion so every capture is byte-stable between runs.
import { chromium } from '/data/duchess/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';

const URL = process.env.URL || 'http://127.0.0.1:4173/?seed=12345';
const OUT = process.env.OUT || '/tmp/shots-ui';
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

const THEME = process.env.THEME === 'ember' ? 'ember' : 'candy';
await page.addInitScript((theme) => {
  try { localStorage.setItem('linmine.theme', theme); } catch (err) { /* private mode */ }
  // Meta progression (starter card grants, chest rolls) is the app's only
  // Math.random consumer. Pin it so the draft, result and shop panels hold the
  // same content on every run and a pixel diff means a CSS change.
  let seed = 0x9e3779b9;
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}, THEME);

await page.goto(URL, { waitUntil: 'networkidle' });
await sleep(700);
await page.addStyleTag({ content: '#app > canvas, canvas { visibility: hidden !important }' });
await page.evaluate((theme) => {
  window.linmine.game.handlers.setTheme(theme);
  window.linmine.game.handlers.setReducedMotion(true);
}, THEME);
await sleep(200);

const shot = async (name) => { await sleep(260); await page.screenshot({ path: `${OUT}/${name}.png` }); };
const go = (fn, ...a) => page.evaluate(([f, args]) => window.linmine.game.handlers[f](...args), [fn, a]);

// Screens whose content comes from meta progression (owned cards, chest rolls,
// how far a scripted run happened to get) are driven from fixed view models
// pushed straight into the UI, so a pixel diff can only mean a CSS change.
const CARDS = [
  { id: 'a', name: '矿脉直觉', family: 'generation', level: 2, maxLevel: 5, description: '矿石出现概率提高 20%。', owned: true, selected: true },
  { id: 'b', name: '鉴定师', family: 'income', level: 1, maxLevel: 5, description: '矿石售出价格提高 20%。', owned: true, selected: false },
  { id: 'c', name: '松软土层', family: 'durability', level: 3, maxLevel: 5, description: '挖土与岩石的耐久消耗降低 1.00。', owned: true, selected: true },
  { id: 'd', name: '连锁反应', family: 'chain', level: 0, maxLevel: 4, description: '连锁范围扩大一格。', owned: false, selected: false },
];

await page.exposeFunction('__noop', () => undefined);

await go('goToTitle'); await shot('01-title');
await go('goToLevels'); await shot('02-levels');
await go('goToSettings'); await shot('03-settings');

await page.evaluate((cards) => {
  const ui = window.linmine.ui;
  ui.renderDraft({
    levelId: 'sunlit_shaft', levelName: '向阳矿坑', targetDepth: 54, durability: 56,
    cards, selectedIds: ['a', 'c'], maxCards: 3,
  });
  ui.setScreen('draft');
}, CARDS);
await shot('04-draft');

await page.evaluate(() => {
  const ui = window.linmine.ui;
  // setScreen('run') resets the HUD counters, so paint the values after it.
  ui.setScreen('run');
  ui.renderHud({
    durability: 38, maxDurability: 56, cash: 212, depth: 23, targetDepth: 54,
    chains: 3, levelName: '向阳矿坑', banner: null,
  });
  ui.setTutorial({ id: 'dig', text: '点击发光的方块进行挖掘。矿工会走过去挥镐。', anchor: 'grid' });
  ui.toast('测试提示 Toast');
});
await shot('05-hud');
await page.evaluate(() => window.linmine.ui.setTutorial(null));

await page.evaluate((cards) => {
  const ui = window.linmine.ui;
  ui.renderResult({
    won: true, reason: 'reached', levelName: '向阳矿坑', depth: 54, targetDepth: 54,
    cashCollected: 128,
    settlement: { runCash: 128, winBonus: 60, depthBonus: 27, total: 215 },
    rewardTier: 'common', pendingChests: ['common'],
    stats: { digs: 41, chains: 7, bestChain: 5, oresMined: 12, blocksMined: 41, falls: 6 },
    unlockedLevelName: '回声深井',
  });
  ui.setScreen('result');
  ui.renderShop({
    cash: 940, pickaxeLevel: 2, pickaxeMaxLevel: 6, upgradeCost: 320, nextDurabilityBonus: 12,
    cards,
    chests: {
      common: { name: '普通宝箱', cost: 150, cards: 1 },
      rare: { name: '稀有宝箱', cost: 420, cards: 2 },
      epic: { name: '史诗宝箱', cost: 900, cards: 3 },
    },
    pendingChests: ['common'],
  });
}, CARDS);
await shot('06-result');
await page.evaluate(() => window.linmine.ui.setScreen('shop'));
await shot('07-shop');

console.log('theme:', THEME, 'CONSOLE ERRORS:', errors.length);
for (const e of errors.slice(0, 20)) console.log('  -', e);
await browser.close();
console.log('DONE ->', OUT);
