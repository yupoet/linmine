/** Settings: three sound/feel switches, a guarded reset, and version info. */

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
import { svg } from './icons.ts';

const EMPTY_SETTINGS: SettingsView = {
  muted: false,
  reducedMotion: false,
  haptics: false,
  schemaVersion: 0,
  configVersion: '',
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

  const sound = createToggle('Sound', 'Mines are quiet by default.', (v) => handlers.setMuted(!v));
  const motion = createToggle('Calm motion', 'Cuts screen shake and fades.', (v) =>
    handlers.setReducedMotion(v),
  );
  const haptics = createToggle('Haptics', 'Buzz on big chains.', (v) => handlers.setHaptics(v));

  const reset = h('button', 'btn btn--danger', ['Reset save']);
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
    setText(reset, 'Reset save');
  }

  reset.addEventListener('click', () => {
    if (resetArmed) {
      disarmReset();
      handlers.resetSave();
      return;
    }
    resetArmed = true;
    reset.classList.add('is-armed');
    setText(reset, 'Tap again to erase');
    resetTimer = window.setTimeout(disarmReset, RESET_CONFIRM_MS);
  });

  const version = h('p', 'settings__version');

  const back = h('button', 'iconbtn', [svg('back', 'icon')]);
  back.type = 'button';
  back.setAttribute('aria-label', 'Back to title');
  back.addEventListener('click', () => handlers.goToTitle());

  el.appendChild(
    panel([
      panelHead([h('div', 'panel__title', [back, h('h1', 'panel__heading', ['Settings'])])]),
      panelBody([
        h('div', 'settings__group', [sound.root, motion.root, haptics.root]),
        h('div', 'settings__group settings__group--danger', [
          h('p', 'settings__note', ['Erasing your save removes cash, cards and level progress.']),
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
      setText(
        version,
        `Save v${Math.round(num(v.schemaVersion))} · Config ${text(v.configVersion, 'unknown')}`,
      );
    },

    dispose(): void {
      disarmReset();
    },
  };
}
