import { BlockKind } from '../config/blocks.ts';
import { MAX_ROWS } from '../config/version.ts';
import type { Grid } from './grid.ts';

export interface Cell {
  col: number;
  row: number;
}

export interface PathStep extends Cell {
  /** True when this step is the landing cell of a fall, not a walked cell. */
  fell: boolean;
}

export interface DigPlan {
  target: Cell;
  /** Standable cell the miner occupies while swinging. */
  work: Cell;
  /** Walk/fall steps from the miner's current cell to `work` (exclusive). */
  steps: PathStep[];
}

export interface LegalTarget {
  col: number;
  row: number;
  kind: BlockKind;
}

/** A cell the miner can occupy: empty, with solid ground underneath. */
export function isStandable(grid: Grid, col: number, row: number): boolean {
  if (!grid.inBounds(col, row)) return false;
  if (!grid.isEmpty(col, row)) return false;
  return grid.isSolid(col, row + 1);
}

/** Drop a cell straight down until it lands on solid ground. */
export function resolveFall(grid: Grid, col: number, row: number): { row: number; distance: number } {
  grid.ensureAhead(row);
  let current = row;
  let distance = 0;
  while (current < MAX_ROWS && grid.isEmpty(col, current + 1)) {
    current++;
    distance++;
  }
  return { row: current, distance };
}

export interface ReachResult {
  cells: Set<number>;
  parent: Map<number, number>;
  /** Indices reached by falling rather than walking. */
  fellInto: Set<number>;
}

const MAX_BFS_NODES = 4096;

/**
 * Breadth-first flood over standable cells.
 *
 * Edges: walk sideways to a standable neighbour, or step into an open pit and
 * fall to wherever the drop ends. Falls are one-way, which is what makes
 * "walk off the ledge" a real decision instead of a free undo.
 */
export function computeReach(grid: Grid, start: Cell, maxNodes = MAX_BFS_NODES): ReachResult {
  const parent = new Map<number, number>();
  const fellInto = new Set<number>();
  const cells = new Set<number>();

  if (!isStandable(grid, start.col, start.row)) return { cells, parent, fellInto };

  const startIndex = grid.index(start.col, start.row);
  cells.add(startIndex);
  const queue: number[] = [startIndex];
  let head = 0;

  while (head < queue.length && cells.size < maxNodes) {
    const index = queue[head++];
    const row = Math.floor(index / grid.width);
    const col = index - row * grid.width;

    for (const dir of [-1, 1]) {
      const nextCol = col + dir;
      if (nextCol < 0 || nextCol >= grid.width) continue;

      if (isStandable(grid, nextCol, row)) {
        const nextIndex = grid.index(nextCol, row);
        if (!cells.has(nextIndex)) {
          cells.add(nextIndex);
          parent.set(nextIndex, index);
          queue.push(nextIndex);
        }
        continue;
      }

      // Open pit: step in and fall. Only worth it if the drop actually drops.
      if (grid.isEmpty(nextCol, row)) {
        const landing = resolveFall(grid, nextCol, row);
        if (landing.distance > 0) {
          const nextIndex = grid.index(nextCol, landing.row);
          if (!cells.has(nextIndex)) {
            cells.add(nextIndex);
            parent.set(nextIndex, index);
            fellInto.add(nextIndex);
            queue.push(nextIndex);
          }
        }
      }
    }
  }

  return { cells, parent, fellInto };
}

/** Rebuild the step list from a BFS result. Empty when already in place. */
export function pathFromReach(grid: Grid, reach: ReachResult, start: Cell, goal: Cell): PathStep[] | null {
  const goalIndex = grid.index(goal.col, goal.row);
  const startIndex = grid.index(start.col, start.row);
  if (!reach.cells.has(goalIndex)) return null;
  if (goalIndex === startIndex) return [];

  const steps: PathStep[] = [];
  let index = goalIndex;
  let guard = 0;
  while (index !== startIndex && guard++ < MAX_BFS_NODES) {
    const row = Math.floor(index / grid.width);
    steps.push({
      col: index - row * grid.width,
      row,
      fell: reach.fellInto.has(index),
    });
    const parentIndex = reach.parent.get(index);
    if (parentIndex === undefined) return null;
    index = parentIndex;
  }
  steps.reverse();
  return steps;
}

