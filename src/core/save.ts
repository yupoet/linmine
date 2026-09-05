/**
 * Save profile shape, validation and migration.
 *
 * Rules from the plan:
 *  - the save carries `schemaVersion` and `configVersion`;
 *  - a corrupt or unknown save falls back to a fresh profile (never throws);
 *  - migrations run one version at a time and are individually testable.
 */

import { PICKAXE_MAX_LEVEL, type ChestTier } from '../config/economy.ts';
import { CARDS } from '../config/cards.ts';
import { LEVELS } from '../config/levels.ts';
import { CONFIG_VERSION, SAVE_SCHEMA_VERSION } from '../config/version.ts';

export interface CardOwnership {
  level: number;
  count: number;
}

export interface LevelRecord {
  plays: number;
  clears: number;
  bestDepth: number;
  bestCash: number;
}

export interface ProfileSettings {
  muted: boolean;
  reducedMotion: boolean;
  haptics: boolean;
  /** UI language. Chinese is the default; English is opt-in. */
  lang: 'zh' | 'en';
}

export interface LifetimeStats {
  runs: number;
  wins: number;
  deepestRow: number;
  blocksMined: number;
  chestsOpened: number;
}

export interface Profile {
  schemaVersion: number;
  configVersion: string;
  cash: number;
  lifetimeCash: number;
  pickaxeLevel: number;
  cards: Record<string, CardOwnership>;
  levels: Record<string, LevelRecord>;
  pendingChests: ChestTier[];
  settings: ProfileSettings;
  tutorialDone: boolean;
  stats: LifetimeStats;
  updatedAt: number;
}

export function createProfile(): Profile {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    configVersion: CONFIG_VERSION,
    cash: 0,
    lifetimeCash: 0,
    pickaxeLevel: 1,
    cards: {},
    levels: Object.fromEntries(LEVELS.map((level) => [level.id, emptyLevelRecord()])),
    pendingChests: [],
    settings: { muted: false, reducedMotion: false, haptics: true, lang: 'zh' },
    tutorialDone: false,
    stats: { runs: 0, wins: 0, deepestRow: 0, blocksMined: 0, chestsOpened: 0 },
    updatedAt: 0,
  };
}

export function emptyLevelRecord(): LevelRecord {
  return { plays: 0, clears: 0, bestDepth: 0, bestCash: 0 };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function num(value: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.round(value), min), max);
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** Coerce anything into a valid profile. Never throws. */
export function sanitizeProfile(raw: unknown): Profile {
  const profile = createProfile();
  if (!isRecord(raw)) return profile;

  profile.cash = num(raw.cash, 0);
  profile.lifetimeCash = num(raw.lifetimeCash, profile.cash);
  // A level above the upgrade ceiling means the save was tampered with.
  profile.pickaxeLevel = num(raw.pickaxeLevel, 1, 1, PICKAXE_MAX_LEVEL);
  profile.tutorialDone = bool(raw.tutorialDone, false);
  profile.updatedAt = num(raw.updatedAt, 0);
  profile.configVersion = typeof raw.configVersion === 'string' ? raw.configVersion : CONFIG_VERSION;

  if (isRecord(raw.cards)) {
    for (const card of CARDS) {
      const entry = raw.cards[card.id];
      if (!isRecord(entry)) continue;
      const count = num(entry.count, 0, 0, 999);
      if (count <= 0) continue;
      profile.cards[card.id] = { count, level: Math.min(card.maxLevel, Math.max(1, count)) };
    }
  }

  if (isRecord(raw.levels)) {
    for (const level of LEVELS) {
      const entry = raw.levels[level.id];
      if (!isRecord(entry)) continue;
      profile.levels[level.id] = {
        plays: num(entry.plays, 0),
        clears: num(entry.clears, 0),
        bestDepth: num(entry.bestDepth, 0),
        bestCash: num(entry.bestCash, 0),
      };
    }
    // Daily shafts (daily_YYYYMMDD) are player records too — keep any that
    // look sane instead of silently dropping them on load.
    for (const [id, entry] of Object.entries(raw.levels)) {
      if (!id.startsWith('daily_') || !isRecord(entry)) continue;
      if (typeof profile.levels[id]?.plays === 'number' && profile.levels[id]) {
        const existing = profile.levels[id];
        existing.plays = Math.max(existing.plays, num(entry.plays, 0));
        existing.clears = Math.max(existing.clears, num(entry.clears, 0));
        existing.bestDepth = Math.max(existing.bestDepth, num(entry.bestDepth, 0));
        existing.bestCash = Math.max(existing.bestCash, num(entry.bestCash, 0));
      } else {
        profile.levels[id] = {
          plays: num(entry.plays, 0),
          clears: num(entry.clears, 0),
          bestDepth: num(entry.bestDepth, 0),
          bestCash: num(entry.bestCash, 0),
        };
      }
    }
  }

  if (Array.isArray(raw.pendingChests)) {
    profile.pendingChests = raw.pendingChests.filter(
      (tier): tier is ChestTier => tier === 'common' || tier === 'rare' || tier === 'epic',
    );
  }

  if (isRecord(raw.settings)) {
    profile.settings = {
      muted: bool(raw.settings.muted, false),
      reducedMotion: bool(raw.settings.reducedMotion, false),
      haptics: bool(raw.settings.haptics, true),
      lang: raw.settings.lang === 'en' ? 'en' : 'zh',
    };
  }

  if (isRecord(raw.stats)) {
    profile.stats = {
      runs: num(raw.stats.runs, 0),
      wins: num(raw.stats.wins, 0),
      deepestRow: num(raw.stats.deepestRow, 0),
      blocksMined: num(raw.stats.blocksMined, 0),
      chestsOpened: num(raw.stats.chestsOpened, 0),
    };
  }

  return profile;
}

/**
 * Version ladder. Each step receives a partially valid object and returns the
 * next shape. Add a case here whenever SAVE_SCHEMA_VERSION is bumped.
 */
export function migrateProfile(raw: unknown): Profile {
  if (!isRecord(raw)) return createProfile();

  const version = typeof raw.schemaVersion === 'number' && Number.isFinite(raw.schemaVersion) ? raw.schemaVersion : 0;
  let current: Record<string, unknown> = { ...raw };

  // v0 -> v1: the very first public shape. Nothing to transform yet; the
  // sanitizer is what actually repairs pre-release saves.
  if (version < 1) {
    current = { ...current, schemaVersion: 1 };
  }

  const profile = sanitizeProfile(current);
  profile.schemaVersion = SAVE_SCHEMA_VERSION;
  profile.configVersion = CONFIG_VERSION;
  return profile;
}

export function serializeProfile(profile: Profile): string {
  return JSON.stringify({ ...profile, updatedAt: Date.now() });
}

export function ownedCards(profile: Profile): { id: string; level: number }[] {
  return CARDS.filter((card) => (profile.cards[card.id]?.count ?? 0) > 0).map((card) => ({
    id: card.id,
    level: profile.cards[card.id].level,
  }));
}

export function isLevelUnlocked(profile: Profile, levelIndex: number): boolean {
  if (levelIndex <= 0) return true;
  const previous = LEVELS[levelIndex - 1];
  if (!previous) return false;
  return (profile.levels[previous.id]?.clears ?? 0) > 0;
}
