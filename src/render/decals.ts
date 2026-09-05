import {
  CanvasTexture,
  ClampToEdgeWrapping,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  LinearFilter,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  type Texture,
} from 'three';
import { ArrowVariant, BlockKind } from '../config/blocks.ts';

/**
 * Procedural "face" decals for the candy skin.
 *
 * Bible §3 asks special blocks to have expressions and ores to show a vein.
 * Rather than shipping texture files (the project is 100% procedural and the
 * PWA budget is tight), one 512² atlas is drawn on a canvas the first time a
 * candy scene is built and reused for the life of the page. A single extra
 * instanced plane samples it, so the whole feature costs one draw call.
 *
 * The atlas is 4×4 tiles of 128 px. Tile 0 is deliberately empty: plain blocks
 * point at it and simply draw nothing.
 */

export const DECAL_TILES = 4;
const TILE = 128;
const ATLAS = DECAL_TILES * TILE;
/** Normalised size of one tile, i.e. the `zw` of every atlas rect. */
export const DECAL_SPAN = 1 / DECAL_TILES;

const Tile = {
  Empty: 0,
  BombEyes: 1,
  ArrowDown: 2,
  ArrowSide: 3,
  RepairFace: 4,
  VaultCoins: 5,
  CopperVein: 6,
  GoldVein: 7,
  ExitStars: 8,
} as const;
type Tile = (typeof Tile)[keyof typeof Tile];

const CREAM = '#fff8e7';
const COCOA = '#3d2612';
const SUN = '#ffcc33';
const SUN_LT = '#fff0a6';
const MINT_LT = '#c9f2d2';
const CARAMEL_DK = '#8a5424';

/** Atlas rect (u, v, du, dv) for a block kind. Slot recycling rewrites this. */
export function decalRect(kind: number, variant: number): [number, number, number, number] {
  const tile = tileFor(kind, variant);
  const col = tile % DECAL_TILES;
  const row = (tile / DECAL_TILES) | 0;
  // CanvasTexture keeps the default flipY=true, so UV v=1 is the canvas top:
  // canvas row 0 (painted at the top) sits at v ∈ [1-span, 1], not [0, span].
  const v = (DECAL_TILES - 1 - row) * DECAL_SPAN;
  return [col * DECAL_SPAN, v, DECAL_SPAN, DECAL_SPAN];
}

function tileFor(kind: number, variant: number): Tile {
  switch (kind) {
    case BlockKind.Bomb:
      return Tile.BombEyes;
    case BlockKind.Arrow:
      return variant === ArrowVariant.Side ? Tile.ArrowSide : Tile.ArrowDown;
    case BlockKind.Repair:
      return Tile.RepairFace;
    case BlockKind.Vault:
      return Tile.VaultCoins;
    case BlockKind.Copper:
      return Tile.CopperVein;
    case BlockKind.Gold:
      return Tile.GoldVein;
    case BlockKind.Exit:
      return Tile.ExitStars;
    default:
      return Tile.Empty;
  }
}

let cached: Texture | null | undefined;

/**
 * The shared atlas texture, drawn once.
 *
 * Returns `null` where there is no DOM (unit tests run in vitest's node
 * environment): the decal layer then renders with no map, which keeps all the
 * instance bookkeeping testable without a browser.
 */
export function decalAtlas(): Texture | null {
  if (cached !== undefined) return cached;
  cached = typeof document === 'undefined' ? null : paintAtlas();
  return cached;
}

function paintAtlas(): Texture | null {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS;
  canvas.height = ATLAS;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, ATLAS, ATLAS);
  paintTile(ctx, Tile.BombEyes, paintBombEyes);
  paintTile(ctx, Tile.ArrowDown, (c) => paintArrow(c, 0));
  paintTile(ctx, Tile.ArrowSide, (c) => paintArrow(c, Math.PI / 2));
  paintTile(ctx, Tile.RepairFace, paintRepairFace);
  paintTile(ctx, Tile.VaultCoins, paintVaultCoins);
  paintTile(ctx, Tile.CopperVein, (c) => paintVein(c, SUN_LT, 1));
  paintTile(ctx, Tile.GoldVein, (c) => paintVein(c, CREAM, 2));
  paintTile(ctx, Tile.ExitStars, paintExitStars);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

/**
 * Draw one tile in its own coordinate system: the callback works in a
 * 0..1 square and never has to know where the tile sits in the atlas. Content
 * is inset so bilinear filtering cannot bleed a neighbouring tile in.
 */
function paintTile(ctx: CanvasRenderingContext2D, tile: Tile, draw: (c: CanvasRenderingContext2D) => void): void {
  const col = tile % DECAL_TILES;
  const row = (tile / DECAL_TILES) | 0;
  const pad = TILE * 0.08;
  ctx.save();
  ctx.translate(col * TILE + pad, row * TILE + pad);
  ctx.scale(TILE - 2 * pad, TILE - 2 * pad);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  draw(ctx);
  ctx.restore();
}

function disc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Blast crate: two wide startled eyes and a lit fuse spark. */
function paintBombEyes(ctx: CanvasRenderingContext2D): void {
  disc(ctx, 0.34, 0.46, 0.16, CREAM);
  disc(ctx, 0.66, 0.46, 0.16, CREAM);
  disc(ctx, 0.36, 0.49, 0.075, COCOA);
  disc(ctx, 0.64, 0.49, 0.075, COCOA);
  disc(ctx, 0.5, 0.14, 0.07, SUN);
  disc(ctx, 0.5, 0.14, 0.035, CREAM);
}

