import {
  BackSide,
  BoxGeometry,
  type BufferGeometry,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshToonMaterial,
  SphereGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toonGradient } from './blockHull.ts';
import { CHARACTER_RECIPES, type CharacterRecipe } from './characters.ts';
import { CUBE_SIZE } from './constants.ts';
import type { CharacterId } from '../config/characters.ts';
import type { MinerPalette, MinerVariant, RenderTheme } from './themes/types.ts';

/**
 * What hangs off the miner's rig.
 *
 * `miner.ts` owns the skeleton and the animation; this module owns the shapes.
 * Splitting them is what lets the chibi skin reuse the ember animation code
 * unchanged — including the swing keyframes that drive `onWave`/`onLand` — and
 * it is why the rig reads pivot heights from here instead of hard-coding them.
 */

export type PartSlot = 'body' | 'armLeft' | 'armRight' | 'legLeft' | 'legRight';

export interface MinerPart {
  readonly name: string;
  readonly slot: PartSlot;
  readonly mesh: Mesh;
  /** Back-faced outline shell, parented to the part. Null on ember. */
  readonly hull: Mesh | null;
}

export interface MinerPivots {
  readonly armX: number;
  readonly armY: number;
  readonly legX: number;
  readonly legY: number;
}

/** One static piece of a merged cluster: geometry is tinted and offset in place. */
interface MergePiece {
  readonly geometry: BufferGeometry;
  readonly color: number;
  readonly at: readonly [number, number, number];
  readonly scale?: readonly [number, number, number];
}

export interface MinerParts {
  readonly parts: readonly MinerPart[];
  readonly pivots: MinerPivots;
  /** Head height and torso+hips height, for the Q-version 1 : 0.92 ratio. */
  readonly headSize: number;
  readonly bodySize: number;
  dispose(): void;
}

/**
 * Parts that never get an outline shell.
 *
 * Two reasons, both from the art review: fine detail (the merged `face`
 * cluster — eyes, irises, glints, blush — plus the hat band, brim and lamp,
 * which live inside the `helmet` mesh) turns into a solid chocolate blob once
 * a shell is inflated around it, and touching pairs would double their shared
 * line — so only the larger half of each pair (sleeve, thigh, pick head) is
 * outlined.
 */
export const HULL_SKIP: readonly string[] = [
  'lampLens',
  'face',
  'handL',
  'handR',
  'bootL',
  'bootR',
  'pickHandle',
  'antenna',
  'antennaBulb',
];

const SKIP = new Set(HULL_SKIP);

/** Per-part shell thickness: bigger parts can carry a slightly thinner line. */
function inflateFor(name: string): number {
  if (name === 'head' || name === 'helmet' || name === 'hair') return 1.1;
  if (name === 'pickHead') return 1.08;
  if (name === 'torso' || name === 'hips' || name === 'torsoHips') return 1.09;
  return 1.12;
}

export function buildParts(variant: MinerVariant, theme: RenderTheme, character: CharacterId = 'boy'): MinerParts {
  const builder = new PartBuilder(theme);
  const parts = variant === 'chibi' ? builder.chibi(CHARACTER_RECIPES[character]) : builder.classic();
  return {
    parts,
    pivots: builder.pivots,
    headSize: builder.headSize,
    bodySize: builder.bodySize,
    dispose: () => builder.dispose(),
  };
}

/**
 * Collects geometries and materials as it builds so the caller can free them
 * in one call. Materials are shared per colour, and static clusters are merged
 * into vertex-tinted meshes: a chibi miner is 15 meshes plus 8 outline shells.
 */
class PartBuilder {
  pivots: MinerPivots = { armX: 0.25, armY: 0.52, legX: 0.1, legY: 0.24 };
  headSize = 0;
  bodySize = 0;

  private readonly theme: RenderTheme;
  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: Material[] = [];
  private readonly litCache = new Map<number, Material>();
  private readonly flatCache = new Map<number, Material>();
  /**
   * Chibi shares one material per colour and one white vertex-tinted material
   * for merged clusters. Classic keeps one material per part: three.js sorts
   * opaque draws by material, so sharing would reorder them and shift a few
   * pixels where the helmet meets the head — and ember has to stay
   * pixel-identical.
   */
  private share = false;
  private hullMaterial: Material | null = null;
  private litTintedMaterial: Material | null = null;
  private flatTintedMaterial: Material | null = null;

  constructor(theme: RenderTheme) {
    this.theme = theme;
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.geometries.length = 0;
    this.materials.length = 0;
    this.litCache.clear();
    this.flatCache.clear();
    this.hullMaterial = null;
    this.litTintedMaterial = null;
    this.flatTintedMaterial = null;
  }

  // --- ember ----------------------------------------------------------------

