import { describe, expect, it } from 'vitest';
import { BlockKind, BLOCKS } from '../../src/config/blocks.ts';
import { EMBER_THEME } from '../../src/render/themes/ember.ts';

/**
 * Parity guard for the ember skin.
 *
 * Every number here is the literal that used to live in the render layer
 * before the theme extraction (blocks.ts, miner.ts, fx.ts, dom.ts,
 * constants.ts, index.ts). If one of them drifts, ember stops being
 * pixel-identical to the pre-skin build — which is the whole contract of the
 * theme system.
 */
describe('ember render theme', () => {
  it('identifies itself as the ember skin with the legacy pipeline', () => {
    expect(EMBER_THEME.id).toBe('ember');
    expect(EMBER_THEME.shading).toBe('standard');
    expect(EMBER_THEME.outline.enabled).toBe(false);
    expect(EMBER_THEME.decals).toBe(false);
  });

  it('keeps the legacy cube geometry (roundedBox 2 segments, radius 0.09)', () => {
    expect(EMBER_THEME.geometry.segments).toBe(2);
    expect(EMBER_THEME.geometry.radius).toBe(0.09);
  });

  it('keeps the atmosphere constants from render/constants.ts', () => {
    expect(EMBER_THEME.atmosphere.sky).toBe(0x9ad9f5);
    expect(EMBER_THEME.atmosphere.deep).toBe(0x05070c);
    expect(EMBER_THEME.atmosphere.darkByRow).toBe(40);
  });

  it('keeps the depth falloff curve from updateAtmosphere', () => {
    // hemi 0.95 - 0.65t, sun 1.15 - 0.6t, lamp 1.2 + 4.3t, vignette 0.18 + 0.42t
    expect(EMBER_THEME.atmosphere.hemiDrop).toBe(0.65);
    expect(EMBER_THEME.atmosphere.sunDrop).toBe(0.6);
    expect(EMBER_THEME.atmosphere.lampGain).toBe(4.3);
    expect(EMBER_THEME.atmosphere.vignetteBase).toBe(0.18);
    expect(EMBER_THEME.atmosphere.vignetteGain).toBe(0.42);
  });

  it('keeps the light rig from the SceneRenderer constructor', () => {
    const lights = EMBER_THEME.lights;
    expect(lights.hemiSky).toBe(0xcfe9ff);
    expect(lights.hemiGround).toBe(0x3a2a1c);
    expect(lights.hemiIntensity).toBe(0.95);
    expect(lights.sun).toBe(0xffffff);
    expect(lights.sunIntensity).toBe(1.15);
    expect(lights.sunPosition).toEqual([3, 6, 8]);
    expect(lights.lamp).toBe(0xffe6a8);
    expect(lights.lampIntensity).toBe(1.2);
    expect(lights.lampDistance).toBe(6);
    expect(lights.lampDecay).toBe(1.8);
    expect(lights.lampPosition).toEqual([0, 0.8, 0.45]);
  });

  it('sources every block colour from the config table', () => {
    for (const kind of Object.values(BlockKind)) {
      const def = BLOCKS[kind];
      const palette = EMBER_THEME.blocks[kind];
      expect(palette.base).toBe(def.color);
      expect(palette.light).toBe(def.accent);
      // Standard shading derives its own shadow, so ember's shade tone is the
      // base colour: debris tinting stays exactly as it was.
      expect(palette.shade).toBe(def.color);
    }
  });

  it('keeps the grass tint used for topsoil blocks', () => {
    expect(EMBER_THEME.grass).toBe(0x6aa84f);
  });

  it('keeps the highlight rim colours', () => {
    expect(EMBER_THEME.highlight.affordable).toBe(0x7cf0b4);
    expect(EMBER_THEME.highlight.tooExpensive).toBe(0xff5a45);
    expect(EMBER_THEME.highlight.hovered).toBe(0xfff3b0);
  });

  it('keeps the particle colours', () => {
    expect(EMBER_THEME.particles.dust).toBe(0xb9a888);
    expect(EMBER_THEME.particles.hitFlash).toBe(0xffffff);
  });

  it('keeps the DOM popup and label colours', () => {
    expect(EMBER_THEME.popups.cash).toBe('#eafff2');
    expect(EMBER_THEME.popups.gold).toBe('#ffd856');
    expect(EMBER_THEME.popups.repair).toBe('#8ef0a4');
    expect(EMBER_THEME.popups.labelOk).toBe('#f2fff8');
    expect(EMBER_THEME.popups.labelNo).toBe('#ff8b76');
    expect(EMBER_THEME.popups.shadow).toBe('0 1px 2px rgba(0,0,0,0.9)');
    expect(EMBER_THEME.popups.labelShadow).toBe('0 1px 2px rgba(0,0,0,0.95)');
  });

  it('keeps the classic miner palette', () => {
    expect(EMBER_THEME.miner.variant).toBe('classic');
    const palette = EMBER_THEME.miner.palette;
    expect(palette.shirt).toBe(0xe0574a);
    expect(palette.trousers).toBe(0x2f4a7a);
    expect(palette.skin).toBe(0xf0c193);
    expect(palette.helmet).toBe(0xffc93c);
    expect(palette.lamp).toBe(0xfff6c8);
    expect(palette.steel).toBe(0x8d949e);
    expect(palette.wood).toBe(0x8a5a3b);
  });
});
