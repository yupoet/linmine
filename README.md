# Lin Mine

A mobile-web, portrait, tap-to-dig mining game: spend a limited pickaxe
breaking through a destructible shaft, trigger chain reactions, fall for free
depth, and reach the goal layer before the pick wears out.

Built with **Three.js + TypeScript + Vite**. No physics engine, no game engine,
no backend.

> Lin Mine is an original game in the *genre* of Pocket Mine 2. Nothing is
> copied from any commercial title — see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm run test       # 161 unit + integration + balance tests
npm run typecheck
npm run build      # -> dist/
npm run sim        # balance report for every level (bot play)
```

Debug helpers: append `?dev=1` for a perf overlay and `?seed=12345` to force a
run seed (useful with the replay codec in `src/devtools/replay.ts`).

Two switchable skins (settings → 皮肤): **candy** (default, Happy-Mall-style
toon look) and **ember** (the original look). Visual scripts take
`THEME=candy|ember`.

## How it plays

- Tap any **glowing** block next to the miner. He walks there (or steps off a
  ledge and falls) and swings. One tap = one intent.
- Digging costs **durability**; walking and falling are free.
- **Blast crates** clear a 3×3, **drill charges** clear a line. Chains cascade
  into each other and cost no extra durability.
- **Supply crates** restore durability. **Vaults** pay out.
- The target depth is a full-width **goal layer** — break any cell of it to win.
- Run out of durability (or get walled in) and the run ends; you keep the cash
  you collected, minus the win bonus.

Between runs: cash buys **pickaxe upgrades** (+durability) and **crates**
(cards). Up to **3 cards** are equipped per run, across four families:
generation, income, durability, chain.

## Architecture

```
src/
  core/       pure rules: rng, grid streaming, generation, pathfinding, dig resolution
  config/     versioned tables: blocks, levels, cards, economy
  app/        state machine, meta progression, contracts, analytics
  render/     Three.js scene, instanced blocks, miner, FX
  ui/         DOM HUD, menus, draft, result, shop, tutorial
  platform/   input, storage (backup + checksum), synthesised audio, clock
  devtools/   batch simulator, replay codec, perf overlay
```

Dependency direction is one-way: `render/ui/platform → app → core/config`.
`core` never imports Three.js, the DOM, `localStorage`, `Math.random` or the
wall clock — everything is injected, so a run is a pure function of
`(seed, level, build, commands)`.

That buys three things: **replay** (a bug report is a short string), **batch
balance** (`npm run sim` plays hundreds of full runs headlessly), and **tests
that can drive the whole game with stub UI and renderer**.

### Balance

Numbers are measured, not guessed (`npm run sim`, seed base fixed at 1000).
Current snapshot with a competent bot, no cards, level-1 pickaxe:

| Level | Target | Win rate | Avg taps | Avg depth progress |
|---|---:|---:|---:|---:|
| Sunlit Shaft | 54 | ~62% | 33 | 96% |
| Copper Gorge | 70 | ~60% | 41 | 95% |
| The Deep Shelf | 90 | ~63% | 52 | 95% |
| Molten Reach | 112 | ~49% | 62 | 93% |
| The Long Dark | 140 | ~44% | 73 | 91% |

Most losses land within ~10% of the goal, which is what makes "one more run"
the natural reaction. At pickaxe level 10 the first levels flip to ~99%, and
the last one stays tense.

Change a number, run `npm run sim`, and compare against this table.

## Engineering notes

- **Determinism**: rows are derived from `hash(seed, salt, row)`, so the grid
  streams lazily and still replays exactly.
- **Streaming**: only rows near the miner exist as instances; blocks live in a
  single `InstancedMesh` with recycled slots (three.js cannot delete an
  instance).
- **Solvability**: generation guarantees no two bedrock side by side and at
  least two diggable columns per row, so a run cannot be made impossible.
- **Saves**: checksummed envelope + a backup copy; a corrupt or unknown save
  falls back instead of throwing, and migrations run one version at a time.
- **No third-party analytics**: events stay in a capped local buffer that
  `?dev=1` can export as JSON.

## Deploy

Static output, deployed to Cloudflare Pages:

```bash
npm run deploy    # build + `wrangler pages deploy dist --project-name linmine`
```

## Docs

- [PROJECT_PLAN.md](PROJECT_PLAN.md) — milestones, gates, risk register
- [docs/ASSETS.md](docs/ASSETS.md) — minimal art asset list and placeholder boundary
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) — licences and reuse boundary
