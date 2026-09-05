/** Level select: five digs, their bests, and the shop door. */

import type { LevelView } from '../app/contracts.ts';
import {
  type ScreenModule,
  Counter,
  createScreenEl,
  h,
  list,
  num,
  panel,
  panelBody,
  panelFoot,
  panelHead,
  setFlag,
  setText,
  text,
} from './dom.ts';
import { svg } from './icons.ts';
import { t } from '../i18n/index.ts';

interface LevelRow {
  root: HTMLButtonElement;
  index: HTMLElement;
  name: HTMLElement;
  blurb: HTMLElement;
  goal: HTMLElement;
  best: HTMLElement;
  plays: HTMLElement;
  lock: HTMLElement;
  onTap: () => void;
}

export interface LevelsScreen extends ScreenModule {
  render(levels: readonly LevelView[], cash: number, pickaxeLevel: number): void;
}

export function createLevels(
  handlers: { selectLevel(levelId: string): void; goToShop(): void; goToTitle(): void },
  reducedMotion: () => boolean,
): LevelsScreen {
  const el = createScreenEl('levels');

  const cashValue = new Counter({ reducedMotion });
  const pickValue = h('strong', 'stat__value');
  const cashChip = h('div', 'stat stat--cash', [
    h('span', 'stat__icon', [svg('coin', 'icon')]),
    h('span', 'stat__value', [cashValue.el]),
  ]);
  const pickChip = h('div', 'stat stat--pick', [
    h('span', 'stat__icon', [svg('pickaxe', 'icon')]),
    pickValue,
  ]);

  const back = h('button', 'iconbtn iconbtn--close', [svg('back', 'icon')]);
  back.type = 'button';
  back.setAttribute('aria-label', t('Back to title'));
  back.addEventListener('click', () => handlers.goToTitle());

  const shop = h('button', 'btn btn--ghost', [svg('chest', 'icon'), t('Shop')]);
  shop.type = 'button';
  shop.addEventListener('click', () => handlers.goToShop());

  const listEl = h('div', 'levellist');

  el.appendChild(
    panel([
      panelHead([
        h('div', 'panel__title', [back, h('h1', 'panel__heading', [t('Pick a dig')])]),
        h('div', 'panel__stats', [cashChip, pickChip]),
      ]),
      panelBody([listEl]),
      panelFoot([shop]),
    ]),
  );

  const rows = new Map<string, LevelRow>();
  let signature = '';

  function buildRow(level: LevelView, position: number): LevelRow {
    const onTap = (): void => handlers.selectLevel(level.id);
    const index = h('span', 'levelcard__index');
    const name = h('span', 'levelcard__name');
    const blurb = h('span', 'levelcard__blurb');
    const goal = h('span', 'tag tag--goal');
    const best = h('span', 'tag tag--best');
    const plays = h('span', 'tag tag--plays');
    const lock = h('div', 'levelcard__lock', [
      h('span', 'levelcard__lock-icon', [svg('lock', 'icon')]),
      h('span', 'levelcard__lock-text', [t('Clear the previous dig')]),
    ]);

    const root = h('button', 'levelcard', [
      h('span', 'levelcard__top', [
        index,
        h('span', 'levelcard__title', [name, blurb]),
        h('span', 'levelcard__badge', [
          h('span', 'levelcard__check', [svg('check', 'icon')]),
          h('span', 'levelcard__pad', [svg('lock', 'icon')]),
        ]),
      ]),
      h('span', 'levelcard__meta', [goal, best, plays]),
      lock,
    ]);
    root.type = 'button';
    root.addEventListener('click', onTap);

    setText(index, String(position + 1).padStart(2, '0'));
    return { root, index, name, blurb, goal, best, plays, lock, onTap };
  }

  return {
    el,

    render(levels: readonly LevelView[], cash: number, pickaxeLevel: number): void {
      const items = list(levels);
      const nextSignature = items.map((level) => level.id).join('|');

      if (nextSignature !== signature) {
        signature = nextSignature;
        for (const row of rows.values()) row.root.remove();
        rows.clear();
        items.forEach((level, i) => {
          const row = buildRow(level, i);
          rows.set(level.id, row);
          listEl.appendChild(row.root);
        });
      }

      items.forEach((level, i) => {
        const row = rows.get(level.id);
        if (!row) return;
        setText(row.index, String(i + 1).padStart(2, '0'));
        setText(row.name, text(level.name, t('Unknown dig')));
        setText(row.blurb, text(level.blurb));
        setText(row.goal, t('Reach {n} m', { n: Math.round(num(level.targetDepth)) }));

        const best = Math.round(num(level.bestDepth));
        setText(row.best, best > 0 ? t('Best {n} m', { n: best }) : t('No dig yet'));

        const plays = Math.max(0, Math.round(num(level.plays)));
        const clears = Math.max(0, Math.round(num(level.clears)));
        setText(
          row.plays,
          t('{p} play · {c} clear', { p: plays, c: clears }),
        );

        const unlocked = level.unlocked !== false;
        row.root.disabled = !unlocked;
        setFlag(row.root, 'is-locked', !unlocked);
        setFlag(row.root, 'is-cleared', level.cleared === true);
      });

      cashValue.set(num(cash));
      setText(pickValue, `${t('Lvl')} ${Math.max(1, Math.round(num(pickaxeLevel, 1)))}`);
    },

    dispose(): void {
      rows.clear();
      cashValue.dispose();
    },
  };
}
