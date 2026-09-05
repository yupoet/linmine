import {
  BoxGeometry,
  type BufferGeometry,
  Color,
  DynamicDrawUsage,
  Euler,
  type InstancedBufferAttribute,
  InstancedMesh,
  type Material,
  Matrix4,
  MeshBasicMaterial,
  MeshToonMaterial,
  type Object3D,
  Quaternion,
  Vector3,
} from 'three';
import { createOutlineHull, toonGradient, type OutlineHull } from './blockHull.ts';
import { MAX_PARTICLES, MAX_SHAKE, PARTICLE_GRAVITY, clamp01 } from './constants.ts';
import { RoundedBoxGeometry } from './roundedBox.ts';
import type { RenderTheme } from './themes/types.ts';

/**
 * Pooled debris cubes. Live particles always occupy slots [0, live) so the
 * instanced mesh can render them with a single `count`; dead ones are removed
 * by swapping the last live particle into their slot.
 *
 * Opacity cannot vary per instance without a custom shader, so particles fade
 * by shrinking instead.
 */
export class Particles {
  readonly mesh: InstancedMesh<BufferGeometry, Material>;
  /** Candy's outline shell, sharing the pool's `instanceMatrix`. */
  readonly hull: InstancedMesh | null = null;
  private readonly outline: OutlineHull | null = null;
  private readonly geometry: BufferGeometry;
  private readonly material: Material;
  private readonly px = new Float32Array(MAX_PARTICLES);
  private readonly py = new Float32Array(MAX_PARTICLES);
  private readonly pz = new Float32Array(MAX_PARTICLES);
  private readonly vx = new Float32Array(MAX_PARTICLES);
  private readonly vy = new Float32Array(MAX_PARTICLES);
  private readonly vz = new Float32Array(MAX_PARTICLES);
  private readonly spin = new Float32Array(MAX_PARTICLES);
  private readonly spinRate = new Float32Array(MAX_PARTICLES);
  private readonly life = new Float32Array(MAX_PARTICLES);
  private readonly maxLife = new Float32Array(MAX_PARTICLES);
  private readonly size = new Float32Array(MAX_PARTICLES);
  private readonly cr = new Float32Array(MAX_PARTICLES);
  private readonly cg = new Float32Array(MAX_PARTICLES);
  private readonly cb = new Float32Array(MAX_PARTICLES);
  private readonly matrix = new Matrix4();
  private readonly quaternion = new Quaternion();
  private readonly euler = new Euler();
  private readonly position = new Vector3();
  private readonly scale = new Vector3();
  private readonly color = new Color();
  private readonly dustColor: number;
  private live = 0;
  private reduced = false;

  constructor(theme: RenderTheme) {
    this.dustColor = theme.particles.dust;
    // Candy throws plump rounded chunks that inherit the block's shade tone;
    // ember keeps the flat unlit cubes it always had.
    const toon = theme.shading === 'toon';
    this.geometry = toon ? new RoundedBoxGeometry(1, 1, 1, 1, 0.3) : new BoxGeometry(1, 1, 1);
    this.material = toon ? new MeshToonMaterial({ gradientMap: toonGradient() }) : new MeshBasicMaterial();
    this.mesh = new InstancedMesh(this.geometry, this.material, MAX_PARTICLES);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.visible = false;

    if (theme.outline.enabled) {
      this.outline = createOutlineHull(this.mesh, this.geometry, theme, MAX_PARTICLES);
      this.hull = this.outline.mesh;
      this.hull.visible = false;
    }
  }

  get count(): number {
    return this.live;
  }

  /** Scene-graph nodes this pool contributes. */
  layers(): Object3D[] {
    return this.hull ? [this.mesh, this.hull] : [this.mesh];
  }

  /**
   * The shell shares `instanceMatrix` but not `count`/`visible`, so every path
   * that changes the live population has to push them across by hand.
   */
  private mirrorHull(): void {
    if (!this.hull) return;
    this.hull.count = this.mesh.count;
    this.hull.visible = this.mesh.visible;
  }

  setReducedMotion(value: boolean): void {
    this.reduced = value;
  }

  clear(): void {
    this.live = 0;
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mirrorHull();
  }

