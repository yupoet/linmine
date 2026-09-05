import type { ThemeId } from '../../config/theme.ts';
import { CANDY_THEME } from './candy.ts';
import { EMBER_THEME } from './ember.ts';
import type { RenderTheme } from './types.ts';

/** Resolve a stored skin id to the render-layer theme object. */
export function themeById(id: ThemeId): RenderTheme {
  return id === 'ember' ? EMBER_THEME : CANDY_THEME;
}

export { CANDY_THEME, EMBER_THEME };
export type { RenderTheme };
