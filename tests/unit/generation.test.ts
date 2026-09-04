import { describe, expect, it } from 'vitest';
import { BlockKind } from '../../src/config/blocks.ts';
import { LEVELS, levelById } from '../../src/config/levels.ts';
import { Grid } from '../../src/core/grid.ts';
import { createRowGenerator } from '../../src/core/generation.ts';

function makeGrid(levelIndex = 0, oreWeightMul = 0, specialWeightMul = 0): Grid {
  const level = LEVELS[levelIndex];
  return new Grid(
    level.gridWidth,
    createRowGenerator({ level, seed: 4242, oreWeightMul, specialWeightMul }),
  );
}

describe('row generation', () => {
  it('leaves row 0 as open air', () => {
    const grid = makeGrid();
    grid.ensureThrough(2);
    for (let col = 0; col < grid.width; col++) {
      expect(grid.kindAt(col, 0)).toBe(BlockKind.Empty);
    }
  });

  it('makes the surface row solid soil so the first dig always works', () => {
    const grid = makeGrid();
    grid.ensureThrough(3);
    for (let col = 0; col < grid.width; col++) {
      expect(grid.kindAt(col, 1)).toBe(BlockKind.Dirt);
    }
  });

  it('generates the same row for the same seed, regardless of order', () => {
    const level = LEVELS[0];
    const forward = new Grid(level.gridWidth, createRowGenerator({ level, seed: 777, oreWeightMul: 0, specialWeightMul: 0 }));
    forward.ensureThrough(40);
    const skip = new Grid(level.gridWidth, createRowGenerator({ level, seed: 777, oreWeightMul: 0, specialWeightMul: 0 }));
    skip.ensureThrough(40);

    for (let row = 0; row <= 40; row++) {
      for (let col = 0; col < level.gridWidth; col++) {
        expect(skip.kindAt(col, row)).toBe(forward.kindAt(col, row));
      }
    }
  });

  it('changes the mine when the seed changes', () => {
    const level = LEVELS[0];
    const a = new Grid(level.gridWidth, createRowGenerator({ level, seed: 1, oreWeightMul: 0, specialWeightMul: 0 }));
    const b = new Grid(level.gridWidth, createRowGenerator({ level, seed: 2, oreWeightMul: 0, specialWeightMul: 0 }));
    a.ensureThrough(30);
    b.ensureThrough(30);
    let differences = 0;
    for (let row = 0; row <= 30; row++) {
      for (let col = 0; col < level.gridWidth; col++) {
        if (a.kindAt(col, row) !== b.kindAt(col, row)) differences++;
      }
    }
    expect(differences).toBeGreaterThan(20);
  });

  it('never places two bedrock side by side', () => {
    for (let levelIndex = 0; levelIndex < LEVELS.length; levelIndex++) {
      const grid = makeGrid(levelIndex);
      const level = LEVELS[levelIndex];
      grid.ensureThrough(level.targetDepth - 1);
      for (let row = 1; row < level.targetDepth; row++) {
        for (let col = 1; col < grid.width; col++) {
          const left = grid.kindAt(col - 1, row);
          const here = grid.kindAt(col, row);
          expect(left === BlockKind.Bedrock && here === BlockKind.Bedrock).toBe(false);
        }
      }
    }
  });

  it('always leaves at least two diggable columns per row', () => {
    for (let levelIndex = 0; levelIndex < LEVELS.length; levelIndex++) {
      const grid = makeGrid(levelIndex);
      const level = LEVELS[levelIndex];
      grid.ensureThrough(Math.min(level.targetDepth - 1, 200));
      for (let row = 1; row < level.targetDepth; row++) {
        let diggable = 0;
        for (let col = 0; col < grid.width; col++) {
          if (grid.kindAt(col, row) !== BlockKind.Bedrock) diggable++;
        }
        expect(diggable).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('turns the target depth into a full-width goal layer', () => {
    const grid = makeGrid(0);
    const level = LEVELS[0];
    grid.ensureThrough(level.targetDepth);
    for (let col = 0; col < grid.width; col++) {
      expect(grid.kindAt(col, level.targetDepth)).toBe(BlockKind.Exit);
    }
  });

  it('caps the world with bedrock below the goal', () => {
    const grid = makeGrid(0);
    const level = LEVELS[0];
    grid.ensureThrough(level.targetDepth + 4);
    for (let col = 0; col < grid.width; col++) {
      expect(grid.kindAt(col, level.targetDepth + 2)).toBe(BlockKind.Bedrock);
    }
  });

  it('produces more ore when the ore modifier is raised', () => {
    const level = LEVELS[0];
    const count = (mul: number): number => {
      const grid = new Grid(level.gridWidth, createRowGenerator({ level, seed: 31337, oreWeightMul: mul, specialWeightMul: 0 }));
      grid.ensureThrough(level.targetDepth - 1);
      let ore = 0;
      for (let row = 1; row < level.targetDepth; row++) {
        for (let col = 0; col < grid.width; col++) {
          const kind = grid.kindAt(col, row);
          if (kind === BlockKind.Copper || kind === BlockKind.Gold) ore++;
        }
      }
      return ore;
    };
    expect(count(1)).toBeGreaterThan(count(0));
  });

  it('produces more special blocks when the special modifier is raised', () => {
    const level = LEVELS[0];
    const count = (mul: number): number => {
      const grid = new Grid(level.gridWidth, createRowGenerator({ level, seed: 5150, oreWeightMul: 0, specialWeightMul: mul }));
      grid.ensureThrough(level.targetDepth - 1);
      let special = 0;
      for (let row = 1; row < level.targetDepth; row++) {
        for (let col = 0; col < grid.width; col++) {
          const kind = grid.kindAt(col, row);
          if (kind === BlockKind.Bomb || kind === BlockKind.Arrow || kind === BlockKind.Repair || kind === BlockKind.Vault) {
            special++;
          }
        }
      }
      return special;
    };
    expect(count(1)).toBeGreaterThan(count(0));
  });

  it('generates rows lazily and only once', () => {
    let calls = 0;
    const level = levelById('sunlit_shaft');
    const generator = createRowGenerator({ level, seed: 9, oreWeightMul: 0, specialWeightMul: 0 });
    const grid = new Grid(level.gridWidth, (row) => {
      calls++;
      return generator(row);
    });
    grid.ensureThrough(10);
    const afterFirst = calls;
    grid.ensureThrough(10);
    expect(calls).toBe(afterFirst);
    expect(afterFirst).toBe(11);
  });
});
