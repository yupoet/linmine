import { describe, expect, it } from 'vitest';
import { BlockKind } from '../../src/config/blocks.ts';
import { applyDig } from '../../src/core/run.ts';
import { makeRun } from '../helpers/grid.ts';

describe('chains', () => {
  it('clears a 3x3 area around a blast crate for free', () => {
    const run = makeRun({
      rows: ['@.....', 'dBdddd', 'dddddd', 'dddddd'],
      durability: 20,
      floor: true,
    });
    const before = run.durability;
    const result = applyDig(run, 1, 1);

    expect(result.ok).toBe(true);
    expect(result.cost).toBe(2); // only the tapped crate was paid for
    expect(run.durability).toBe(before - 2);

    for (let row = 0; row <= 2; row++) {
      for (let col = 0; col <= 2; col++) {
        expect(run.grid.kindAt(col, row)).toBe(BlockKind.Empty);
      }
    }
    // Outside the blast stays intact.
    expect(run.grid.kindAt(3, 1)).not.toBe(BlockKind.Empty);
    expect(run.grid.kindAt(1, 3)).not.toBe(BlockKind.Empty);
  });

  it('cascades when a chain reaches another crate', () => {
    const run = makeRun({
      rows: ['@.....', 'dBdddd', 'dBdddd', 'dddddd', 'dddddd'],
      durability: 20,
      floor: true,
    });
    const result = applyDig(run, 1, 1);
    const waves = new Set(result.removed.map((entry) => entry.wave));
    expect(waves.has(0)).toBe(true);
    expect(waves.has(1)).toBe(true);
    // The second crate is swept up in wave 1 and fires in wave 2, reaching a
    // row the first blast could not touch.
    expect(waves.has(2)).toBe(true);
    expect(result.removed.some((entry) => entry.wave === 2 && entry.row === 3)).toBe(true);
    expect(run.grid.kindAt(1, 2)).toBe(BlockKind.Empty);
    expect(run.grid.kindAt(1, 3)).toBe(BlockKind.Empty);
  });

  it('widens the blast with the Big Blast card', () => {
    const narrow = makeRun({ rows: ['@.....', 'dBdddd', 'dddddd', 'dddddd'], durability: 20, floor: true });
    const wide = makeRun({
      rows: ['@.....', 'dBdddd', 'dddddd', 'dddddd'],
      durability: 20,
      cards: [{ id: 'big_blast', level: 1 }],
      floor: true,
    });
    const narrowResult = applyDig(narrow, 1, 1);
    const wideResult = applyDig(wide, 1, 1);
    expect(wideResult.removed.length).toBeGreaterThan(narrowResult.removed.length);
  });

  it('drills straight down and stops at bedrock', () => {
    const run = makeRun({
      rows: ['@.....', 'sAdddd', 'dddddd', 'dddddd', 'dbdddd', 'dddddd', 'dddddd'],
      durability: 20,
      floor: true,
    });
    applyDig(run, 1, 1);
    expect(run.grid.kindAt(1, 2)).toBe(BlockKind.Empty);
    expect(run.grid.kindAt(1, 3)).toBe(BlockKind.Empty);
    expect(run.grid.kindAt(1, 4)).toBe(BlockKind.Bedrock);
    expect(run.grid.kindAt(0, 3)).not.toBe(BlockKind.Empty);
  });

  it('drills sideways in both directions and stops at bedrock', () => {
    const run = makeRun({
      rows: ['@.....', 'ssasss', 'dddddd'],
      durability: 20,
      floor: true,
    });
    applyDig(run, 2, 1);
    expect(run.grid.kindAt(0, 1)).toBe(BlockKind.Empty);
    expect(run.grid.kindAt(1, 1)).toBe(BlockKind.Empty);
    expect(run.grid.kindAt(3, 1)).toBe(BlockKind.Empty);
    expect(run.grid.kindAt(2, 2)).not.toBe(BlockKind.Empty); // below is untouched
  });

  it('pays a chain bonus only for chained blocks', () => {
    const plain = makeRun({ rows: ['@.....', 'dBdccc', 'dddddd'], durability: 20, floor: true });
    const boosted = makeRun({
      rows: ['@.....', 'dBdccc', 'dddddd'],
      durability: 20,
      cards: [{ id: 'chain_bonus', level: 1 }],
      floor: true,
    });
    const plainCash = applyDig(plain, 1, 1).cashGained;
    const boostedCash = applyDig(boosted, 1, 1).cashGained;
    expect(boostedCash).toBeGreaterThan(plainCash);
  });

  it('restores durability from a supply crate caught in a chain', () => {
    const run = makeRun({
      rows: ['@.....', 'dBdddd', 'drdddd', 'dddddd'],
      durability: 20,
      floor: true,
    });
    run.durability = 10;
    const result = applyDig(run, 1, 1);
    expect(result.durabilityRepaired).toBeGreaterThan(0);
    expect(run.durability).toBeGreaterThan(8);
  });

  it('never restores more than the maximum durability', () => {
    const run = makeRun({ rows: ['@...', 'drdd'], durability: 20, floor: true });
    const result = applyDig(run, 1, 1);
    expect(result.ok).toBe(true);
    expect(run.durability).toBeLessThanOrEqual(run.maxDurability);
  });

  it('tags the tapped block as wave 0 and chained blocks as later waves', () => {
    const run = makeRun({
      rows: ['@.....', 'dBdddd', 'dddddd', 'dddddd'],
      durability: 20,
      floor: true,
    });
    const result = applyDig(run, 1, 1);
    expect(result.removed[0]).toMatchObject({ col: 1, row: 1, source: 'dig', wave: 0 });
    const chained = result.removed.filter((entry) => entry.source === 'chain');
    expect(chained.length).toBeGreaterThan(0);
    for (const entry of chained) expect(entry.wave).toBeGreaterThanOrEqual(1);
  });

  it('pays cash for ore swept up by a chain', () => {
    const run = makeRun({
      rows: ['@.....', 'dBdddd', 'ccgccc', 'dddddd'],
      durability: 20,
      floor: true,
    });
    const result = applyDig(run, 1, 1);
    const oreInChain = result.removed.filter(
      (entry) => entry.source === 'chain' && (entry.kind === BlockKind.Copper || entry.kind === BlockKind.Gold),
    );
    expect(oreInChain.length).toBeGreaterThan(0);
    expect(result.cashGained).toBeGreaterThan(0);
  });

  it('lets the miner fall through the space a chain opened', () => {
    const run = makeRun({
      rows: ['@.....', 'dAdddd', 'dddddd', 'dddddd', 'dddddd', 'dddddd', 'dddddd', 'dddddd'],
      durability: 20,
      floor: true,
    });
    const result = applyDig(run, 1, 1);
    expect(result.fellDistance).toBeGreaterThanOrEqual(5);
    expect(run.player.row).toBeGreaterThanOrEqual(6);
  });
});