  /** The original low-poly miner, box for box. */
  classic(): MinerPart[] {
    const p = this.theme.miner.palette;
    this.share = false;
    this.pivots = { armX: 0.25, armY: 0.52, legX: 0.1, legY: 0.24 };
    this.headSize = 0.26;
    this.bodySize = 0.34;

    return [
      this.part('torso', 'body', this.box(0.4, 0.34, 0.26), p.shirt, [0, 0.39, 0]),
      this.part('hips', 'body', this.box(0.36, 0.12, 0.24), p.trousers, [0, 0.24, 0]),
      this.part('head', 'body', this.box(0.28, 0.26, 0.26), p.skin, [0, 0.69, 0]),
      this.part('helmet', 'body', this.box(0.34, 0.13, 0.32), p.helmet, [0, 0.86, 0]),
      this.flatPart('lampLens', 'body', this.sphere(0.055, 8, 6), p.lamp, [0, 0.79, 0.15]),
      this.part('sleeveL', 'armLeft', this.box(0.11, 0.3, 0.13), p.skin, [0, -0.15, 0]),
      this.part('sleeveR', 'armRight', this.box(0.11, 0.3, 0.13), p.skin, [0, -0.15, 0]),
      this.part('thighL', 'legLeft', this.box(0.13, 0.24, 0.15), p.trousers, [0, -0.12, 0]),
      this.part('thighR', 'legRight', this.box(0.13, 0.24, 0.15), p.trousers, [0, -0.12, 0]),
      this.part('pickHandle', 'armRight', this.box(0.05, 0.46, 0.05), p.wood, [0, -0.34, 0.02]),
      this.part('pickHead', 'armRight', this.box(0.3, 0.09, 0.09), p.steel, [0, -0.56, 0.02]),
    ];
  }

  // --- candy ----------------------------------------------------------------

  /**
   * Q-version proportions from the style bible: head almost as tall as the
   * body, no neck, short round limbs and an oversized pickaxe.
   *
   * Static sub-parts that share a slot and never move independently (hips+torso,
   * helmet+brim+band+lamp, the whole face, pick head+blades) are baked into one
   * vertex-tinted mesh each — 15 meshes instead of 28, which is what keeps the
   * chibi miner inside the draw-call budget (ember + 15 for the whole scene).
   *
   * The recipe picks the palette, the headgear (helmet / twin buns / antenna)
   * and the bottom (trousers / dress); the rig, the face and the limbs are
   * shared by every character.
   */
  chibi(recipe: CharacterRecipe): MinerPart[] {
    const p = recipe.palette;
    this.share = true;
    this.pivots = { armX: 0.22, armY: 0.52, legX: 0.09, legY: 0.24 };
    // Head 0.37 tall against a 0.18..0.52 body: the 1 : 0.92 ratio the bible asks for.
    this.headSize = 0.37;
    this.bodySize = 0.34;

    const parts: MinerPart[] = [
      recipe.skirt
        ? this.merged('torsoHips', 'body', [
            { geometry: this.tapered(0.2, 0.27, 0.16), color: p.shirt, at: [0, 0.22, 0] },
            { geometry: this.box(0.42, 0.26, 0.3), color: p.shirt, at: [0, 0.39, 0] },
          ], [0, 0.305, 0])
        : this.merged('torsoHips', 'body', [
            { geometry: this.box(0.36, 0.12, 0.26), color: p.trousers, at: [0, 0.24, 0] },
            { geometry: this.box(0.42, 0.26, 0.3), color: p.shirt, at: [0, 0.39, 0] },
          ], [0, 0.315, 0]),
      this.part('head', 'body', this.sphere(0.185, 20, 14), p.skin, [0, 0.69, 0]),
      ...this.headgear(recipe, p),
    ];

    const face: MergePiece[] = [];
    for (const side of [-1, 1] as const) {
      face.push(
        { geometry: this.sphere(0.065, 12, 10), color: p.spark, at: [side * 0.07, 0.7, 0.155] },
        { geometry: this.sphere(0.032, 10, 8), color: p.iris, at: [side * 0.07, 0.695, 0.2] },
        { geometry: this.sphere(0.012, 6, 6), color: p.spark, at: [side * 0.055, 0.712, 0.225] },
        { geometry: this.sphere(0.042, 10, 8), color: p.blush, at: [side * 0.12, 0.615, 0.13], scale: [1, 1, 0.45] },
      );
    }
    // The face is flat (unlit) and never outlined: no hull, so no cluster centre needed.
    parts.push(this.merged('face', 'body', face, [0, 0, 0], true));

    for (const [slot, tag] of [
      ['armLeft', 'L'],
      ['armRight', 'R'],
    ] as const) {
      parts.push(
        this.part(`sleeve${tag}`, slot, this.capsule(0.05, 0.14), p.shirt, [0, -0.05, 0]),
        this.part(`hand${tag}`, slot, this.sphere(0.07, 12, 10), p.skin, [0, -0.155, 0]),
      );
    }

    for (const [slot, tag] of [
      ['legLeft', 'L'],
      ['legRight', 'R'],
    ] as const) {
      parts.push(
        this.part(`thigh${tag}`, slot, this.capsule(0.07, 0.15), p.trousers, [0, -0.07, 0]),
        this.part(`boot${tag}`, slot, this.sphere(0.075, 12, 10), p.boot, [0, -0.16, 0.03]),
      );
    }

    // Oversized pickaxe, held in the right hand (bible §3: head width ≈ head width).
    parts.push(
      this.part('pickHandle', 'armRight', this.cylinder(0.032, 0.34), p.wood, [0, -0.26, 0.07]),
      this.merged('pickHead', 'armRight', [
        { geometry: this.box(0.36, 0.11, 0.11), color: p.steel, at: [0, -0.44, 0.07] },
        { geometry: this.box(0.08, 0.08, 0.08), color: p.steelLight, at: [-0.2, -0.44, 0.07] },
        { geometry: this.box(0.08, 0.08, 0.08), color: p.steelLight, at: [0.2, -0.44, 0.07] },
      ], [0, -0.44, 0.07]),
    );
    return parts;
  }

