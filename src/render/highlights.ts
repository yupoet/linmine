import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  Color,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
} from 'three';
import type { TargetInfo } from '../core/run.ts';
import type { Cell } from '../core/types.ts';
import { CUBE_SIZE, MAX_HIGHLIGHT_INSTANCES, worldX, worldY } from './constants.ts';
import type { RenderTheme } from './themes/types.ts';

const EMPTY_TARGETS: readonly TargetInfo[] = [];

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
  private readonly affordable = new Color();
  private readonly tooExpensive = new Color();
  private readonly hovered = new Color();
  private readonly breathe: number;
  private targets: readonly TargetInfo[] = EMPTY_TARGETS;
  private hover: Cell | null = null;
  private width = 6;
  private suppressed = false;
  private dirty = true;

  constructor(theme: RenderTheme) {
    this.affordable.setHex(theme.highlight.affordable);
    this.tooExpensive.setHex(theme.highlight.tooExpensive);
    this.hovered.setHex(theme.highlight.hovered);
    this.breathe = theme.highlight.breathe;
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
      // Candy rims breathe: the affordable colour swells with the pulse.
      if (this.breathe > 0 && target.affordable) this.color.multiplyScalar(1 + this.breathe * pulse);
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
