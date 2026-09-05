import { Color, InstancedMesh, Matrix4, type Object3D } from 'three';
import { BlockKind, BLOCKS } from '../config/blocks.ts';
import { MAX_ROWS } from '../config/version.ts';
import type { Grid } from '../core/grid.ts';
import {
  CUBE_SIZE,
  MAX_BLOCK_INSTANCES,
  cellHash,
  worldX,
  worldY,
  WINDOW_ABOVE,
  WINDOW_BELOW,
} from './constants.ts';
import { RoundedBoxGeometry } from './roundedBox.ts';
import { createBlockMaterial, createOutlineHull, type LitMaterial, type OutlineHull } from './blockHull.ts';
import { DecalLayer } from './decals.ts';
import type { RenderTheme } from './themes/types.ts';

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
  readonly mesh: InstancedMesh<RoundedBoxGeometry, LitMaterial>;
  /** Candy's back-faced outline shell; null on skins without outlines. */
  readonly hull: InstancedMesh | null = null;
  /** Candy's decal plane (block "faces" and ore veins); null otherwise. */
  readonly decals: InstancedMesh | null = null;
  private readonly outline: OutlineHull | null = null;
  private readonly decalLayer: DecalLayer | null = null;
  private readonly theme: RenderTheme;
  private readonly geometry: RoundedBoxGeometry;
  private readonly material: LitMaterial;
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

  constructor(width: number, theme: RenderTheme) {
    this.width = width;
    this.theme = theme;
    this.capacity = Math.min(MAX_BLOCK_INSTANCES, (WINDOW_ABOVE + WINDOW_BELOW + 2) * Math.max(width, 8));
    const { segments, radius } = theme.geometry;
    this.geometry = new RoundedBoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE, segments, radius);
    this.material = createBlockMaterial(theme);
    this.mesh = new InstancedMesh(this.geometry, this.material, this.capacity);
    this.mesh.count = 0;
    // Instances are placed by hand every time; the auto bounding sphere would
    // be stale and cull the whole field.
    this.mesh.frustumCulled = false;
    this.cellOfSlot = new Int32Array(this.capacity).fill(-1);
    this.kindOfSlot = new Uint8Array(this.capacity);
    this.variantOfSlot = new Uint8Array(this.capacity);

    if (theme.outline.enabled) {
      this.outline = createOutlineHull(this.mesh, this.geometry, theme, this.capacity);
      this.hull = this.outline.mesh;
    }
    if (theme.decals) {
      this.decalLayer = new DecalLayer(this.capacity, this.mesh.instanceMatrix);
      this.decals = this.decalLayer.mesh;
    }
  }

  get count(): number {
    return this.mesh.count;
  }

  /** Every object this field contributes to the scene graph. */
  layers(): Object3D[] {
    const out: Object3D[] = [this.mesh];
    if (this.hull) out.push(this.hull);
    if (this.decals) out.push(this.decals);
    return out;
  }

  /** Instance slot holding a cell, or -1. Exposed for the outline tests. */
  slotOf(cellIndex: number): number {
    return this.slotOfCell.get(cellIndex) ?? -1;
  }

  /** Cell currently drawn in a slot, or -1. */
  cellOf(slot: number): number {
    return slot >= 0 && slot < this.mesh.count ? this.cellOfSlot[slot] : -1;
  }

  decalRectAt(slot: number): [number, number, number, number] {
    return this.decalLayer ? this.decalLayer.rectAt(slot) : [0, 0, 0, 0];
  }

  /**
   * Push the live instance count (and visibility) onto the shells. three.js
   * shares the matrix attribute but not these, so every add / remove / reset
   * has to mirror them or the outline and decals drift out of sync with the
   * blocks — the same discipline the hit-flash slot state follows.
   */
  private mirrorLayers(): void {
    const count = this.mesh.count;
    const visible = this.mesh.visible;
    if (this.hull) {
      this.hull.count = count;
      this.hull.visible = visible;
    }
    this.decalLayer?.mirror(count, visible);
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
    this.hitCell = -1;
    this.hitSlot = -1;
    this.mirrorLayers();
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

  // --- hit flash -------------------------------------------------------------
  // A tapped block shakes and whitens for ~100ms before its wave destroys it,
  // giving the impact a readable "hit" beat instead of an instant vanish.

  private hitCell = -1;
  private hitSlot = -1;
  private hitT = 0;
  private readonly hitBaseColor = new Color();

  /** Start the hit reaction on a cell (ignored when not on screen). */
  hit(cellIndex: number): void {
    const slot = this.slotOfCell.get(cellIndex);
    if (slot === undefined || slot >= this.mesh.count) return;
    this.clearHit();
    this.hitCell = cellIndex;
    this.hitSlot = slot;
    this.hitT = 0;
    this.hitBaseColor.copy(this.mesh.getColorAt(slot, this.color) ?? this.color);
  }

  private clearHit(): void {
    if (this.hitSlot < 0) return;
    if (this.hitSlot < this.mesh.count) {
      const cell = this.cellOfSlot[this.hitSlot];
      const row = (cell / this.width) | 0;
      const col = cell - row * this.width;
      this.mesh.setColorAt(this.hitSlot, this.blockColor(col, row, this.kindOfSlot[this.hitSlot], this.variantOfSlot[this.hitSlot]));
    }
    this.hitCell = -1;
    this.hitSlot = -1;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** Advance the hit reaction; call every frame. */
  updateHit(dt: number, reduced: boolean): void {
    if (this.hitSlot < 0) return;
    this.hitT += dt;
    const DURATION = 0.1;
    if (this.hitT >= DURATION || this.hitSlot >= this.mesh.count || this.cellOfSlot[this.hitSlot] !== this.hitCell) {
      this.clearHit();
      return;
    }
    // The slot may have been swapped by a concurrent rebuild.
    const slot = this.slotOfCell.get(this.hitCell);
    if (slot === undefined) {
      this.clearHit();
      return;
    }
    this.hitSlot = slot;
    const cell = this.cellOfSlot[slot];
    const row = (cell / this.width) | 0;
    const col = cell - row * this.width;
    const k = this.hitT / DURATION;
    const flash = 1 - k;
    // White flash layered over the base colour, plus a shrinking jitter.
    this.color.copy(this.hitBaseColor).lerp(this.mix.setHex(this.theme.particles.hitFlash), flash * 0.7);
    this.mesh.setColorAt(slot, this.color);
    const shake = reduced ? 0 : 0.06 * (1 - k);
    const jx = worldX(col, this.width) + (Math.sin(this.hitT * 260) * shake);
    const jy = worldY(row) + (Math.cos(this.hitT * 310) * shake);
    const squash = 1 - 0.12 * k;
    this.matrix.makeScale(squash, 1 / squash, squash);
    this.matrix.setPosition(jx, jy, 0);
    this.mesh.setMatrixAt(slot, this.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
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

  /**
   * Blocks, outline shell and decals share one `instanceMatrix`, which r169
   * frees without reference counting — so the three are always disposed
   * together, never individually.
   */
  dispose(): void {
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
    if (this.outline) {
      this.outline.mesh.dispose();
      this.outline.geometry.dispose();
      this.outline.material.dispose();
    }
    this.decalLayer?.dispose();
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
    this.mirrorLayers();
  }

  private removeAt(slot: number): void {
    const removed = this.cellOfSlot[slot];
    this.slotOfCell.delete(removed);
    if (removed === this.hitCell) {
      this.hitCell = -1;
      this.hitSlot = -1;
    }
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
    this.mirrorLayers();
  }

  private writeInstance(slot: number): void {
    const cell = this.cellOfSlot[slot];
    const row = (cell / this.width) | 0;
    const col = cell - row * this.width;
    this.matrix.makeTranslation(worldX(col, this.width), worldY(row), 0);
    this.mesh.setMatrixAt(slot, this.matrix);
    this.mesh.setColorAt(slot, this.blockColor(col, row, this.kindOfSlot[slot], this.variantOfSlot[slot]));
    // Per-slot decal state follows the same invalidation rule as the hit flash.
    this.decalLayer?.setSlot(slot, this.kindOfSlot[slot], this.variantOfSlot[slot]);
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** Instance colour for a block: theme base, jittered, plus the accent pass. */
  private blockColor(col: number, row: number, kind: number, variant: number): Color {
    const def = BLOCKS[kind as BlockKind];
    const palette = this.theme.blocks[kind as BlockKind];
    const jitter = cellHash(col, row);
    this.color.setHex(palette.base);
    // Jitter breaks up large flat areas of the same block.
    this.color.multiplyScalar(0.93 + jitter * 0.14);

    if (kind === BlockKind.Dirt && variant === 1) {
      this.color.lerp(this.mix.setHex(this.theme.grass), 0.55);
    } else if (def.isOre) {
      this.color.lerp(this.mix.setHex(palette.light), 0.14 + jitter * 0.2);
    } else if (kind === BlockKind.Arrow && variant === 1) {
      // Side-firing drill charges read differently from downward ones.
      this.color.lerp(this.mix.setHex(palette.light), 0.45);
    }
    return this.color;
  }

  private goalColor(col: number, row: number, phase: number): Color {
    const exit = this.theme.blocks[BlockKind.Exit];
    const jitter = cellHash(col, row);
    this.color.setHex(exit.base);
    this.color.lerp(this.mix.setHex(exit.light), 0.3 + 0.4 * phase);
    // Overbright reads as a glow; the boost also fights the depth fog.
    this.color.multiplyScalar((0.92 + jitter * 0.14) * (1.15 + 0.45 * phase) * this.goalBoost);
    return this.color;
  }
}
