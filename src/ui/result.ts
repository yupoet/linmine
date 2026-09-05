/** End-of-run board: what you earned, how deep you got, what to do next. */

import type { ResultView } from '../app/contracts.ts';
import { type ChestTier, CHESTS } from '../config/economy.ts';
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
  setFlag,
  setText,
  text,
} from './dom.ts';
import { svg } from './icons.ts';
import { t } from '../i18n/index.ts';

const EMPTY_RESULT: ResultView = {
  won: false,
  reason: '',
  levelName: '',
  depth: 0,
  targetDepth: 0,
  cashCollected: 0,
  settlement: { runCash: 0, winBonus: 0, depthBonus: 0, total: 0 },
  rewardTier: null,
  pendingChests: [],
  stats: {
    blocksMined: 0,
    chainBlocks: 0,
    chainsTriggered: 0,
    oreMined: 0,
    cratesTriggered: 0,
    durabilitySpent: 0,
    durabilityRepaired: 0,
    longestFall: 0,
    deepestRow: 0,
    cashOre: 0,
    cashSpecial: 0,
    cashTerrain: 0,
    cashExit: 0,
  },
  unlockedLevelName: null,
};

function headline(view: ResultView): string {
  if (view.won === true) return t('Shaft cleared!');
  if (view.reason === 'stuck') return t('Boxed in!');
  return t('Pickaxe worn out');
}

export interface ResultScreen extends ScreenModule {
  render(view: ResultView): void;
}

