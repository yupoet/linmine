import {
  BackSide,
  type BufferGeometry,
  DataTexture,
  InstancedMesh,
  type Material,
  MeshBasicMaterial,
  MeshStandardMaterial,
  MeshToonMaterial,
  NearestFilter,
  NoColorSpace,
  RedFormat,
} from 'three';
import { extrudeAlongNormals } from './outlineGeometry.ts';
import type { RenderTheme } from './themes/types.ts';

/**
 * Shared material and outline-hull construction for the instanced layers.
 *
 * Ember keeps the physically-shaded look; candy swaps in a 3-step toon ramp and
 * wraps every instanced layer in a back-faced hull. Both live here so the block
 * field, the particle pool and the miner agree on how a skin is realised.
 */

/** Three toon bands: shadow, mid, lit. Nearest sampling keeps the edges hard. */
const TOON_STEPS = new Uint8Array([100, 185, 255]);

let toonRamp: DataTexture | null = null;

/**
 * The gradient ramp is a single 3×1 red texture shared by every toon material
 * in the scene, so a skin rebuild never reallocates it.
 */
export function toonGradient(): DataTexture {
  if (toonRamp) return toonRamp;
  const texture = new DataTexture(TOON_STEPS, TOON_STEPS.length, 1, RedFormat);
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = NoColorSpace;
  texture.needsUpdate = true;
  toonRamp = texture;
  return texture;
}

export type LitMaterial = MeshStandardMaterial | MeshToonMaterial;

/** Lit material for the block field: standard for ember, toon for candy. */
export function createBlockMaterial(theme: RenderTheme): LitMaterial {
  if (theme.shading === 'toon') {
    return new MeshToonMaterial({ gradientMap: toonGradient() });
  }
  return new MeshStandardMaterial({ roughness: 0.72, metalness: 0.04 });
}

/** Flat chocolate material used by every outline shell. */
export function createOutlineMaterial(color: number): MeshBasicMaterial {
  return new MeshBasicMaterial({ color, side: BackSide, fog: false, toneMapped: false });
}

export interface OutlineHull {
  readonly mesh: InstancedMesh<BufferGeometry, MeshBasicMaterial>;
  readonly geometry: BufferGeometry;
  readonly material: MeshBasicMaterial;
}

/**
 * Build the outline shell for an instanced layer.
 *
 * The shell shares the source mesh's `instanceMatrix` attribute object, so
 * every transform written once is drawn twice for the cost of one extra draw
 * call. three.js does **not** propagate `count` or `visible` through a shared
 * attribute, so callers must mirror those after every add / remove / reset.
 */
export function createOutlineHull(
  source: InstancedMesh<BufferGeometry, Material>,
  geometry: BufferGeometry,
  theme: RenderTheme,
  capacity: number,
): OutlineHull {
  const hullGeometry = extrudeAlongNormals(geometry, theme.outline.extrude);
  const material = createOutlineMaterial(theme.outline.color);
  const mesh = new InstancedMesh(hullGeometry, material, capacity);
  mesh.instanceMatrix = source.instanceMatrix;
  mesh.instanceColor = null;
  mesh.count = source.count;
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  return { mesh, geometry: hullGeometry, material };
}
