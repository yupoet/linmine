/**
 * UI entry point.
 *
 * The UI is a pure view: it owns DOM, never owns state. The app pushes view
 * models in through the render* methods and receives intent through the
 * handler callbacks. Nothing here imports rules or engines.
 */

import './styles.css';

import type {
  DraftView,
  HudView,
  LevelView,
  ResultView,
  ScreenId,
  SettingsView,
  ShopView,
  TutorialStep,
  UIAPI,
  UIHandlers,
} from '../app/contracts.ts';
import { h, setFlag, setText, text } from './dom.ts';
import { createDraft } from './draft.ts';
import { createHud } from './hud.ts';
import { createLevels } from './levels.ts';
import { createResult } from './result.ts';
import { createSettings } from './settings.ts';
import { createShop } from './shop.ts';
import { createTitle } from './title.ts';

const TOAST_MS = 2200;
const TOAST_EXIT_MS = 260;
const MAX_TOASTS = 3;
const TUTORIAL_ANCHORS = ['grid', 'hud', 'draft', 'result'] as const;

export function createUI(root: HTMLElement, handlers: UIHandlers): UIAPI {
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  let calmSetting = false;
  const motionOff = (): boolean => calmSetting || media.matches;

  const layer = h('div', 'ui');
  root.appendChild(layer);

  const hud = createHud(handlers, motionOff);
  const title = createTitle(handlers);
  const levels = createLevels(handlers, motionOff);
  const draft = createDraft(handlers);
  const result = createResult(handlers, motionOff);
  const shop = createShop(handlers, motionOff);
  const settings = createSettings(handlers);

  const screens: Record<ScreenId, HTMLElement> = {
    title: title.el,
    levels: levels.el,
    draft: draft.el,
    run: hud.el,
    result: result.el,
    shop: shop.el,
    settings: settings.el,
  };

  for (const id of Object.keys(screens) as ScreenId[]) {
    layer.appendChild(screens[id]);
  }

  // --- transient layers ---------------------------------------------------
  const toasts = h('div', 'ui__toasts');
  layer.appendChild(toasts);

  const tutText = h('p', 'tut__text');
  const tutOk = h('button', 'btn btn--sm tut__ok', ['Got it']);
  tutOk.type = 'button';
  tutOk.addEventListener('click', () => handlers.dismissTutorial());
  const tutorial = h('div', 'tut', [h('span', 'tut__tail'), tutText, tutOk]);
  layer.appendChild(tutorial);

  const timers = new Set<number>();

  function later(fn: () => void, ms: number): void {
    const id = window.setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
  }

  function applyCalm(): void {
    setFlag(layer, 'ui--calm', motionOff());
  }

  const onMediaChange = (): void => applyCalm();
  media.addEventListener('change', onMediaChange);
  applyCalm();

  let current: ScreenId = 'title';
  screens[current].classList.add('is-active');

  return {
    setScreen(screen: ScreenId): void {
      const next = screens[screen] ?? screens.title;
      if (next !== screens[current]) {
        screens[current].classList.remove('is-active');
        // Reset scroll so a revisited panel starts at the top.
        for (const body of next.querySelectorAll('.js-scroll')) {
          if (body instanceof HTMLElement) body.scrollTop = 0;
        }
        if (screen === 'run') hud.reset();
        current = screen;
      }
      next.classList.add('is-active');
      setFlag(layer, 'is-run', screen === 'run');
    },

    renderLevels(list: readonly LevelView[], cash: number, pickaxeLevel: number): void {
      levels.render(list, cash, pickaxeLevel);
    },

    renderDraft(view: DraftView): void {
      draft.render(view);
    },

    renderHud(view: HudView): void {
      hud.render(view);
    },

    renderResult(view: ResultView): void {
      result.render(view);
    },

    renderShop(view: ShopView): void {
      shop.render(view);
    },

    renderSettings(view: SettingsView): void {
      settings.render(view);
      calmSetting = view?.reducedMotion === true;
      applyCalm();
    },

    setTutorial(step: TutorialStep | null): void {
      if (!step) {
        tutorial.classList.remove('is-on');
        return;
      }
      for (const anchor of TUTORIAL_ANCHORS) {
        tutorial.classList.remove(`tut--${anchor}`);
      }
      const anchor = step.anchor;
      if (anchor && (TUTORIAL_ANCHORS as readonly string[]).includes(anchor)) {
        tutorial.classList.add(`tut--${anchor}`);
      }
      setText(tutText, text(step.text, 'Tap the soil to dig.'));
      tutorial.classList.add('is-on');
    },

    toast(message: string): void {
      const message2 = text(message, '');
      if (message2.length === 0) return;
      const el = h('div', 'toast', [message2]);
      toasts.appendChild(el);
      requestAnimationFrame(() => el.classList.add('is-on'));
      later(() => {
        el.classList.remove('is-on');
        later(() => el.remove(), TOAST_EXIT_MS);
      }, TOAST_MS);
      while (toasts.children.length > MAX_TOASTS) {
        toasts.firstElementChild?.remove();
      }
    },

    hint(message: string): void {
      hud.hint(message);
    },

    dispose(): void {
      media.removeEventListener('change', onMediaChange);
      for (const id of timers) window.clearTimeout(id);
      timers.clear();
      hud.dispose();
      title.dispose();
      levels.dispose();
      draft.dispose();
      result.dispose();
      shop.dispose();
      settings.dispose();
      layer.remove();
    },
  };
}
