import { describe, expect, it } from 'vitest';
import { shouldApplyPendingTheme } from '../../src/render/themeGate.ts';

/**
 * The renderer defers a skin swap until the scene is idle: rebuilding halfway
 * through a dig would drop blocks that the rules layer has already removed from
 * the grid but the sequencer has not finished animating.
 */
describe('shouldApplyPendingTheme', () => {
  it('does nothing when no swap is pending', () => {
    expect(shouldApplyPendingTheme(null, 'ember', false)).toBe(false);
    expect(shouldApplyPendingTheme(null, 'candy', true)).toBe(false);
  });

  it('waits while a dig is playing', () => {
    expect(shouldApplyPendingTheme('candy', 'ember', true)).toBe(false);
  });

  it('applies a different skin once the scene is idle', () => {
    expect(shouldApplyPendingTheme('candy', 'ember', false)).toBe(true);
    expect(shouldApplyPendingTheme('ember', 'candy', false)).toBe(true);
  });

  it('treats a pending swap to the current skin as a no-op', () => {
    expect(shouldApplyPendingTheme('ember', 'ember', false)).toBe(false);
    expect(shouldApplyPendingTheme('candy', 'candy', false)).toBe(false);
  });
});
