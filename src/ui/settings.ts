/** Settings: language, three sound/feel switches, a guarded reset, and version info. */

import type { SettingsView } from '../app/contracts.ts';
import {
  type ScreenModule,
  createScreenEl,
  h,
  num,
  panel,
  panelBody,
  panelFoot,
  panelHead,
  setText,
  text,
} from './dom.ts';
import { CHARACTER_IDS, DEFAULT_CHARACTER, type CharacterId } from '../config/characters.ts';
import { DEFAULT_THEME, type ThemeId } from '../config/theme.ts';
import { t, type Lang } from '../i18n/index.ts';
import { svg } from './icons.ts';

const EMPTY_SETTINGS: SettingsView = {
  muted: false,
  reducedMotion: false,
  haptics: false,
  lang: 'zh',
  theme: DEFAULT_THEME,
  character: DEFAULT_CHARACTER,
  schemaVersion: 0,
  configVersion: '',
};

/** i18n key for each character id, in picker order. */
const CHARACTER_LABELS: Record<CharacterId, string> = {
  girl: 'Little girl',
  boy: 'Miner boy',
  robot: 'Robot',
};

const RESET_CONFIRM_MS = 4000;

interface Toggle {
  root: HTMLButtonElement;
  /** Reflects state coming from the app without firing the handler. */
  sync(on: boolean): void;
}

export interface SettingsScreen extends ScreenModule {
  render(view: SettingsView): void;
}

