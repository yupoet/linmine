/** Shop: pickaxe upgrades, crates, pending rewards and the card collection. */

import type { CardView, ShopView } from '../app/contracts.ts';
import { type ChestTier, CHESTS } from '../config/economy.ts';
import { type CardTile, createCardTile } from './card.ts';
import {
  type ScreenModule,
  Counter,
  createScreenEl,
  fmtNum,
  h,
  list,
  num,
  panel,
  panelBody,
  panelFoot,
  panelHead,
  sectionTitle,
  setFlag,
  setText,
  text,
} from './dom.ts';
import { svg } from './icons.ts';

const EMPTY_SHOP: ShopView = {
  cash: 0,
  pickaxeLevel: 1,
  pickaxeMaxLevel: 10,
  upgradeCost: 0,
  nextDurabilityBonus: 0,
  cards: [],
  chests: {
    common: { name: CHESTS.common.name, cost: CHESTS.common.cost, cards: CHESTS.common.cards },
    rare: { name: CHESTS.rare.name, cost: CHESTS.rare.cost, cards: CHESTS.rare.cards },
  },
  pendingChests: [],
};

const TIERS: readonly ChestTier[] = ['common', 'rare'];

export interface ShopScreen extends ScreenModule {
  render(view: ShopView): void;
}

