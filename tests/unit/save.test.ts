import { describe, expect, it } from 'vitest';
import { CARDS } from '../../src/config/cards.ts';
import {
  createProfile,
  emptyLevelRecord,
  isLevelUnlocked,
  migrateProfile,
  ownedCards,
  sanitizeProfile,
  serializeProfile,
} from '../../src/core/save.ts';
import { SAVE_SCHEMA_VERSION } from '../../src/config/version.ts';
import { PICKAXE_MAX_LEVEL } from '../../src/config/economy.ts';
import { DEFAULT_THEME } from '../../src/config/theme.ts';

describe('save profile', () => {
  it('creates a fresh profile with every level tracked', () => {
    const profile = createProfile();
    expect(profile.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(profile.pickaxeLevel).toBe(1);
    expect(profile.cash).toBe(0);
    expect(Object.keys(profile.levels).length).toBe(5);
    expect(profile.pendingChests).toEqual([]);
  });

  it('survives garbage input', () => {
    for (const input of [null, undefined, 42, 'nope', [], {}, { cash: 'lots' }]) {
      const profile = migrateProfile(input);
      expect(profile.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
      expect(profile.cash).toBe(0);
      expect(profile.pickaxeLevel).toBe(1);
    }
  });

  it('migrates a pre-release save that has no schema version', () => {
    const legacy = { cash: 500, pickaxeLevel: 3, cards: { rich_veins: { count: 2, level: 2 } } };
    const profile = migrateProfile(legacy);
    expect(profile.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(profile.cash).toBe(500);
    expect(profile.pickaxeLevel).toBe(3);
    expect(profile.cards.rich_veins.level).toBe(2);
  });

  it('clamps nonsense numbers instead of trusting them', () => {
    const profile = sanitizeProfile({
      cash: -50,
      pickaxeLevel: 999,
      cards: { 'not-a-card': { count: 5, level: 5 }, rich_veins: { count: -3, level: -7 } },
      pendingChests: ['common', 'platinum', 17],
      settings: { muted: 'yes' },
    });
    expect(profile.cash).toBe(0);
    expect(profile.pickaxeLevel).toBe(PICKAXE_MAX_LEVEL); // clamped to the ceiling
    expect(profile.cards['not-a-card']).toBeUndefined();
    expect(profile.cards.rich_veins).toBeUndefined(); // non-positive count is dropped
    expect(profile.pendingChests).toEqual(['common']);
    expect(profile.settings.muted).toBe(false);
  });

  it('caps card level at the card maximum', () => {
    const profile = sanitizeProfile({ cards: { rich_veins: { count: 40, level: 40 } } });
    const card = CARDS.find((entry) => entry.id === 'rich_veins');
    expect(profile.cards.rich_veins.level).toBe(card?.maxLevel);
  });

  it('round-trips through serialization', () => {
    const profile = createProfile();
    profile.cash = 1234;
    profile.pickaxeLevel = 5;
    profile.cards.appraiser = { count: 3, level: 3 };
    profile.levels.sunlit_shaft = { plays: 7, clears: 2, bestDepth: 40, bestCash: 900 };
    profile.pendingChests.push('rare');

    const restored = migrateProfile(JSON.parse(serializeProfile(profile)));
    expect(restored.cash).toBe(1234);
    expect(restored.pickaxeLevel).toBe(5);
    expect(restored.cards.appraiser).toEqual({ count: 3, level: 3 });
    expect(restored.levels.sunlit_shaft).toEqual({ plays: 7, clears: 2, bestDepth: 40, bestCash: 900 });
    expect(restored.pendingChests).toEqual(['rare']);
  });

  it('keeps unknown level records out', () => {
    const profile = sanitizeProfile({ levels: { atlantis: { plays: 99 } } });
    expect(profile.levels.atlantis).toBeUndefined();
  });

  it('unlocks only the first level on a fresh profile', () => {
    const profile = createProfile();
    expect(isLevelUnlocked(profile, 0)).toBe(true);
    expect(isLevelUnlocked(profile, 1)).toBe(false);
  });

  it('unlocks the next level after a clear', () => {
    const profile = createProfile();
    profile.levels.sunlit_shaft = { ...emptyLevelRecord(), clears: 1 };
    expect(isLevelUnlocked(profile, 1)).toBe(true);
    expect(isLevelUnlocked(profile, 2)).toBe(false);
  });

  it('reports owned cards with their level', () => {
    const profile = createProfile();
    profile.cards.rich_veins = { count: 2, level: 2 };
    expect(ownedCards(profile)).toEqual([{ id: 'rich_veins', level: 2 }]);
  });

  it('never lets a corrupt payload throw', () => {
    const nasty = {
      cash: Number.NaN,
      pickaxeLevel: Number.POSITIVE_INFINITY,
      cards: null,
      levels: 5,
      stats: 'lots',
      pendingChests: { common: 1 },
    };
    expect(() => migrateProfile(nasty)).not.toThrow();
    const profile = migrateProfile(nasty);
    expect(profile.pickaxeLevel).toBe(1);
    expect(profile.cards).toEqual({});
    expect(profile.stats.runs).toBe(0);
  });
});

describe('save theme migration', () => {
  it('gives a fresh profile the default theme', () => {
    expect(createProfile().settings.theme).toBe(DEFAULT_THEME);
  });

  it('falls back to the default theme when the stored id is garbage', () => {
    for (const theme of ['neon', 42, null, undefined, {}]) {
      expect(sanitizeProfile({ settings: { theme } }).settings.theme).toBe(DEFAULT_THEME);
    }
  });

  it('keeps a valid stored theme', () => {
    expect(sanitizeProfile({ settings: { theme: 'ember' } }).settings.theme).toBe('ember');
  });

  it('migrates a v1 save by filling in the theme', () => {
    const migrated = migrateProfile({ schemaVersion: 1, cash: 10 });
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.settings.theme).toBe(DEFAULT_THEME);
    expect(migrated.cash).toBe(10);
  });

  it('is idempotent: migrating twice changes nothing', () => {
    const once = migrateProfile({ schemaVersion: 1, cash: 10 });
    once.settings.theme = 'ember';
    const twice = migrateProfile(JSON.parse(serializeProfile(once)));
    expect(twice.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(twice.settings.theme).toBe('ember');
    expect(twice.cash).toBe(10);
  });

  it('round-trips a chosen theme through serialization', () => {
    const profile = createProfile();
    profile.settings.theme = 'ember';
    const restored = migrateProfile(JSON.parse(serializeProfile(profile)));
    expect(restored.settings.theme).toBe('ember');
  });
});
