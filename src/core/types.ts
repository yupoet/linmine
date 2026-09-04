import type { BlockKind } from '../config/blocks.ts';
import type { LevelDef } from '../config/levels.ts';
import type { Grid } from './grid.ts';
import type { Cell, PathStep } from './pathfind.ts';

export type { Cell, PathStep };

export type RunStatus = 'running' | 'won' | 'lost';

export type EndReason = 'exit' | 'durability' | 'stuck' | null;

/**
 * Everything a run needs to know about the player's build. Produced once at
 * run start by folding the equipped cards through the effect pipeline; never
 * mutated afterwards.
 */
export interface RunModifiers {
  /** Flat durability added at run start. */
  startDurability: number;
  /** Durability subtracted from soil/rock costs. */
  softCostDelta: number;
  /** Additive ore cash bonus (0.2 => +20%). */
  oreCashMul: number;
  /** Additive bonus applied to chain destruction only. */
  chainCashMul: number;
  /** Extra depth multiplier gained per 10 rows. */
  depthCashPer10: number;
  /** Extra Chebyshev radius added to blast crates. */
  bombRadiusBonus: number;
  /** Additive ore spawn weight bonus. */
  oreWeightMul: number;
  /** Additive special block spawn weight bonus. */
  specialWeightMul: number;
}

export interface RunStats {
  blocksMined: number;
  chainBlocks: number;
  chainsTriggered: number;
  oreMined: number;
  cratesTriggered: number;
  durabilitySpent: number;
  durabilityRepaired: number;
  longestFall: number;
  deepestRow: number;
  cashOre: number;
  cashSpecial: number;
  cashTerrain: number;
  cashExit: number;
}

export type RemovalSource = 'dig' | 'chain';

export interface Removal {
  col: number;
  row: number;
  kind: BlockKind;
  cash: number;
  source: RemovalSource;
  /** 0 = the tapped block, 1+ = chain waves. */
  wave: number;
}

export type GameEvent =
  | { t: 'run_start'; levelId: string; seed: number; durability: number; targetDepth: number }
  | {
      t: 'block_removed';
      col: number;
      row: number;
      kind: BlockKind;
      cash: number;
      source: RemovalSource;
      wave: number;
    }
  | { t: 'chain_triggered'; col: number; row: number; kind: BlockKind; wave: number; cleared: number }
  | { t: 'durability_spent'; amount: number; remaining: number }
  | { t: 'durability_repaired'; amount: number; remaining: number }
  | { t: 'player_moved'; col: number; row: number }
  | { t: 'player_fell'; col: number; fromRow: number; toRow: number; distance: number }
  | { t: 'depth_reached'; depth: number }
  | { t: 'run_end'; status: Exclude<RunStatus, 'running'>; reason: Exclude<EndReason, null>; cash: number; depth: number };

export type DigFailure =
  | 'run_over'
  | 'out_of_bounds'
  | 'not_solid'
  | 'indestructible'
  | 'no_durability'
  | 'unreachable';

export interface DigResult {
  ok: boolean;
  reason?: DigFailure;
  cost: number;
  cashGained: number;
  durabilityRepaired: number;
  target: Cell;
  /** Standable cell the miner swings from (unspecified when the dig failed). */
  work: Cell | null;
  steps: PathStep[];
  removed: Removal[];
  /** Landing row after the miner drops into the hole, null if no movement. */
  landedRow: number | null;
  fellDistance: number;
  events: GameEvent[];
}

export interface RunState {
  runId: string;
  seed: number;
  configVersion: string;
  level: LevelDef;
  grid: Grid;
  player: Cell;
  durability: number;
  maxDurability: number;
  cash: number;
  /** Deepest row reached so far. */
  depth: number;
  status: RunStatus;
  endReason: EndReason;
  /** Ordered dig targets; seed + this list fully reproduces the run. */
  commands: Cell[];
  mods: RunModifiers;
  stats: RunStats;
}
