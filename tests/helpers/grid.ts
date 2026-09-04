import { ArrowVariant, BlockKind } from '../../src/config/blocks.ts';
import { levelById, type LevelDef } from '../../src/config/levels.ts';
import { Grid, type GridRow } from '../../src/core/grid.ts';
import { createRun } from '../../src/core/run.ts';
import type { OwnedCard } from '../../src/core/modifiers.ts';
import type { RunState } from '../../src/core/types.ts';

/**
 * Build a grid from an ASCII map, one string per row (row 0 first).
 *
 *   .  air            d  dirt         s  stone        c  copper
 *   g  gold           b  bedrock      x  goal layer   B  blast crate
 *   A  drill down     a  drill side   r  supply       v  vault
 *   @  air + player start
 *
 * Rows past the map become bedrock when `floor` is set (so falling tests can
 * rely on a bottom) and air otherwise.
 */
export const CHARS: Record<string, BlockKind> = {
  '.': BlockKind.Empty,
  '@': BlockKind.Empty,
  d: BlockKind.Dirt,
  s: BlockKind.Stone,
  c: BlockKind.Copper,
  g: BlockKind.Gold,
  b: BlockKind.Bedrock,
  x: BlockKind.Exit,
  B: BlockKind.Bomb,
  A: BlockKind.Arrow,
  a: BlockKind.Arrow,
  r: BlockKind.Repair,
  v: BlockKind.Vault,
};

export function gridFrom(rows: readonly string[], options: { floor?: boolean } = {}): Grid {
  const width = Math.max(...rows.map((row) => row.length));
  const grid = new Grid(width, (row) => {
    const line: GridRow = { kind: new Uint8Array(width), variant: new Uint8Array(width) };
    const spec = rows[row];
    if (spec === undefined) {
      line.kind.fill(options.floor ? BlockKind.Bedrock : BlockKind.Empty);
      return line;
    }
    for (let col = 0; col < width; col++) {
      const char = spec[col] ?? '.';
      const kind = CHARS[char] ?? BlockKind.Empty;
      line.kind[col] = kind;
      line.variant[col] = char === 'A' ? ArrowVariant.Down : char === 'a' ? ArrowVariant.Side : 0;
    }
    return line;
  });
  grid.ensureThrough(rows.length + (options.floor ? 2 : 0));
  return grid;
}

export interface MakeRunOptions {
  rows: readonly string[];
  durability?: number;
  cards?: readonly OwnedCard[];
  pickaxeLevel?: number;
  levelId?: string;
  floor?: boolean;
  targetDepth?: number;
}

/** Build a run whose grid is fully under test control. */
export function makeRun(options: MakeRunOptions): RunState {
  const levelDef: LevelDef = levelById(options.levelId ?? 'sunlit_shaft');
  const level = options.targetDepth ? { ...levelDef, targetDepth: options.targetDepth } : levelDef;

  const state = createRun({
    seed: 1,
    level,
    cards: options.cards ?? [],
    pickaxeLevel: options.pickaxeLevel ?? 1,
  });

  state.grid = gridFrom(options.rows, { floor: options.floor ?? true });
  if (options.durability !== undefined) {
    state.durability = options.durability;
  }
  state.maxDurability = Math.max(state.maxDurability, state.durability);

  let startCol = -1;
  for (let col = 0; col < state.grid.width; col++) {
    const char = options.rows[0]?.[col];
    if (char === '@') startCol = col;
  }
  state.player = { col: startCol >= 0 ? startCol : 0, row: 0 };
  return state;
}

export function kindsAt(grid: Grid, row: number): BlockKind[] {
  const out: BlockKind[] = [];
  for (let col = 0; col < grid.width; col++) out.push(grid.kindAt(col, row));
  return out;
}
