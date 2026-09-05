# Implementation Plan: Candy Skin & Theme System

Spec (final): `docs/superpowers/specs/2026-09-05-candy-skin-and-theme-system-design.md`. Art: `docs/art/STYLE_BIBLE.md`.
Four streams in separate git worktrees, merged **P → R → U → A**. `ember` stays pixel-identical; `candy` implements the bible.
Rulings from external reviews (kimi CSS, codex Three.js, grok chibi/palette) are already folded in below and in the spec; do not re-open them.

## Ground rules (every stream)

- Only additive contract changes: `setTheme(theme: ThemeId): void` on `UIHandlers`, `UIAPI`, `RendererAPI`; `theme: ThemeId` on `SettingsView`. Nothing else in `src/app/contracts.ts`.
- `onWave`/`onLand` keep firing at the true impact frame (`src/render/index.ts` ~659/672). No `setTimeout` audio.
- `BlockField.removeAt/reset` keep invalidating per-slot state (`hitCell/hitSlot`); any new per-slot state (decal rect, hull) follows the same pattern.
- Class names used by `scripts/visual-*.mjs` are frozen: `.levelcard__name .title__name .title__tagline .switch__label .hud__depth-goal`. The settings skin control must be inserted **after** the language row (`visual-i18n.mjs` reads the first `.switch__label`).
- New strings go through `t()` with zh entries: `Skin`→`皮肤`, `Candy`→`糖果`, `Ember`→`余烬`.
- Imports use `.ts` extensions; strict TS (`noUnusedLocals/Parameters`). Render must not import from `ui/`; render reads colours from the `RenderTheme` object, never from CSS variables.
- Gates before handing back: `npm run typecheck`, `npm test`, and for R/U `node scripts/visual.mjs` (needs `npm run preview` on 4173).
- Do not commit; the orchestrator merges and commits.

---

## Stream P — Theme pipeline (merge 1st) — Opus

**P1 `src/config/theme.ts` (new) + `tests/unit/theme.test.ts` (new, write first).**
`THEME_IDS = ['candy','ember'] as const`, `ThemeId`, `DEFAULT_THEME = 'candy'`, `isThemeId(v: unknown): v is ThemeId`. Tests: both ids true; `'foo'`, `42`, `undefined` false; default is candy.

**P2 Save shape + migration.** Files: `src/config/version.ts` (`SAVE_SCHEMA_VERSION` 1→2), `src/core/save.ts`, `tests/unit/save.test.ts`.
`ProfileSettings.theme: ThemeId`; `createProfile()` default; `sanitizeProfile` validates via `isThemeId` else default; `migrateProfile` adds a `version < 2` step that fills `settings.theme` when absent (keep ladder order v0→v1→v2; idempotent). Tests first: createProfile default; sanitize garbage → candy; `migrateProfile({schemaVersion:1, cash:10})` → schemaVersion 2 + theme candy; round-trip through `serializeProfile` preserves `'ember'`; running migrate twice is a no-op. Check existing save tests that assert `schemaVersion === 1` and update them.

**P3 `src/platform/storage.ts` mirror key.** In `save()`, after the envelope write, best-effort `setItem('linmine.theme', profile.settings.theme)` with the same try/ignore pattern as `write()`. Never part of checksum; ignored on load. Test in `tests/unit/save.test.ts` or a new `tests/unit/storage.test.ts` with an injected in-memory store: save → mirror key equals theme; corrupt mirror key does not affect `load()`.

**P4 `src/app/contracts.ts`.** Add `theme: ThemeId` to `SettingsView` (after `lang`), `setTheme(theme: ThemeId): void` to `UIHandlers` (after `setLang`), `UIAPI` (before `dispose`), `RendererAPI` (after `dispose`). Import `ThemeId` from `../config/theme.ts`. In the same change, update `tests/integration/loop.test.ts` stubs (`createStubRenderer`, `createStubUi`) with `setTheme` recorders so typecheck stays green.