export function createShop(
  handlers: {
    buyPickaxe(): void;
    buyChest(tier: ChestTier): void;
    openPendingChest(tier: ChestTier): void;
    goToLevels(): void;
  },
  reducedMotion: () => boolean,
): ShopScreen {
  const el = createScreenEl('shop');

  const cashValue = new Counter({ reducedMotion });

  const back = h('button', 'iconbtn', [svg('back', 'icon')]);
  back.type = 'button';
  back.setAttribute('aria-label', 'Back to levels');
  back.addEventListener('click', () => handlers.goToLevels());

  // --- pickaxe ------------------------------------------------------------
  const pickLevel = h('span', 'upgrade__value');
  const pickBonus = h('span', 'upgrade__bonus');
  const pickCost = h('span', 'upgrade__cost');
  const pickReason = h('p', 'upgrade__reason');
  const buyPick = h('button', 'btn btn--primary', ['Upgrade']);
  buyPick.type = 'button';
  buyPick.addEventListener('click', () => handlers.buyPickaxe());

  const pickaxeSection = h('section', 'shop__section', [
    sectionTitle('Pickaxe'),
    h('div', 'upgrade', [
      h('div', 'upgrade__art', [svg('pickaxe', 'upgrade__icon')]),
      h('div', 'upgrade__info', [
        h('div', 'upgrade__row', [h('span', 'upgrade__label', ['Durability']), pickLevel]),
        pickBonus,
        h('div', 'upgrade__row', [h('span', 'upgrade__label', ['Cost']), pickCost]),
        pickReason,
      ]),
      buyPick,
    ]),
  ]);

  // --- crates -------------------------------------------------------------
  const crateRows = new Map<ChestTier, { root: HTMLElement; name: HTMLElement; note: HTMLElement; cost: HTMLElement; buy: HTMLButtonElement }>();
  const crateList = h('div', 'cratelist');
  for (const tier of TIERS) {
    const name = h('span', 'crate__name');
    const note = h('span', 'crate__note');
    const cost = h('span', 'crate__cost');
    const buy = h('button', 'btn btn--primary btn--sm', ['Buy']);
    buy.type = 'button';
    buy.addEventListener('click', () => handlers.buyChest(tier));
    const root = h('div', `crate crate--${tier}`, [
      h('span', 'crate__art', [svg('chest', 'crate__icon'), svg(tier === 'rare' ? 'gem' : 'bolt', 'crate__mark')]),
      h('span', 'crate__text', [name, note]),
      h('span', 'crate__buy', [cost, buy]),
    ]);
    crateList.appendChild(root);
    crateRows.set(tier, { root, name, note, cost, buy });
  }

  // --- pending crates -----------------------------------------------------
  const pendingRow = h('div', 'pendingrow');
  const pendingButtons = new Map<ChestTier, { root: HTMLButtonElement; label: HTMLElement }>();
  for (const tier of TIERS) {
    const label = h('span', 'pendingbtn__label');
    const root = h('button', `btn btn--gold pendingbtn pendingbtn--${tier}`, [
      h('span', 'pendingbtn__icon', [svg('chest', 'icon')]),
      label,
    ]);
    root.type = 'button';
    root.classList.add('is-hidden');
    root.addEventListener('click', () => handlers.openPendingChest(tier));
    pendingRow.appendChild(root);
    pendingButtons.set(tier, { root, label });
  }
  const pendingSection = h('section', 'shop__section', [
    sectionTitle('Unopened crates'),
    pendingRow,
  ]);

  // --- collection ---------------------------------------------------------
  const collection = h('div', 'cardgrid cardgrid--collection');
  const collectionSection = h('section', 'shop__section', [
    sectionTitle('Card collection'),
    collection,
  ]);

  el.appendChild(
    panel([
      panelHead([
        h('div', 'panel__title', [back, h('h1', 'panel__heading', ['Shop'])]),
        h('div', 'stat stat--cash', [
          h('span', 'stat__icon', [svg('coin', 'icon')]),
          h('span', 'stat__value', [cashValue.el]),
        ]),
      ]),
      panelBody([pickaxeSection, h('section', 'shop__section', [sectionTitle('Crates'), crateList]), pendingSection, collectionSection]),
      panelFoot([]),
    ]),
  );

  const tiles = new Map<string, CardTile>();
  let signature = '';

  function syncCards(cards: readonly CardView[]): void {
    const next = cards.map((card) => card.id).join('|');
    if (next !== signature) {
      signature = next;
      for (const tile of tiles.values()) tile.el.remove();
      tiles.clear();
      for (const card of cards) {
        const tile = createCardTile();
        tiles.set(card.id, tile);
        collection.appendChild(tile.el);
      }
    }
    for (const card of cards) {
      tiles.get(card.id)?.update(card);
    }
  }

  return {
    el,

    render(view: ShopView): void {
      const v = view ?? EMPTY_SHOP;
      const cash = num(v.cash);
      const level = Math.max(1, Math.round(num(v.pickaxeLevel, 1)));
      const maxLevel = Math.max(level, Math.round(num(v.pickaxeMaxLevel, 10)));
      const maxed = level >= maxLevel;
      const cost = num(v.upgradeCost);
      const shortfall = Math.max(0, Math.ceil(cost - cash));

      cashValue.set(cash);

      setText(pickLevel, maxed ? `Lvl ${maxLevel} — max` : `Lvl ${level} → ${level + 1}`);
      setText(
        pickBonus,
        maxed ? 'Your pick cannot get any tougher.' : `+${Math.round(num(v.nextDurabilityBonus))} durability per run`,
      );
      setText(pickCost, maxed ? '—' : fmtNum(cost));

      buyPick.disabled = maxed || shortfall > 0;
      setFlag(pickaxeSection, 'is-maxed', maxed);
      setText(pickReason, maxed ? '' : shortfall > 0 ? `Need ${fmtNum(shortfall)} more cash` : '');
      setFlag(pickReason, 'is-hidden', maxed || shortfall === 0);

      for (const tier of TIERS) {
        const row = crateRows.get(tier);
        if (!row) continue;
        const def = v.chests?.[tier];
        const price = num(def?.cost, CHESTS[tier].cost);
        const cards = Math.max(1, Math.round(num(def?.cards, CHESTS[tier].cards)));
        const missing = Math.max(0, Math.ceil(price - cash));

        setText(row.name, text(def?.name, CHESTS[tier].name));
        setText(row.note, `${cards} ${cards === 1 ? 'card' : 'cards'} + cash`);
        setText(row.cost, fmtNum(price));
        row.buy.disabled = missing > 0;
        setFlag(row.root, 'is-broke', missing > 0);
      }

      const pending = list(v.pendingChests);
      const counts = new Map<ChestTier, number>();
      for (const tier of pending) {
        if (tier !== 'common' && tier !== 'rare') continue;
        counts.set(tier, (counts.get(tier) ?? 0) + 1);
      }
      setFlag(pendingSection, 'is-hidden', counts.size === 0);
      for (const tier of TIERS) {
        const entry = pendingButtons.get(tier);
        if (!entry) continue;
        const count = counts.get(tier) ?? 0;
        entry.root.classList.toggle('is-hidden', count === 0);
        setText(entry.label, `Open ${CHESTS[tier].name}${count > 1 ? ` x${count}` : ''}`);
      }

      syncCards(list(v.cards));
    },

    dispose(): void {
      tiles.clear();
      cashValue.dispose();
    },
  };
}
