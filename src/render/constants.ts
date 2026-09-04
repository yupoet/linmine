/**
 * Shared constants and coordinate helpers for the render layer.
 *
 * The world convention (owned by the app contract, mirrored here):
 *   block (col,row) centre = (worldX(col), worldY(row), 0), cube size 1
 *   x horizontal, y negative and decreasing with depth, z slice thickness.
 */

export const CUBE_SIZE = 1;

/** The miner sits slightly in front of the slice so he reads against blocks. */
export const PLAYER_Z = 0.35;

/** Rows kept alive above / below the miner's row; everything else is culled. */
export const WINDOW_ABOVE = 5;
export const WINDOW_BELOW = 11;

export const MAX_BLOCK_INSTANCES = 512;
export const MAX_HIGHLIGHT_INSTANCES = 40;
export const MAX_PARTICLES = 400;
export const MAX_LABELS = 28;
export const MAX_POPUPS = 18;

// --- camera -----------------------------------------------------------------

export const CAMERA_FOV = 45;
export const CAMERA_FOV_MAX = 62;
/** Rows the player should see at once on a comfortably wide screen. */
export const CAMERA_ROWS = 12.5;
/** Downward pitch, radians. Gives a little more room below than above. */
export const CAMERA_TILT = 0.1;
/**
 * Rows between the miner's cell centre and the point the camera aims at.
 * Positive => the miner sits above the screen centre, so more of the mine
 * below him is visible (the player plans the descent).
 */
export const CAMERA_FOCUS_OFFSET = 1.5;
export const CAMERA_LERP_K = 8;
/** Beyond this error the camera catches up faster so long falls stay on screen. */
export const CAMERA_CATCHUP_ERROR = 4;

// --- dig timing (seconds) ----------------------------------------------------

export const WALK_PER_CELL = 0.1;
export const SWING_TIME = 0.16;
/** Fraction of the swing at which the pick lands and the block breaks. */
export const SWING_IMPACT = 0.72;
export const CHAIN_STAGGER = 0.09;
export const CHAIN_WINDOW_MAX = 0.28;
export const STEP_IN_TIME = 0.07;
export const FALL_PER_ROW = 0.05;
export const FALL_BASE = 0.05;
export const FALL_MAX = 0.45;
export const SETTLE_TIME = 0.05;
/** Hard cap for one tap: walk + swing + chains + fall must fit inside this. */
export const DIG_BUDGET = 0.75;
export const WAVE_GAP = 0.04;

// --- atmosphere --------------------------------------------------------------

export const SKY_COLOR = 0x9ad9f5;
export const DEEP_COLOR = 0x05070c;
/** Row at which the atmosphere has fully transitioned to the deep palette. */
export const DARK_BY_ROW = 40;

export const MAX_SHAKE = 0.22;
export const PARTICLE_GRAVITY = 9.5;

// --- helpers -----------------------------------------------------------------

/** Centre x of a column. */
export function worldX(col: number, width: number): number {
  return (col - (width - 1) / 2) * CUBE_SIZE;
}

/** Centre y of a row. */
export function worldY(row: number): number {
  return -row * CUBE_SIZE;
}

/** y of the feet of a miner standing on top of the block at `row`. */
export function feetY(row: number): number {
  return worldY(row) - CUBE_SIZE / 2;
}

/** Falls stay short and scale with distance instead of using a fixed duration. */
export function fallDuration(rows: number): number {
  return Math.min(FALL_MAX, FALL_BASE + Math.abs(rows) * FALL_PER_ROW);
}

/**
 * Frame-rate independent exponential smoothing. `k` is the rate: after
 * 1/k seconds roughly 63% of the distance is covered, whatever the framerate.
 */
export function damp(current: number, target: number, k: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-k * dt));
}

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function smoothstep(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

/** Stable 0..1 hash of a cell, used for per-block colour jitter. */
export function cellHash(col: number, row: number): number {
  let h = (Math.imul(col, 374761393) + Math.imul(row, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
