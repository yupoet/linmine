# Minimal art asset list (M−1 deliverable)

Scope rule: **M0–M2 use placeholder art only.** Final art is swapped in during
M3. Anything not on this list is a scope change.

Everything below is **procedural** — generated in code rather than authored as
files — which is why the placeholder column mostly reads "code". Replacing an
item with final art means changing the generator, not deleting a file.

## Blocks (6 base + 4 special)

| Item | Family | Placeholder | Final | Owner |
|---|---|---|---|---|
| Soil | base | flat brown cube, per-cell colour jitter | textured cube with crumb detail | `config/blocks.ts` + `render/` |
| Rock | base | flat grey cube, darker sides | cracked rock texture | same |
| Copper ore | base | brown cube + orange speckle accents | glinting embedded nuggets | same |
| Gold ore | base | brown cube + bright yellow accents | glinting embedded nuggets | same |
| Bedrock | base | near-black cube, unlit look | dense igneous texture | same |
| Goal layer | base | full-width glowing cyan row, pulsing | carved exit gate with light shafts | same |
| Blast crate | special | red cube with dark band + fuse dot | crate with fuse and warning stripes | same |
| Drill charge | special | violet cube with a direction arrow | arrow-carved charge, direction glow | same |
| Supply crate | special | green cube with a cross mark | wooden crate with a pickaxe icon | same |
| Vault | special | amber cube with a bright face | gilded strongbox | same |

## Character

| Item | Placeholder | Final |
|---|---|---|
| Miner | box-built body, head, helmet with lamp, arms, pickaxe | low-poly character with 3–4 poses |
| Animations | idle bob, walk, swing, fall, land squash | same set, better timing/easing |

## UI

| Item | Count | Placeholder | Final |
|---|---:|---|---|
| HUD icons (pickaxe, coin, chain, pause) | 4 | inline SVG / CSS shapes | polished icon set |
| Card frames (one per family: generation, income, durability, chain) | 4 | CSS gradient frame + family colour | illustrated frames |
| Card art | 8 | CSS shape + family colour per card | one illustrated motif per card |
| Crate icons (common, rare) | 2 | CSS box with tier colour | illustrated crates |
| Level card thumbnails | 5 | gradient by depth band | small scenic art |
| Buttons / panels | 1 set | CSS custom-property theme | final theme, same tokens |

## Effects

| Item | Placeholder | Final |
|---|---|---|
| Break particles | instanced cubes tinted per block | same, tuned count/shape |
| Floating cash numbers | DOM text projected to screen | stylised number pop |
| Screen shake | camera offset scaled by blocks cleared | same, tuned |
| Depth atmosphere | background colour lerp sky → near-black | layered parallax backdrop |

## Audio (all synthesised, no files)

dig, break, explode, cash, repair, fall, land, win, lose, error, chest, ui —
12 sounds, all in `src/platform/audio.ts`.

## Out of scope for MVP

More islands/themes, artefact sets, character skins, animated cutscenes,
music tracks, voice. These are M4+ and need their own list.
