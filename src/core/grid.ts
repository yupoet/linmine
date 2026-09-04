import { BlockKind } from '../config/blocks.ts';
import { GENERATION_LOOKAHEAD, MAX_ROWS } from '../config/version.ts';

/** One row of the mine. Rows are generated lazily and cached. */
export interface GridRow {
  kind: Uint8Array;
  variant: Uint8Array;
}

export type RowGenerator = (row: number) => GridRow;

/**
 * Streaming, lazily generated block grid. Column index 0..width-1, row grows
 * downwards. Row 0 is the air row above the surface: the miner starts there.
 */
export class Grid {
  readonly width: number;
  private readonly rows = new Map<number, GridRow>();
  private highest = -1;

  constructor(width: number, private readonly generate: RowGenerator) {
    this.width = width;
  }

  /** Highest row index generated so far (inclusive). */
  get highestGenerated(): number {
    return this.highest;
  }

  index(col: number, row: number): number {
    return row * this.width + col;
  }

  colOf(index: number): number {
    return index % this.width;
  }

  rowOf(index: number): number {
    return Math.floor(index / this.width);
  }

  inBounds(col: number, row: number): boolean {
    return col >= 0 && col < this.width && row >= 0 && row <= MAX_ROWS;
  }

  /** Generate up to `row` if needed. Cheap when already present. */
  ensureThrough(row: number): void {
    const target = Math.min(row, MAX_ROWS);
    for (let r = this.highest + 1; r <= target; r++) {
      this.rows.set(r, this.generate(r));
      this.highest = r;
    }
  }

  /** Keep the lookahead buffer filled relative to the miner's row. */
  ensureAhead(row: number): void {
    this.ensureThrough(row + GENERATION_LOOKAHEAD);
  }

  rowAt(row: number): GridRow {
    this.ensureThrough(row);
    const found = this.rows.get(Math.min(row, MAX_ROWS));
    if (!found) throw new Error(`grid row missing: ${row}`);
    return found;
  }

  /** Rows currently materialised. Used by tests and the streaming window. */
  materialisedRows(): number[] {
    return [...this.rows.keys()].sort((a, b) => a - b);
  }

  kindAt(col: number, row: number): BlockKind {
    if (!this.inBounds(col, row)) return BlockKind.Bedrock;
    return this.rowAt(row).kind[col] as BlockKind;
  }

  variantAt(col: number, row: number): number {
    if (!this.inBounds(col, row)) return 0;
    return this.rowAt(row).variant[col];
  }

  setAt(col: number, row: number, kind: BlockKind, variant = 0): void {
    if (!this.inBounds(col, row)) return;
    const gridRow = this.rowAt(row);
    gridRow.kind[col] = kind;
    gridRow.variant[col] = variant;
  }

  isSolid(col: number, row: number): boolean {
    return this.kindAt(col, row) !== BlockKind.Empty;
  }

  isEmpty(col: number, row: number): boolean {
    return this.kindAt(col, row) === BlockKind.Empty;
  }

  /**
   * The grid never shrinks during a run, but the renderer only needs a window.
   * This drops rows above `keepFrom` so long play sessions do not retain the
   * whole mine in memory.
   */
  releaseAbove(keepFrom: number): void {
    for (const key of this.rows.keys()) {
      if (key < keepFrom) this.rows.delete(key);
    }
  }
}
