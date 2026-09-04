import { ArrowVariant, BlockKind, BLOCKS } from '../config/blocks.ts';
import type { LevelDef } from '../config/levels.ts';
import { CONFIG_VERSION, GENERATION_LOOKAHEAD } from '../config/version.ts';
import { createRowGenerator } from './generation.ts';
import { Grid } from './grid.ts';
import {
  blockCost,
  bombRadius,
  cashFor,
  computeModifiers,
  startingDurability,
  type OwnedCard,
} from './modifiers.ts';
import {
  findDigPlan,
  hasLegalTarget,
  legalTargets,
  resolveFall,
  type Cell,
} from './pathfind.ts';
import { deriveRng, makeId, nextInt } from './rng.ts';
import type {
  DigFailure,
  DigResult,
  GameEvent,
  Removal,
  RunModifiers,
  RunState,
  RunStats,
} from './types.ts';

export interface CreateRunOptions {
  seed: number;
  level: LevelDef;
  cards: readonly OwnedCard[];
  pickaxeLevel: number;
  configVersion?: string;
  runId?: string;
}

/** Safety valve: no single tap may ever clear more than this many blocks. */
const MAX_CHAIN_STEPS = 2048;

function emptyStats(): RunStats {
  return {
    blocksMined: 0,
    chainBlocks: 0,
    chainsTriggered: 0,
    oreMined: 0,
    cratesTriggered: 0,
    durabilitySpent: 0,
    durabilityRepaired: 0,
    longestFall: 0,
    deepestRow: 0,
    cashOre: 0,
    cashSpecial: 0,
    cashTerrain: 0,
    cashExit: 0,
  };
}

export function createRun(options: CreateRunOptions): RunState {
  const { seed, level, cards, pickaxeLevel } = options;
  const mods: RunModifiers = computeModifiers(cards, pickaxeLevel);
  const grid = new Grid(
    level.gridWidth,
    createRowGenerator({
      level,
      seed,
      oreWeightMul: mods.oreWeightMul,
      specialWeightMul: mods.specialWeightMul,
    }),
  );
  grid.ensureThrough(GENERATION_LOOKAHEAD);

  const maxDurability = startingDurability(level, mods);
  const startRng = deriveRng(seed, level.seedSalt, 0x5fa3);
  const startCol = nextInt(startRng, level.gridWidth);

  const state: RunState = {
    runId: options.runId ?? makeId('run'),
    seed,
    configVersion: options.configVersion ?? CONFIG_VERSION,
    level,
    grid,
    player: { col: startCol, row: 0 },
    durability: maxDurability,
    maxDurability,
    cash: 0,
    depth: 0,
    status: 'running',
    endReason: null,
    commands: [],
    mods,
    stats: emptyStats(),
  };

  return state;
}

interface ChainNode {
  col: number;
  row: number;
  kind: BlockKind;
  variant: number;
  wave: number;
}

interface DestroyOutcome {
  destroyed: boolean;
  wasExit: boolean;
}

function destroyBlock(
  state: RunState,
  col: number,
  row: number,
  source: 'dig' | 'chain',
  wave: number,
  removed: Removal[],
  events: GameEvent[],
  queue: ChainNode[],
): DestroyOutcome {
  const kind = state.grid.kindAt(col, row);
  if (kind === BlockKind.Empty) return { destroyed: false, wasExit: false };

  const def = BLOCKS[kind];
  if (!def.destructible) return { destroyed: false, wasExit: false };

  const variant = state.grid.variantAt(col, row);
  state.grid.setAt(col, row, BlockKind.Empty, 0);

  const cash = cashFor(kind, row, state.mods, source === 'chain');
  state.cash += cash;

  if (source === 'dig') state.stats.blocksMined++;
  else state.stats.chainBlocks++;

  if (kind === BlockKind.Exit) state.stats.cashExit += cash;
  else if (def.isOre) {
    state.stats.oreMined++;
    state.stats.cashOre += cash;
  } else if (def.family === 'special') state.stats.cashSpecial += cash;
  else state.stats.cashTerrain += cash;

  removed.push({ col, row, kind, cash, source, wave });
  events.push({ t: 'block_removed', col, row, kind, cash, source, wave });

  if (def.repair > 0) {
    const before = state.durability;
    state.durability = Math.min(state.maxDurability, state.durability + def.repair);
    const amount = state.durability - before;
    if (amount > 0) {
      state.stats.durabilityRepaired += amount;
      events.push({ t: 'durability_repaired', amount, remaining: state.durability });
    }
  }

  if (def.chain.type !== 'none') {
    queue.push({ col, row, kind, variant, wave: wave + 1 });
  }

  return { destroyed: true, wasExit: kind === BlockKind.Exit };
}

/** Clear every cell a triggered special block affects. */
function applyChain(
  state: RunState,
  node: ChainNode,
  removed: Removal[],
  events: GameEvent[],
  queue: ChainNode[],
): { cleared: number; wasExit: boolean } {
  let cleared = 0;
  let wasExit = false;

  const clearCell = (col: number, row: number): 'stop' | 'continue' => {
    if (!state.grid.inBounds(col, row)) return 'stop';
    const kind = state.grid.kindAt(col, row);
    if (kind === BlockKind.Bedrock) return 'stop';
    const outcome = destroyBlock(state, col, row, 'chain', node.wave, removed, events, queue);
    if (outcome.destroyed) cleared++;
    if (outcome.wasExit) wasExit = true;
    return 'continue';
  };

  if (node.kind === BlockKind.Bomb) {
    const radius = bombRadius(state.mods);
    for (let dRow = -radius; dRow <= radius; dRow++) {
      for (let dCol = -radius; dCol <= radius; dCol++) {
        if (dRow === 0 && dCol === 0) continue;
        clearCell(node.col + dCol, node.row + dRow);
      }
    }
    return { cleared, wasExit };
  }

  if (node.kind === BlockKind.Arrow) {
    const length = BLOCKS[BlockKind.Arrow].chain.length;
    if (node.variant === ArrowVariant.Down) {
      for (let i = 1; i <= length; i++) {
        if (clearCell(node.col, node.row + i) === 'stop') break;
      }
    } else {
      for (const dir of [-1, 1]) {
        for (let i = 1; i <= length; i++) {
          if (clearCell(node.col + dir * i, node.row) === 'stop') break;
        }
      }
    }
  }

  return { cleared, wasExit };
}

