/**
 * Headless batch simulator. Plays full runs with a heuristic bot so balance
 * changes can be measured instead of guessed (plan 8.2).
 *
 * The bot is a proxy for a competent-but-not-optimal player: it values depth,
 * takes free falls, grabs crates when useful, and avoids expensive rock when a
 * cheap route down exists. It is NOT used by the game itself.
 */

import { BlockKind, BLOCKS } from '../config/blocks.ts';
import type { LevelDef } from '../config/levels.ts';
import { LEVELS } from '../config/levels.ts';
import { CONFIG_VERSION } from '../config/version.ts';
import { blockCost, type OwnedCard } from '../core/modifiers.ts';
import { applyDig, createRun, getLegalTargets, type TargetInfo } from '../core/run.ts';
import { createRng, nextFloat, type RngState } from '../core/rng.ts';
import type { RunState } from '../core/types.ts';

export interface BotWeights {
  /** Value of descending one row. */
  depth: number;
  /** Value of one free row of falling. */
  fall: number;
  /** Penalty per durability point. */
  cost: number;
  /** Cash is divided by this before being added to the score. */
  cashScale: number;
  bomb: number;
  arrow: number;
  vault: number;
  repairLow: number;
  repairHigh: number;
  exit: number;
  /** Random jitter so the bot does not play identically every time. */
  noise: number;
}

export const DEFAULT_BOT_WEIGHTS: BotWeights = {
  depth: 6,
  fall: 2.5,
  cost: 2.2,
  cashScale: 15,
  bomb: 6,
  arrow: 3,
  vault: 5,
  repairLow: 8,
  repairHigh: -1,
  exit: 1000,
  noise: 1.2,
};

/** Rows the bot would fall for free if it removed this block. */
function fallDistanceBelow(state: RunState, target: TargetInfo): number {
  let distance = 0;
  let row = target.row + 1;
  while (state.grid.isEmpty(target.col, row) && distance < 64) {
    distance++;
    row++;
  }
  return distance;
}

export function scoreTarget(state: RunState, target: TargetInfo, weights: BotWeights, rng: RngState): number {
  const kind = target.kind;
  const def = BLOCKS[kind];
  let score = nextFloat(rng) * weights.noise;

  if (kind === BlockKind.Exit) return score + weights.exit;

  const rowGain = Math.max(0, target.row - state.player.row);
  score += rowGain * weights.depth;
  score += fallDistanceBelow(state, target) * weights.fall;
  score -= target.cost * weights.cost;
  score += (def.cash / weights.cashScale) * (def.isOre ? 1.4 : 1);

  if (kind === BlockKind.Bomb) score += weights.bomb;
  if (kind === BlockKind.Arrow) score += weights.arrow;
  if (kind === BlockKind.Vault) score += weights.vault;
  if (kind === BlockKind.Repair) {
    const low = state.durability < state.maxDurability * 0.5;
    score += low ? weights.repairLow : weights.repairHigh;
  }

  return score;
}

export function chooseTarget(state: RunState, weights: BotWeights, rng: RngState): TargetInfo | null {
  const targets = getLegalTargets(state);
  if (targets.length === 0) return null;
  let best: TargetInfo | null = null;
  let bestScore = -Infinity;
  for (const target of targets) {
    const score = scoreTarget(state, target, weights, rng);
    if (score > bestScore) {
      bestScore = score;
      best = target;
    }
  }
  return best;
}

export interface SimulatedRun {
  seed: number;
  won: boolean;
  reason: string;
  depth: number;
  targetDepth: number;
  cash: number;
  durabilityLeft: number;
  durabilitySpent: number;
  blocksMined: number;
  chainBlocks: number;
  chains: number;
  longestFall: number;
  taps: number;
}

export function simulateRun(options: {
  seed: number;
  level: LevelDef;
  cards?: readonly OwnedCard[];
  pickaxeLevel?: number;
  weights?: Partial<BotWeights>;
  maxTaps?: number;
}): SimulatedRun {
  const weights = { ...DEFAULT_BOT_WEIGHTS, ...options.weights };
  const state = createRun({
    seed: options.seed,
    level: options.level,
    cards: options.cards ?? [],
    pickaxeLevel: options.pickaxeLevel ?? 1,
    configVersion: CONFIG_VERSION,
  });
  const rng = createRng(options.seed ^ 0x9e3779b9);

  let taps = 0;
  const maxTaps = options.maxTaps ?? 4000;

  while (state.status === 'running' && taps < maxTaps) {
    const target = chooseTarget(state, weights, rng);
    if (!target) break;
    applyDig(state, target.col, target.row);
    taps++;
  }

  return {
    seed: options.seed,
    won: state.status === 'won',
    reason: state.endReason ?? 'unfinished',
    depth: state.depth,
    targetDepth: options.level.targetDepth,
    cash: state.cash,
    durabilityLeft: state.durability,
    durabilitySpent: state.stats.durabilitySpent,
    blocksMined: state.stats.blocksMined,
    chainBlocks: state.stats.chainBlocks,
    chains: state.stats.chainsTriggered,
    longestFall: state.stats.longestFall,
    taps,
  };
}

export interface BalanceReport {
  level: string;
  targetDepth: number;
  runs: number;
  winRate: number;
  avgDepth: number;
  depthProgress: number;
  avgCash: number;
  medianCash: number;
  avgTaps: number;
  avgBlocks: number;
  avgChainBlocks: number;
  avgChains: number;
  avgDurabilityLeft: number;
  stuckRate: number;
  longestFall: number;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export function balanceReport(
  level: LevelDef,
  runs: number,
  options: { cards?: readonly OwnedCard[]; pickaxeLevel?: number; seedBase?: number; weights?: Partial<BotWeights> } = {},
): BalanceReport {
  const seedBase = options.seedBase ?? 1000;
  const results: SimulatedRun[] = [];
  for (let i = 0; i < runs; i++) {
    results.push(
      simulateRun({
        seed: seedBase + i,
        level,
        cards: options.cards,
        pickaxeLevel: options.pickaxeLevel,
        weights: options.weights,
      }),
    );
  }

  const sum = (pick: (run: SimulatedRun) => number) => results.reduce((acc, run) => acc + pick(run), 0);
  const wins = results.filter((run) => run.won).length;
  const stuck = results.filter((run) => run.reason === 'stuck').length;

  return {
    level: level.name,
    targetDepth: level.targetDepth,
    runs,
    winRate: wins / results.length,
    avgDepth: sum((run) => run.depth) / results.length,
    depthProgress: sum((run) => run.depth) / results.length / level.targetDepth,
    avgCash: sum((run) => run.cash) / results.length,
    medianCash: median(results.map((run) => run.cash)),
    avgTaps: sum((run) => run.taps) / results.length,
    avgBlocks: sum((run) => run.blocksMined) / results.length,
    avgChainBlocks: sum((run) => run.chainBlocks) / results.length,
    avgChains: sum((run) => run.chains) / results.length,
    avgDurabilityLeft: sum((run) => run.durabilityLeft) / results.length,
    stuckRate: stuck / results.length,
    longestFall: Math.max(...results.map((run) => run.longestFall)),
  };
}

export function reportAllLevels(runs: number, options: { cards?: readonly OwnedCard[]; pickaxeLevel?: number } = {}): BalanceReport[] {
  return LEVELS.map((level) => balanceReport(level, runs, options));
}

/** Cost of the next tap, exposed for HUD parity checks. */
export function costOf(state: RunState, kind: BlockKind): number {
  return blockCost(kind, state.mods);
}
