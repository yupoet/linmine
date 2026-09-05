# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Vite dev server at http://localhost:5173
npm run typecheck    # tsc --noEmit (strict, noUnusedLocals/noUnusedParameters)
npm test             # vitest run — unit + property + integration, all must pass
npm run test:watch   # vitest watch mode
npx vitest run tests/unit/chain.test.ts             # one test file
npx vitest run tests/unit/chain.test.ts -t "widens"  # one test by name
npm run sim          # balance report: bot plays every level; args [runsPerLevel] [pickaxeLevel]
npm run build        # typecheck + vite build -> dist/
npm run deploy       # build + wrangler pages deploy (rarely needed — CI deploys on push to main)
```

There is no linter. Quality gates before pushing: `npm run typecheck` clean, `npm test` green, `npm run sim` shows no unexplained drift versus the balance tables in README.md / docs/HANDOFF.md, and `node scripts/visual.mjs` reports zero console errors. CI (`.github/workflows/ci.yml`, Node 22) runs typecheck → tests → a 200-run sim → build, then deploys to Cloudflare Pages on push to `main`. Every push to main goes live.

**Browser debug hooks**: `?dev=1` (perf overlay + analytics export), `?seed=12345` (fixed run seed). `window.linmine.game` exposes `digCell(col,row)`, `handlers`, `getRun()`, `getProfile()`. Automation should drive real digs through `digCell` rather than synthesizing state.

**Headless visual check**: `node scripts/visual.mjs` (also `visual-i18n.mjs`, `visual-p0.mjs`). These import Playwright from the hardcoded path `/data/duchess/node_modules` and launch `/usr/bin/google-chrome-stable` against `http://127.0.0.1:4173/` (run `npm run preview` first). Screenshots go to `/tmp/shots`. Images cannot be viewed in this CLI, so rely on the scripts' DOM assertions and console-error checks.

## Architecture

**Lin Mine (林脉)** is a portrait mobile-web 3D tap-to-dig mining game built with Three.js + TypeScript + Vite. No game engine, no physics, no backend. Original work in the *genre* of Pocket Mine 2 — nothing copied (see THIRD_PARTY_NOTICES.md). Default language is Chinese; English is opt-in.

### The rule that shapes everything

Dependency direction is one-way and must never be violated:

```
render/  ui/  platform/  →  app/  →  core/  config/
```

`src/core/` + `src/config/` form a **deterministic pure simulation**: a run is a pure function of `(seed, level, build, commands)`. They must never import Three.js, the DOM, `localStorage`, `Math.random`, or the wall clock — everything is injected. This buys three things: replay (`src/devtools/replay.ts` encodes a run as a short string), headless batch balance (`npm run sim` via `src/devtools/simulate.ts`), and integration tests that drive the whole game with a stub UI and renderer (`tests/integration/loop.test.ts`).

### Layers

