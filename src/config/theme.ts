/**
 * Skin (theme) identifiers.
 *
 * Pure data with no dependencies: `core/save.ts` validates and migrates the
 * stored id, so the list has to live in config (core may only depend on
 * config). Render and UI import the type from here too.
 *
 * The same two literals are duplicated in `index.html`'s boot script, which
 * runs before any module loads — keep the two in sync.
 */

export const THEME_IDS = ['candy', 'ember'] as const;

export type ThemeId = (typeof THEME_IDS)[number];

/** New and returning players both start on candy; ember is opt-in. */
export const DEFAULT_THEME: ThemeId = 'candy';

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value);
}
