/** Pre-run card draft: pick your kit, then start digging. */

import type { CardView, DraftView } from '../app/contracts.ts';
import { type CardTile, createCardTile } from './card.ts';
import {
  type ScreenModule,
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

const EMPTY_DRAFT: DraftView = {
  levelId: '',
  levelName: '',
  targetDepth: 0,
  durability: 0,
  cards: [],
  selectedIds: [],
  maxCards: 3,
};

export interface DraftScreen extends ScreenModule {
  render(view: DraftView): void;
}

export function createDraft(
  handlers: { toggleCard(cardId: string): void; beginRun(): void; goToLevels(): void },
): DraftScreen {
  const el = createScreenEl('draft');

  const levelName = h('h1', 'panel__heading');
  const maxCardsText = h('b', 'draft__max');
  const picked = h('span', 'draft__picked');
  const durability = h('span', 'draft__stat-value');
  const target = h('span', 'draft__stat-value');
  const grid = h('div', 'cardgrid');

  const start = h('button', 'btn btn--primary btn--xl', [t('Start Dig')]);
  start.type = 'button';
  start.addEventListener('click', () => handlers.beginRun());

  const back = h('button', 'iconbtn iconbtn--close', [svg('back', 'icon')]);
  back.type = 'button';
  back.setAttribute('aria-label', t('Back to levels'));
  back.addEventListener('click', () => handlers.goToLevels());

  el.appendChild(
    panel([
      panelHead([
        h('div', 'panel__title', [back, levelName]),
        h('p', 'panel__sub', [`${t('Equip up to')} `, maxCardsText, ` ${t('cards')}`]),
      ]),
      panelBody([
        h('div', 'draft__stats', [
          h('div', 'draft__stat', [h('span', 'draft__stat-label', [t('Pickaxe')]), durability]),
          h('div', 'draft__stat', [h('span', 'draft__stat-label', [t('Target')]), target]),
        ]),
        grid,
      ]),
      panelFoot([h('div', 'draft__picked-row', [picked]), start]),
    ]),
  );

  const tiles = new Map<string, CardTile>();
  let signature = '';

  function syncCards(cards: readonly CardView[], onTap: (id: string) => void): void {
    const next = cards.map((card) => card.id).join('|');
    if (next !== signature) {
      signature = next;
      for (const tile of tiles.values()) tile.el.remove();
      tiles.clear();
      for (const card of cards) {
        const tile = createCardTile({ interactive: true, onTap });
        tiles.set(card.id, tile);
        grid.appendChild(tile.el);
      }
    }
    for (const card of cards) {
      tiles.get(card.id)?.update(card);
    }
  }

  return {
    el,

    render(view: DraftView): void {
      const v = view ?? EMPTY_DRAFT;
      const cards = list(v.cards);
      const maxCards = Math.max(1, Math.round(num(v.maxCards, 3)));
      const count = Math.min(list(v.selectedIds).length, maxCards);

      setText(levelName, text(v.levelName, t('Pick a dig')));
      setText(maxCardsText, String(maxCards));
      setText(durability, t('{n} swings', { n: Math.round(num(v.durability)) }));
      setText(target, t('{n} m', { n: Math.round(num(v.targetDepth)) }));
      setText(picked, t('{n} of {max} equipped', { n: count, max: maxCards }));
      setText(start, count > 0 ? t('Start Dig') : t('Go bare-handed'));
      setFlag(start, 'is-quiet', count === 0);

      syncCards(cards, (id: string) => handlers.toggleCard(id));
    },

    dispose(): void {
      tiles.clear();
    },
  };
}