**P5 `index.html` boot.** Inline `<script>` in `<head>` (≤10 lines): `try { const t = localStorage.getItem('linmine.theme'); if (t === 'candy' || t === 'ember') document.documentElement.dataset.theme = t; } catch {}` then default `candy` when unset. Boot `<style>`: `html[data-theme="ember"] { --boot-bg:#1b1410; --boot-glow:#3a2a1d; --boot-fg:#f6ece0; --boot-title:#ffcc66; --boot-title-shadow:#6b4310; color-scheme: dark }` and `html[data-theme="candy"] { --boot-bg:#f7ecd2; --boot-glow:#fff8e7; --boot-fg:#3d2612; --boot-title:#fff8e7; --boot-title-shadow:#5a3a1e; color-scheme: light }`; `body/#boot/#fatal` consume the variables only. Comment that the two literal ids must track `THEME_IDS`.

**P6 Wiring.** Files: `src/app/game.ts`, `src/ui/settings.ts`, `src/ui/index.ts`, `src/i18n/index.ts`, `src/main.ts` (only if needed).
- `game.ts`: `setTheme(theme)` handler mirroring `setReducedMotion` (set profile, `renderer.setTheme`, `ui.setTheme`, save, re-render settings); in `boot()` call `renderer.setTheme(profile.settings.theme)` and `ui.setTheme(...)` next to the existing `setReducedMotion/setI18nLang`; add `theme` to the settings view builder. Also update `<meta name="theme-color">` content on theme change (`#1b1410` ember / `#f7ecd2` candy).
- `ui/index.ts`: implement `UIAPI.setTheme` → sets `document.documentElement.dataset.theme` and the `.ui` root `dataset.theme`; `createUI` initialises from `document.documentElement.dataset.theme ?? DEFAULT_THEME` (so the language-switch rebuild keeps the theme).
- `ui/settings.ts`: segmented control for skin reusing the `.langbtn` markup pattern (class it `skinbtn` + wrapper `settings__skin`), inserted **after** the language row and before the toggles; `render(view)` syncs it; `EMPTY_SETTINGS.theme = 'candy'`.
- Integration test: after boot `settings.theme === 'candy'`; `handlers.setTheme('ember')` reaches both stubs and persists (reload via a second `createGame` on the same storage → `'ember'`).

**P acceptance:** typecheck clean (render stub implements `setTheme` as a no-op if R has not landed — add the no-op in `src/render/index.ts` so main compiles), `npm test` green, `node scripts/visual.mjs` zero errors, `THEME=ember` and `THEME=candy` both boot (see I3).

---

## Stream R — Render skin (merge 2nd, branch from post-P main) — Opus

**R1 Extract ember first, parity test first.** New `src/render/themes/types.ts` (`RenderTheme` per spec §2.5, plus `radius/segments`, `miner: { variant: 'classic'|'chibi'; palette }`), `src/render/themes/ember.ts`, `tests/unit/render-theme-ember.test.ts`.
Move verbatim: `GRASS 0x6aa84f` (`blocks.ts:28`), highlight `0x7cf0b4/0xff5a45/0xfff3b0` (`blocks.ts:340-342`), hit-flash `0xffffff`, miner palette (`miner.ts:15-21`), lights (`index.ts` ctor: hemi `0xcfe9ff/0x3a2a1c/0.95`, sun `0xffffff/1.15`, lamp `0xffe6a8/1.2/6/1.8`), `SKY_COLOR/DEEP_COLOR/DARK_BY_ROW`, dust `0xb9a888` (`fx.ts:101`), popup colours (`dom.ts:32-36`) and label colours (`dom.ts:128`), block base/accent from `BLOCKS[kind]` (config keeps them; comment "ember 皮肤基色"). `shading:'standard'`, `outline.enabled:false`, `decals:false`, `radius 0.09`, `segments 2`. The test asserts each field equals the literal it replaced; write it against the current literals BEFORE touching consumers.

**R2 Consumers read the theme (ember only, zero visual change).** `blocks.ts`, `miner.ts`, `index.ts`, `fx.ts`, `dom.ts` take a `RenderTheme`; `SceneRenderer` constructs with the theme for `DEFAULT_THEME`... but since R lands after P, construct with `ember` when `DEFAULT_THEME` is candy only if candy is not yet implemented — i.e. R2 uses ember unconditionally, R3 switches. No per-frame allocation. Capture a baseline screenshot set BEFORE R2 (`node scripts/visual.mjs`, copy `/tmp/shots` to the scratchpad) and diff after: 0%.

