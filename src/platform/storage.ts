/**
 * Save persistence.
 *
 * - every write keeps the previous good save as a backup;
 * - every read validates a checksum and falls back to the backup, then to a
 *   fresh profile, and reports which happened so the UI can warn the player;
 * - works when localStorage is unavailable (private mode) by degrading to an
 *   in-memory store for the session.
 *
 * Besides the envelope every save mirrors the chosen theme as plain text so
 * the boot script in index.html can paint the right skin before any module
 * loads. The mirror is never read back here and never checksummed.
 */

import { migrateProfile, serializeProfile, type Profile } from '../core/save.ts';

const STORAGE_KEY = 'linmine.save';
const BACKUP_KEY = 'linmine.save.bak';

/** Plain-text theme mirror; also duplicated in index.html's boot script. */
export const THEME_MIRROR_KEY = 'linmine.theme';

export type LoadStatus = 'fresh' | 'loaded' | 'recovered' | 'corrupt';

export interface LoadResult {
  profile: Profile;
  status: LoadStatus;
}

interface Envelope {
  sum: number;
  data: string;
}

function checksum(text: string): number {
  let sum = 0;
  for (let i = 0; i < text.length; i++) {
    sum = (sum + text.charCodeAt(i) * (i + 1)) % 0xffffffff;
  }
  return sum >>> 0;
}

function wrap(profile: Profile): string {
  const data = serializeProfile(profile);
  const envelope: Envelope = { sum: checksum(data), data };
  return JSON.stringify(envelope);
}

function unwrap(raw: string | null): Profile | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Envelope>;
    if (typeof parsed.data !== 'string' || typeof parsed.sum !== 'number') return null;
    if (checksum(parsed.data) !== parsed.sum) return null;
    return migrateProfile(JSON.parse(parsed.data));
  } catch {
    return null;
  }
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function createMemoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

function detectStore(): KeyValueStore {
  try {
    if (typeof localStorage === 'undefined') return createMemoryStore();
    const probe = 'linmine.probe';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return createMemoryStore();
  }
}

export interface StorageAPI {
  load(): LoadResult;
  save(profile: Profile): void;
  clear(): void;
  /** True when saves survive a reload (false in private mode). */
  persistent: boolean;
}

/**
 * @param injected test seam: an explicit store replaces detection entirely.
 */
export function createStorage(injected?: KeyValueStore): StorageAPI {
  const storeRef: { current: KeyValueStore } = { current: injected ?? createMemoryStore() };
  let persistent = false;
  try {
    if (!injected) storeRef.current = detectStore();
    persistent = typeof localStorage !== 'undefined' && storeRef.current === localStorage;
  } catch {
    persistent = false;
  }

  const read = (key: string): string | null => {
    try {
      return storeRef.current.getItem(key);
    } catch {
      return null;
    }
  };

  const write = (key: string, value: string): void => {
    try {
      storeRef.current.setItem(key, value);
    } catch {
      /* quota or private mode: the session keeps running without persistence */
    }
  };

  return {
    persistent,
    load(): LoadResult {
      const primary = unwrap(read(STORAGE_KEY));
      if (primary) return { profile: primary, status: 'loaded' };

      const backup = unwrap(read(BACKUP_KEY));
      if (backup) return { profile: backup, status: 'recovered' };

      const raw = read(STORAGE_KEY);
      const fresh = migrateProfile(raw ? safeParse(raw) : null);
      return { profile: fresh, status: raw ? 'corrupt' : 'fresh' };
    },
    save(profile: Profile): void {
      const previous = read(STORAGE_KEY);
      if (previous) write(BACKUP_KEY, previous);
      write(STORAGE_KEY, wrap(profile));
      // Best effort, outside the checksum: the boot script only needs a hint.
      write(THEME_MIRROR_KEY, profile.settings.theme);
    },
    clear(): void {
      try {
        storeRef.current.removeItem(STORAGE_KEY);
        storeRef.current.removeItem(BACKUP_KEY);
      } catch {
        /* ignore */
      }
    },
  };
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
