# Third-party notices

Lin Mine is an **original** game. Its rules, numbers, art, audio and copy were
written from scratch for this repository. Nothing here is derived from
*Pocket Mine 2* (Roofdog Games) or any other commercial title: we reproduce a
**genre**, not a specific work. Game mechanics are not protected by copyright,
but code, art, audio and text are — so the boundary below is deliberate and
must be maintained.

Reference games and genre ancestors were studied through **publicly observable
behaviour only** (playing, watching, reading public documentation and wikis).
No assets, no decompiled code, no data files and no proprietary numbers were
imported.

## Runtime dependencies

| Package | Version | License | Notes |
|---|---|---|---|
| [three.js](https://github.com/mrdoob/three.js) | 0.169.0 | MIT | Renderer only. `src/render/**`. |

Build-time only (not shipped to players): TypeScript (Apache-2.0), Vite (MIT),
Vitest (MIT) and their transitive dependencies.

## Research references — learn only, nothing copied

Every repository below was examined **for ideas**. None of their code was
copied into this repository, and no file in `src/` is derived from them.

| Repository | License shown on GitHub | Status for this project |
|---|---|---|
| [kiforsbe/pocketminer](https://github.com/kiforsbe/pocketminer) | none shown | **Learn only.** A repository with no license is "all rights reserved" by default. |
| [tiwu/gemdigger](https://github.com/tiwu/gemdigger) | none shown | **Learn only.** Same reason. |
| [alektron/ChunkMinerGame](https://github.com/alektron/ChunkMinerGame) | MIT | **Eligible to reuse.** Not currently used; if code is ever taken from it, the MIT notice and copyright line must be reproduced here and in the file header. |
| [llakssz/Dr-Driller](https://github.com/llakssz/Dr-Driller) | none shown | **Learn only.** |
| [Gertkeno/to-the-core](https://github.com/Gertkeno/to-the-core) | none shown | **Learn only.** |

Balance data published by the community (e.g. the Pocket Mine wiki, CC-BY-SA)
was consulted only to understand the *shape* of a healthy economy. All Lin Mine
numbers were produced by our own simulator (`npm run sim`) against our own
rules.

## Assets

All art and audio are generated in code:

- **Art** — procedural geometry and colours defined in `src/config/blocks.ts`
  and `src/render/**`. No image files are shipped.
- **Audio** — synthesised at runtime with the WebAudio API in
  `src/platform/audio.ts`. No audio files are shipped.
- **Fonts** — system font stack only. No web fonts are downloaded.

## If you add something

1. Prefer MIT / Apache-2.0 / CC0 material.
2. **Never** add GPL or LGPL code without an explicit decision: those licences
   are viral and would force this project to be relicensed.
3. Never add an asset whose provenance cannot be shown.
4. Add a row to the tables above, and record the source in the commit message.
