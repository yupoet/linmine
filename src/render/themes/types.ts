import type { BlockKind } from '../../config/blocks.ts';
import type { ThemeId } from '../../config/theme.ts';

/**
 * A skin, as the render layer sees it.
 *
 * Everything the Three.js scene draws — colours, light rig, cube geometry,
 * outline hull, decal atlas, miner proportions — comes from one of these
 * objects. No render module may hold a colour literal of its own, so a skin
 * is swapped by rebuilding the scene resources against a different
 * `RenderTheme` and nothing else.
 *
 * The render layer must never read CSS variables: `ui/` owns the DOM skin and
 * the dependency direction is one-way (see CLAUDE.md).
 */

/**
 * Three-tone colour for one block kind.
 *
 * `base` is the instance colour. `light` is the accent (ore veins, topsoil
 * grass, drill variant tint, the pulsing exit layer). `shade` tints the debris
 * a destroyed block throws — under toon shading it reads as the block's own
 * shadow tone; ember mirrors `base` so debris stays exactly as it was.
 */
export interface BlockPalette {
  readonly base: number;
  readonly shade: number;
  readonly light: number;
}

/**
 * Back-faced hull drawn around every cube. `extrude` is a distance pushed
 * along the vertex normals — never an object scale, which would also scale the
 * per-instance translations.
 */
export interface OutlineTheme {
  readonly enabled: boolean;
  readonly color: number;
  readonly extrude: number;
}

/** Cube geometry knobs. More segments buy rounder corners at ~2x triangles. */
export interface GeometryTheme {
  readonly segments: number;
  readonly radius: number;
}

export interface LightTheme {
  readonly hemiSky: number;
  readonly hemiGround: number;
  readonly hemiIntensity: number;
  readonly sun: number;
  readonly sunIntensity: number;
  readonly sunPosition: readonly [number, number, number];
  readonly lamp: number;
  readonly lampIntensity: number;
  readonly lampDistance: number;
  readonly lampDecay: number;
  readonly lampPosition: readonly [number, number, number];
}

/**
 * Depth mood. `t` is `smoothstep(minerRow / darkByRow)`; each field below is
 * the coefficient of one of the linear falloffs in `updateAtmosphere`:
 *
 *   background = lerp(sky, deep, t)
 *   hemi       = hemiIntensity - hemiDrop * t
 *   sun        = sunIntensity  - sunDrop  * t
 *   lamp       = lampIntensity + lampGain * t
 *   vignette   = vignetteBase  + vignetteGain * t
 */
export interface AtmosphereTheme {
  readonly sky: number;
  readonly deep: number;
  readonly darkByRow: number;
  readonly hemiDrop: number;
  readonly sunDrop: number;
  readonly lampGain: number;
  readonly vignetteBase: number;
  readonly vignetteGain: number;
}

export interface HighlightTheme {
  readonly affordable: number;
  readonly tooExpensive: number;
  readonly hovered: number;
  /** Extra brightness swell on affordable rims (candy's "breathing" glow). */
  readonly breathe: number;
}

export interface ParticleTheme {
  readonly dust: number;
  readonly hitFlash: number;
}

/** Inline styles for the DOM overlay (floating cash, per-block cost badges). */
export interface PopupTheme {
  readonly cash: string;
  readonly gold: string;
  readonly repair: string;
  readonly labelOk: string;
  readonly labelNo: string;
  readonly shadow: string;
  readonly labelShadow: string;
}

/**
 * Miner colours. `classic` uses the first seven; `chibi` uses all of them.
 * Unused slots still carry a sensible value so a partial skin cannot render a
 * black part.
 */
export interface MinerPalette {
  readonly shirt: number;
  readonly trousers: number;
  readonly skin: number;
  readonly helmet: number;
  readonly lamp: number;
  readonly steel: number;
  readonly wood: number;
  readonly brim: number;
  readonly band: number;
  readonly lampLens: number;
  readonly steelLight: number;
  readonly iris: number;
  readonly blush: number;
  readonly spark: number;
  readonly boot: number;
}

export type MinerVariant = 'classic' | 'chibi';

export interface MinerTheme {
  readonly variant: MinerVariant;
  readonly palette: MinerPalette;
  /** Per-part outline colour; ignored when `outline.enabled` is false. */
  readonly outline: number;
}

export interface RenderTheme {
  readonly id: ThemeId;
  readonly shading: 'standard' | 'toon';
  readonly outline: OutlineTheme;
  readonly geometry: GeometryTheme;
  readonly atmosphere: AtmosphereTheme;
  readonly lights: LightTheme;
  readonly blocks: Readonly<Record<BlockKind, BlockPalette>>;
  /** Topsoil cap tint blended into surface dirt. */
  readonly grass: number;
  readonly highlight: HighlightTheme;
  readonly particles: ParticleTheme;
  readonly popups: PopupTheme;
  readonly miner: MinerTheme;
  /** Procedural "face" decals on special blocks and ore veins. */
  readonly decals: boolean;
}
