import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  Color,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
} from 'three';
import { BlockKind, BLOCKS } from '../config/blocks.ts';
import { MAX_ROWS } from '../config/version.ts';
import type { Grid } from '../core/grid.ts';
import type { TargetInfo } from '../core/run.ts';
import type { Cell } from '../core/types.ts';
import {
  CUBE_SIZE,
  MAX_BLOCK_INSTANCES,
  MAX_HIGHLIGHT_INSTANCES,
  cellHash,
  worldX,
  worldY,
  WINDOW_ABOVE,
  WINDOW_BELOW,
} from './constants.ts';
import { RoundedBoxGeometry } from './roundedBox.ts';

const GRASS = 0x6aa84f;
const GOAL_COLOR = BLOCKS[BlockKind.Exit].color;
const GOAL_ACCENT = BLOCKS[BlockKind.Exit].accent;

const EMPTY_TARGETS: readonly TargetInfo[] = [];

/**
 * Every visible block in one instanced draw call.
 *
 * Two pieces of bookkeeping make this cheap:
 *  - `slotOfCell` maps a grid cell index to its instance slot so a removal is
 *    an O(1) lookup;
 *  - slots stay dense. Removing a slot moves the *last* live instance into it
 *    and decrements `count` (three.js instanced meshes cannot delete an
 *    instance, only render fewer of them). Instance transforms are a pure
 *    function of the cell, so the moved instance is simply rewritten.
 *
 * `pending` holds cells that are already empty in the grid but must stay on
 * screen until their destruction animation fires (the grid is mutated by the
 * rules layer before the renderer has played the swing).
 */
export class BlockField {
  readonly mesh: InstancedMesh<RoundedBoxGeometry, MeshStandardMaterial>;
  private readonly geometry: RoundedBoxGeometry;
  private readonly material: MeshStandardMaterial;
  private readonly capacity: number;
  private readonly slotOfCell = new Map<number, number>();
  private readonly cellOfSlot: Int32Array;
  private readonly kindOfSlot: Uint8Array;
  private readonly variantOfSlot: Uint8Array;
  private readonly matrix = new Matrix4();
  private readonly color = new Color();
  private readonly mix = new Color();
  private readonly pending = new Set<number>();
  private width: number;
  private top = 0;
  private bottom = -1;
  private dirty = true;
  private goalRow = -1;
  private goalBoost = 1;