**R3 `themes/candy.ts` + deferred `setTheme`.** Populate candy per bible §2/§4 **and §2.3 block overrides** (dirt `#8f5a2c`, bomb `#b02232`, vault body `#d4891a`; skin `cream-100`; lines `cocoa-900`). `setTheme(id)` stores `pendingTheme`; `update(dt)` applies it only when `!playing`, following spec §2.6 exactly (retain state/targets/hover/miner pose/camera/time/qualityScale; dispose main+hull+decal together; update existing light objects; `reset`, `updateAtmosphere`, `field.sync`, `pulseGoal`; restore miner, `highlights.set`, reduced-motion). Never call `setState` from the rebuild. Unit test: same-id call is a no-op (spy on dispose); pending theme applied on next idle `update`.

**R4 Candy block visuals.** `blocks.ts` (+ new `src/render/decals.ts` for the atlas):
- `MeshToonMaterial` + 3-step `DataTexture` ramp (Uint8 `[100,185,255]`, `RedFormat`, `NearestFilter`, no mipmaps, `NoColorSpace`); material type `MeshStandardMaterial | MeshToonMaterial`; `instanceColor` unchanged.
- Candy lighting: hemi sky == ground colour, sun direction ≈ `(-3, 6, 1)`, point light does not light blocks (lamp becomes a `sun-lt` glow sprite on the miner).
- Outline hull: geometry clone extruded along normals by 0.045 (not `scale`), `MeshBasicMaterial({color: 0x5a3a1e, side: BackSide, fog: false, toneMapped: false})`, `renderOrder 1`, `hull.instanceMatrix = mesh.instanceMatrix`; mirror `count`/`visible` after `add/removeAt/reset`; `instanceColor` null; dispose together. Test: hull shares the same attribute object and `count` mirrors after add/removeAt/reset.
- Geometry: `RoundedBoxGeometry(1,1,1,3,0.16)`; fallback segments 2 if the FPS gate fails.
- Decals: `InstancedMesh<PlaneGeometry(0.62,0.62).translate(0,0,0.507)>` sharing `instanceMatrix`, `MeshBasicMaterial({map, alphaTest:0.4, depthWrite:false, toneMapped:false})`, `InstancedBufferAttribute atlasRect(vec4)` injected via `onBeforeCompile` after `#include <uv_vertex>` (`vMapUv = vMapUv * atlasRect.zw + atlasRect.xy;`) with `customProgramCacheKey`; 4×4 padded 512² `CanvasTexture` drawn once: bomb eyes, drill arrow (down/side), repair cross+smile, vault coins, copper vein, gold vein+stars, exit stars/flags, transparent tile for plain blocks. `writeInstance` sets the rect so slot swaps stay correct.
- WebGL1 fallback: `capabilities.isWebGL2 === false` → standard shading for candy, keep outline+decals.
- Highlight colours from theme; candy affordable = `sun-lt` breathing.

