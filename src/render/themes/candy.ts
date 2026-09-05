import { BlockKind } from '../../config/blocks.ts';
import type { BlockPalette, RenderTheme } from './types.ts';

/**
 * Candy — the Happy-Mall-style skin defined by `docs/art/STYLE_BIBLE.md`.
 *
 * Cream grounds, chocolate outlines, rounded chibi shapes, saturated candy
 * colours and a daytime sky that fades to evening lavender instead of black.
 * Every number below traces back to a token in bible §2; the block base
 * colours honour the colour-blindness revision in §2.3 (soil, blast crate and
 * vault body deliberately sit off their nominal tokens so the orange family
 * does not collapse into one mass).
 */

// --- §2.1 grounds ------------------------------------------------------------
const CREAM_50 = 0xfff8e7;
const CREAM_100 = 0xf7ecd2;
const TAN_300 = 0xe3c48c;
const COCOA_800 = 0x5a3a1e;
const COCOA_900 = 0x3d2612;

// --- §2.2 candy colours ------------------------------------------------------
const SUN = 0xffcc33;
const SUN_DK = 0xe08a1a;
const SUN_LT = 0xfff0a6;
const TANGERINE = 0xff9a3c;
const TANGERINE_DK = 0xd9641c;
const CHERRY = 0xe8453c;
const MINT = 0x8fd7a3;
const MINT_DK = 0x3f9a5c;
const MINT_LT = 0xc9f2d2;
const SKY = 0x7fc7ea;
const SKY_DK = 0x3a86b7;
const SKY_LT = 0xc4e8f8;
const BLOSSOM = 0xf7a8c4;
const LILAC = 0xb7a3d9;
const LILAC_DK = 0x6f5b9e;
const LILAC_LT = 0xdcd2ef;
const CARAMEL = 0xc8874a;
const CARAMEL_DK = 0x8a5424;
const CARAMEL_LT = 0xe6b47d;
const SLATE = 0x5c5470;
const SLATE_DK = 0x332d40;
const SLATE_LT = 0x8d85a3;

// --- §2.3 block base overrides ----------------------------------------------
/** Wood brown, darker than caramel, to separate soil from copper by value. */
const SOIL = 0x8f5a2c;
/** Cold brick red: reads as "dark brick", not a second orange. */
const BLAST = 0xb02232;
/** Amber vault body, distinct from gold's lemon yellow. */
const VAULT = 0xd4891a;

function palette(base: number, shade: number, light: number): BlockPalette {
  return { base, shade, light };
}

const BLOCK_PALETTES: Record<BlockKind, BlockPalette> = {
  [BlockKind.Empty]: palette(0x000000, 0x000000, 0x000000),
  [BlockKind.Dirt]: palette(SOIL, 0x6d431f, CARAMEL_LT),
  [BlockKind.Stone]: palette(LILAC, LILAC_DK, LILAC_LT),
  [BlockKind.Copper]: palette(TANGERINE, TANGERINE_DK, SUN_LT),
  [BlockKind.Gold]: palette(SUN, SUN_DK, CREAM_50),
  [BlockKind.Bedrock]: palette(SLATE, SLATE_DK, SLATE_LT),
  [BlockKind.Exit]: palette(MINT, MINT_DK, MINT_LT),
  [BlockKind.Bomb]: palette(BLAST, 0x7a1523, CHERRY),
  [BlockKind.Arrow]: palette(SKY, SKY_DK, CREAM_50),
  [BlockKind.Repair]: palette(MINT, MINT_DK, CREAM_50),
  [BlockKind.Vault]: palette(VAULT, CARAMEL_DK, SUN),
};

export const CANDY_THEME: RenderTheme = {
  id: 'candy',
  shading: 'toon',
  // Bible §3: line weight ~4-5% of a 1-unit cube, always chocolate, never black.
  outline: { enabled: true, color: COCOA_800, extrude: 0.045 },
  geometry: { segments: 3, radius: 0.16 },
  atmosphere: {
    // Daylight sky that sinks into evening lavender; never approaches black.
    sky: SKY_LT,
    deep: LILAC_DK,
    darkByRow: 40,
    // Toon shading carries the reading, so depth barely dims the rig; the mine
    // stays legible 40 rows down without a headlamp.
    hemiDrop: 0.35,
    sunDrop: 0.5,
    lampGain: 0,
    vignetteBase: 0.04,
    vignetteGain: 0.12,
  },
  lights: {
    // Sky and ground share a colour: toon banding, not the light rig, has to
    // produce the three tones.
    hemiSky: CREAM_50,
    hemiGround: CREAM_50,
    // Toon shading divides direct light by PI, so the rig runs hotter than
    // ember's to land the lit band near full base colour.
    hemiIntensity: 1.4,
    sun: 0xfff6e0,
    sunIntensity: 2.2,
    // From the upper left and almost head-on, so top / front / side faces each
    // land on a different toon band (the ember rig put top and front together).
    sunPosition: [-3, 6, 1],
    // The headlamp becomes a glow lens on the miner; it must not light blocks.
    lamp: SUN_LT,
    lampIntensity: 0,
    lampDistance: 6,
    lampDecay: 1.8,
    lampPosition: [0, 0.74, 0.2],
  },
  blocks: BLOCK_PALETTES,
  grass: MINT,
  highlight: { affordable: SUN_LT, tooExpensive: CHERRY, hovered: CREAM_50, breathe: 0.35 },
  particles: { dust: TAN_300, hitFlash: CREAM_50 },
  popups: {
    cash: '#fff8e7',
    gold: '#ffcc33',
    repair: '#8fd7a3',
    labelOk: '#fff8e7',
    labelNo: '#ff8a80',
    // Chocolate outline instead of a black drop shadow (bible §4, §5.2).
    shadow: '0 2px 0 #5a3a1e, 0 -1px 0 #5a3a1e, 1px 0 0 #5a3a1e, -1px 0 0 #5a3a1e',
    labelShadow: '0 1px 0 #3d2612, 0 -1px 0 #3d2612, 1px 0 0 #3d2612, -1px 0 0 #3d2612',
  },
  miner: {
    variant: 'chibi',
    outline: COCOA_800,
    palette: {
      shirt: SKY,
      trousers: SKY_DK,
      skin: CREAM_100,
      helmet: SUN,
      lamp: SUN_DK,
      steel: SLATE,
      wood: CARAMEL,
      brim: SUN_DK,
      band: CHERRY,
      lampLens: SUN_LT,
      steelLight: SLATE_LT,
      iris: COCOA_900,
      blush: BLOSSOM,
      spark: CREAM_50,
      boot: CARAMEL,
    },
  },
  decals: true,
};
