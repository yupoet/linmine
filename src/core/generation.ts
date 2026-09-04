import { ArrowVariant, BlockKind, type WeightKey } from '../config/blocks.ts';
import { bandForRow, type LevelDef } from '../config/levels.ts';
import type { GridRow } from './grid.ts';
import { deriveRng, nextChance, nextInt, nextWeighted, type RngState } from './rng.ts';

export interface GenerationOptions {
  level: LevelDef;
  seed: number;
  /** Additive multipliers coming from equipped cards. */
  oreWeightMul: number;
  specialWeightMul: number;
}

const WEIGHT_KEYS: readonly WeightKey[] = [
  'dirt',
  'stone',
  'copper',
  'gold',
  'bedrock',
  'bomb',
  'arrow',
  'repair',
  'vault',
];

const ORE_KEYS: readonly WeightKey[] = ['copper', 'gold'];
const SPECIAL_KEYS: readonly WeightKey[] = ['bomb', 'arrow', 'repair', 'vault'];

const KIND_BY_WEIGHT: Record<WeightKey, BlockKind> = {
  dirt: BlockKind.Dirt,
  stone: BlockKind.Stone,
  copper: BlockKind.Copper,
  gold: BlockKind.Gold,
  bedrock: BlockKind.Bedrock,
  bomb: BlockKind.Bomb,
  arrow: BlockKind.Arrow,
  repair: BlockKind.Repair,
  vault: BlockKind.Vault,
};

/** Rows below the exit get a bedrock floor so the world has a bottom. */
const FLOOR_ROWS_AFTER_EXIT = 2;

/**
 * Builds a per-row generator. Every row is derived from
 * hash(seed, salt, row) so rows may be generated lazily, in any order, and
 * always reproduce identically for replay and batch simulation.
 */
export function createRowGenerator(options: GenerationOptions): (row: number) => GridRow {
  const { level, seed, oreWeightMul, specialWeightMul } = options;
  const width = level.gridWidth;
  const exitRow = level.targetDepth;
  const floorRow = exitRow + FLOOR_ROWS_AFTER_EXIT;

  return (row: number): GridRow => {
    const kind = new Uint8Array(width);
    const variant = new Uint8Array(width);
    const rowData: GridRow = { kind, variant };

    if (row <= 0) return rowData;

    // The goal layer spans the whole width: it is a floor, so the miner can
    // never fall past it, and breaking any cell of it wins the run.
    if (row === exitRow) {
      kind.fill(BlockKind.Exit);
      return rowData;
    }
    if (row >= floorRow) {
      kind.fill(BlockKind.Bedrock);
      return rowData;
    }

    const rng: RngState = deriveRng(seed, level.seedSalt, row, 0x5173);

    // Surface row: solid soil everywhere so the first dig is always safe.
    if (row === 1) {
      kind.fill(BlockKind.Dirt);
      variant.fill(1);
      return rowData;
    }

    const band = bandForRow(level, row);
    const weights = WEIGHT_KEYS.map((key) => {
      let value = band[key];
      if (ORE_KEYS.includes(key)) value *= 1 + oreWeightMul;
      if (SPECIAL_KEYS.includes(key)) value *= 1 + specialWeightMul;
      return Math.max(0, value);
    });

    let previous: BlockKind = BlockKind.Empty;
    let previousWasOre = false;

    for (let col = 0; col < width; col++) {
      // Natural caves: free depth, and the reason long falls are possible.
      if (row >= 4 && nextChance(rng, level.caveChance)) {
        kind[col] = BlockKind.Empty;
        previous = BlockKind.Empty;
        previousWasOre = false;
        continue;
      }

      // Ore clumps: continue a neighbouring vein instead of rolling fresh.
      if (previousWasOre && nextChance(rng, 0.38)) {
        kind[col] = previous;
        continue;
      }

      const picked = nextWeighted(rng, weights);
      const key = picked >= 0 ? WEIGHT_KEYS[picked] : 'dirt';
      const next = KIND_BY_WEIGHT[key];
      kind[col] = next;

      if (next === BlockKind.Arrow) {
        // 60% drill down, 40% drill sideways.
        variant[col] = nextChance(rng, 0.6) ? ArrowVariant.Down : ArrowVariant.Side;
      } else if (next === BlockKind.Dirt) {
        variant[col] = 0;
      }

      previousWasOre = key === 'copper' || key === 'gold';
      previous = next;
    }

    applyGuarantees(kind, variant, rng, row, width);
    applyBedrockRules(kind, rng, width);

    return rowData;
  };
}

/**
 * Rhythm guarantees: a blast crate every few rows and a vault deeper down, so
 * every run has at least one moment worth planning around.
 */
function applyGuarantees(kind: Uint8Array, variant: Uint8Array, rng: RngState, row: number, width: number): void {
  if (row >= 3 && row % 7 === 0) {
    const col = nextInt(rng, width);
    kind[col] = BlockKind.Bomb;
    variant[col] = 0;
  }
  if (row >= 8 && row % 11 === 0) {
    let col = nextInt(rng, width);
    if (kind[col] === BlockKind.Bomb) col = (col + 1) % width;
    kind[col] = BlockKind.Vault;
    variant[col] = 0;
  }
  if (row >= 6 && row % 9 === 0) {
    let col = nextInt(rng, width);
    if (kind[col] === BlockKind.Bomb || kind[col] === BlockKind.Vault) col = (col + 2) % width;
    kind[col] = BlockKind.Arrow;
    variant[col] = nextChance(rng, 0.65) ? ArrowVariant.Down : ArrowVariant.Side;
  }
}

/**
 * Bedrock must never make a level unsolvable:
 *  - no two bedrock side by side (guarantees a diggable column can be reached);
 *  - never more than width - 2 bedrock in a row.
 * Both rules keep at least two passable columns available at every depth.
 */
function applyBedrockRules(kind: Uint8Array, rng: RngState, width: number): void {
  for (let col = 1; col < width; col++) {
    if (kind[col] === BlockKind.Bedrock && kind[col - 1] === BlockKind.Bedrock) {
      kind[col] = BlockKind.Stone;
    }
  }

  let count = 0;
  for (let col = 0; col < width; col++) {
    if (kind[col] === BlockKind.Bedrock) count++;
  }
  const limit = Math.max(2, width - 2);
  while (count > limit) {
    const col = nextInt(rng, width);
    if (kind[col] === BlockKind.Bedrock) {
      kind[col] = BlockKind.Stone;
      count--;
    }
  }
}