**R5 Miner chibi.** Split `miner.ts` → `miner.ts` (rig, `update(dt)` unchanged) + `minerParts.ts` (`buildParts(theme)` returning parts + pivots). Keep the part hierarchy. Classic = current boxes and pivots (arms y 0.52 at ±0.25, legs y 0.24). Chibi per grok's table: arms pivot `(±0.22, 0.52)`, legs `(±0.09, 0.24)`; hips Box 0.36×0.12×0.26 @ y0.24 `sky-dk`; torso Box 0.42×0.26×0.30 @ y0.39 `sky`; head Sphere r0.185 @ y0.69 `cream-100`; helmet dome Sphere r0.195 scaleY0.62 @ y0.78 `sun`; brim Cylinder r0.20 h0.035 @ y0.655; cherry band Cylinder r0.188 h0.03 @ y0.70; lamp body Cylinder r0.04 h0.05 @ (0,0.74,0.17) `sun-dk`; lamp lens Sphere r0.048 @ (0,0.74,0.20) `sun-lt` Basic; eye whites r0.065 @ (±0.07,0.70,0.155); irises r0.032 @ (±0.07,0.695,0.20) `cocoa-900`; sparks r0.012 @ (±0.055,0.712,0.225); cheeks r0.042 scaleZ0.45 @ (±0.12,0.615,0.13) `blossom`; sleeve Capsule 0.14×0.10 @ y−0.05 on arm pivot `sky`; hand Sphere r0.07 @ y−0.155; thigh Capsule 0.15×0.14 @ y−0.07 on leg pivot; boot Sphere r0.075 @ (0,−0.16,0.03) `caramel`; pickaxe on `armRight`: handle Cylinder r0.032 h0.34 @ (0,−0.26,0.07) `caramel`, head Box 0.36×0.11×0.11 @ (0,−0.44,0.07) `slate`, blades Box 0.08³ @ (±0.20,−0.44,0.07). `MeshToonMaterial` shared per colour.
Hulls: child BackSide meshes with **per-part uniform inflate** (head 1.10, limbs 1.12, pick head 1.08, torso/hips 1.09); **no hull** on irises, sparks, eye whites, cheeks, cherry band, brim, lamp, pick handle; one hull per touching pair (thigh not boot, sleeve not hand). Tests (`tests/unit/miner-parts.test.ts`, first): classic pivots equal 0.52/0.24; chibi head:body ≈ 1:0.92; `Miner` with either variant runs `update(dt)` without throwing; no hull on the skip-list parts.
Candy particles: rounded geometry + toon + shared-matrix hull; dust/hit-flash colours from theme.

**R acceptance:** ember screenshot diff ≤ 0.5% vs pre-R baseline; candy `?dev=1` drawCalls ≤ ember + 3 instanced + miner shells (≤ +15); median FPS ≥ 90% of baseline; all 11 block kinds distinguishable at ~50 px; visual.mjs zero errors on both themes.

---

## Stream U — UI skin (merge 3rd, branch from post-P main) — Opus

**U1 Tokenize with ember values only (no visual change).** `src/ui/styles.css`.
Keep the existing ~20 token names as palette slots. Add shape tokens with ember values reproducing today's CSS exactly: `--outline-w:0 --outline-c:transparent --panel-outline-w:0 --stroke-w:0 --stroke-w-lg:0 --stroke-c:transparent --btn-edge:.25rem --btn-edge-down:.05rem --btn-edge-c:rgba(0,0,0,.4) --btn-hl:.08rem --btn-hl-c:rgba(255,255,255,.16) --btn-press-y:.18rem --btn-text --panel-inset --chip-bg --toast-bg --toast-ink --spring`. Button variants set `--btn-bg/--btn-ink/--btn-edge-c/--btn-text`; base `.btn` consumes them, including `-webkit-text-stroke: var(--stroke-w) var(--stroke-c); paint-order: stroke fill`.
Tokenize every stray literal: `.btn--gold/--danger` (~247-262), chip critical `#ff8f75` (~904), bar `#8c4a16` (~960), banner/payout `#7a4406` (~987, ~1108), unlock `#d9f2c9` (~1284), result stamps `#123c06/#3d0c02` (~1043-1053), `.tut` popover `#4a301a/#241609` (~1650, ~1698-1710), `.settings__lang/.langbtn` (~1905, ~1917-1928). Replace both enumerated reduced-motion lists (~1820-1869) with blanket rules (`.ui--calm *, .ui--calm *::before, .ui--calm *::after { animation-duration:.001s !important; transition-duration:.001s !important }` and the same under `prefers-reduced-motion`), and verify the JS `Counter` tween still honours reduced motion. Acceptance: visual.mjs screenshots pixel-identical to baseline.

