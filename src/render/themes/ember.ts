import { BlockKind, BLOCKS } from '../../config/blocks.ts';
import type { BlockPalette, RenderTheme } from './types.ts';

/**
 * Ember — the original dark-mine look, preserved verbatim.
 *
 * Every value here was lifted from a literal that used to live in the render
 * layer (`blocks.ts`, `miner.ts`, `fx.ts`, `dom.ts`, `constants.ts`,
 * `index.ts`). `tests/unit/render-theme-ember.test.ts` pins each one, so the
 * skin stays pixel-identical to the pre-theme build.
 */

function fromConfig(kind: BlockKind): BlockPalette {
  const def = BLOCKS[kind];
  // Standard shading derives its own shadow; only base + accent were ever used.
  return { base: def.color, shade: def.color, light: def.accent };
}

function configPalettes(): Record<BlockKind, BlockPalette> {
  const out = {} as Record<BlockKind, BlockPalette>;
  for (const kind of Object.values(BlockKind)) out[kind] = fromConfig(kind);
  return out;
}

export const EMBER_THEME: RenderTheme = {
  id: 'ember',
  shading: 'standard',
  outline: { enabled: false, color: 0x000000, extrude: 0 },
  geometry: { segments: 2, radius: 0.09 },
  atmosphere: {
    sky: 0x9ad9f5,
    deep: 0x05070c,
    darkByRow: 40,
    hemiDrop: 0.65,
    sunDrop: 0.6,
    lampGain: 4.3,
    vignetteBase: 0.18,
    vignetteGain: 0.42,
  },
  lights: {
    hemiSky: 0xcfe9ff,
    hemiGround: 0x3a2a1c,
    hemiIntensity: 0.95,
    sun: 0xffffff,
    sunIntensity: 1.15,
    sunPosition: [3, 6, 8],
    lamp: 0xffe6a8,
    lampIntensity: 1.2,
    lampDistance: 6,
    lampDecay: 1.8,
    lampPosition: [0, 0.8, 0.45],
  },
  blocks: configPalettes(),
  grass: 0x6aa84f,
  highlight: { affordable: 0x7cf0b4, tooExpensive: 0xff5a45, hovered: 0xfff3b0, breathe: 0 },
  particles: { dust: 0xb9a888, hitFlash: 0xffffff },
  popups: {
    cash: '#eafff2',
    gold: '#ffd856',
    repair: '#8ef0a4',
    labelOk: '#f2fff8',
    labelNo: '#ff8b76',
    shadow: '0 1px 2px rgba(0,0,0,0.9)',
    labelShadow: '0 1px 2px rgba(0,0,0,0.95)',
  },
  miner: {
    variant: 'classic',
    outline: 0x000000,
    palette: {
      shirt: 0xe0574a,
      trousers: 0x2f4a7a,
      skin: 0xf0c193,
      helmet: 0xffc93c,
      lamp: 0xfff6c8,
      steel: 0x8d949e,
      wood: 0x8a5a3b,
      // Chibi-only slots: ember never builds these parts.
      brim: 0xffc93c,
      band: 0xe0574a,
      lampLens: 0xfff6c8,
      steelLight: 0x8d949e,
      iris: 0x2f4a7a,
      blush: 0xe0574a,
      spark: 0xfff6c8,
      boot: 0x8a5a3b,
    },
  },
  decals: false,
};
