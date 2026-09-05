/** Card tile, shared by the draft picker and the shop collection. */

import type { CardView } from '../app/contracts.ts';
import { h, num, setFlag, setText, text } from './dom.ts';
import { t } from '../i18n/index.ts';
import { svg } from './icons.ts';

const FAMILY_LABEL: Record<string, string> = {
  generation: 'Veins',
  income: 'Cash',
  durability: 'Gear',
  chain: 'Blast',
};

export const EMPTY_CARD: CardView = {
  id: '',
  name: 'Unknown card',
  family: '',
  level: 0,
  maxLevel: 1,
  description: '',
  owned: false,
  selected: false,
};

export interface CardTile {
  readonly el: HTMLElement;
  update(card: CardView): void;
}

export interface CardTileOptions {
  /** Draft tiles are buttons that toggle; collection tiles are inert. */
  interactive?: boolean;
  onTap?: (id: string) => void;
}

export function createCardTile(options: CardTileOptions = {}): CardTile {
  const interactive = options.interactive === true;
  const name = h('span', 'card__name');
  const badge = h('span', 'card__badge');
  const family = h('span', 'card__family');
  const desc = h('span', 'card__desc');
  const pips = h('span', 'card__pips');
  const lockNote = h('span', 'card__lock', [svg('lock', 'icon'), t('Find it in a crate')]);

  const el = h(interactive ? 'button' : 'div', interactive ? 'card card--tap' : 'card', [
    h('span', 'card__head', [name, badge]),
    h('span', 'card__body', [family, desc]),
    pips,
    lockNote,
  ]);

  let id = '';
  let pipCount = 0;

  if (interactive) {
    const btn = el as HTMLButtonElement;
    btn.type = 'button';
    btn.addEventListener('click', () => {
      if (btn.disabled || id.length === 0) return;
      options.onTap?.(id);
    });
  }

  function buildPips(count: number, filled: number): void {
    pips.textContent = '';
    pipCount = count;
    for (let i = 0; i < count; i += 1) {
      pips.appendChild(h('i', i < filled ? 'pip is-on' : 'pip'));
    }
  }

  return {
    el,

    update(card: CardView): void {
      const c = card ?? EMPTY_CARD;
      id = text(c.id);

      const level = Math.max(0, Math.round(num(c.level)));
      const maxLevel = Math.max(1, Math.round(num(c.maxLevel, 1)));
      const owned = c.owned !== false;

      setText(name, text(c.name, t('Unknown card')));
      setText(family, t(FAMILY_LABEL[text(c.family)] ?? text(c.family, 'Card')));
      setText(desc, text(c.description, t('No effect yet.')));
      setText(badge, owned && level > 0 ? t('L{n}/{max}', { n: level, max: maxLevel }) : t('Locked'));

      if (pipCount !== maxLevel) buildPips(maxLevel, level);
      else {
        const children = pips.children;
        for (let i = 0; i < children.length; i += 1) {
          children[i]?.classList.toggle('is-on', i < level);
        }
      }

      setFlag(el, 'is-owned', owned);
      setFlag(el, 'is-locked', !owned);
      setFlag(el, 'is-selected', interactive && owned && c.selected === true);
      if (interactive) {
        (el as HTMLButtonElement).disabled = !owned;
      }
    },
  };
}
