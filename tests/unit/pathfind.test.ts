import { describe, expect, it } from 'vitest';
import { BlockKind } from '../../src/config/blocks.ts';
import { gridFrom } from '../helpers/grid.ts';
import {
  computeReach,
  findDigPlan,
  hasLegalTarget,
  isStandable,
  legalTargets,
  resolveFall,
  targetsFor,
} from '../../src/core/pathfind.ts';

describe('pathfinding', () => {
  it('treats an air cell with solid ground below as standable', () => {
    // Row 1 has a gap under column 2, so column 2 of row 0 is a pit, not a ledge.
    const grid = gridFrom(['@..d', 'dd.d'], { floor: true });
    expect(isStandable(grid, 0, 0)).toBe(true);
    expect(isStandable(grid, 2, 0)).toBe(false);
  });

  it('lands a fall on the first solid ground', () => {
    const grid = gridFrom(['@....', 'd....', '.....', 'ddddd'], { floor: true });
    const fall = resolveFall(grid, 1, 0);
    expect(fall.distance).toBe(2);
    expect(fall.row).toBe(2);
  });

  it('walks sideways along a ledge but never climbs', () => {
    const grid = gridFrom(['@...', 'ddddd'], { floor: true });
    const reach = computeReach(grid, { col: 0, row: 0 });
    expect(reach.cells.has(grid.index(3, 0))).toBe(true);
    expect(reach.cells.has(grid.index(0, 1))).toBe(false);
  });

  it('steps into an open pit and records where the drop ends', () => {
    // Row 1 has a gap at col 1-2; walking right drops the miner to row 2.
    const grid = gridFrom(['@...', 'd...', 'dddd'], { floor: true });
    const reach = computeReach(grid, { col: 0, row: 0 });
    const landing = grid.index(1, 1);
    expect(reach.cells.has(landing)).toBe(true);
    expect(reach.fellInto.has(landing)).toBe(true);
  });

  it('cannot walk across a bedrock wall', () => {
    const grid = gridFrom(['@.b..', 'ddddd'], { floor: true });
    const reach = computeReach(grid, { col: 0, row: 0 });
    expect(reach.cells.has(grid.index(1, 0))).toBe(true);
    expect(reach.cells.has(grid.index(3, 0))).toBe(false);
  });

  it('finds a work position below, beside and diagonally below a target', () => {
    const grid = gridFrom(['@...', 'dddd', 'ssss'], { floor: true });

    const below = findDigPlan(grid, { col: 0, row: 0 }, { col: 0, row: 1 });
    expect(below?.work).toEqual({ col: 0, row: 0 });

    const side = findDigPlan(grid, { col: 0, row: 0 }, { col: 1, row: 0 });
    expect(side).toBeNull(); // (1,0) is air, not a block

    const diagonal = findDigPlan(grid, { col: 0, row: 0 }, { col: 1, row: 1 });
    expect(diagonal?.work).toEqual({ col: 0, row: 0 });
  });

  it('refuses targets that cannot be reached', () => {
    const grid = gridFrom(['@.b..', 'ddddd'], { floor: true });
    expect(findDigPlan(grid, { col: 0, row: 0 }, { col: 4, row: 0 })).toBeNull();
  });

  it('inverts work positions and targets consistently', () => {
    const work = { col: 2, row: 3 };
    for (const target of targetsFor(work)) {
      const plan = findDigPlan(
        gridFrom(['......', '......', '......', '......', 'dddddd'], { floor: true }),
        work,
        target,
      );
      // Every listed target must be adjacent in one of the five legal ways.
      const dRow = target.row - work.row;
      const dCol = target.col - work.col;
      expect(plan === null || Math.abs(dCol) <= 1).toBe(true);
      expect(dRow === 1 || (dRow === 0 && Math.abs(dCol) === 1)).toBe(true);
    }
  });

  it('lists only destructible, reachable blocks as legal targets', () => {
    const grid = gridFrom(['@...', 'dbbd'], { floor: true });
    const targets = legalTargets(grid, { col: 0, row: 0 });
    const kinds = targets.map((target) => target.kind);
    expect(kinds).toContain(BlockKind.Dirt);
    expect(kinds).not.toContain(BlockKind.Bedrock);
    for (const target of targets) {
      expect(grid.isSolid(target.col, target.row)).toBe(true);
    }
  });

  it('reports no legal target when walled in by bedrock', () => {
    // Ledge at row 0; below is bedrock, both sides are bedrock, diagonals bedrock.
    const grid = gridFrom(['.b.b.', 'bbbbb', 'bbbbb'], { floor: true });
    const grid2 = gridFrom(['.....', 'bbbbb', 'bbbbb'], { floor: true });
    expect(hasLegalTarget(grid2, { col: 2, row: 0 })).toBe(false);
    expect(grid.kindAt(2, 1)).toBe(BlockKind.Bedrock);
  });
});
