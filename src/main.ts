/**
 * Entry point: builds the platform services, wires render <-> app <-> ui,
 * and starts the frame loop. Nothing here decides game rules.
 */

import { createAnalytics } from './app/analytics.ts';
import { createGame, type GameAPI } from './app/game.ts';
import type { UIHandlers } from './app/contracts.ts';
import { DEFAULT_GRID_WIDTH } from './config/version.ts';
import { attachDevtools, type DevtoolsHandle } from './devtools/perf.ts';
import { createAudio } from './platform/audio.ts';
import { createClock } from './platform/clock.ts';
import { attachInput } from './platform/input.ts';
import { createStorage } from './platform/storage.ts';
import { createRenderer } from './render/index.ts';
import { createUI } from './ui/index.ts';

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`missing element: ${selector}`);
  return element;
}

function showFatal(message: string): void {
  const fatal = document.getElementById('fatal');
  const detail = document.getElementById('fatal-detail');
  if (detail) detail.textContent = message;
  if (fatal) fatal.style.display = 'grid';
}

function main(): void {
  const canvas = required<HTMLCanvasElement>('#stage');
  const uiRoot = required<HTMLDivElement>('#ui');
  const boot = document.getElementById('boot');
  const params = new URLSearchParams(location.search);

  const storage = createStorage();
  const audio = createAudio();
  const analytics = createAnalytics();
  const clock = createClock();

  // Dig audio is event-driven: the renderer reports the exact on-screen
  // impact moment, which the game turns into sound/haptics. The bridge is
  // late-bound because the game does not exist yet.
  let game: GameAPI | null = null;
  const renderer = createRenderer({
    canvas,
    width: DEFAULT_GRID_WIDTH,
    onWave: (wave, destroyed, kind, chained) => game?.digWaveSound(wave, destroyed, kind, chained),
    onLand: (fallRows) => game?.digLandSound(fallRows),
  });
  renderer.resize();

  // The UI is built before the game exists, so its handler calls are late-bound.
  const lateBound = new Proxy({} as UIHandlers, {
    get(_target, key: string) {
      return (...args: unknown[]) => {
        const handlers = game?.handlers as unknown as Record<string, (...a: unknown[]) => void> | undefined;
        handlers?.[key]?.(...args);
      };
    },
  });

  const ui = createUI(uiRoot, lateBound);

  // Language switching rebuilds the whole UI (static chrome is constructed
  // once per instance), so the game gets a factory to swap it out.
  const rebuildUI = () => createUI(uiRoot, lateBound);

  game = createGame({
    ui,
    rebuildUI,
    renderer,
    audio,
    storage,
    analytics,
    fixedSeed: params.has('seed') ? Number(params.get('seed')) >>> 0 : undefined,
    haptics: (pattern) => {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(pattern);
      }
    },
  });

  const detachInput = attachInput({
    target: canvas,
    onTap: (x, y) => game?.tapAt(x, y),
    onHover: (x, y) => game?.hoverAt(x, y),
    onHoverEnd: () => renderer.setHover(null),
  });

  let devtools: DevtoolsHandle | null = null;
  clock.onFrame((dt) => {
    game?.frame(dt);
    renderer.update(dt);
    renderer.render();
    devtools?.update(dt);
  });
  clock.start();

  const onResize = (): void => renderer.resize();
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);

  game.boot();
  boot?.classList.add('is-hidden');

  if (params.has('dev')) {
    devtools = attachDevtools({ renderer, analytics, game });
  }

  window.addEventListener('error', (event) => {
    analytics.track('error', { message: String(event.message) });
  });
  window.addEventListener('unhandledrejection', (event) => {
    analytics.track('error', { message: `unhandled rejection: ${String(event.reason)}` });
  });

  // Handy for debugging in the console; not part of the game surface.
  Object.assign(window as unknown as Record<string, unknown>, {
    linmine: { game, renderer, ui, analytics, storage, detach: detachInput },
  });
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
  showFatal(message);
  // eslint-disable-next-line no-console
  console.error(error);
}

// Register the service worker so the game is playable offline after the
// first visit. The SW only owns the static app shell; runtime state
// (save/profile) lives in localStorage so it survives cache evictions.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('service worker registration failed', err);
    });
  });
}
