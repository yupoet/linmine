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

  const start = h('button', 'btn btn--primary btn--xl', ['Start Dig']);
  start.type = 'button';
  start.addEventListener('click', () => handlers.beginRun());

  const back = h('button', 'iconbtn', [svg('back', 'icon')]);
  back.type = 'button';
  back.setAttribute('aria-label', 'Back to levels');
  back.addEventListener('click', () => handlers.goToLevels());

  el.appendChild(
    panel([
      panelHead([
        h('div', 'panel__title', [back, levelName]),
        h('p', 'panel__sub', ['Equip up to ', maxCardsText, ' cards']),
      ]),
      panelBody([
        h('div', 'draft__stats', [
          h('div', 'draft__stat', [h('span', 'draft__stat-label', ['Pickaxe']), durability]),
          h('div', 'draft__stat', [h('span', 'draft__stat-label', ['Target']), target]),
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

      setText(levelName, text(v.levelName, 'Pick a dig'));
      setText(maxCardsText, String(maxCards));
      setText(durability, `${Math.round(num(v.durability))} swings`);
      setText(target, `${Math.round(num(v.targetDepth))} m`);
      setText(picked, `${count} of ${maxCards} equipped`);
      setText(start, count > 0 ? 'Start Dig' : 'Go bare-handed');
      setFlag(start, 'is-quiet', count === 0);

      syncCards(cards, (id: string) => handlers.toggleCard(id));
    },

    dispose(): void {
      tiles.clear();
    },
  };
}
