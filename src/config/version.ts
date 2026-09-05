/**
 * Version identifiers. Any change to a config table that alters simulation
 * results MUST bump CONFIG_VERSION; any change to the save file shape MUST
 * bump SAVE_SCHEMA_VERSION and add a migration in core/save.ts.
 */

export const CONFIG_VERSION = '1.0.0';

/**
 * Bump only when the save shape changes incompatibly.
 * v2: `ProfileSettings.theme` (skin id).
 * v3: `ProfileSettings.character` (playable character id).
 */
export const SAVE_SCHEMA_VERSION = 3;

/**
 * Grid width decision (plan 4.4): A/B tested at 5/6/7 columns; default 6.
 * Configurable per level, but the MVP ships 6 as the frozen default.
 */
export const DEFAULT_GRID_WIDTH = 6;

/** Rows generated ahead of the deepest generated row when streaming. */
export const GENERATION_LOOKAHEAD = 24;

/** Hard cap on generated rows; protects against runaway depth. */
export const MAX_ROWS = 512;
