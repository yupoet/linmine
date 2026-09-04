import { describe, expect, it } from 'vitest';
import { createRng, deriveRng, hash32, nextFloat, nextInt, nextWeighted, shuffle } from '../../src/core/rng.ts';

describe('rng', () => {
  it('is deterministic for a given seed', () => {
    const a = createRng(1234);
    const b = createRng(1234);
    const left = Array.from({ length: 20 }, () => nextFloat(a));
    const right = Array.from({ length: 20 }, () => nextFloat(b));
    expect(left).toEqual(right);
  });

  it('produces different streams for different seeds', () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(nextFloat(a)).not.toBe(nextFloat(b));
  });

  it('derives independent streams from parts', () => {
    expect(nextUintOf(deriveRng(7, 1, 2))).toBe(nextUintOf(deriveRng(7, 1, 2)));
    expect(nextUintOf(deriveRng(7, 1, 2))).not.toBe(nextUintOf(deriveRng(7, 2, 1)));
  });

  it('keeps floats in [0,1) and ints in range', () => {
    const rng = createRng(99);
    for (let i = 0; i < 5000; i++) {
      const value = nextFloat(rng);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      const n = nextInt(rng, 6);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(6);
    }
  });

  it('picks weighted indices proportionally', () => {
    const rng = createRng(2024);
    const weights = [0, 10, 30, 60];
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < 4000; i++) {
      counts[nextWeighted(rng, weights)]++;
    }
    expect(counts[0]).toBe(0);
    expect(counts[3]).toBeGreaterThan(counts[2]);
    expect(counts[2]).toBeGreaterThan(counts[1]);
  });

  it('returns -1 when every weight is zero', () => {
    expect(nextWeighted(createRng(1), [0, 0])).toBe(-1);
  });

  it('shuffles without losing elements', () => {
    const rng = createRng(5);
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const shuffled = shuffle(rng, [...items]);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(items);
  });

  it('hashes to unsigned 32-bit values', () => {
    const value = hash32(1, 2, 3);
    expect(Number.isInteger(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(0xffffffff);
  });
});

function nextUintOf(rng: { s: number }): number {
  return nextInt(rng, 0xffffffff);
}
