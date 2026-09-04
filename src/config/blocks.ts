/**
 * Block table. MVP ships 6 base blocks (plan 4.2) plus 4 special blocks.
 * Costs are durability units; cash is the base reward before the depth
 * multiplier, card modifiers and chain bonuses.
 *
 * All values are original tuning for Lin Mine — do not copy reference-game
 * numbers verbatim (see THIRD_PARTY_NOTICES.md).
 */

export const BlockKind = {
  Empty: 0,
  Dirt: 1,
  Stone: 2,
  Copper: 3,
  Gold: 4,
  Bedrock: 5,
  Exit: 6,
  Bomb: 7,
  Arrow: 8,
  Repair: 9,
  Vault: 10,
} as const;

export type BlockKind = (typeof BlockKind)[keyof typeof BlockKind];

export type BlockFamily = 'base' | 'special';

export type ChainType = 'none' | 'bomb' | 'arrow';

export interface ChainDef {
  type: ChainType;
  /** Chebyshev radius for bombs (1 => 3x3). */
  radius: number;
  /** Cells cleared per direction for arrows. */
  length: number;
}

export interface BlockDef {
  kind: BlockKind;
  id: string;
  label: string;
  family: BlockFamily;
  /** Durability units consumed by one dig. Infinity means indestructible. */
  cost: number;
  /** Base cash awarded when destroyed (any source). */
  cash: number;
  destructible: boolean;
  isOre: boolean;
  /** Placeholder palette used by the graybox renderer (hex). */
  color: number;
  /** Secondary placeholder colour for the block's top face / accent. */
  accent: number;
  chain: ChainDef;
  /** Durability restored when dug or caught in a chain. */
  repair: number;
  /** Weight key used by the row generator. */
  weightKey: WeightKey | null;
}

export type WeightKey = 'dirt' | 'stone' | 'copper' | 'gold' | 'bedrock' | 'bomb' | 'arrow' | 'repair' | 'vault';

const NO_CHAIN: ChainDef = { type: 'none', radius: 0, length: 0 };

export const BLOCKS: Record<BlockKind, BlockDef> = {
  [BlockKind.Empty]: {
    kind: BlockKind.Empty,
    id: 'empty',
    label: 'Air',
    family: 'base',
    cost: 0,
    cash: 0,
    destructible: false,
    isOre: false,
    color: 0x000000,
    accent: 0x000000,
    chain: NO_CHAIN,
    repair: 0,
    weightKey: null,
  },
  [BlockKind.Dirt]: {
    kind: BlockKind.Dirt,
    id: 'dirt',
    label: 'Soil',
    family: 'base',
    cost: 1,
    cash: 1,
    destructible: true,
    isOre: false,
    color: 0x8a5a3b,
    accent: 0x6f4529,
    chain: NO_CHAIN,
    repair: 0,
    weightKey: 'dirt',
  },
  [BlockKind.Stone]: {
    kind: BlockKind.Stone,
    id: 'stone',
    label: 'Rock',
    family: 'base',
    cost: 2,
    cash: 2,
    destructible: true,
    isOre: false,
    color: 0x7c7f86,
    accent: 0x63666d,
    chain: NO_CHAIN,
    repair: 0,
    weightKey: 'stone',
  },
  [BlockKind.Copper]: {
    kind: BlockKind.Copper,
    id: 'copper',
    label: 'Copper',
    family: 'base',
    cost: 2,
    cash: 9,
    destructible: true,
    isOre: true,
    color: 0xc9743a,
    accent: 0xf0a26a,
    chain: NO_CHAIN,
    repair: 0,
    weightKey: 'copper',
  },
  [BlockKind.Gold]: {
    kind: BlockKind.Gold,
    id: 'gold',
    label: 'Gold',
    family: 'base',
    cost: 3,
    cash: 28,
    destructible: true,
    isOre: true,
    color: 0xe8bf4a,
    accent: 0xfff0a8,
    chain: NO_CHAIN,
    repair: 0,
    weightKey: 'gold',
  },
  [BlockKind.Bedrock]: {
    kind: BlockKind.Bedrock,
    id: 'bedrock',
    label: 'Bedrock',
    family: 'base',
    cost: Number.POSITIVE_INFINITY,
    cash: 0,
    destructible: false,
    isOre: false,
    color: 0x3b3f47,
    accent: 0x2a2d33,
    chain: NO_CHAIN,
    repair: 0,
    weightKey: 'bedrock',
  },
  [BlockKind.Exit]: {
    kind: BlockKind.Exit,
    id: 'exit',
    label: 'Mine Exit',
    family: 'base',
    cost: 3,
    cash: 90,
    destructible: true,
    isOre: false,
    color: 0x4fc3f7,
    accent: 0xb3e5fc,
    chain: NO_CHAIN,
    repair: 0,
    weightKey: null,
  },
  [BlockKind.Bomb]: {
    kind: BlockKind.Bomb,
    id: 'bomb',
    label: 'Blast Crate',
    family: 'special',
    cost: 2,
    cash: 3,
    destructible: true,
    isOre: false,
    color: 0xd9534f,
    accent: 0x2a2a2a,
    chain: { type: 'bomb', radius: 1, length: 0 },
    repair: 0,
    weightKey: 'bomb',
  },
  [BlockKind.Arrow]: {
    kind: BlockKind.Arrow,
    id: 'arrow',
    label: 'Drill Charge',
    family: 'special',
    cost: 2,
    cash: 3,
    destructible: true,
    isOre: false,
    color: 0x9b59b6,
    accent: 0xe1bee7,
    chain: { type: 'arrow', radius: 0, length: 6 },
    repair: 0,
    weightKey: 'arrow',
  },
  [BlockKind.Repair]: {
    kind: BlockKind.Repair,
    id: 'repair',
    label: 'Supply Crate',
    family: 'special',
    cost: 1,
    cash: 0,
    destructible: true,
    isOre: false,
    color: 0x4caf50,
    accent: 0xc8e6c9,
    chain: NO_CHAIN,
    repair: 6,
    weightKey: 'repair',
  },
  [BlockKind.Vault]: {
    kind: BlockKind.Vault,
    id: 'vault',
    label: 'Vault',
    family: 'special',
    cost: 4,
    cash: 120,
    destructible: true,
    isOre: false,
    color: 0xffb300,
    accent: 0xffe082,
    chain: NO_CHAIN,
    repair: 0,
    weightKey: 'vault',
  },
};

/** Arrow orientation variants (stored per cell). */
export const ArrowVariant = {
  Down: 0,
  Side: 1,
} as const;
export type ArrowVariant = (typeof ArrowVariant)[keyof typeof ArrowVariant];

export const BLOCK_LIST: readonly BlockDef[] = Object.values(BLOCKS);

export function blockDef(kind: BlockKind): BlockDef {
  return BLOCKS[kind];
}

export function isDestructible(kind: BlockKind): boolean {
  return BLOCKS[kind].destructible;
}

export function baseCost(kind: BlockKind): number {
  return BLOCKS[kind].cost;
}

export function baseCash(kind: BlockKind): number {
  return BLOCKS[kind].cash;
}
