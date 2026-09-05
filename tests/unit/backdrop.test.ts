import { describe, expect, it } from 'vitest';
import { Backdrop } from '../../src/render/backdrop.ts';
import { CANDY_THEME } from '../../src/render/themes/candy.ts';
import { EMBER_THEME } from '../../src/render/themes/ember.ts';

/**
 * The candy backdrop is two draw calls (one merged cloud mesh, one star
 * Points) and nothing under ember — the bare ember gradient is part of the
 * pixel-parity contract.
 */
describe('Backdrop', () => {
  it('builds nothing for ember', () => {
    const backdrop = new Backdrop(EMBER_THEME);
    expect(backdrop.group.children.length).toBe(0);
    backdrop.update(1 / 60, -10, 0.9); // must be a safe no-op
    backdrop.dispose();
  });

  it('builds exactly one cloud mesh and one star field for candy', () => {
    const backdrop = new Backdrop(CANDY_THEME);
    expect(backdrop.group.children.length).toBe(2);
    backdrop.dispose();
  });

  it('drifts the clouds with wrap and follows the camera at a discount', () => {
    const backdrop = new Backdrop(CANDY_THEME);
    const clouds = backdrop.group.children[0];
    backdrop.update(1, -100, 0);
    expect(clouds.position.x).toBeLessThan(0);
    expect(backdrop.group.position.y).toBe(-85); // PARALLAX 0.85
    // Drift wraps within one pattern repeat instead of running away.
    for (let i = 0; i < 200; i++) backdrop.update(1, -100, 0);
    expect(clouds.position.x).toBeGreaterThan(-20);
    backdrop.dispose();
  });

  it('fades the stars in with depth', () => {
    const backdrop = new Backdrop(CANDY_THEME);
    const stars = backdrop.group.children[1];
    const material = Array.isArray(stars.material) ? stars.material[0] : stars.material;
    backdrop.update(0, 0, 0);
    expect(material.opacity).toBe(0);
    backdrop.update(0, 0, 1);
    expect(material.opacity).toBeGreaterThan(0.8);
    backdrop.dispose();
  });
});