/** The five cells a miner can stand in while digging `target`. */
export function workPositionsFor(target: Cell): Cell[] {
  return [
    { col: target.col, row: target.row - 1 },
    { col: target.col - 1, row: target.row },
    { col: target.col + 1, row: target.row },
    { col: target.col - 1, row: target.row - 1 },
    { col: target.col + 1, row: target.row - 1 },
  ];
}

/**
 * The five blocks a miner standing in `work` could reach: straight down, both
 * sides, and both downward diagonals. This is the inverse of
 * `workPositionsFor`.
 */
export function targetsFor(work: Cell): Cell[] {
  return [
    { col: work.col, row: work.row + 1 },
    { col: work.col - 1, row: work.row },
    { col: work.col + 1, row: work.row },
    { col: work.col - 1, row: work.row + 1 },
    { col: work.col + 1, row: work.row + 1 },
  ];
}

export function isWorkPositionFor(work: Cell, target: Cell): boolean {
  const dCol = target.col - work.col;
  const dRow = target.row - work.row;
  if (dRow === 1 && Math.abs(dCol) <= 1) return true;
  return dRow === 0 && Math.abs(dCol) === 1;
}

/**
 * Find where the miner must stand to dig `target`, preferring the shortest
 * route. Returns null when the target cannot be reached.
 */
export function findDigPlan(grid: Grid, start: Cell, target: Cell): DigPlan | null {
  if (!grid.inBounds(target.col, target.row)) return null;
  if (grid.isEmpty(target.col, target.row)) return null;

  const reach = computeReach(grid, start);
  let best: { work: Cell; steps: PathStep[] } | null = null;

  for (const work of workPositionsFor(target)) {
    if (!isStandable(grid, work.col, work.row)) continue;
    const steps = pathFromReach(grid, reach, start, work);
    if (!steps) continue;
    if (!best || steps.length < best.steps.length) {
      best = { work, steps };
      if (steps.length === 0) break;
    }
  }

  if (!best) return null;
  return { target, work: best.work, steps: best.steps };
}

/** Every destructible block the miner can currently reach. */
export function legalTargets(grid: Grid, start: Cell): LegalTarget[] {
  const reach = computeReach(grid, start);
  const seen = new Set<number>();
  const out: LegalTarget[] = [];

  for (const index of reach.cells) {
    const row = Math.floor(index / grid.width);
    const col = index - row * grid.width;
    for (const target of targetsFor({ col, row })) {
      if (!grid.inBounds(target.col, target.row)) continue;
      const kind = grid.kindAt(target.col, target.row);
      if (kind === BlockKind.Empty) continue;
      if (!isWorkPositionFor({ col, row }, target)) continue;
      const targetIndex = grid.index(target.col, target.row);
      if (seen.has(targetIndex)) continue;
      seen.add(targetIndex);
      if (kind === BlockKind.Bedrock) continue;
      out.push({ col: target.col, row: target.row, kind });
    }
  }

  return out;
}

/** Cheap variant used for the stuck check after every dig. */
export function hasLegalTarget(grid: Grid, start: Cell): boolean {
  const reach = computeReach(grid, start);
  for (const index of reach.cells) {
    const row = Math.floor(index / grid.width);
    const col = index - row * grid.width;
    for (const target of targetsFor({ col, row })) {
      if (!grid.inBounds(target.col, target.row)) continue;
      if (!isWorkPositionFor({ col, row }, target)) continue;
      const kind = grid.kindAt(target.col, target.row);
      if (kind !== BlockKind.Empty && kind !== BlockKind.Bedrock) return true;
    }
  }
  return false;
}
