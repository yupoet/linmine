import type { CharacterId } from '../config/characters.ts';
import { CANDY_THEME } from './themes/candy.ts';
import type { MinerPalette } from './themes/types.ts';

/**
 * Playable characters — visual recipes for the chibi miner.
 *
 * Characters are a candy-skin feature: every recipe below is built from
 * STYLE_BIBLE §2 candy tokens, and the ember skin always builds its classic
 * miner regardless of the picked character (pixel parity). All three
 * characters share the chibi rig, the face cluster, the limb proportions and
 * the draw-call budget; they differ in palette, headgear and bottom (trousers
 * vs dress).
 */

export type Headgear = 'helmet' | 'twintails' | 'antenna';

export interface CharacterRecipe {
  readonly palette: MinerPalette;
  readonly headgear: Headgear;
  /** A dress (torso + flared skirt) instead of shirt + hips box. */
  readonly skirt: boolean;
}

// Candy tokens (bible §2), duplicated from themes/candy.ts on purpose: a theme
// and a character change for different reasons, so neither imports the other's
// literals (the boy alone reuses the theme palette — he IS the candy miner).
const CREAM_50 = 0xfff8e7;
const CREAM_100 = 0xf7ecd2;
const COCOA_900 = 0x3d2612;
const SUN_DK = 0xe08a1a;
const SUN_LT = 0xfff0a6;
const CHERRY = 0xe8453c;
const BLOSSOM = 0xf7a8c4;
const SKY_DK = 0x3a86b7;
const LILAC = 0xb7a3d9;
const LILAC_DK = 0x6f5b9e;
const LILAC_LT = 0xdcd2ef;
const CARAMEL = 0xc8874a;
const CARAMEL_DK = 0x8a5424;
const SLATE = 0x5c5470;
const SLATE_DK = 0x332d40;
const SLATE_LT = 0x8d85a3;

/** Little girl (default): warm brown twin buns, cherry dress, caramel boots. */
const GIRL: CharacterRecipe = {
  headgear: 'twintails',
  skirt: true,
  palette: {
    shirt: CHERRY,
    trousers: CREAM_100, // bare legs under the dress
    skin: CREAM_100,
    helmet: CARAMEL_DK, // hair
    lamp: SUN_DK,
    steel: SLATE,
    wood: CARAMEL,
    brim: COCOA_900, // hair shade
    band: CHERRY,
    lampLens: SUN_LT,
    steelLight: SLATE_LT,
    iris: COCOA_900,
    blush: BLOSSOM,
    spark: CREAM_50,
    boot: CARAMEL,
  },
};

/** Miner boy: the original candy chibi, yellow helmet and all. */
const BOY: CharacterRecipe = {
  headgear: 'helmet',
  skirt: false,
  palette: CANDY_THEME.miner.palette,
};

/** Robot: lilac shell, pale face plate, glowing antenna bulb, blue eyes. */
const ROBOT: CharacterRecipe = {
  headgear: 'antenna',
  skirt: false,
  palette: {
    shirt: LILAC,
    trousers: LILAC_DK,
    skin: LILAC_LT,
    helmet: SLATE_LT, // head plate
    lamp: SUN_DK,
    steel: SLATE,
    wood: CARAMEL,
    brim: SLATE_DK, // antenna stick
    band: SLATE_DK,
    lampLens: SUN_LT, // antenna bulb
    steelLight: SLATE_LT,
    iris: SKY_DK,
    blush: BLOSSOM,
    spark: CREAM_50,
    boot: SLATE,
  },
};

export const CHARACTER_RECIPES: Record<CharacterId, CharacterRecipe> = {
  girl: GIRL,
  boy: BOY,
  robot: ROBOT,
};
