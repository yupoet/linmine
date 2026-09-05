import type { Color, DirectionalLight, Fog, HemisphereLight, PerspectiveCamera, PointLight, Vector3 } from 'three';
import {
  CAMERA_FOV,
  CAMERA_FOV_MAX,
  CAMERA_ROWS,
  CAMERA_TILT,
  smoothstep,
} from './constants.ts';
import type { RenderTheme } from './themes/types.ts';

/**
 * Framing and mood: the two parts of the view that depend only on the shaft
 * geometry and the active skin, with no knowledge of the dig sequencer.
 */

export interface ViewFit {
  readonly camDist: number;
  readonly tiltHeight: number;
}

/**
 * Pull the camera back far enough to show `CAMERA_ROWS` rows and the full grid
 * width. Tall, narrow phone screens widen the fov instead of retreating
 * further, which keeps the mine from shrinking to a ribbon.
 */
export function fitView(camera: PerspectiveCamera, width: number, height: number, gridWidth: number): ViewFit {
  const aspect = width / Math.max(1, height);
  const fov = aspect >= 0.6 ? CAMERA_FOV : Math.min(CAMERA_FOV_MAX, CAMERA_FOV + (0.6 - aspect) * 90);
  const halfV = Math.tan((fov * Math.PI) / 360);
  const distForRows = CAMERA_ROWS / (2 * halfV);
  const distForWidth = (gridWidth + 1.4) / (2 * halfV * aspect);

  camera.fov = fov;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  const camDist = Math.max(distForRows, distForWidth) * 1.04;
  return { camDist, tiltHeight: camDist * Math.tan(CAMERA_TILT) };
}

/**
 * Place the camera at (x, y) with the shake offset applied to *both* the eye
 * and the look-at target, so a shake translates the frame instead of swinging
 * it around the miner.
 */
export function placeCamera(
  camera: PerspectiveCamera,
  x: number,
  y: number,
  fit: ViewFit,
  shake: Vector3,
  lookTarget: Vector3,
): void {
  camera.position.set(x + shake.x, y + fit.tiltHeight + shake.y, fit.camDist + shake.z);
  lookTarget.set(x + shake.x, y + shake.y, 0);
  camera.lookAt(lookTarget);
}

export interface AtmosphereTargets {
  readonly background: Color;
  readonly deep: Color;
  readonly fog: Fog;
  readonly hemi: HemisphereLight;
  readonly sun: DirectionalLight;
  readonly lamp: PointLight;
}

/**
 * Blend the skin's daylight palette towards its deep palette with depth.
 *
 * Every coefficient comes from the theme, which is what lets candy stay a
 * coloured evening 40 rows down while ember still sinks to a near-black mine.
 * Returns the 0..1 depth blend so the caller can drive the vignette and the
 * exit-layer glow off the same curve.
 */
export function applyAtmosphere(
  theme: RenderTheme,
  row: number,
  camDist: number,
  out: AtmosphereTargets,
): number {
  const air = theme.atmosphere;
  const lights = theme.lights;
  const t = smoothstep(row / air.darkByRow);

  out.background.setHex(air.sky).lerp(out.deep.setHex(air.deep), t);
  out.fog.color.copy(out.background);
  // Fog tightens with depth: the walls close in.
  out.fog.near = camDist + 1.5 - 4 * t;
  out.fog.far = camDist + 18 - 11 * t;
  out.hemi.intensity = lights.hemiIntensity - air.hemiDrop * t;
  out.sun.intensity = lights.sunIntensity - air.sunDrop * t;
  out.lamp.intensity = lights.lampIntensity + air.lampGain * t;
  return t;
}
