import { BlockKind, BLOCKS } from '../config/blocks.ts';
import { effectValue, CARDS } from '../config/cards.ts';
import { pickaxeDurabilityBonus } from '../config/economy.ts';
import type { LevelDef } from '../config/levels.ts';
import type { RunModifiers } from './types.ts';

export interface OwnedCard {
  id: string;
  level: number;
}

/** Baseline depth multiplier growth per 10 rows. */
const BASE_DEPTH_CASH_PER_10 = 0.15;
const MAX_BOMB_RADIUS = 3;
const MIN_BLOCK_COST = 1;

export function baseModifiers(): RunModifiers {
  return {
    startDurability: 0,
    softCostDelta: 0,
    oreCashMul: 0,
    chainCashMul: 0,
    depthCashPer10: 0,
    bombRadiusBonus: 0,
    oreWeightMul: 0,
    specialWeightMul: 0,
  };
}

/**
 * Effect pipeline (plan 5.2): start from the base value, apply every additive
 * card contribution, then clamp. Cards never touch run state directly, so the
 * same build always produces the same modifiers.
 */
export function computeModifiers(cards: readonly OwnedCard[], pickaxeLevel: number): RunModifiers {
  const mods = baseModifiers();
  mods.startDurability += pickaxeDurabilityBonus(pickaxeLevel);

  for (const owned of cards) {
    const def = CARDS.find((card) => card.id === owned.id);
    if (!def || owned.level < 1) continue;
    for (const effect of def.effects) {
      mods[effect.key] += effectValue(effect, owned.level);
    }
  }

  mods.bombRadiusBonus = Math.max(0, Math.floor(mods.bombRadiusBonus));
  mods.softCostDelta = Math.max(0, mods.softCostDelta);
  mods.oreWeightMul = Math.max(0, mods.oreWeightMul);
  mods.specialWeightMul = Math.max(0, mods.specialWeightMul);
  return mods;
}

/** Durability cost of one dig. Infinity for indestructible blocks. */
export function blockCost(kind: BlockKind, mods: RunModifiers): number {
  const def = BLOCKS[kind];
  if (!Number.isFinite(def.cost)) return Number.POSITIVE_INFINITY;
  let cost = def.cost;
  if (kind === BlockKind.Dirt || kind === BlockKind.Stone) {
    cost -= mods.softCostDelta;
  }
  return Math.max(MIN_BLOCK_COST, Math.round(cost));
}

/** Cash multiplier earned by digging deeper. */
export function depthMultiplier(row: number, mods: RunModifiers): number {
  const per10 = BASE_DEPTH_CASH_PER_10 + mods.depthCashPer10;
  return 1 + Math.floor(Math.max(0, row) / 10) * per10;
}

/**
 * Cash for destroying one block.
 * Order: base -> ore bonus -> depth bonus -> chain bonus -> round.
 */
export function cashFor(kind: BlockKind, row: number, mods: RunModifiers, viaChain: boolean): number {
  const def = BLOCKS[kind];
  let value = def.cash;
  if (value === 0) return 0;
  if (def.isOre) value *= 1 + mods.oreCashMul;
  value *= depthMultiplier(row, mods);
  if (viaChain) value *= 1 + mods.chainCashMul;
  return Math.max(0, Math.round(value));
}

/** Blast radius for a crate, including card bonuses. */
export function bombRadius(mods: RunModifiers): number {
  return Math.min(MAX_BOMB_RADIUS, BLOCKS[BlockKind.Bomb].chain.radius + mods.bombRadiusBonus);
}

export function startingDurability(level: LevelDef, mods: RunModifiers): number {
  return Math.max(1, Math.round(level.baseDurability + mods.startDurability));
}