export function createSettings(handlers: {
  setMuted(muted: boolean): void;
  setReducedMotion(value: boolean): void;
  setHaptics(value: boolean): void;
  setLang(lang: Lang): void;
  setTheme(theme: ThemeId): void;
  setCharacter(character: CharacterId): void;
  resetSave(): void;
  goToTitle(): void;
}): SettingsScreen {
  const el = createScreenEl('settings');

  function createToggle(label: string, hint: string, onToggle: (value: boolean) => void): Toggle {
    let value = false;
    const root = h('button', 'switch', [
      h('span', 'switch__text', [
        h('span', 'switch__label', [label]),
        h('span', 'switch__hint', [hint]),
      ]),
      h('span', 'switch__track', [h('span', 'switch__knob')]),
    ]);
    root.type = 'button';
    root.setAttribute('role', 'switch');
    root.addEventListener('click', () => {
      value = !value;
      onToggle(value);
    });
    return {
      root,
      sync(on: boolean): void {
        value = on;
        root.classList.toggle('is-on', on);
        root.setAttribute('aria-checked', on ? 'true' : 'false');
      },
    };
  }

  const sound = createToggle(t('Sound'), t('Mines are quiet by default.'), (v) => handlers.setMuted(!v));
  const motion = createToggle(t('Calm motion'), t('Cuts screen shake and fades.'), (v) =>
    handlers.setReducedMotion(v),
  );
  const haptics = createToggle(t('Haptics'), t('Buzz on big chains.'), (v) => handlers.setHaptics(v));

  // --- language -------------------------------------------------------------
  // Two segmented buttons; the active one is highlighted. Choosing a language
  // rebuilds the whole UI (the app owns that), so this screen is disposable.
  const zhBtn = h('button', 'langbtn', ['中文']);
  const enBtn = h('button', 'langbtn', ['English']);
  zhBtn.type = 'button';
  enBtn.type = 'button';
  zhBtn.addEventListener('click', () => handlers.setLang('zh'));
  enBtn.addEventListener('click', () => handlers.setLang('en'));
  const langRow = h('div', 'settings__lang', [
    h('span', 'switch__label', [t('Language')]),
    h('div', 'langbtns', [zhBtn, enBtn]),
  ]);

  // --- skin ---------------------------------------------------------------
  // Same segmented pattern as the language row. It must stay AFTER that row:
  // scripts/visual-i18n.mjs reads the first `.switch__label` on this screen.
  const candyBtn = h('button', 'skinbtn', [t('Candy')]);
  const emberBtn = h('button', 'skinbtn', [t('Ember')]);
  candyBtn.type = 'button';
  emberBtn.type = 'button';
  candyBtn.addEventListener('click', () => handlers.setTheme('candy'));
  emberBtn.addEventListener('click', () => handlers.setTheme('ember'));
  const skinRow = h('div', 'settings__skin', [
    h('span', 'switch__label', [t('Skin')]),
    h('div', 'skinbtns', [candyBtn, emberBtn]),
  ]);

  // --- character ----------------------------------------------------------
  // Same segmented pattern as the skin row; only reskins the chibi miner, so
  // ember players see no change until they switch back to candy.
  const charBtns = new Map<CharacterId, HTMLButtonElement>();
  for (const id of CHARACTER_IDS) {
    const btn = h('button', 'skinbtn', [t(CHARACTER_LABELS[id])]);
    btn.type = 'button';
    btn.addEventListener('click', () => handlers.setCharacter(id));
    charBtns.set(id, btn);
  }
  const charRow = h('div', 'settings__skin settings__character', [
    h('span', 'switch__label', [t('Character')]),
    h('div', 'skinbtns', [...charBtns.values()]),
  ]);

  const reset = h('button', 'btn btn--danger', [t('Reset save')]);
  reset.type = 'button';
  let resetArmed = false;
  let resetTimer = 0;

  function disarmReset(): void {
    resetArmed = false;
    if (resetTimer !== 0) {
      window.clearTimeout(resetTimer);
      resetTimer = 0;
    }
    reset.classList.remove('is-armed');
    setText(reset, t('Reset save'));
  }

  reset.addEventListener('click', () => {
    if (resetArmed) {
      disarmReset();
      handlers.resetSave();
      return;
    }
    resetArmed = true;
    reset.classList.add('is-armed');
    setText(reset, t('Tap again to erase'));
    resetTimer = window.setTimeout(disarmReset, RESET_CONFIRM_MS);
  });

  const version = h('p', 'settings__version');

  const back = h('button', 'iconbtn iconbtn--close', [svg('back', 'icon')]);
  back.type = 'button';
  back.setAttribute('aria-label', t('Back to title'));
  back.addEventListener('click', () => handlers.goToTitle());

  el.appendChild(
    panel([
      panelHead([h('div', 'panel__title', [back, h('h1', 'panel__heading', [t('Settings')])])]),
      panelBody([
        langRow,
        skinRow,
        charRow,
        h('div', 'settings__group', [sound.root, motion.root, haptics.root]),
        h('div', 'settings__group settings__group--danger', [
          h('p', 'settings__note', [t('Erasing your save removes cash, cards and level progress.')]),
          reset,
        ]),
        version,
      ]),
      panelFoot([]),
    ]),
  );

  const toggles: Array<{ toggle: Toggle; pick: (view: SettingsView) => boolean }> = [
    { toggle: sound, pick: (v) => !v.muted },
    { toggle: motion, pick: (v) => v.reducedMotion },
    { toggle: haptics, pick: (v) => v.haptics },
  ];

  return {
    el,

    render(view: SettingsView): void {
      const v = view ?? EMPTY_SETTINGS;
      for (const entry of toggles) {
        entry.toggle.sync(entry.pick(v) === true);
      }
      const lang: Lang = v.lang === 'en' ? 'en' : 'zh';
      zhBtn.classList.toggle('is-on', lang === 'zh');
      enBtn.classList.toggle('is-on', lang === 'en');
      const theme: ThemeId = v.theme === 'ember' ? 'ember' : 'candy';
      candyBtn.classList.toggle('is-on', theme === 'candy');
      emberBtn.classList.toggle('is-on', theme === 'ember');
      const character: CharacterId = charBtns.has(v.character) ? v.character : DEFAULT_CHARACTER;
      for (const [id, btn] of charBtns) btn.classList.toggle('is-on', id === character);
      setText(
        version,
        t('Save v{n} · Config {v}', { n: Math.round(num(v.schemaVersion)), v: text(v.configVersion, 'unknown') }),
      );
    },

    dispose(): void {
      disarmReset();
    },
  };
}
