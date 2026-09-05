/** Theme identifiers: the only source of truth for skin ids across layers. */

import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME, THEME_IDS, isThemeId } from '../../src/config/theme.ts';

describe('theme ids', () => {
  it('lists exactly candy and ember', () => {
    expect([...THEME_IDS]).toEqual(['candy', 'ember']);
  });

  it('defaults to candy', () => {
    expect(DEFAULT_THEME).toBe('candy');
  });

  it('accepts every known id', () => {
    for (const id of THEME_IDS) {
      expect(isThemeId(id)).toBe(true);
    }
  });

  it('rejects anything that is not a known id', () => {
    expect(isThemeId('foo')).toBe(false);
    expect(isThemeId(42)).toBe(false);
    expect(isThemeId(undefined)).toBe(false);
    expect(isThemeId(null)).toBe(false);
    expect(isThemeId({ id: 'candy' })).toBe(false);
  });
});
