import type { DirectionalLight, HemisphereLight, Object3D, PointLight, Scene } from 'three';
import { BlockField } from './blocks.ts';
import { Particles } from './fx.ts';
import { HighlightField } from './highlights.ts';
import { Miner } from './miner.ts';
import type { CharacterId } from '../config/characters.ts';
import type { RenderTheme } from './themes/types.ts';

/**
 * Everything in the scene that a skin owns.
 *
 * Swapping skins means throwing these away and rebuilding them; the camera,
 * lights, DOM overlay, dig sequencer and `RunState` all survive untouched. The
 * light *objects* survive too — only their parameters are reassigned — because
 * replacing lights forces three.js to recompile every material in the scene.
 */
export interface SkinResources {
  readonly theme: RenderTheme;
  readonly field: BlockField;
  readonly highlights: HighlightField;
  readonly miner: Miner;
  readonly particles: Particles;
}

export interface SceneLights {
  readonly hemi: HemisphereLight;
  readonly sun: DirectionalLight;
  readonly lamp: PointLight;
}

export function buildSkin(theme: RenderTheme, gridWidth: number, character: CharacterId): SkinResources {
  return {
    theme,
    field: new BlockField(gridWidth, theme),
    highlights: new HighlightField(theme),
    miner: new Miner(theme, character),
    particles: new Particles(theme),
  };
}

/** Scene-graph nodes contributed by a skin, in draw order. */
function nodes(skin: SkinResources): Object3D[] {
  return [...skin.field.layers(), ...skin.particles.layers(), skin.highlights.mesh, skin.miner.group];
}

export function attachSkin(scene: Scene, skin: SkinResources): void {
  for (const node of nodes(skin)) scene.add(node);
}

/** Remove a skin from the scene and free its GPU resources. */
export function releaseSkin(scene: Scene, skin: SkinResources): void {
  for (const node of nodes(skin)) scene.remove(node);
  skin.field.dispose();
  skin.highlights.dispose();
  skin.particles.dispose();
  skin.miner.dispose();
}

/** Re-point the existing light objects at a different skin's rig. */
export function applyLights(theme: RenderTheme, lights: SceneLights): void {
  const rig = theme.lights;
  lights.hemi.color.setHex(rig.hemiSky);
  lights.hemi.groundColor.setHex(rig.hemiGround);
  lights.hemi.intensity = rig.hemiIntensity;
  lights.sun.color.setHex(rig.sun);
  lights.sun.intensity = rig.sunIntensity;
  lights.sun.position.set(rig.sunPosition[0], rig.sunPosition[1], rig.sunPosition[2]);
  lights.lamp.color.setHex(rig.lamp);
  lights.lamp.intensity = rig.lampIntensity;
  lights.lamp.distance = rig.lampDistance;
  lights.lamp.decay = rig.lampDecay;
  lights.lamp.position.set(rig.lampPosition[0], rig.lampPosition[1], rig.lampPosition[2]);
}