function failure(reason: DigFailure, target: Cell, events: GameEvent[] = []): DigResult {
  return {
    ok: false,
    reason,
    cost: 0,
    cashGained: 0,
    durabilityRepaired: 0,
    target,
    work: null,
    steps: [],
    removed: [],
    landedRow: null,
    fellDistance: 0,
    events,
  };
}

/**
 * The single entry point for player intent. Mutates `state` and returns a
 * description the renderer can animate plus the raw event list.
 */
export function applyDig(state: RunState, col: number, row: number): DigResult {
  const target: Cell = { col, row };
  const events: GameEvent[] = [];
  const removed: Removal[] = [];

  if (state.status !== 'running') return failure('run_over', target);
  if (!state.grid.inBounds(col, row)) return failure('out_of_bounds', target);

  const kind = state.grid.kindAt(col, row);
  if (kind === BlockKind.Empty) return failure('not_solid', target);
  if (!BLOCKS[kind].destructible) return failure('indestructible', target);
  if (state.durability <= 0) return failure('no_durability', target);

  const plan = findDigPlan(state.grid, state.player, target);
  if (!plan) return failure('unreachable', target);

  const cashBefore = state.cash;
  const repairedBefore = state.stats.durabilityRepaired;
  const depthBefore = state.depth;

  // --- pay the cost (the last swing is always allowed: it may win the run) ---
  const cost = blockCost(kind, state.mods);
  const spent = Math.min(cost, state.durability);
  state.durability -= spent;
  state.stats.durabilitySpent += spent;
  events.push({ t: 'durability_spent', amount: spent, remaining: state.durability });

  state.commands.push({ col, row });

  // --- walk / fall into position ---
  if (plan.steps.length > 0) {
    state.player = { col: plan.work.col, row: plan.work.row };
    events.push({ t: 'player_moved', col: plan.work.col, row: plan.work.row });
  }

  // --- break the block, then resolve every chain it sets off ---
  const queue: ChainNode[] = [];
  let exitDug = false;

  const direct = destroyBlock(state, col, row, 'dig', 0, removed, events, queue);
  exitDug = exitDug || direct.wasExit;

  let guard = 0;
  while (queue.length > 0 && guard++ < MAX_CHAIN_STEPS) {
    const node = queue.shift();
    if (!node) break;
    const result = applyChain(state, node, removed, events, queue);
    if (result.cleared > 0) {
      state.stats.chainsTriggered++;
      state.stats.cratesTriggered++;
      events.push({
        t: 'chain_triggered',
        col: node.col,
        row: node.row,
        kind: node.kind,
        wave: node.wave,
        cleared: result.cleared,
      });
    }
    exitDug = exitDug || result.wasExit;
  }

  // --- drop into the hole ---
  state.grid.ensureAhead(row);
  const fall = resolveFall(state.grid, col, row);
  state.player = { col, row: fall.row };
  if (fall.distance > 0) {
    events.push({ t: 'player_fell', col, fromRow: row, toRow: fall.row, distance: fall.distance });
    state.stats.longestFall = Math.max(state.stats.longestFall, fall.distance);
  }

  state.grid.ensureAhead(state.player.row);
  state.depth = Math.max(state.depth, state.player.row);
  state.stats.deepestRow = state.depth;
  if (state.depth > depthBefore) events.push({ t: 'depth_reached', depth: state.depth });

  // --- resolve the run ---
  if (exitDug) {
    state.status = 'won';
    state.endReason = 'exit';
  } else if (state.durability <= 0) {
    state.status = 'lost';
    state.endReason = 'durability';
  } else if (!hasLegalTarget(state.grid, state.player)) {
    state.status = 'lost';
    state.endReason = 'stuck';
  }

  if (state.status !== 'running') {
    events.push({
      t: 'run_end',
      status: state.status,
      reason: state.endReason ?? 'durability',
      cash: state.cash,
      depth: state.depth,
    });
  }

  return {
    ok: true,
    cost: spent,
    cashGained: state.cash - cashBefore,
    durabilityRepaired: state.stats.durabilityRepaired - repairedBefore,
    target,
    work: plan.work,
    steps: plan.steps,
    removed,
    landedRow: fall.row,
    fellDistance: fall.distance,
    events,
  };
}

export interface TargetInfo {
  col: number;
  row: number;
  kind: BlockKind;
  cost: number;
  /** False when the block costs more durability than remains. */
  affordable: boolean;
}

/** Reachable, diggable blocks with their durability cost, for the HUD. */
export function getLegalTargets(state: RunState): TargetInfo[] {
  return legalTargets(state.grid, state.player).map((target) => {
    const cost = blockCost(target.kind, state.mods);
    return { ...target, cost, affordable: cost <= state.durability };
  });
}

export function isRunOver(state: RunState): boolean {
  return state.status !== 'running';
}

/** Re-run a recorded command list; used by replay tooling and tests. */
export function replayCommands(options: CreateRunOptions, commands: readonly Cell[]): RunState {
  const state = createRun(options);
  for (const command of commands) {
    applyDig(state, command.col, command.row);
    if (state.status !== 'running') break;
  }
  return state;
}