**U2 `[data-theme]` + candy.** `.ui[data-theme="ember"]` = the U1 values; `.ui[data-theme="candy"]` redefines the slots per kimi's table (cocoa text on cream panels, `--scrim` sky gradient, `--panel-bg` cream with top highlight band, `--radius 1.4rem`, outline 2px `#5a3a1e`, stroke 1.5px/3px, `--btn-edge 4px`, per-variant `--btn-bg` gradients tangerine/sky/mint/cherry with `*-dk` edges, `--chip-bg rgba(61,38,18,.85)`, toast cream with cocoa ink, `--spring cubic-bezier(.34,1.56,.64,1)`). Minimal candy override blocks only where shape differs: `.toast::after` speech tail; `.panel` outline; `.panel__head` cream-200 band with stroked heading; new `.iconbtn--close` cherry square with white X (add the class where panels have a close/back icon button, keep existing classes); `.chip__icon` coin overflow; `.skinbtn/.langbtn` selected state; `.card` family top band (generation mint, income sun, durability sky, chain cherry); title screen: sky→grass background, tangerine banner behind `.title__name` with stroke. Also restyle `.switch__track/__knob` via tokens. No tabs component.

**U3 Motion.** Any new candy animation ≤ 400 ms, uses `--spring`, and is automatically covered by the blanket reduced-motion rules from U1; verify by toggling Calm motion.

**U acceptance:** `THEME=ember` and `THEME=candy` visual.mjs zero errors; ember pixel-identical; candy checked against bible §7 DoD (orchestrator does the blind review).

---

## Stream A — Brand assets (merge 4th) — Sonnet

`public/favicon.svg` (candy: cream rounded square, cocoa outline, sun/tangerine pickaxe), `public/manifest.webmanifest` (`background_color #f7ecd2`, `theme_color #f7ecd2`), regenerate `public/icons/icon-180/192/512.png` by rasterising the SVG with Playwright (`/data/duchess/node_modules/playwright`, Chrome at `/usr/bin/google-chrome-stable`). Keep file names. Check PNG dimensions with `file`.

---

## Integration

**I1** P4 and the loop-test stubs land together so `main` never fails typecheck.
**I2** Merge order P → R → U → A. R and U branch from post-P `main`. Expected conflicts: none in `contracts.ts` (only P touches it); possible `src/ui/settings.ts` overlap between P6 markup and U2 classes (keep P6 markup, apply U2 class names).
**I3** `scripts/visual.mjs` (+ `visual-i18n.mjs`, `visual-p0.mjs`): read `process.env.THEME` (`candy|ember`, default candy) and `page.addInitScript` to set `localStorage.linmine.theme` before navigation. Run both.
**I4** Final matrix: typecheck; `npm test`; `npm run sim` zero drift; visual.mjs ×2 themes zero errors; ember pixel diff ≤ 0.5%; `?dev=1` FPS ≥ 90% baseline and drawCalls within budget on both themes; bible §7 DoD on candy; external blind review (codex/kimi/grok) of candy screenshots vs the reference description, adjudicated by the orchestrator.

---

## Addenda (planner second pass, accepted)

- **R3 gate is unit-testable.** Extract `shouldApplyPendingTheme(pending: ThemeId | null, current: ThemeId, playing: boolean): boolean` into `src/render/themeGate.ts` and test it in `tests/unit/theme-rebuild-gate.test.ts` (false when no pending, false while playing, true only for a different id while idle). The check sits at the top of `update(dt)` before `adaptQuality()`.
- **R4 helper.** `src/render/outlineGeometry.ts` exports `extrudeAlongNormals(geometry, distance)`; unit test that a unit-box corner moves exactly `distance` along its normal. `tests/unit/block-field-outline.test.ts` builds a `BlockField` over a `tests/helpers/grid.ts` fixture (no WebGL needed) and asserts hull/decal `instanceMatrix` reference equality plus `count`/`visible` mirroring after add/removeAt/reset cycles.
- **R4 quality fallback.** When `qualityScale` drops to 0.75 under candy, the next rebuild uses cookie segments 2.
- **R6 particles** mirror `count`/`visible` for the hull in `burst/swapRemove/update/clear`.
- **U1 simplification.** The base `.ui { }` block IS the ember skin; only `.ui[data-theme="candy"] { }` is added. No separate `.ui[data-theme="ember"]` block.
- **U3 check.** The JS `Counter` tween in `src/ui/dom.ts` is gated by its own `reducedMotion` option (wired from hud/result/levels/shop); confirm it is unaffected by the CSS blanket rule.
- **I3 draw-call logging.** `scripts/visual.mjs` logs `window.linmine.renderer.stats()` before and after one mid-run `handlers.setTheme(<other>)` call to support the draw-budget gate.