  /** Debris burst tinted with the destroyed block's colour. */
  burst(x: number, y: number, z: number, color: Color, amount: number, speed: number, size: number): void {
    const count = Math.max(0, Math.round(amount * (this.reduced ? 0.35 : 1)));
    for (let i = 0; i < count; i++) {
      if (this.live >= MAX_PARTICLES) break;
      const slot = this.live++;
      const angle = Math.random() * Math.PI * 2;
      const power = speed * (0.35 + Math.random() * 0.65);
      this.px[slot] = x + (Math.random() - 0.5) * 0.55;
      this.py[slot] = y + (Math.random() - 0.5) * 0.55;
      this.pz[slot] = z + (Math.random() - 0.5) * 0.4;
      this.vx[slot] = Math.cos(angle) * power;
      this.vy[slot] = Math.sin(angle) * power + speed * 0.35;
      this.vz[slot] = (Math.random() - 0.3) * power * 0.5;
      this.spin[slot] = Math.random() * Math.PI * 2;
      this.spinRate[slot] = (Math.random() - 0.5) * 14;
      this.maxLife[slot] = 0.45 + Math.random() * 0.4;
      this.life[slot] = this.maxLife[slot];
      this.size[slot] = size * (0.6 + Math.random() * 0.8);
      this.cr[slot] = color.r;
      this.cg[slot] = color.g;
      this.cb[slot] = color.b;
    }
  }

  /** Low, wide puff used when the miner lands. */
  dust(x: number, y: number, z: number, strength: number): void {
    this.color.setHex(this.dustColor);
    this.burst(x, y, z, this.color, Math.round(4 + strength * 6), 1.4 + strength, 0.1);
  }

  update(dt: number): void {
    for (let i = 0; i < this.live; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.swapRemove(i);
        i--;
        continue;
      }

      this.vy[i] -= PARTICLE_GRAVITY * dt;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      this.spin[i] += this.spinRate[i] * dt;

      const k = this.life[i] / this.maxLife[i];
      // Shrink over the whole life, then collapse in the last quarter.
      const s = this.size[i] * (0.35 + 0.65 * k) * Math.min(1, k * 4);
      this.position.set(this.px[i], this.py[i], this.pz[i]);
      this.euler.set(this.spin[i], this.spin[i] * 0.7, this.spin[i] * 1.3);
      this.quaternion.setFromEuler(this.euler);
      this.scale.setScalar(s > 0.0005 ? s : 0.0005);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.mesh.setMatrixAt(i, this.matrix);
      this.color.setRGB(this.cr[i], this.cg[i], this.cb[i]);
      this.mesh.setColorAt(i, this.color);
    }

    this.mesh.count = this.live;
    this.mesh.visible = this.live > 0;
    this.mirrorHull();
    if (this.live > 0) {
      this.mesh.instanceMatrix.needsUpdate = true;
      const colors: InstancedBufferAttribute | null = this.mesh.instanceColor;
      if (colors) colors.needsUpdate = true;
    }
  }

  /** Pool and shell share one `instanceMatrix`; they are freed together. */
  dispose(): void {
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
    if (this.outline) {
      this.outline.mesh.dispose();
      this.outline.geometry.dispose();
      this.outline.material.dispose();
    }
    this.live = 0;
  }

  private swapRemove(index: number): void {
    const last = this.live - 1;
    if (index !== last) {
      this.px[index] = this.px[last];
      this.py[index] = this.py[last];
      this.pz[index] = this.pz[last];
      this.vx[index] = this.vx[last];
      this.vy[index] = this.vy[last];
      this.vz[index] = this.vz[last];
      this.spin[index] = this.spin[last];
      this.spinRate[index] = this.spinRate[last];
      this.life[index] = this.life[last];
      this.maxLife[index] = this.maxLife[last];
      this.size[index] = this.size[last];
      this.cr[index] = this.cr[last];
      this.cg[index] = this.cg[last];
      this.cb[index] = this.cb[last];
    }
    this.live = last;
  }
}

/**
 * Trauma-based screen shake. Trauma is additive, decays exponentially and the
 * amplitude uses trauma² so small taps barely register while a big chain
 * cascade kicks hard. Never allocates; the offset is written into `out`.
 */
export class ScreenShake {
  private trauma = 0;
  private clock = 0;

  add(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  update(dt: number, enabled: boolean, out: Vector3): Vector3 {
    this.clock += dt;
    if (!enabled) this.trauma = 0;
    if (this.trauma <= 0.002) {
      this.trauma = 0;
      out.set(0, 0, 0);
      return out;
    }
    this.trauma *= Math.exp(-dt * 4.5);
    const amplitude = this.trauma * this.trauma * MAX_SHAKE;
    // Two incommensurate frequencies per axis: cheap pseudo-noise.
    out.set(
      (Math.sin(this.clock * 51.7) + Math.sin(this.clock * 31.3) * 0.6) * amplitude,
      (Math.sin(this.clock * 43.1) + Math.sin(this.clock * 27.9) * 0.6) * amplitude,
      Math.sin(this.clock * 37.7) * amplitude * 0.35,
    );
    return out;
  }

  reset(): void {
    this.trauma = 0;
  }
}

/** Shared helper: 0..1 progress to a fade-out alpha for DOM popups. */
export function popupAlpha(progress: number): number {
  const t = clamp01(progress);
  return t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
}