- `src/config/` — versioned data tables. `blocks.ts` (11 block kinds, costs, cash), `levels.ts` (5 story levels plus `daily_YYYYMMDD` shafts derived from a UTC date seed), `cards.ts` (8 cards; effects are pure data folded by `core/modifiers.ts`), `economy.ts` (pickaxe costs, 3 chest tiers, settlement). `version.ts`: any config change that alters simulation results must bump `CONFIG_VERSION`; any save-shape change must bump `SAVE_SCHEMA_VERSION` and add a migration step in `core/save.ts`.
- `src/core/` — rules only. `rng.ts` (hash32-derived streams), `grid.ts` (lazy row streaming from `hash(seed, salt, row)`), `generation.ts` (ore clumps, caves, bedrock rules that guarantee solvability, full-width Exit layer at `targetDepth`), `pathfind.ts` (BFS reachability with one-way falls — falling is a decision, not an undo), `run.ts` (`createRun`/`applyDig`, wave-based chain resolution: wave 0 is the tapped block and costs durability, later waves are free), `modifiers.ts` (card pipeline: base → additive → clamp), `save.ts` (sanitize/migrate; never throws, corrupt saves fall back).
- `src/app/` — the state machine. `contracts.ts` is **owned by app**: render/ui import `RendererAPI`, `UIAPI`, view models and `UIHandlers` from it but must not edit it. `game.ts` orchestrates the 7 screens, builds view models, owns tutorial/toast/audio timing. `profile.ts` is meta progression (chests, cards, run recording).
- `src/render/` — Three.js view of a `RunState`; never mutates game state. `index.ts` holds the dig sequencer: a tap is laid out as absolute times (walk 0.1s/cell + swing 0.16s + chain stagger 0.09s) compressed into `DIG_BUDGET=0.75s`; falls never compress. `blocks.ts` is one `InstancedMesh` with recycled slots plus hit-flash. `roundedBox.ts` is a local copy of a three.js example (MIT).
- `src/ui/` — DOM screens, pure views consuming view models and calling back through handlers. `index.ts` builds all screens; **a language switch rebuilds the whole UI** through the `rebuildUI` factory passed from `main.ts`.
- `src/platform/` — `storage.ts` (checksummed envelope at `linmine.save` + `linmine.save.bak` backup; in-memory fallback in private mode), `audio.ts` (all SFX synthesized with WebAudio, no audio files), `clock.ts` (rAF with clamped dt), `input.ts` (pointer with tap slop).
- **Themes (skins)** — `src/config/theme.ts` defines `ThemeId = 'candy' | 'ember'` (candy default, ember is the original look). The choice lives in `profile.settings.theme` (save schema v2) and is mirrored as plain text at `localStorage['linmine.theme']` so the inline script in `index.html` can paint the right skin before any module loads. UI side: `<html data-theme>` and `.ui[data-theme]`; the base `.ui {}` block in `styles.css` IS ember, `src/ui/theme-candy.css` only overrides candy. Render side: `src/render/themes/*` `RenderTheme` objects; render never reads CSS variables. `RendererAPI.setTheme` defers the rebuild until the dig sequencer is idle. Style rules: `docs/art/STYLE_BIBLE.md`. Visual scripts take `THEME=candy|ember`; `scripts/ui-shots.mjs` gives deterministic DOM-only screenshots for pixel diffs.
- **Characters** — `src/config/characters.ts` defines `CharacterId = 'girl' | 'boy' | 'robot'` (girl default; save schema v3 `settings.character`). Visual recipes (palette + headgear + skirt) live in `src/render/characters.ts` and are built by `minerParts.chibi(recipe)`; characters only reskin the candy chibi miner, ember always uses classic. `RendererAPI.setCharacter` shares `setTheme`'s deferred idle-frame rebuild.
- `src/i18n/` — English strings are the keys; the `zh` dictionary maps them to Chinese. Use `t('Need {n} more cash', {n})`. Missing keys silently fall back to English. `tCardDesc`/`tChest`/`tLevel` localize config data.
- `src/main.ts` — wires everything; late-binds `UIHandlers` via a Proxy because the UI is built before the game exists. Registers `public/sw.js` for offline play.

### Conventions that bite if missed

- **Imports use `.ts` extensions** (`from './grid.ts'`) — the repo relies on `allowImportingTsExtensions`.
- **Dig audio is event-driven**: the renderer fires `onWave`/`onLand` at the true on-screen impact frame → `game.digWaveSound`/`digLandSound`. Never schedule dig sounds with `setTimeout` estimates (that caused a 0.6s drift bug).
- **Reward chests are granted exactly once**, in `buildResult` at settlement; `claimResult` only clears the pending board. Double-granting was a real bug.
- **Daily shafts** (`daily_*` ids) sit outside the story unlock ladder: clearing one must not unlock story levels, and `sanitizeProfile` must preserve their records.
- **BlockField slot recycling**: instance slots are swapped on removal, so any per-slot state (hit flash etc.) must be invalidated in `removeAt`/`reset`.
- **Balance changes require a sim run**: edit a number in `config/` → `npm run sim` → compare win rate / avg cash against the current table before pushing.
- **New user-facing strings** must go through `t()` **and** get a `zh` entry in `src/i18n/index.ts`. Typecheck will not catch omissions; the Chinese UI will just show English.
- `window.linmine` is a debug surface only. Remove or make it read-only before adding any leaderboard.

### Tests

`tests/unit/` covers rng, generation, pathfind, run, chain, save, economy, and `property.test.ts` (400 random runs asserting legality). `tests/integration/loop.test.ts` drives the full app loop with stub UI/renderer and asserts on localized **zh** toast strings. `tests/helpers/grid.ts` turns ASCII maps into a `Grid` (`.` air, `@` start, `d` dirt, `s` stone, `c` copper, `g` gold, `b` bedrock, `x` goal, `B` blast, `A`/`a` drill, `r` supply, `v` vault; `floor: true` adds bedrock below). Most historical test failures were wrong fixture assumptions (e.g. fall-through adjacency), so read the map comments before blaming the code.

## Deploy and credentials

CI deploys to Cloudflare Pages project `linmine` (live at `linmine.yupoet.com` and `linmine.pages.dev`) using GitHub secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. The token is Pages-scoped and **requires** the account ID alongside it, or wrangler's membership lookup returns 403. Local deploy credentials live in the gitignored `.env` (`source .env && npm run deploy`). Wrangler 4 needs Node ≥ 22.

## Further reading

- `docs/HANDOFF.md` — full handoff (Chinese): conventions, numeric snapshot, remaining P1/P2 roadmap
- `docs/REVIEW_KIMI.md` — external game-design review driving the roadmap
- `PROJECT_PLAN.md` — original plan, milestones, gates
- `CODEBUDDY.md` — equivalent guide for the CodeBuddy CLI; keep the two in sync when conventions change
