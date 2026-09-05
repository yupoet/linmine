import { describe, expect, it } from 'vitest';
import { Miner } from '../../src/render/miner.ts';
import { CHARACTER_IDS } from '../../src/config/characters.ts';
import { buildParts, HULL_SKIP } from '../../src/render/minerParts.ts';
import { CANDY_THEME } from '../../src/render/themes/candy.ts';
import { EMBER_THEME } from '../../src/render/themes/ember.ts';

/**
 * The rig (`miner.ts`) poses pivots; the parts (`minerParts.ts`) decide what
 * hangs off them. Splitting the two is what lets a chibi miner reuse the exact
 * same animation code, so the rig must keep reading the pivot heights from the
 * parts instead of hard-coding 0.52 / 0.24.
 */
describe('buildParts', () => {
  it('keeps the classic shoulder and hip pivots', () => {
    const parts = buildParts('classic', EMBER_THEME);
    expect(parts.pivots.armY).toBe(0.52);
    expect(parts.pivots.armX).toBe(0.25);
    expect(parts.pivots.legY).toBe(0.24);
    expect(parts.pivots.legX).toBe(0.1);
    parts.dispose();
  });

  it('gives the chibi miner a head as tall as its body (1 : 0.92)', () => {
    const parts = buildParts('chibi', CANDY_THEME);
    expect(parts.headSize).toBeGreaterThan(0);
    expect(parts.bodySize / parts.headSize).toBeCloseTo(0.92, 2);
    parts.dispose();
  });

  it('moves the chibi pivots inward per the dimension table', () => {
    const parts = buildParts('chibi', CANDY_THEME);
    expect(parts.pivots.armX).toBeCloseTo(0.22, 6);
    expect(parts.pivots.armY).toBeCloseTo(0.52, 6);
    expect(parts.pivots.legX).toBeCloseTo(0.09, 6);
    expect(parts.pivots.legY).toBeCloseTo(0.24, 6);
    parts.dispose();
  });

  it('outlines the big chibi parts but never the fine detail', () => {
    for (const character of CHARACTER_IDS) {
      const parts = buildParts('chibi', CANDY_THEME, character);
      const byName = new Map(parts.parts.map((part) => [part.name, part]));

      // HULL_SKIP is the union over every character's fine detail; a recipe
      // only contains its own (the boy has a lamp lens, the robot an antenna).
      for (const name of HULL_SKIP) {
        const part = byName.get(name);
        if (!part) continue;
        expect(part.hull, `${character}/${name} must not carry an outline shell`).toBeNull();
      }

      for (const name of ['head', 'torsoHips', 'sleeveL', 'thighL', 'pickHead']) {
        const part = byName.get(name);
        expect(part, `${character}: missing part ${name}`).toBeDefined();
        expect(part!.hull, `${character}/${name} should carry an outline shell`).not.toBeNull();
      }
      parts.dispose();
    }
  });

  it('outlines the girl\'s hair like a helmet but never the robot\'s antenna', () => {
    const girl = buildParts('chibi', CANDY_THEME, 'girl');
    const hair = girl.parts.find((part) => part.name === 'hair');
    expect(hair, 'girl should wear twin buns').toBeDefined();
    expect(hair!.hull).not.toBeNull();
    expect(girl.parts.some((part) => part.name === 'helmet')).toBe(false);
    girl.dispose();

    const robot = buildParts('chibi', CANDY_THEME, 'robot');
    const antenna = robot.parts.find((part) => part.name === 'antenna');
    expect(antenna, 'robot should wear an antenna').toBeDefined();
    expect(antenna!.hull).toBeNull();
    robot.dispose();
  });

  it('keeps every character inside the draw-call budget (scene must stay ≤ ember + 15)', () => {
    for (const character of CHARACTER_IDS) {
      const parts = buildParts('chibi', CANDY_THEME, character);
      const hulls = parts.parts.filter((part) => part.hull !== null).length;
      expect(parts.parts.length, `${character} mesh count`).toBeLessThanOrEqual(15);
      expect(hulls, `${character} hull count`).toBeLessThanOrEqual(8);
      parts.dispose();
    }
  });

  it('leaves the classic miner unoutlined', () => {
    const parts = buildParts('classic', EMBER_THEME);
    for (const part of parts.parts) expect(part.hull).toBeNull();
    parts.dispose();
  });
});

describe('Miner', () => {
  for (const [label, theme, character] of [
    ['classic', EMBER_THEME, undefined],
    ['chibi girl', CANDY_THEME, 'girl'],
    ['chibi boy', CANDY_THEME, 'boy'],
    ['chibi robot', CANDY_THEME, 'robot'],
  ] as const) {
    it(`animates the ${label} rig without throwing`, () => {
      const miner = character === undefined ? new Miner(theme) : new Miner(theme, character);
      miner.setMotion('walk');
      miner.startSwing(0.16);
      for (let i = 0; i < 40; i++) miner.update(1 / 60);
      miner.setMotion('fall');
      miner.squash(1);
      for (let i = 0; i < 40; i++) miner.update(1 / 60);
      miner.setMotion('idle');
      miner.setFacing(-1);
      miner.update(1 / 60);
      expect(miner.facing).toBe(-1);
      miner.dispose();
    });
  }
});
