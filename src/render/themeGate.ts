import type { ThemeId } from '../config/theme.ts';

/**
 * Should the renderer rebuild its scene resources this frame?
 *
 * A skin swap tears down and recreates the block field, the miner and the
 * particle pool. Doing that mid-dig would lose the blocks that the rules layer
 * has already removed from the grid but the sequencer is still animating, so
 * the swap waits for an idle frame. The check runs at the very top of
 * `update(dt)`, before quality adaptation, so the new resources are the ones
 * measured for the rest of the frame.
 */
export function shouldApplyPendingTheme(
  pending: ThemeId | null,
  current: ThemeId,
  playing: boolean,
): boolean {
  if (pending === null) return false;
  if (playing) return false;
  return pending !== current;
}