/** Drill charge: a fat cream arrow, rotated for the side-firing variant. */
function paintArrow(ctx: CanvasRenderingContext2D, angle: number): void {
  ctx.save();
  ctx.translate(0.5, 0.5);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(-0.13, -0.34);
  ctx.lineTo(0.13, -0.34);
  ctx.lineTo(0.13, 0.06);
  ctx.lineTo(0.3, 0.06);
  ctx.lineTo(0, 0.38);
  ctx.lineTo(-0.3, 0.06);
  ctx.lineTo(-0.13, 0.06);
  ctx.closePath();
  ctx.fillStyle = CREAM;
  ctx.fill();
  ctx.lineWidth = 0.05;
  ctx.strokeStyle = COCOA;
  ctx.stroke();
  ctx.restore();
}

/** Supply crate: a first-aid cross wearing a smile. */
function paintRepairFace(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = CREAM;
  ctx.fillRect(0.4, 0.12, 0.2, 0.5);
  ctx.fillRect(0.25, 0.27, 0.5, 0.2);
  disc(ctx, 0.33, 0.76, 0.045, COCOA);
  disc(ctx, 0.67, 0.76, 0.045, COCOA);
  ctx.beginPath();
  ctx.arc(0.5, 0.74, 0.16, 0.2 * Math.PI, 0.8 * Math.PI);
  ctx.lineWidth = 0.05;
  ctx.strokeStyle = COCOA;
  ctx.stroke();
}

/** Vault: coins spilling over the lid. */
function paintVaultCoins(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = CARAMEL_DK;
  ctx.fillRect(0.06, 0.4, 0.88, 0.12);
  for (const [x, y, r] of [
    [0.3, 0.24, 0.12],
    [0.56, 0.18, 0.1],
    [0.72, 0.3, 0.09],
  ] as const) {
    disc(ctx, x, y, r, SUN);
    disc(ctx, x, y, r * 0.55, SUN_LT);
  }
  disc(ctx, 0.5, 0.74, 0.1, SUN);
}

/** Ore: pale nuggets, plus star glints for gold. */
function paintVein(ctx: CanvasRenderingContext2D, tone: string, stars: number): void {
  for (const [x, y, r] of [
    [0.31, 0.34, 0.13],
    [0.63, 0.28, 0.1],
    [0.46, 0.66, 0.15],
    [0.76, 0.62, 0.09],
  ] as const) {
    disc(ctx, x, y, r, tone);
  }
  for (let i = 0; i < stars; i++) star(ctx, i === 0 ? 0.24 : 0.78, i === 0 ? 0.74 : 0.24, 0.1, CREAM);
}

/** Exit layer: a little bunting of stars over the grass band. */
function paintExitStars(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = MINT_LT;
  ctx.fillRect(0.04, 0.6, 0.92, 0.12);
  star(ctx, 0.24, 0.34, 0.15, CREAM);
  star(ctx, 0.62, 0.26, 0.11, SUN);
  star(ctx, 0.82, 0.46, 0.09, CREAM);
}

function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, fill: string): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    const radius = i % 2 === 0 ? r : r * 0.44;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/**
 * The instanced plane that stamps atlas tiles onto block faces.
 *
 * It shares the block field's `instanceMatrix`, so it needs no transforms of
 * its own — only a per-instance `atlasRect` saying which tile to sample. The
 * rect is injected into the shader after `<uv_vertex>`, which is where three.js
 * has just written `vMapUv`.
 */
export class DecalLayer {
  readonly mesh: InstancedMesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly geometry: PlaneGeometry;
  private readonly material: MeshBasicMaterial;
  private readonly rect: InstancedBufferAttribute;

  constructor(capacity: number, instanceMatrix: InstancedMesh['instanceMatrix']) {
    // Slightly proud of the cube's front face (half-size 0.5) so the decal
    // never z-fights with the block it belongs to.
    this.geometry = new PlaneGeometry(0.62, 0.62).translate(0, 0, 0.507);
    const map = decalAtlas();
    this.material = new MeshBasicMaterial({
      map,
      alphaTest: 0.4,
      depthWrite: false,
      toneMapped: false,
    });

    this.rect = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    this.rect.setUsage(DynamicDrawUsage);
    this.geometry.setAttribute('atlasRect', this.rect);

    if (map) {
      this.material.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nattribute vec4 atlasRect;')
          .replace('#include <uv_vertex>', '#include <uv_vertex>\n\tvMapUv = vMapUv * atlasRect.zw + atlasRect.xy;');
      };
      this.material.customProgramCacheKey = () => 'linmine-decal-atlas';
    }

    this.mesh = new InstancedMesh(this.geometry, this.material, capacity);
    this.mesh.instanceMatrix = instanceMatrix;
    this.mesh.instanceColor = null;
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  /** Point one slot at the tile for its block. Called from `writeInstance`. */
  setSlot(slot: number, kind: number, variant: number): void {
    const [u, v, du, dv] = decalRect(kind, variant);
    this.rect.setXYZW(slot, u, v, du, dv);
    this.rect.needsUpdate = true;
  }

  /** Mirror the owning field's instance count and visibility. */
  mirror(count: number, visible: boolean): void {
    this.mesh.count = count;
    this.mesh.visible = visible;
  }

  rectAt(slot: number): [number, number, number, number] {
    return [this.rect.getX(slot), this.rect.getY(slot), this.rect.getZ(slot), this.rect.getW(slot)];
  }

  /**
   * Only ever called together with the block field and the outline hull:
   * three.js r169 frees the shared `instanceMatrix` buffer without reference
   * counting, so the three layers live and die as one.
   */
  dispose(): void {
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }
}
