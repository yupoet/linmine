/**
 * Meta economy tables. MVP: one pickaxe upgrade line, two chest tiers,
 * a single soft currency (cash). No hard currency, no ads (plan 4.3).
 */

export const PICKAXE_MAX_LEVEL = 10;
export const PICKAXE_DURABILITY_PER_LEVEL = 3;

/** Cost to upgrade FROM the given level to the next one. */
export function pickaxeUpgradeCost(level: number): number {
  if (level >= PICKAXE_MAX_LEVEL) return Number.POSITIVE_INFINITY;
  if (level < 1) return Number.POSITIVE_INFINITY;
  return Math.round(350 * Math.pow(level, 1.45));
}

export function pickaxeDurabilityBonus(level: number): number {
  const clamped = Math.max(1, Math.min(level, PICKAXE_MAX_LEVEL));
  return PICKAXE_DURABILITY_PER_LEVEL * (clamped - 1);
}

export type ChestTier = 'common' | 'rare';

export interface ChestDef {
  id: ChestTier;
  name: string;
  cost: number;
  cards: number;
  cashMin: number;
  cashMax: number;
}

export const CHESTS: Record<ChestTier, ChestDef> = {
  common: {
    id: 'common',
    name: 'Rusty Crate',
    cost: 500,
    cards: 1,
    cashMin: 120,
    cashMax: 260,
  },
  rare: {
    id: 'rare',
    name: 'Gilded Crate',
    cost: 1800,
    cards: 2,
    cashMin: 520,
    cashMax: 940,
  },
};

/** Chest granted when a level is cleared. First clear pays the good one. */
export function clearRewardTier(firstClear: boolean): ChestTier {
  return firstClear ? 'rare' : 'common';
}

export interface SettlementInput {
  cashCollected: number;
  cashMultiplier: number;
  won: boolean;
  winBonus: number;
  depth: number;
  targetDepth: number;
}

export interface Settlement {
  /** Cash collected underground, scaled by the level multiplier. */
  runCash: number;
  /** Bonus for digging the exit. */
  winBonus: number;
  /** Bonus for how far past the shallows you got, even on a loss. */
  depthBonus: number;
  total: number;
}

const DEPTH_BONUS_PER_ROW = 2;

export function settleRun(input: SettlementInput): Settlement {
  const runCash = Math.round(input.cashCollected * input.cashMultiplier);
  const winBonus = input.won ? input.winBonus : 0;
  const progressRows = Math.max(0, Math.min(input.depth, input.targetDepth));
  const depthBonus = Math.round(progressRows * DEPTH_BONUS_PER_ROW * (input.won ? 1 : 0.5));
  return {
    runCash,
    winBonus,
    depthBonus,
    total: runCash + winBonus + depthBonus,
  };
}