export function createResult(
  handlers: { claimResult(): void; goToShop(): void; goToLevels(): void },
  reducedMotion: () => boolean,
): ResultScreen {
  const el = createScreenEl('result');

  const stamp = h('div', 'result__stamp');
  const headlineEl = h('h1', 'result__headline');
  const levelName = h('p', 'result__level');

  const depthValue = h('span', 'result__depth-value');
  const depthGoal = h('span', 'result__depth-goal');
  const depthFill = h('i', 'bar__fill');
  const depthBar = h('div', 'bar bar--depth', [depthFill]);

  const payout = new Counter({ reducedMotion });
  const payoutNote = h('p', 'result__payout-note');

  // --- settlement ---------------------------------------------------------
  const rows: Array<{ el: HTMLElement; value: HTMLSpanElement; pick: (v: ResultView) => number }> =
    [];
  function addRow(label: string, pick: (v: ResultView) => number, extraClass = ''): void {
    const value = h('span', 'row__value');
    const row = h('div', extraClass ? `row ${extraClass}` : 'row', [
      h('span', 'row__label', [label]),
      value,
    ]);
    rows.push({ el: row, value, pick });
    settlementList.appendChild(row);
  }
  const settlementList = h('div', 'rowlist');
  addRow(t('Run cash'), (v) => num(v.settlement?.runCash));
  addRow(t('Win bonus'), (v) => num(v.settlement?.winBonus));
  addRow(t('Depth bonus'), (v) => num(v.settlement?.depthBonus));
  addRow(t('Total'), (v) => num(v.settlement?.total), 'row--total');

  // --- highlights ---------------------------------------------------------
  const statCards: Array<{ value: HTMLSpanElement; pick: (v: ResultView) => number }> = [];
  function addStat(label: string, pick: (v: ResultView) => number): void {
    const value = h('span', 'statcard__value');
    statCards.push({ value, pick });
    statGrid.appendChild(
      h('div', 'statcard', [value, h('span', 'statcard__label', [label])]),
    );
  }
  const statGrid = h('div', 'statgrid');
  addStat(t('Blocks mined'), (v) => num(v.stats?.blocksMined));
  addStat(t('Chain blocks'), (v) => num(v.stats?.chainBlocks));
  addStat(t('Longest fall'), (v) => num(v.stats?.longestFall));
  addStat(t('Ore mined'), (v) => num(v.stats?.oreMined));

  // --- reward -------------------------------------------------------------
  const rewardName = h('span', 'reward__name');
  const rewardNote = h('span', 'reward__note');
  const claim = h('button', 'btn btn--primary', [t('Claim')]);
  claim.type = 'button';
  claim.addEventListener('click', () => handlers.claimResult());
  const reward = h('div', 'reward', [
    h('div', 'reward__chest', [svg('chest', 'reward__icon'), svg('spark', 'reward__spark')]),
    h('div', 'reward__text', [rewardName, rewardNote]),
    claim,
  ]);

  const unlockText = h('span', 'unlock__text');
  const unlock = h('div', 'unlock', [h('span', 'unlock__icon', [svg('spark', 'icon')]), unlockText]);

  const pendingText = h('span', 'pending__text');
  const pending = h('div', 'pending', [
    h('span', 'pending__icon', [svg('chest', 'icon')]),
    pendingText,
  ]);

  const again = h('button', 'btn btn--ghost', [t('Dig again')]);
  again.type = 'button';
  again.addEventListener('click', () => handlers.claimResult());

  const shop = h('button', 'btn btn--ghost', [svg('chest', 'icon'), t('Shop')]);
  shop.type = 'button';
  shop.addEventListener('click', () => handlers.goToShop());

  const levels = h('button', 'btn btn--ghost', [t('Levels')]);
  levels.type = 'button';
  levels.addEventListener('click', () => handlers.goToLevels());

  el.appendChild(
    panel([
      h('header', 'result__hero', [
        stamp,
        headlineEl,
        levelName,
        h('div', 'result__depth', [depthValue, depthGoal, depthBar]),
        h('div', 'result__payout', [h('span', 'result__coin', [svg('coin', 'icon')]), payout.el]),
        payoutNote,
      ]),
      panelBody([settlementList, statGrid, reward, pending, unlock]),
      panelFoot([h('div', 'btnrow', [again, shop, levels])]),
    ]),
  );

  return {
    el,

    render(view: ResultView): void {
      const v = view ?? EMPTY_RESULT;
      const won = v.won === true;
      const target = Math.max(1, Math.round(num(v.targetDepth, 1)));
      const depth = Math.round(num(v.depth));

      setText(stamp, won ? t('Cleared') : t('Run over'));
      setText(headlineEl, headline(v));
      setText(levelName, text(v.levelName, t('The mine')));
      setFlag(el, 'is-win', won);
      setFlag(el, 'is-loss', !won);

      setText(depthValue, String(depth));
      setText(depthGoal, t('of {n} m', { n: target }));
      depthFill.style.width = `${Math.min(100, (depth / target) * 100).toFixed(1)}%`;

      const total = Math.round(num(v.settlement?.total));
      payout.reset(0);
      payout.set(total);
      const collected = Math.round(num(v.cashCollected));
      setText(
        payoutNote,
        collected > 0 ? t('Picked up {n} in the shaft', { n: fmtNum(collected) }) : t('Nothing in the pockets'),
      );

      for (const row of rows) {
        setText(row.value, fmtNum(row.pick(v)));
      }
      for (const stat of statCards) {
        setText(stat.value, fmtNum(stat.pick(v)));
      }

      const tier: ChestTier | null =
        v.rewardTier === 'common' || v.rewardTier === 'rare' || v.rewardTier === 'epic'
          ? v.rewardTier
          : null;
      setFlag(reward, 'is-empty', tier === null);
      setText(rewardName, tier ? t(CHESTS[tier].name) : t('No crate this time'));
      setText(rewardNote, tier ? t('Open it for cards and cash') : t('Clear the shaft to earn one'));
      setText(claim, tier ? t('Claim') : t('Collect'));

      const pendingChests = list(v.pendingChests);
      setFlag(pending, 'is-hidden', pendingChests.length === 0);
      if (pendingChests.length > 0) {
        const names = pendingChests.map((chest) => t(CHESTS[chest].name));
        setText(pendingText, t('{names} waiting in the shop', { names: names.join(' + ') }));
      }

      const unlocked = typeof v.unlockedLevelName === 'string' ? v.unlockedLevelName : '';
      setFlag(unlock, 'is-hidden', unlocked.length === 0);
      if (unlocked.length > 0) setText(unlockText, t('New dig unlocked — {name}', { name: unlocked }));
    },

    dispose(): void {
      payout.dispose();
    },
  };
}
