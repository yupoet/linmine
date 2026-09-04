export interface RngState {
  s: number;
}

/** Mix a seed and an arbitrary number of integers into a 32-bit value. */
export function hash32(...values: number[]): number {
  let h = 0x9e3779b9;
  for (let i = 0; i < values.length; i++) {
    let v = values[i] | 0;
    v = Math.imul(v ^ (v >>> 15), 0x2c1b3c6d);
    v = Math.imul(v ^ (v >>> 12), 0x297a2d39);
    v = v ^ (v >>> 15);
    h = Math.imul(h ^ v, 0x85ebca6b);
    h = h ^ (h >>> 13);
  }
  h = h ^ (h >>> 16);
  return h >>> 0;
}

export function createRng(seed: number): RngState {
  return { s: hash32(seed) >>> 0 };
}

/** Derive an independent stream from a seed plus positional parts. */
export function deriveRng(seed: number, ...parts: number[]): RngState {
  return createRng(hash32(seed, ...parts));
}

export function nextUint(rng: RngState): number {
  rng.s = (rng.s + 0x6d2b79f5) >>> 0;
  let t = rng.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t = t ^ (t + Math.imul(t ^ (t >>> 7), t | 61));
  return ((t ^ (t >>> 14)) >>> 0);
}

/** Uniform float in [0, 1). */
export function nextFloat(rng: RngState): number {
  return nextUint(rng) / 4294967296;
}

/** Uniform integer in [0, n). */
export function nextInt(rng: RngState, n: number): number {
  if (n <= 0) return 0;
  return nextUint(rng) % n;
}

/** Uniform integer in [min, max] inclusive. */
export function nextRange(rng: RngState, min: number, max: number): number {
  if (max <= min) return min;
  return min + (nextUint(rng) % (max - min + 1));
}

/**
 * Pick an index from a non-negative weight table. Returns -1 when the total
 * weight is zero. Weights are consumed in a fixed order so the result is
 * stable for a given rng stream.
 */
export function nextWeighted(rng: RngState, weights: readonly number[]): number {
  let total = 0;
  for (let i = 0; i < weights.length; i++) total += weights[i];
  if (total <= 0) return -1;
  let roll = nextFloat(rng) * total;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll < 0) return i;
  }
  return weights.length - 1;
}

export function nextChance(rng: RngState, probability: number): boolean {
  return nextFloat(rng) < probability;
}

/** Pick a uniform block kind from a candidate list. */
export function pick<T>(rng: RngState, items: readonly T[]): T | undefined {
  if (items.length === 0) return undefined;
  return items[nextInt(rng, items.length)];
}

/** Shuffle in place using a Fisher-Yates driven by the rng stream. */
export function shuffle<T>(rng: RngState, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = nextInt(rng, i + 1);
    const tmp = items[i];
    items[i] = items[j];
    items[j] = tmp;
  }
  return items;
}

/** Stable string id generator; core must not depend on crypto or Math.random. */
let idCounter = 0;
export function makeId(prefix: string): string {
  idCounter = (idCounter + 1) % 0xffffff;
  return `${prefix}_${idCounter.toString(36)}`;
}
