/**
 * Playable character identifiers.
 *
 * Pure data with no dependencies: `core/save.ts` validates and migrates the
 * stored id, so the list has to live in config (core may only depend on
 * config). The visual recipe for each id is render-layer data
 * (`src/render/characters.ts`); UI labels are i18n keys.
 *
 * Characters only reskin the chibi miner — the ember skin keeps its classic
 * miner no matter which character is picked (pixel parity).
 */

export const CHARACTER_IDS = ['girl', 'boy', 'robot'] as const;

export type CharacterId = (typeof CHARACTER_IDS)[number];

/** The little girl leads; the original chibi miner boy and the robot opt in. */
export const DEFAULT_CHARACTER: CharacterId = 'girl';

export function isCharacterId(value: unknown): value is CharacterId {
  return typeof value === 'string' && (CHARACTER_IDS as readonly string[]).includes(value);
}
