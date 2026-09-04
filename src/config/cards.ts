/**
 * Card table. MVP ships 8 cards across four effect families (plan 4.2).
 * Card effects are pure data: the effect pipeline in core/modifiers.ts folds
 * every equipped card into a RunModifiers record, and cards may never touch
 * run state directly.
 */

export type CardFamily = 'generation' | 'income' | 'durability' | 'chain';

export type ModifierKey =
  | 'oreWeightMul'
  | 'specialWeightMul'
  | 'startDurability'
  | 'softCostDelta'
  | 'oreCashMul'
  | 'depthCashPer10'
  | 'bombRadiusBonus'
  | 'chainCashMul';

export interface CardEffect {
  key: ModifierKey;
  /** Value at level 1. */
  value: number;
  /** Added for each level beyond the first: value + perLevel * (level - 1). */
  perLevel: number;
}

export interface CardDef {
  id: string;
  name: string;
  family: CardFamily;
  maxLevel: number;
  effects: readonly CardEffect[];
  /** Human readable description for a given level. */
  describe: (level: number) => string;
  /** Relative draw weight when a chest grants a card. */
  drawWeight: number;
}

const pct = (value: number) => `${Math.round(value * 100)}%`;

export const CARDS: readonly CardDef[] = [
  {
    id: 'rich_veins',
    name: 'Rich Veins',
    family: 'generation',
    maxLevel: 5,
    drawWeight: 10,
    effects: [{ key: 'oreWeightMul', value: 0.18, perLevel: 0.18 }],
    describe: (level) => `Ore appears ${pct(0.18 * level)} more often.`,
  },
  {
    id: 'loaded_crates',
    name: 'Loaded Crates',
    family: 'generation',
    maxLevel: 5,
    drawWeight: 9,
    effects: [{ key: 'specialWeightMul', value: 0.25, perLevel: 0.25 }],
    describe: (level) => `Special blocks appear ${pct(0.25 * level)} more often.`,
  },
  {
    id: 'appraiser',
    name: 'Appraiser',
    family: 'income',
    maxLevel: 5,
    drawWeight: 10,
    effects: [{ key: 'oreCashMul', value: 0.2, perLevel: 0.2 }],
    describe: (level) => `Ore pays ${pct(0.2 * level)} more cash.`,
  },
  {
    id: 'deep_pockets',
    name: 'Deep Pockets',
    family: 'income',
    maxLevel: 5,
    drawWeight: 8,
    effects: [{ key: 'depthCashPer10', value: 0.1, perLevel: 0.1 }],
    describe: (level) => `Depth bonus grows by ${pct(0.1 * level)} per 10 rows.`,
  },
  {
    id: 'sturdy_grip',
    name: 'Sturdy Grip',
    family: 'durability',
    maxLevel: 5,
    drawWeight: 10,
    effects: [{ key: 'startDurability', value: 6, perLevel: 4 }],
    describe: (level) => `Start each run with +${6 + 4 * (level - 1)} durability.`,
  },
  {
    id: 'soft_soil',
    name: 'Soft Soil',
    family: 'durability',
    maxLevel: 5,
    drawWeight: 9,
    effects: [{ key: 'softCostDelta', value: 1, perLevel: 0.25 }],
    describe: (level) => `Soil and rock cost ${(1 + 0.25 * (level - 1)).toFixed(2)} less durability.`,
  },
  {
    id: 'big_blast',
    name: 'Big Blast',
    family: 'chain',
    maxLevel: 5,
    drawWeight: 8,
    effects: [{ key: 'bombRadiusBonus', value: 1, perLevel: 0.5 }],
    describe: (level) => `Blast crates clear radius ${Math.min(3, Math.floor(1 + 0.5 * (level - 1)))}.`,
  },
  {
    id: 'chain_bonus',
    name: 'Chain Bonus',
    family: 'chain',
    maxLevel: 5,
    drawWeight: 8,
    effects: [{ key: 'chainCashMul', value: 0.6, perLevel: 0.6 }],
    describe: (level) => `Chained destruction pays ${pct(0.6 * level)} more.`,
  },
];

export const MAX_CARDS_PER_RUN = 3;

export function cardById(id: string): CardDef {
  const found = CARDS.find((card) => card.id === id);
  if (!found) throw new Error(`unknown card: ${id}`);
  return found;
}

/** Effect magnitude at a given card level. */
export function effectValue(effect: CardEffect, level: number): number {
  const clamped = Math.max(1, Math.min(level, 5));
  return effect.value + effect.perLevel * (clamped - 1);
}
