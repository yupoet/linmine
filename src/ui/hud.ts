/**
 * Run HUD. Floats over the 3D canvas: the container never eats taps
 * (pointer-events:none) and only real buttons opt back in.
 *
 * renderHud() is called many times per second, so every node is created once
 * and only its text/width/class is updated afterwards.
 */

import type { HudView } from '../app/contracts.ts';
import { Counter, clamp01, createScreenEl, h, num, setFlag, setText, text } from './dom.ts';
import { svg } from './icons.ts';
import { t } from '../i18n/index.ts';

const EMPTY_HUD: HudView = {
  durability: 0,
  maxDurability: 0,
  cash: 0,
  depth: 0,
  targetDepth: 0,
  chains: 0,
  levelName: '',
  banner: null,
};

const BANNER_MS = 1100;
const HINT_MS = 1500;

export interface HudScreen {
  readonly el: HTMLElement;
  render(view: HudView): void;
  hint(message: string): void;
  /** Called when the run restarts so counters do not tween from stale values. */
  reset(): void;
  dispose(): void;
}

export function createHud(
  handlers: { quitRun(): void },
  reducedMotion: () => boolean,
): HudScreen {
  const el = createScreenEl('run', 'screen--transparent');

  // --- durability ---------------------------------------------------------
  const duraFill = h('i', 'bar__fill');
  const duraBar = h('div', 'bar bar--dura', [duraFill]);
  const duraNow = new Counter({ reducedMotion });
  const duraMax = h('span', 'hud__of');
  const duraChip = h('div', 'chip chip--dura', [
    h('span', 'chip__icon', [svg('pickaxe', 'icon')]),
    h('span', 'chip__value', [duraNow.el, duraMax]),
    duraBar,
  ]);

  // --- cash ---------------------------------------------------------------
  const cashNow = new Counter({ reducedMotion });
  const cashChip = h('div', 'chip chip--cash', [
    h('span', 'chip__icon', [svg('coin', 'icon')]),
    h('span', 'chip__value', [cashNow.el]),
  ]);

  // --- chain --------------------------------------------------------------
  const chainValue = h('span', 'chip__value');
  const chainChip = h('div', 'chip chip--chain', [
    h('span', 'chip__icon', [svg('chain', 'icon')]),
    chainValue,
  ]);

  // --- depth --------------------------------------------------------------
  const depthFill = h('i', 'bar__fill');
  const depthFlag = h('b', 'bar__flag');
  const depthTrack = h('div', 'bar bar--vertical bar--depth', [depthFill, depthFlag]);
  const depthNow = new Counter({ reducedMotion });
  const depthGoal = h('span', 'hud__depth-goal');
  const depthBlock = h('div', 'hud__depth', [
    h('div', 'hud__depth-read', [depthNow.el, h('span', 'hud__unit', ['m'])]),
    depthGoal,
    depthTrack,
  ]);

  // --- misc ---------------------------------------------------------------
  const levelName = h('div', 'hud__level');
  const banner = h('div', 'hud__banner');
  const hint = h('div', 'hud__hint');
  const pause = h('button', 'iconbtn hud__pause', [svg('pause', 'icon')]);
  pause.type = 'button';
  pause.setAttribute('aria-label', t('Pause dig'));
  pause.addEventListener('click', () => handlers.quitRun());

  const topRow = h('div', 'hud__row hud__row--top', [
    duraChip,
    h('div', 'hud__spacer', [levelName]),
    pause,
  ]);
  const bottomRow = h('div', 'hud__row hud__row--bottom', [cashChip, chainChip]);

  el.appendChild(h('div', 'hud', [topRow, depthBlock, bottomRow, banner, hint]));

  let bannerTimer = 0;
  let hintTimer = 0;
  let lastBanner = '';

  function flash(node: HTMLElement, message: string, ms: number, timer: number): number {
    setText(node, message);
    // Restart the CSS animation even when the same message repeats.
    node.classList.remove('is-on');
    void node.offsetWidth;
    node.classList.add('is-on');
    if (timer !== 0) window.clearTimeout(timer);
    return window.setTimeout(() => node.classList.remove('is-on'), ms);
  }

  return {
    el,

    render(view: HudView): void {
      const v = view ?? EMPTY_HUD;
      const max = Math.max(1, num(v.maxDurability, 1));
      const dura = num(v.durability);
      const target = Math.max(1, num(v.targetDepth, 1));
      const depth = num(v.depth);

      duraNow.set(dura);
      setText(duraMax, `/${Math.round(max)}`);
      const ratio = clamp01(dura / max);
      const width = `${(ratio * 100).toFixed(1)}%`;
      if (duraFill.style.width !== width) duraFill.style.width = width;
      setFlag(duraChip, 'is-critical', ratio <= 0.2);

      cashNow.set(num(v.cash));

      depthNow.set(depth);
      setText(depthGoal, t('of {n} m', { n: Math.round(target) }));
      const depthWidth = `${(clamp01(depth / target) * 100).toFixed(1)}%`;
      if (depthFill.style.height !== depthWidth) depthFill.style.height = depthWidth;

      const chains = Math.max(0, Math.round(num(v.chains)));
      setText(chainValue, `x${chains}`);
      setFlag(chainChip, 'is-idle', chains <= 0);

      setText(levelName, text(v.levelName, '—'));

      const nextBanner = typeof v.banner === 'string' ? v.banner : '';
      if (nextBanner !== lastBanner) {
        lastBanner = nextBanner;
        if (nextBanner.length > 0) {
          bannerTimer = flash(banner, nextBanner, BANNER_MS, bannerTimer);
        } else {
          banner.classList.remove('is-on');
        }
      }
    },

    hint(message: string): void {
      const msg = typeof message === 'string' ? message : '';
      if (msg.length === 0) return;
      hintTimer = flash(hint, msg, HINT_MS, hintTimer);
    },

    reset(): void {
      duraNow.reset(0);
      cashNow.reset(0);
      depthNow.reset(0);
      lastBanner = '';
      banner.classList.remove('is-on');
      hint.classList.remove('is-on');
    },

    dispose(): void {
      if (bannerTimer !== 0) window.clearTimeout(bannerTimer);
      if (hintTimer !== 0) window.clearTimeout(hintTimer);
      bannerTimer = 0;
      hintTimer = 0;
      duraNow.dispose();
      cashNow.dispose();
      depthNow.dispose();
    },
  };
}