  // --- helpers --------------------------------------------------------------

  /** What sits on the head: the boy's helmet, the girl's twin buns, the robot's antenna. */
  private headgear(recipe: CharacterRecipe, p: MinerPalette): MinerPart[] {
    switch (recipe.headgear) {
      case 'twintails':
        // Hair cap plus two buns; the cluster is outlined like a helmet.
        return [
          this.merged('hair', 'body', [
            { geometry: this.sphere(0.195, 20, 12), color: p.helmet, at: [0, 0.78, 0], scale: [1, 0.62, 1] },
            { geometry: this.sphere(0.08, 12, 10), color: p.helmet, at: [-0.185, 0.72, 0] },
            { geometry: this.sphere(0.08, 12, 10), color: p.helmet, at: [0.185, 0.72, 0] },
          ], [0, 0.74, 0]),
        ];
      case 'antenna':
        // Thin detail stays unoutlined (it would blob); only the bulb glows.
        return [
          this.merged('antenna', 'body', [
            { geometry: this.cylinder(0.16, 0.05), color: p.helmet, at: [0, 0.85, 0] },
            { geometry: this.cylinder(0.02, 0.14), color: p.brim, at: [0, 0.94, 0] },
          ], [0, 0.9, 0]),
          this.flatPart('antennaBulb', 'body', this.sphere(0.045, 10, 8), p.lampLens, [0, 1.02, 0]),
        ];
      default:
        return [
          this.merged('helmet', 'body', [
            { geometry: this.sphere(0.195, 20, 12), color: p.helmet, at: [0, 0.78, 0], scale: [1, 0.62, 1] },
            { geometry: this.cylinder(0.2, 0.035), color: p.brim, at: [0, 0.655, 0] },
            { geometry: this.cylinder(0.188, 0.03), color: p.band, at: [0, 0.7, 0] },
            { geometry: this.cylinder(0.04, 0.05), color: p.lamp, at: [0, 0.74, 0.17] },
          ], [0, 0.72, 0]),
          this.flatPart('lampLens', 'body', this.sphere(0.048, 10, 8), p.lampLens, [0, 0.74, 0.2]),
        ];
    }
  }

  private part(
    name: string,
    slot: PartSlot,
    geometry: BufferGeometry,
    color: number,
    at: readonly [number, number, number],
    scale?: readonly [number, number, number],
  ): MinerPart {
    return this.make(name, slot, geometry, this.lit(color), at, scale);
  }

  /** Unlit part: eyes, glints and the lamp lens must not pick up shading. */
  private flatPart(
    name: string,
    slot: PartSlot,
    geometry: BufferGeometry,
    color: number,
    at: readonly [number, number, number],
    scale?: readonly [number, number, number],
  ): MinerPart {
    return this.make(name, slot, geometry, this.flat(color), at, scale);
  }

