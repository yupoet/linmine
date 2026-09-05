import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  SphereGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { RenderTheme } from './themes/types.ts';

/**
 * Far-background dressing for the candy skin: a band of soft cream clouds
 * drifting sideways behind the shaft, plus pale-gold stars that fade in as the
 * sky deepens into evening lavender.
 *
 * Everything sits at z < 0 so the blocks, miner and popups always draw over
 * it. The whole layer costs two draw calls: one merged mesh for every cloud
 * (the pattern repeats laterally so the drift can wrap without a seam) and one
 * `Points` for the stars. Ember disables the layer entirely, keeping its bare
 * gradient pixel-identical.
 */

/** Lateral repeat distance of the cloud pattern; drift wraps modulo this. */
const WRAP = 20;
/** How strongly the layer follows the camera (1 = glued, 0 = fixed). */
const PARALLAX = 0.85;
/** Units per second of sideways cloud drift. */
const DRIFT = 0.22;
/** Stars start appearing at this depth factor and are full by +0.45. */
const STAR_FADE_START = 0.3;

interface CloudSpec {
  readonly x: number;
  readonly y: number;
  readonly s: number;
}

// Hand-placed blobs: spread wide, avoiding the shaft's centre column where the
// blocks sit, and denser up top where the sky is brightest.
const CLOUDS: readonly CloudSpec[] = [
  { x: -7.5, y: 6.5, s: 1.1 },
  { x: 5.5, y: 4.2, s: 0.85 },
  { x: -4.6, y: 1.8, s: 0.7 },
  { x: 7.8, y: -0.6, s: 1.0 },
  { x: -8.2, y: -3.4, s: 0.8 },
  { x: 6.4, y: -6.8, s: 0.65 },
  { x: -5.8, y: -10.5, s: 0.9 },
  { x: 7.2, y: -14.2, s: 0.75 },
  { x: -7.9, y: -18.6, s: 0.6 },
  { x: 5.9, y: -23.0, s: 0.7 },
  { x: -6.6, y: -26.5, s: 0.55 },
];

const STARS: readonly (readonly [number, number])[] = [
  [-8.5, -8], [-3.2, -11], [4.4, -9.5], [8.8, -12.5],
  [-6.1, -15.5], [1.8, -14], [7.1, -17.8], [-9.2, -20],
  [-1.5, -18.6], [5.2, -21.5], [-4.8, -24], [8.4, -25.5],
  [-7.4, -27.5], [2.6, -26.8], [-0.2, -22.4],
];

export class Backdrop {
  readonly group = new Group();
  private readonly stars: Points | null = null;
  private readonly starMaterial: PointsMaterial | null = null;
  private readonly clouds: Mesh | null = null;
  private drift = 0;

  constructor(theme: RenderTheme) {
    if (!theme.backdrop.enabled) return;

    const cloudGeometry = mergeGeometries(
      CLOUDS.flatMap((spec) => [0, WRAP].map((offset) => this.blob(spec.x + offset, spec.y, spec.s))),
    );
    const cloudMaterial = new MeshBasicMaterial({
      color: theme.backdrop.cloud,
      fog: false,
      toneMapped: false,
    });
    this.clouds = new Mesh(cloudGeometry, cloudMaterial);
    this.clouds.position.z = -4.5;
    this.group.add(this.clouds);

    const positions = new Float32Array(STARS.length * 3);
    STARS.forEach(([x, y], i) => positions.set([x, y, -4.2], i * 3));
    const starGeometry = new BufferGeometry();
    starGeometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    this.starMaterial = new PointsMaterial({
      color: theme.backdrop.star,
      size: 0.14,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    });
    this.stars = new Points(starGeometry, this.starMaterial);
    this.group.add(this.stars);
  }

  /** Drift the clouds, follow the camera at a parallax discount, fade stars in. */
  update(dt: number, camY: number, depthT: number): void {
    if (this.clouds === null) return;
    this.drift = (this.drift + dt * DRIFT) % WRAP;
    this.clouds.position.x = -this.drift;
    this.group.position.y = camY * PARALLAX;
    if (this.starMaterial !== null) {
      const fade = Math.min(1, Math.max(0, (depthT - STAR_FADE_START) / 0.45));
      this.starMaterial.opacity = fade * 0.9;
    }
  }

  dispose(): void {
    this.clouds?.geometry.dispose();
    (this.clouds?.material as MeshBasicMaterial | undefined)?.dispose();
    this.stars?.geometry.dispose();
    this.starMaterial?.dispose();
  }

  /** One squashed three-sphere blob, baked at the given position and scale. */
  private blob(x: number, y: number, s: number): BufferGeometry {
    const parts = [
      { r: 0.5, dx: 0, dy: 0 },
      { r: 0.38, dx: -0.42, dy: -0.08 },
      { r: 0.42, dx: 0.44, dy: -0.06 },
    ].map(({ r, dx, dy }) => {
      const sphere = new SphereGeometry(r * s, 12, 8);
      sphere.scale(1.15, 0.62, 1);
      sphere.translate(dx * s, dy * s, 0);
      return sphere;
    });
    const blobGeometry = mergeGeometries(parts);
    for (const part of parts) part.dispose();
    blobGeometry.translate(x, y, 0);
    return blobGeometry;
  }
}
