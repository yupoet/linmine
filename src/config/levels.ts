import type { WeightKey } from './blocks.ts';
import { DEFAULT_GRID_WIDTH } from './version.ts';

/**
 * A generation band: weights are swapped in once `fromRow` is reached.
 * The last band whose `fromRow <= row` wins, so bands must stay sorted.
 */
export interface WeightBand {
  fromRow: number;
  weights: Record<WeightKey, number>;
}

export interface LevelDef {
  id: string;
  index: number;
  name: string;
  blurb: string;
  gridWidth: number;
  /** Row of the exit block. Reaching and digging it wins the run. */
  targetDepth: number;
  /** Pickaxe durability at pickaxe level 1, before card bonuses. */
  baseDurability: number;
  /** Mixed into the row seed so each level digs differently on the same seed. */
  seedSalt: number;
  /** Multiplier applied to every cash reward in the level. */
  cashMultiplier: number;
  /** Multiplier applied to ore weights (copper/gold). */
  oreMultiplier: number;
  /** Chance a generated cell is collapsed into a pre-dug cave. */
  caveChance: number;
  /** Cash awarded for reaching the exit. */
  winBonus: number;
  bands: readonly WeightBand[];
}

const SHALLOW: Record<WeightKey, number> = {
  dirt: 62,
  stone: 12,
  copper: 9,
  gold: 1.5,
  bedrock: 2,
  bomb: 3,
  arrow: 1.6,
  repair: 1.4,
  vault: 0.4,
};

const MID: Record<WeightKey, number> = {
  dirt: 44,
  stone: 23,
  copper: 14,
  gold: 4,
  bedrock: 4,
  bomb: 3.2,
  arrow: 1.8,
  repair: 1.5,
  vault: 0.7,
};

const DEEP: Record<WeightKey, number> = {
  dirt: 27,
  stone: 31,
  copper: 16,
  gold: 8,
  bedrock: 6,
  bomb: 3.4,
  arrow: 2,
  repair: 1.7,
  vault: 1.1,
};

const DEEPER: Record<WeightKey, number> = {
  dirt: 17,
  stone: 33,
  copper: 17,
  gold: 12,
  bedrock: 8,
  bomb: 3.6,
  arrow: 2.2,
  repair: 1.9,
  vault: 1.6,
};

const DEFAULT_BANDS: readonly WeightBand[] = [
  { fromRow: 1, weights: SHALLOW },
  { fromRow: 9, weights: MID },
  { fromRow: 20, weights: DEEP },
  { fromRow: 35, weights: DEEPER },
];

export const LEVELS: readonly LevelDef[] = [
  {
    id: 'sunlit_shaft',
    index: 0,
    name: 'Sunlit Shaft',
    blurb: 'Soft soil, shallow pockets. Learn the swing.',
    gridWidth: DEFAULT_GRID_WIDTH,
    targetDepth: 54,
    baseDurability: 56,
    seedSalt: 0x11a7,
    cashMultiplier: 1,
    oreMultiplier: 1,
    caveChance: 0.03,
    winBonus: 120,
    bands: DEFAULT_BANDS,
  },
  {
    id: 'copper_gorge',
    index: 1,
    name: 'Copper Gorge',
    blurb: 'Wider veins, harder rock. Watch the pick.',
    gridWidth: DEFAULT_GRID_WIDTH,
    targetDepth: 70,
    baseDurability: 71,
    seedSalt: 0x2b3c,
    cashMultiplier: 1.15,
    oreMultiplier: 1.15,
    caveChance: 0.045,
    winBonus: 200,
    bands: DEFAULT_BANDS,
  },
  {
    id: 'deep_shelf',
    index: 2,
    name: 'The Deep Shelf',
    blurb: 'Long drops pay off if you can survive them.',
    gridWidth: DEFAULT_GRID_WIDTH,
    targetDepth: 90,
    baseDurability: 88,
    seedSalt: 0x3c5d,
    cashMultiplier: 1.32,
    oreMultiplier: 1.3,
    caveChance: 0.06,
    winBonus: 300,
    bands: DEFAULT_BANDS,
  },
  {
    id: 'molten_reach',
    index: 3,
    name: 'Molten Reach',
    blurb: 'Gold everywhere, but bedrock bites back.',
    gridWidth: DEFAULT_GRID_WIDTH,
    targetDepth: 112,
    baseDurability: 104,
    seedSalt: 0x4d7e,
    cashMultiplier: 1.5,
    oreMultiplier: 1.45,
    caveChance: 0.075,
    winBonus: 450,
    bands: DEFAULT_BANDS,
  },
  {
    id: 'the_long_dark',
    index: 4,
    name: 'The Long Dark',
    blurb: 'One shaft, no second chances.',
    gridWidth: DEFAULT_GRID_WIDTH,
    targetDepth: 140,
    baseDurability: 124,
    seedSalt: 0x5e9f,
    cashMultiplier: 1.75,
    oreMultiplier: 1.6,
    caveChance: 0.09,
    winBonus: 650,
    bands: DEFAULT_BANDS,
  },
];

export function levelById(id: string): LevelDef {
  const found = LEVELS.find((level) => level.id === id);
  if (!found) throw new Error(`unknown level: ${id}`);
  return found;
}

export function levelByIndex(index: number): LevelDef {
  const clamped = Math.min(Math.max(index, 0), LEVELS.length - 1);
  return LEVELS[clamped];
}

/** Resolve the weight band for a row. */
export function bandForRow(level: LevelDef, row: number): Record<WeightKey, number> {
  let band = level.bands[0];
  for (const candidate of level.bands) {
    if (row >= candidate.fromRow) band = candidate;
  }
  return band.weights;
}
