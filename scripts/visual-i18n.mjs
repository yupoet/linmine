// Visual check of the localized UI: default Chinese, toggle to English.
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

// Default should be Chinese.
const titleZh = await page.evaluate(() => document.title);
const titleText = await page.evaluate(() => document.querySelector('.title__name')?.textContent);
const tagline = await page.evaluate(() => document.querySelector('.title__tagline')?.textContent);
console.log('title:', titleZh, '| name:', titleText, '| tagline:', tagline);
await page.screenshot({ path: `${OUT}/i18n-01-title-zh.png` });

// Levels screen in Chinese.
await page.evaluate(() => window.linmine.game.handlers.goToLevels());
await sleep(300);
const levelNames = await page.evaluate(() => [...document.querySelectorAll('.levelcard__name')].map((n) => n.textContent));
console.log('levels zh:', JSON.stringify(levelNames));
await page.screenshot({ path: `${OUT}/i18n-02-levels-zh.png` });

// Settings in Chinese.
await page.evaluate(() => window.linmine.game.handlers.goToSettings());
await sleep(300);
const settingsText = await page.evaluate(() => document.querySelector('.switch__label')?.textContent);
console.log('settings first label zh:', settingsText);
await page.screenshot({ path: `${OUT}/i18n-03-settings-zh.png` });

// Switch to English via the handler (as the button would).
await page.evaluate(() => window.linmine.game.handlers.setLang('en'));
await sleep(300);
const titleEn = await page.evaluate(() => document.title);
const settingsTextEn = await page.evaluate(() => document.querySelector('.switch__label')?.textContent);
console.log('after switch: title:', titleEn, '| settings label:', settingsTextEn);
await page.screenshot({ path: `${OUT}/i18n-04-settings-en.png` });

// Levels in English.
await page.evaluate(() => window.linmine.game.handlers.goToLevels());
await sleep(300);
const levelNamesEn = await page.evaluate(() => [...document.querySelectorAll('.levelcard__name')].map((n) => n.textContent));
console.log('levels en:', JSON.stringify(levelNamesEn));
await page.screenshot({ path: `${OUT}/i18n-05-levels-en.png` });

// Back to Chinese, start a run, check HUD.
await page.evaluate(() => window.linmine.game.handlers.setLang('zh'));
await sleep(300);
await page.evaluate(() => window.linmine.game.handlers.selectLevel('sunlit_shaft'));
await sleep(200);
await page.evaluate(() => window.linmine.game.handlers.beginRun());
await sleep(600);
const hudDepth = await page.evaluate(() => document.querySelector('.hud__depth-goal')?.textContent);
console.log('hud depth goal zh:', hudDepth);
await page.screenshot({ path: `${OUT}/i18n-06-run-zh.png` });

console.log('CONSOLE ERRORS:', errors.length);
for (const e of errors.slice(0, 10)) console.log('  -', e);
await browser.close();
console.log('DONE');
