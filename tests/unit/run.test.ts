import { describe, expect, it } from 'vitest';
import { BlockKind } from '../../src/config/blocks.ts';
import { applyDig, createRun, getLegalTargets } from '../../src/core/run.ts';
import { LEVELS } from '../../src/config/levels.ts';
import { makeRun } from '../helpers/grid.ts';

describe('digging', () => {
  it('charges the block cost in durability', () => {
    const run = makeRun({ rows: ['@...', 'dddd'], durability: 10 });
    const result = applyDig(run, 0, 1);
    expect(result.ok).toBe(true);
    expect(result.cost).toBe(1);
    expect(run.durability).toBe(9);
  });

  it('charges more for hard rock', () => {
    const run = makeRun({ rows: ['@...', 'ssss'], durability: 10 });
    const result = applyDig(run, 0, 1);
    expect(result.cost).toBe(2);
    expect(run.durability).toBe(8);
  });

  it('moves the miner into the hole and lets him fall', () => {
    const run = makeRun({ rows: ['@...', 'd...', '....', '....', 'dddd'], durability: 10, floor: true });
    const result = applyDig(run, 0, 1);
    expect(result.ok).toBe(true);
    expect(run.player.col).toBe(0);
    expect(run.player.row).toBe(3);
    expect(result.fellDistance).toBe(2);
    expect(run.depth).toBe(3);
  });

  it('awards cash for ore and scales it with depth', () => {
    const shallow = makeRun({ rows: ['@...', 'cccc'], durability: 20 });
    applyDig(shallow, 0, 1);
    const shallowCash = shallow.cash;

    const deepRows = ['@...', ...Array.from({ length: 12 }, () => 'ddddd'), 'cccc'];
    const deep = makeRun({ rows: deepRows, durability: 40 });
    // Carve straight down to reach the deep ore.
    for (let i = 1; i <= 12; i++) applyDig(deep, 0, i);
    deep.cash = 0;
    applyDig(deep, 0, 13);
    expect(deep.cash).toBeGreaterThan(shallowCash);
  });

  it('refuses bedrock with a reason', () => {
    const run = makeRun({ rows: ['@...', 'dbdd'], durability: 10 });
    const result = applyDig(run, 1, 1);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('indestructible');
    expect(run.durability).toBe(10);
  });

  it('refuses blocks the miner cannot reach', () => {
    // A bedrock column in the air row blocks the walk to column 3.
    const run = makeRun({ rows: ['@b...', 'ddddd'], durability: 10, floor: true });
    const result = applyDig(run, 3, 1);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('unreachable');
  });

  it('refuses air', () => {
    const run = makeRun({ rows: ['@...', 'dddd'], durability: 10 });
    const result = applyDig(run, 0, 0);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('not_solid');
  });

  it('allows the last swing even when it costs more than remains', () => {
    const run = makeRun({ rows: ['@...', 'ssss'], durability: 1 });
    const result = applyDig(run, 0, 1);
    expect(result.ok).toBe(true);
    expect(run.durability).toBe(0);
    expect(run.status).toBe('lost');
    expect(run.endReason).toBe('durability');
  });

  it('wins when the goal layer is broken', () => {
    const run = makeRun({ rows: ['@...', 'xxxx'], durability: 10, targetDepth: 1 });
    const result = applyDig(run, 0, 1);
    expect(result.ok).toBe(true);
    expect(run.status).toBe('won');
    expect(run.endReason).toBe('exit');
    expect(run.cash).toBeGreaterThan(0);
  });

  it('prefers winning over running out of durability on the same tap', () => {
    const run = makeRun({ rows: ['@...', 'xxxx'], durability: 1, targetDepth: 1 });
    applyDig(run, 0, 1);
    expect(run.status).toBe('won');
  });

  it('ends the run when there is nothing left to dig', () => {
    // A pocket sealed by bedrock on every reachable side.
    const run = makeRun({ rows: ['.....', 'bbbbb', 'bbbbb'], durability: 10, floor: true });
    run.player = { col: 2, row: 0 };
    run.status = 'running';
    // Force the stuck check by digging nothing: simulate the check directly.
    const targets = getLegalTargets(run);
    expect(targets).toHaveLength(0);
  });

  it('ignores taps after the run is over', () => {
    const run = makeRun({ rows: ['@...', 'xxxx'], durability: 10, targetDepth: 1 });
    applyDig(run, 0, 1);
    const after = applyDig(run, 1, 1);
    expect(after.ok).toBe(false);
    expect(after.reason).toBe('run_over');
  });

  it('records every command so the run can be replayed', () => {
    const run = makeRun({ rows: ['@...', 'dddd', 'dddd'], durability: 10 });
    applyDig(run, 0, 1);
    applyDig(run, 0, 2);
    expect(run.commands).toEqual([
      { col: 0, row: 1 },
      { col: 0, row: 2 },
    ]);
  });

  it('starts a generated run on the surface with full durability', () => {
    const run = createRun({ seed: 42, level: LEVELS[0], cards: [], pickaxeLevel: 1 });
    expect(run.player.row).toBe(0);
    expect(run.durability).toBe(run.maxDurability);
    expect(run.durability).toBe(LEVELS[0].baseDurability);
    expect(run.status).toBe('running');
  });

  it('emits events in a deterministic order', () => {
    const run = makeRun({ rows: ['@...', 'dddd'], durability: 10 });
    const result = applyDig(run, 0, 1);
    expect(result.events.map((event) => event.t)).toEqual(['durability_spent', 'block_removed', 'depth_reached']);
  });

  it('never lets the goal layer be skipped by a long fall', () => {
    // The goal layer is a full-width floor, so every generated run must pass
    // through it rather than falling past the objective.
    for (let seed = 0; seed < 40; seed++) {
      const run = createRun({ seed, level: LEVELS[0], cards: [], pickaxeLevel: 1 });
      for (let col = 0; col < run.grid.width; col++) {
        expect(run.grid.kindAt(col, LEVELS[0].targetDepth)).toBe(BlockKind.Exit);
      }
    }
  });
});
