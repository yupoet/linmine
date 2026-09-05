# CODEBUDDY.md

This file provides guidance to CodeBuddy Code when working with code in this repository.

## Commands

```bash
npm run dev          # dev server at http://localhost:5173
npm run typecheck    # tsc --noEmit — strict, noUnusedLocals/noUnusedParameters
npm test             # vitest run (111 tests: unit + property + integration)
npm run test:watch   # vitest watch mode
npx vitest run tests/unit/chain.test.ts            # single test file
npx vitest run tests/unit/chain.test.ts -t "widens" # single test by name
npm run sim          # balance report (bot plays every level; args: [runs/level] [pickaxeLevel])
npm run build        # typecheck + vite build -> dist/
npm run deploy       # build + wrangler pages deploy (rarely needed — CI auto-deploys on push to main)
```

There is no linter; typecheck + tests + sim are the quality gates. CI (`.github/workflows/ci.yml`) runs typecheck, tests, a 200-run balance sim, build, then deploys to Cloudflare Pages — all pushes to main go live automatically.

Debug helpers in the browser: `?dev=1` (perf overlay), `?seed=12345` (fixed run seed). `window.linmine.game` exposes `digCell(col,row)`, `handlers`, `getRun()`, `getProfile()` — use `digCell` to drive real digs in automation instead of synthesizing state.

Headless visual verification: `node scripts/visual.mjs` (Playwright + `/usr/bin/google-chrome-stable`, screenshots to /tmp/shots, fails on console errors). Similar: `visual-i18n.mjs`, `visual-p0.mjs`.

## Architecture

**Lin Mine (林脉)** is a portrait mobile-web 3D tap-to-dig mining game (original work in the *genre* of Pocket Mine 2 — nothing copied; see THIRD_PARTY_NOTICES.md). Default language is Chinese; English is opt-in.

### The one rule that shapes everything

Dependency direction is one-way and must never be violated:

```
render/  ui/  platform/  →  app/  →  core/  config/
```

`src/core/` + `src/config/` are a **deterministic pure simulation**: a run is a pure function of `(seed, level, build, commands)`. They must never import Three.js, the DOM, `localStorage`, `Math.random`, or the wall clock — everything is injected. This buys replay (`src/devtools/replay.ts` encodes a whole run as a short string), headless batch balance (`npm run sim`), and integration tests that drive the full game with stub UI/renderer (`tests/integration/loop.test.ts`).

### Layers

- `src/config/` — versioned data tables: `blocks.ts` (11 block kinds, costs/cash), `levels.ts` (5 story levels + `daily_YYYYMMDD` daily shafts derived from a UTC date seed), `cards.ts` (8 cards; card effects are pure data folded by `core/modifiers.ts`), `economy.ts` (pickaxe costs, 3 chest tiers, settlement). `CONFIG_VERSION`/`SAVE_SCHEMA_VERSION` gate save migration.
- `src/core/` — rules only: `rng.ts` (hash32-derived streams), `grid.ts` (lazy row streaming from `hash(seed, salt, row)`), `generation.ts` (ore clumps, caves, bedrock rules guaranteeing solvability, full-width Exit goal layer at `targetDepth`), `pathfind.ts` (BFS reachability with one-way falls — falling is a real decision, not an undo), `run.ts` (`createRun`/`applyDig` with wave-based chain resolution), `modifiers.ts` (card effect pipeline: base → additive → clamp), `save.ts` (profile sanitize/migrate; `daily_*` level records survive sanitization).
- `src/app/` — the state machine. `contracts.ts` is **owned by the app layer**: render/ui import from it but must not edit it (RendererAPI, UIAPI, view models, UIHandlers). `game.ts` orchestrates screens, builds view models, owns tutorial/toasts/audio timing. `profile.ts` is meta progression (chests, cards, run recording).
- `src/render/` — Three.js view of a RunState. Never mutates game state. `index.ts` contains the dig sequencer: one tap is laid out as absolute times (walk 0.1s/cell + swing 0.16s + chain stagger, compressed into `DIG_BUDGET=0.75s`; falls never compress). `blocks.ts` is a single InstancedMesh with recycled slots + hit-flash reaction. `roundedBox.ts` is a local copy of the three.js example (MIT).
- `src/ui/` — DOM screens, pure views. `index.ts` builds all screens; language switching **rebuilds the whole UI** via the `rebuildUI` factory (static chrome is constructed once per instance).
- `src/platform/` — `storage.ts` (checksummed envelope + backup key; degrades to in-memory in private mode), `audio.ts` (all SFX synthesized with WebAudio — no audio files ship), `clock.ts` (rAF, clamped dt), `input.ts` (pointer with tap slop).
- `src/i18n/` — English strings are keys; `zh` dictionary maps them to Chinese. `t('Need {n} more cash', {n})` for params. Missing keys fall back to English silently — a new user-facing string without a dictionary entry shows English under zh. `tCardDesc`/`tChest` localize config data.

### Conventions that bite if missed

- **Imports use `.ts` extensions** (`from './grid.ts'`) — required by `allowImportingTsExtensions`.
- **Dig audio is event-driven**: the renderer fires `onWave`/`onLand` at the true on-screen impact moment → `game.digWaveSound`/`digLandSound`. Do not schedule dig sounds with `setTimeout` estimates (that was the old 0.6s-drift bug).
- **Reward chests are granted exactly once**, in `buildResult` (settlement time); `claimResult` only clears the pending board. Double-granting was a real bug.
- **Daily shafts** (`daily_*` ids) sit outside the story unlock ladder — first-clearing one must not unlock story levels, and `sanitizeProfile` keeps their records.
- **Renderer's BlockField slot recycling**: instance slots are swapped on removal, so any per-slot state (e.g. hit flash) must be invalidated in `removeAt`/`reset`.
- **Balance changes require a sim run**: change a number in `config/` → `npm run sim` → compare win rate/avg cash against the table in README/HANDOFF before pushing.
- Adding user-facing strings: put them through `t()` **and** add the zh entry in `src/i18n/index.ts` (typecheck won't catch omissions).

### Testing layout

`tests/unit/` (rng, generation, pathfind, run, chain, save, economy, property — the property tests play 400 random runs asserting legality), `tests/integration/loop.test.ts` (full app loop with stub UI/renderer — asserts on localized zh toast strings), `tests/helpers/grid.ts` (ASCII map → Grid for fixtures; read the map comments carefully — most historical test failures were wrong fixture assumptions, e.g. fall-through adjacency).

## Deploy & credentials

CI deploys push-to-main to Cloudflare Pages project `linmine` (live at `linmine.yupoet.com` and `linmine.pages.dev`) using GitHub secrets `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`. The token is Pages-scoped and **requires** `CLOUDFLARE_ACCOUNT_ID` to be set alongside it (otherwise wrangler's membership lookup 403s). Local deploy creds live in `/data/linmine/.env` (gitignored). Wrangler needs Node ≥22.

## Further reading

- `docs/HANDOFF.md` — full handoff: conventions, numeric snapshot, remaining P1/P2 roadmap
- `docs/REVIEW_KIMI.md` — external game-design review (B rating) driving the roadmap
- `PROJECT_PLAN.md` — original plan and gates
