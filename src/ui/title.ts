/** Front screen: name, tagline, one big call to action. */

import {
  type ScreenModule,
  createScreenEl,
  h,
  panel,
  panelBody,
  panelFoot,
} from './dom.ts';
import { gameName, t } from '../i18n/index.ts';
import { svg } from './icons.ts';

export function createTitle(handlers: { goToLevels(): void; goToSettings(): void }): ScreenModule {
  const el = createScreenEl('title');

  const gear = h('button', 'iconbtn title__gear', [svg('gear', 'icon')]);
  gear.type = 'button';
  gear.setAttribute('aria-label', t('Settings'));
  gear.addEventListener('click', () => handlers.goToSettings());

  const digIn = h('button', 'btn btn--primary btn--xl', [t('Dig In')]);
  digIn.type = 'button';
  digIn.addEventListener('click', () => handlers.goToLevels());

  el.appendChild(
    panel([
      gear,
      panelBody([
        h('div', 'title__crest', [svg('pickaxe', 'crest__icon'), svg('gem', 'crest__gem')]),
        h('h1', 'title__name', [gameName()]),
        h('p', 'title__tagline', [t('Tap the soil. Chase the vein. Get out before the pick gives.')]),
      ]),
      panelFoot([digIn]),
    ]),
  );

  return { el, dispose: () => undefined };
}
