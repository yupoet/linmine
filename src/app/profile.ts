/**
 * Meta progression: cash, the pickaxe line, crates and the card collection.
 *
 * These are pure functions over a Profile plus an injected RNG, so the whole
 * meta loop can be simulated headlessly (plan 7.1) without a DOM.
 */

import { CARDS, cardById, type CardDef } from '../config/cards.ts';
import { CHESTS, PICKAXE_MAX_LEVEL, pickaxeUpgradeCost, type ChestTier } from '../config/economy.ts';
import { LEVELS, levelById } from '../config/levels.ts';
import { nextInt, nextRange, nextWeighted, type RngState } from '../core/rng.ts';
import type { Profile } from '../core/save.ts';
import type { RunStats } from '../core/types.ts';

export interface ChestCardResult {
  id: string;
  name: string;
  level: number;
  maxLevel: number;
  duplicates: boolean;
  /** Cash refunded when the card was already maxed. */
  refund: number;
}

export interface ChestReward {
  tier: ChestTier;
  cards: ChestCardResult[];
  cash: number;
}

const MAXED_REFUND = 150;

function eligibleCards(profile: Profile): readonly CardDef[] {
  const open = CARDS.filter((card) => (profile.cards[card.id]?.level ?? 0) < card.maxLevel);
  return open.length > 0 ? open : CARDS;
}

export function drawCard(profile: Profile, rng: RngState): ChestCardResult {
  const pool = eligibleCards(profile);
  const index = nextWeighted(rng, pool.map((card) => card.drawWeight));
  const card: CardDef = pool[index >= 0 ? index : 0];

  const owned = profile.cards[card.id];
  const maxed = (owned?.level ?? 0) >= card.maxLevel;

  if (maxed) {
    return { id: card.id, name: card.name, level: card.maxLevel, maxLevel: card.maxLevel, duplicates: true, refund: MAXED_REFUND };
  }

  const count = (owned?.count ?? 0) + 1;
  profile.cards[card.id] = { count, level: Math.min(card.maxLevel, Math.max(1, count)) };
  return {
    id: card.id,
    name: card.name,
    level: profile.cards[card.id].level,
    maxLevel: card.maxLevel,
    duplicates: false,
    refund: 0,
  };
}

export function openChest(profile: Profile, tier: ChestTier, rng: RngState): ChestReward {
  const def = CHESTS[tier];
  const cards: ChestCardResult[] = [];
  let cash = nextRange(rng, def.cashMin, def.cashMax);

  for (let i = 0; i < def.cards; i++) {
    const result = drawCard(profile, rng);
    cards.push(result);
    cash += result.refund;
  }

  profile.cash += cash;
  profile.lifetimeCash += cash;
  profile.stats.chestsOpened += 1;

  return { tier, cards, cash };
}

export function buyPickaxe(profile: Profile): boolean {
  if (profile.pickaxeLevel >= PICKAXE_MAX_LEVEL) return false;
  const cost = pickaxeUpgradeCost(profile.pickaxeLevel);
  if (profile.cash < cost) return false;
  profile.cash -= cost;
  profile.pickaxeLevel += 1;
  return true;
}

export function buyChest(profile: Profile, tier: ChestTier): boolean {
  const cost = CHESTS[tier].cost;
  if (profile.cash < cost) return false;
  profile.cash -= cost;
  profile.pendingChests.push(tier);
  return true;
}

export function takePendingChest(profile: Profile, tier: ChestTier): boolean {
  const index = profile.pendingChests.indexOf(tier);
  if (index < 0) return false;
  profile.pendingChests.splice(index, 1);
  return true;
}

export interface RunResultInput {
  levelId: string;
  won: boolean;
  depth: number;
  cashCollected: number;
  stats: RunStats;
  total: number;
}

export interface RunResultOutcome {
  firstClear: boolean;
  unlockedLevelId: string | null;
  unlockedLevelName: string | null;
  rewardTier: ChestTier | null;
}

/** Commit a finished run to the profile. Returns what changed for the UI. */
export function recordRunResult(profile: Profile, input: RunResultInput): RunResultOutcome {
  const level = levelById(input.levelId);
  const record = profile.levels[level.id] ?? { plays: 0, clears: 0, bestDepth: 0, bestCash: 0 };

  record.plays += 1;
  record.bestDepth = Math.max(record.bestDepth, input.depth);
  record.bestCash = Math.max(record.bestCash, input.cashCollected);

  profile.cash += input.total;
  profile.lifetimeCash += input.total;
  profile.stats.runs += 1;
  profile.stats.deepestRow = Math.max(profile.stats.deepestRow, input.depth);
  profile.stats.blocksMined += input.stats.blocksMined + input.stats.chainBlocks;

  let firstClear = false;
  let unlockedLevelId: string | null = null;

  if (input.won) {
    profile.stats.wins += 1;
    record.clears += 1;
    if (record.clears === 1) {
      firstClear = true;
      const next = LEVELS[level.index + 1];
      if (next && (profile.levels[next.id]?.clears ?? 0) === 0 && !profile.pendingChests.length && next.index === level.index + 1) {
        unlockedLevelId = next.id;
      }
    }
  }

  profile.levels[level.id] = record;

  return {
    firstClear,
    unlockedLevelId,
    unlockedLevelName: unlockedLevelId ? levelById(unlockedLevelId).name : null,
    rewardTier: input.won ? (firstClear ? 'rare' : 'common') : null,
  };
}

/** Cards the player owns, in a stable order, for the pre-run draft. */
export function draftCards(profile: Profile): { id: string; name: string; level: number }[] {
  return CARDS.filter((card) => (profile.cards[card.id]?.count ?? 0) > 0).map((card) => ({
    id: card.id,
    name: card.name,
    level: profile.cards[card.id].level,
  }));
}

export function cardLevel(profile: Profile, id: string): number {
  return profile.cards[id]?.level ?? 0;
}

/** Random starting card so the first run is not cardless. */
export function grantStarterCard(profile: Profile, rng: RngState): string {
  const index = nextInt(rng, CARDS.length);
  const card = CARDS[index];
  profile.cards[card.id] = { count: 1, level: 1 };
  return cardById(card.id).id;
}