  constructor(width: number) {
    this.width = width;
    this.capacity = Math.min(MAX_BLOCK_INSTANCES, (WINDOW_ABOVE + WINDOW_BELOW + 2) * Math.max(width, 8));
    this.geometry = new RoundedBoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE, 2, 0.09);
    this.material = new MeshStandardMaterial({ roughness: 0.72, metalness: 0.04 });
    this.mesh = new InstancedMesh(this.geometry, this.material, this.capacity);
    this.mesh.count = 0;
    // Instances are placed by hand every time; the auto bounding sphere would
    // be stale and cull the whole field.
    this.mesh.frustumCulled = false;
    this.cellOfSlot = new Int32Array(this.capacity).fill(-1);
    this.kindOfSlot = new Uint8Array(this.capacity);
    this.variantOfSlot = new Uint8Array(this.capacity);
  }

  get count(): number {
    return this.mesh.count;
  }

  reset(width: number): void {
    this.width = width;
    this.slotOfCell.clear();
    this.pending.clear();
    this.mesh.count = 0;
    this.cellOfSlot.fill(-1);
    this.top = 0;
    this.bottom = -1;
    this.dirty = true;
  }

  /** Keep a cell rendered even though the grid already reports it as empty. */
  keepVisible(cellIndex: number): void {
    this.pending.add(cellIndex);
  }

  /** Drop a cell from the render set (called when its break animation lands). */
  hide(cellIndex: number): void {
    this.pending.delete(cellIndex);
    const slot = this.slotOfCell.get(cellIndex);
    if (slot === undefined) return;
    this.removeAt(slot);
  }

  setGoal(row: number, boost: number): void {
    this.goalRow = row;
    this.goalBoost = boost;
  }

  /** Force a full rebuild and re-upload (after a WebGL context restore). */
  invalidate(): void {
    this.dirty = true;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** Rebuild only when the visible window shifts or the field was marked dirty. */
  sync(grid: Grid, playerRow: number): void {
    const top = Math.max(0, playerRow - WINDOW_ABOVE);
    const bottom = Math.min(MAX_ROWS, playerRow + WINDOW_BELOW);
    grid.ensureThrough(bottom);
    if (!this.dirty && top === this.top && bottom === this.bottom) return;
    this.top = top;
    this.bottom = bottom;
    this.dirty = false;
    this.rebuild(grid);
  }

  /** Gentle pulse on the goal layer so the exit row is impossible to miss. */
  pulseGoal(time: number): void {
    if (this.goalRow < 0 || this.goalRow < this.top || this.goalRow > this.bottom) return;
    const phase = 0.5 + 0.5 * Math.sin(time * 3.2);
    let touched = false;
    for (let slot = 0; slot < this.mesh.count; slot++) {
      const cell = this.cellOfSlot[slot];
      const row = (cell / this.width) | 0;
      if (row !== this.goalRow) continue;
      const col = cell - row * this.width;
      this.mesh.setColorAt(slot, this.goalColor(col, row, phase));
      touched = true;
    }
    if (touched && this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
    this.slotOfCell.clear();
    this.pending.clear();
  }

  // --- internals ------------------------------------------------------------

  private rebuild(grid: Grid): void {
    let slot = 0;
    while (slot < this.mesh.count) {
      if (this.shouldRender(grid, this.cellOfSlot[slot])) slot++;
      else this.removeAt(slot);
    }

    for (let row = this.top; row <= this.bottom; row++) {
      for (let col = 0; col < this.width; col++) {
        const cell = row * this.width + col;
        if (this.slotOfCell.has(cell)) continue;
        if (!this.shouldRender(grid, cell)) continue;
        if (this.mesh.count >= this.capacity) return;
        this.add(cell, grid.kindAt(col, row), grid.variantAt(col, row));
      }
    }
  }

  private shouldRender(grid: Grid, cell: number): boolean {
    if (cell < 0) return false;
    const row = (cell / this.width) | 0;
    if (row < this.top || row > this.bottom) return false;
    if (this.pending.has(cell)) return true;
    const col = cell - row * this.width;
    return grid.kindAt(col, row) !== BlockKind.Empty;
  }

  private add(cell: number, kind: number, variant: number): void {
    const slot = this.mesh.count;
    this.cellOfSlot[slot] = cell;
    this.kindOfSlot[slot] = kind;
    this.variantOfSlot[slot] = variant;
    this.slotOfCell.set(cell, slot);
    this.mesh.count = slot + 1;
    this.writeInstance(slot);
  }

  private removeAt(slot: number): void {
    const removed = this.cellOfSlot[slot];
    this.slotOfCell.delete(removed);
    const last = this.mesh.count - 1;
    if (slot !== last) {
      const moved = this.cellOfSlot[last];
      this.cellOfSlot[slot] = moved;
      this.kindOfSlot[slot] = this.kindOfSlot[last];
      this.variantOfSlot[slot] = this.variantOfSlot[last];
      this.slotOfCell.set(moved, slot);
      this.writeInstance(slot);
    }
    this.cellOfSlot[last] = -1;
    this.mesh.count = last;
  }

  private writeInstance(slot: number): void {
    const cell = this.cellOfSlot[slot];
    const row = (cell / this.width) | 0;
    const col = cell - row * this.width;
    this.matrix.makeTranslation(worldX(col, this.width), worldY(row), 0);
    this.mesh.setMatrixAt(slot, this.matrix);
    this.mesh.setColorAt(slot, this.blockColor(col, row, this.kindOfSlot[slot], this.variantOfSlot[slot]));
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  private blockColor(col: number, row: number, kind: number, variant: number): Color {
    const def = BLOCKS[kind as BlockKind];
    const jitter = cellHash(col, row);
    this.color.setHex(def.color);
    // Jitter breaks up large flat areas of the same block.
    this.color.multiplyScalar(0.93 + jitter * 0.14);

    if (kind === BlockKind.Dirt && variant === 1) {
      this.color.lerp(this.mix.setHex(GRASS), 0.55);
    } else if (def.isOre) {
      this.color.lerp(this.mix.setHex(def.accent), 0.14 + jitter * 0.2);
    } else if (kind === BlockKind.Arrow && variant === 1) {
      // Side-firing drill charges read differently from downward ones.
      this.color.lerp(this.mix.setHex(def.accent), 0.45);
    }
    return this.color;
  }

  private goalColor(col: number, row: number, phase: number): Color {
    const jitter = cellHash(col, row);
    this.color.setHex(GOAL_COLOR);
    this.color.lerp(this.mix.setHex(GOAL_ACCENT), 0.3 + 0.4 * phase);
    // Overbright reads as a glow; the boost also fights the depth fog.
    this.color.multiplyScalar((0.92 + jitter * 0.14) * (1.15 + 0.45 * phase) * this.goalBoost);
    return this.color;
  }
}

/**
 * Reachability affordance: one additive back-faced cube per target. Back faces
 * are behind the block, so depth testing leaves only a rim around the
 * silhouette — an outline that costs a single draw call.
 */
export class HighlightField {
  readonly mesh: InstancedMesh<BoxGeometry, MeshBasicMaterial>;
  private readonly geometry: BoxGeometry;
  private readonly material: MeshBasicMaterial;
  private readonly capacity = MAX_HIGHLIGHT_INSTANCES;
  private readonly matrix = new Matrix4();
  private readonly color = new Color();
  private readonly affordable = new Color(0x7cf0b4);
  private readonly tooExpensive = new Color(0xff5a45);
  private readonly hovered = new Color(0xfff3b0);
  private targets: readonly TargetInfo[] = EMPTY_TARGETS;
  private hover: Cell | null = null;
  private width = 6;
  private suppressed = false;
  private dirty = true;

  constructor() {
    this.geometry = new BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
    this.material = new MeshBasicMaterial({
      transparent: true,
      opacity: 0.55,
      side: BackSide,
      blending: AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.mesh = new InstancedMesh(this.geometry, this.material, this.capacity);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  get count(): number {
    return this.mesh.count;
  }

  set(width: number, targets: readonly TargetInfo[], hover: Cell | null): void {
    this.width = width;
    this.targets = targets;
    this.hover = hover;
    this.dirty = true;
  }

  /** Hidden while a dig plays so rims never float over destroyed blocks. */
  setSuppressed(value: boolean): void {
    if (this.suppressed === value) return;
    this.suppressed = value;
    this.dirty = true;
  }

  clear(): void {
    this.targets = EMPTY_TARGETS;
    this.hover = null;
    this.mesh.count = 0;
    this.dirty = true;
  }

  update(time: number): void {
    if (!this.dirty && this.mesh.count === 0) return;
    this.dirty = false;

    if (this.suppressed) {
      this.mesh.count = 0;
      return;
    }

    const pulse = 0.5 + 0.5 * Math.sin(time * 4.6);
    this.material.opacity = 0.4 + 0.22 * pulse;
    let slot = 0;
    for (let i = 0; i < this.targets.length && slot < this.capacity; i++) {
      const target = this.targets[i];
      const isHover = this.hover !== null && this.hover.col === target.col && this.hover.row === target.row;
      const scale = isHover ? 1.24 + 0.04 * pulse : 1.12;
      this.matrix.makeScale(scale, scale, scale);
      this.matrix.setPosition(worldX(target.col, this.width), worldY(target.row), 0);
      this.mesh.setMatrixAt(slot, this.matrix);

      this.color.copy(target.affordable ? this.affordable : this.tooExpensive);
      if (isHover) this.color.lerp(this.hovered, 0.55);
      this.mesh.setColorAt(slot, this.color);
      slot++;
    }
    this.mesh.count = slot;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
    this.targets = EMPTY_TARGETS;
  }
}
