import { describe, expect, it } from 'vitest';
import {
  CHESTS,
  PICKAXE_MAX_LEVEL,
  clearRewardTier,
  pickaxeDurabilityBonus,
  pickaxeUpgradeCost,
  settleRun,
} from '../../src/config/economy.ts';
import { createProfile } from '../../src/core/save.ts';
import { createRng } from '../../src/core/rng.ts';
import { buyChest, buyPickaxe, drawCard, openChest, takePendingChest } from '../../src/app/profile.ts';

describe('settlement', () => {
  it('pays collected cash even on a loss', () => {
    const settlement = settleRun({
      cashCollected: 1000,
      cashMultiplier: 1,
      won: false,
      winBonus: 200,
      depth: 30,
      targetDepth: 54,
    });
    expect(settlement.runCash).toBe(1000);
    expect(settlement.winBonus).toBe(0);
    expect(settlement.total).toBeGreaterThan(1000);
  });

  it('pays the exit bonus only on a win', () => {
    const won = settleRun({ cashCollected: 500, cashMultiplier: 1, won: true, winBonus: 200, depth: 54, targetDepth: 54 });
    const lost = settleRun({ cashCollected: 500, cashMultiplier: 1, won: false, winBonus: 200, depth: 54, targetDepth: 54 });
    expect(won.winBonus).toBe(200);
    expect(lost.winBonus).toBe(0);
    expect(won.total).toBeGreaterThan(lost.total);
  });

  it('scales collected cash by the level multiplier', () => {
    const settlement = settleRun({ cashCollected: 1000, cashMultiplier: 1.75, won: false, winBonus: 0, depth: 10, targetDepth: 100 });
    expect(settlement.runCash).toBe(1750);
  });

  it('caps the depth bonus at the target depth', () => {
    const capped = settleRun({ cashCollected: 0, cashMultiplier: 1, won: true, winBonus: 0, depth: 999, targetDepth: 54 });
    const exact = settleRun({ cashCollected: 0, cashMultiplier: 1, won: true, winBonus: 0, depth: 54, targetDepth: 54 });
    expect(capped.depthBonus).toBe(exact.depthBonus);
  });

  it('never pays a negative total', () => {
    const settlement = settleRun({ cashCollected: 0, cashMultiplier: 1, won: false, winBonus: 0, depth: 0, targetDepth: 54 });
    expect(settlement.total).toBe(0);
  });
});

describe('pickaxe line', () => {
  it('gets more expensive every level', () => {
    for (let level = 1; level < PICKAXE_MAX_LEVEL - 1; level++) {
      expect(pickaxeUpgradeCost(level + 1)).toBeGreaterThan(pickaxeUpgradeCost(level));
    }
  });

  it('cannot be upgraded past the maximum', () => {
    expect(pickaxeUpgradeCost(PICKAXE_MAX_LEVEL)).toBe(Number.POSITIVE_INFINITY);
    expect(pickaxeUpgradeCost(PICKAXE_MAX_LEVEL + 5)).toBe(Number.POSITIVE_INFINITY);
  });

  it('adds durability per level', () => {
    expect(pickaxeDurabilityBonus(1)).toBe(0);
    expect(pickaxeDurabilityBonus(2)).toBeGreaterThan(0);
    expect(pickaxeDurabilityBonus(PICKAXE_MAX_LEVEL)).toBeGreaterThan(pickaxeDurabilityBonus(2));
  });

  it('deducts cash and raises the level', () => {
    const profile = createProfile();
    profile.cash = 10000;
    const before = profile.cash;
    expect(buyPickaxe(profile)).toBe(true);
    expect(profile.pickaxeLevel).toBe(2);
    expect(profile.cash).toBe(before - pickaxeUpgradeCost(1));
  });

  it('refuses when cash is short', () => {
    const profile = createProfile();
    profile.cash = 1;
    expect(buyPickaxe(profile)).toBe(false);
    expect(profile.pickaxeLevel).toBe(1);
    expect(profile.cash).toBe(1);
  });

  it('refuses at the maximum level', () => {
    const profile = createProfile();
    profile.cash = 1_000_000;
    profile.pickaxeLevel = PICKAXE_MAX_LEVEL;
    expect(buyPickaxe(profile)).toBe(false);
  });
});

describe('crates', () => {
  it('rewards the good crate on a first clear and the plain one after', () => {
    expect(clearRewardTier(true)).toBe('rare');
    expect(clearRewardTier(false)).toBe('common');
  });

  it('buys a crate into the pending list', () => {
    const profile = createProfile();
    profile.cash = CHESTS.common.cost;
    expect(buyChest(profile, 'common')).toBe(true);
    expect(profile.pendingChests).toEqual(['common']);
    expect(profile.cash).toBe(0);
  });

  it('refuses a crate the player cannot afford', () => {
    const profile = createProfile();
    profile.cash = CHESTS.rare.cost - 1;
    expect(buyChest(profile, 'rare')).toBe(false);
    expect(profile.pendingChests).toEqual([]);
    expect(profile.cash).toBe(CHESTS.rare.cost - 1);
  });

  it('grants cards and cash when opened', () => {
    const profile = createProfile();
    const reward = openChest(profile, 'rare', createRng(7));
    expect(reward.cash).toBeGreaterThan(0);
    expect(reward.cards.length).toBe(CHESTS.rare.cards);
    expect(Object.keys(profile.cards).length).toBeGreaterThan(0);
    expect(profile.stats.chestsOpened).toBe(1);
  });

  it('consumes a pending crate exactly once', () => {
    const profile = createProfile();
    profile.pendingChests.push('common');
    expect(takePendingChest(profile, 'common')).toBe(true);
    expect(takePendingChest(profile, 'common')).toBe(false);
  });

  it('levels a card up rather than duplicating it', () => {
    const profile = createProfile();
    const first = drawCard(profile, createRng(11));
    const owned = profile.cards[first.id];
    expect(owned.count).toBe(1);
    expect(owned.level).toBe(1);
  });

  it('refunds cash once a card is maxed', () => {
    const profile = createProfile();
    const cardId = 'rich_veins';
    profile.cards[cardId] = { count: 5, level: 5 };
    const rng = createRng(3);
    let refunded = false;
    for (let i = 0; i < 50 && !refunded; i++) {
      const result = drawCard(profile, rng);
      if (result.id === cardId) refunded = result.duplicates && result.refund > 0;
    }
    expect(refunded).toBe(true);
  });

  it('distributes cards across the pool over many openings', () => {
    const profile = createProfile();
    const rng = createRng(2026);
    for (let i = 0; i < 200; i++) openChest(profile, 'common', rng);
    expect(Object.keys(profile.cards).length).toBeGreaterThan(3);
  });
});
