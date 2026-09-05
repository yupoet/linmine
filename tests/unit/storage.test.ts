/**
 * Storage: the checksummed envelope plus the plain-text theme mirror key the
 * boot script in index.html reads before any module has loaded.
 */

import { describe, expect, it } from 'vitest';
import { createStorage, THEME_MIRROR_KEY, type KeyValueStore } from '../../src/platform/storage.ts';
import { createProfile } from '../../src/core/save.ts';
import { DEFAULT_THEME } from '../../src/config/theme.ts';

function createTestStore(): KeyValueStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

describe('storage theme mirror', () => {
  it('mirrors the saved theme as plain text', () => {
    const store = createTestStore();
    const storage = createStorage(store);
    const profile = createProfile();
    profile.settings.theme = 'ember';

    storage.save(profile);

    expect(store.getItem(THEME_MIRROR_KEY)).toBe('ember');
  });

  it('rewrites the mirror when the theme changes', () => {
    const store = createTestStore();
    const storage = createStorage(store);
    const profile = createProfile();

    storage.save(profile);
    expect(store.getItem(THEME_MIRROR_KEY)).toBe(DEFAULT_THEME);

    profile.settings.theme = 'ember';
    storage.save(profile);
    expect(store.getItem(THEME_MIRROR_KEY)).toBe('ember');
  });

  it('ignores a corrupt mirror key on load', () => {
    const store = createTestStore();
    const storage = createStorage(store);
    const profile = createProfile();
    profile.cash = 777;
    profile.settings.theme = 'ember';
    storage.save(profile);

    store.setItem(THEME_MIRROR_KEY, '{{not-a-theme}}');

    const loaded = storage.load();
    expect(loaded.status).toBe('loaded');
    expect(loaded.profile.cash).toBe(777);
    expect(loaded.profile.settings.theme).toBe('ember');
  });

  it('keeps the mirror out of the checksummed envelope', () => {
    const store = createTestStore();
    const storage = createStorage(store);
    storage.save(createProfile());

    store.removeItem(THEME_MIRROR_KEY);

    expect(storage.load().status).toBe('loaded');
  });

  it('round-trips a profile through the injected store', () => {
    const store = createTestStore();
    const profile = createProfile();
    profile.cash = 42;
    createStorage(store).save(profile);

    expect(createStorage(store).load().profile.cash).toBe(42);
  });
});