  /**
   * Bake several static pieces into one vertex-tinted mesh. Offsets (and each
   * piece's own scale) go into the geometry, so the mesh sits at `center` and
   * an outline shell inflated around that centre still hugs every piece.
   */
  private merged(
    name: string,
    slot: PartSlot,
    pieces: readonly MergePiece[],
    center: readonly [number, number, number],
    flat = false,
  ): MinerPart {
    const tinted = pieces.map(({ geometry, color, at, scale }) => {
      if (scale) geometry.scale(scale[0], scale[1], scale[2]);
      geometry.translate(at[0] - center[0], at[1] - center[1], at[2] - center[2]);
      const count = geometry.getAttribute('position').count;
      const rgb = new Float32Array(count * 3);
      const c = new Color(color);
      for (let i = 0; i < count; i++) rgb.set([c.r, c.g, c.b], i * 3);
      geometry.setAttribute('color', new Float32BufferAttribute(rgb, 3));
      return geometry;
    });
    const geometry = this.keep(mergeGeometries(tinted));
    const mesh = new Mesh(geometry, flat ? this.flatTinted() : this.litTinted());
    mesh.name = name;
    mesh.position.set(center[0], center[1], center[2]);

    let hull: Mesh | null = null;
    if (this.theme.outline.enabled && !SKIP.has(name)) {
      hull = new Mesh(geometry, this.outlineMaterial());
      hull.scale.setScalar(inflateFor(name));
      mesh.add(hull);
    }
    return { name, slot, mesh, hull };
  }

  /** White base + vertex colours: one material serves every merged cluster. */
  private litTinted(): Material {
    if (this.litTintedMaterial) return this.litTintedMaterial;
    const material =
      this.theme.shading === 'toon'
        ? new MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() })
        : new MeshLambertMaterial({ vertexColors: true });
    this.litTintedMaterial = material;
    this.materials.push(material);
    return material;
  }

  private flatTinted(): Material {
    if (this.flatTintedMaterial) return this.flatTintedMaterial;
    const material = new MeshBasicMaterial({ vertexColors: true });
    this.flatTintedMaterial = material;
    this.materials.push(material);
    return material;
  }

  private make(
    name: string,
    slot: PartSlot,
    geometry: BufferGeometry,
    material: Material,
    at: readonly [number, number, number],
    scale?: readonly [number, number, number],
  ): MinerPart {
    const mesh = new Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(at[0], at[1], at[2]);
    if (scale) mesh.scale.set(scale[0], scale[1], scale[2]);

    let hull: Mesh | null = null;
    if (this.theme.outline.enabled && !SKIP.has(name)) {
      // A child shell inherits the part's transform, so it follows every swing,
      // squash and lean for free. Geometry is shared with the part; only the
      // uniform inflate differs, which is safe here because a miner part is not
      // instanced (unlike the block field, where scaling would move instances).
      hull = new Mesh(geometry, this.outlineMaterial());
      hull.scale.setScalar(inflateFor(name));
      mesh.add(hull);
    }
    return { name, slot, mesh, hull };
  }

  /** One shared back-faced material for every shell on the miner. */
  private outlineMaterial(): Material {
    if (this.hullMaterial) return this.hullMaterial;
    const material = new MeshBasicMaterial({
      color: this.theme.miner.outline,
      side: BackSide,
      fog: false,
      toneMapped: false,
    });
    this.hullMaterial = material;
    this.materials.push(material);
    return material;
  }

  private lit(color: number): Material {
    return this.cached(this.litCache, color, (value) =>
      this.theme.shading === 'toon'
        ? new MeshToonMaterial({ color: value, gradientMap: toonGradient() })
        : new MeshLambertMaterial({ color: value }));
  }

  private flat(color: number): Material {
    return this.cached(this.flatCache, color, (value) => new MeshBasicMaterial({ color: value }));
  }

  private cached(cache: Map<number, Material>, color: number, make: (color: number) => Material): Material {
    const hit = this.share ? cache.get(color) : undefined;
    if (hit) return hit;
    const material = make(color);
    if (this.share) cache.set(color, material);
    this.materials.push(material);
    return material;
  }

  private box(width: number, height: number, depth: number): BufferGeometry {
    return this.keep(new BoxGeometry(width * CUBE_SIZE, height * CUBE_SIZE, depth * CUBE_SIZE));
  }

  private sphere(radius: number, widthSegments: number, heightSegments: number): BufferGeometry {
    return this.keep(new SphereGeometry(radius, widthSegments, heightSegments));
  }

  private cylinder(radius: number, height: number): BufferGeometry {
    return this.keep(new CylinderGeometry(radius, radius, height, 16));
  }

  /** Tapered cylinder (the girl's skirt flares towards the hem). */
  private tapered(radiusTop: number, radiusBottom: number, height: number): BufferGeometry {
    return this.keep(new CylinderGeometry(radiusTop, radiusBottom, height, 16));
  }

  private capsule(radius: number, length: number): BufferGeometry {
    return this.keep(new CapsuleGeometry(radius, length, 4, 12));
  }

  private keep(geometry: BufferGeometry): BufferGeometry {
    this.geometries.push(geometry);
    return geometry;
  }
}
