/**
 * Integration tests: the whole loop end to end with stub UI and renderer.
 * These catch wiring faults (wrong screen order, forgotten saves, bad reward
 * flow) that unit tests cannot see.
 */

import { describe, expect, it, vi } from 'vitest';
import { createAnalytics } from '../../src/app/analytics.ts';
import { createGame, type GameAPI } from '../../src/app/game.ts';
import type {
  CardView,
  DraftView,
  HudView,
  LevelView,
  RendererAPI,
  ResultView,
  ScreenId,
  SettingsView,
  ShopView,
  UIAPI,
  UIHandlers,
} from '../../src/app/contracts.ts';
import { createAudio } from '../../src/platform/audio.ts';
import { createStorage, THEME_MIRROR_KEY, type KeyValueStore } from '../../src/platform/storage.ts';
import { PICKAXE_MAX_LEVEL } from '../../src/config/economy.ts';
import { LEVELS } from '../../src/config/levels.ts';
import { getLegalTargets } from '../../src/core/run.ts';
import { BlockKind } from '../../src/config/blocks.ts';
import { DEFAULT_CHARACTER, type CharacterId } from '../../src/config/characters.ts';
import { DEFAULT_THEME, type ThemeId } from '../../src/config/theme.ts';
import type { Cell, DigResult, RunState } from '../../src/core/types.ts';
import type { TargetInfo } from '../../src/core/run.ts';

interface Recorder {
  screens: ScreenId[];
  hud: HudView | null;
  draft: DraftView | null;
  result: ResultView | null;
  shop: ShopView | null;
  settings: SettingsView | null;
  levels: LevelView[];
  toasts: string[];
  hints: string[];
  tutorials: string[];
  playDigCalls: number;
  /** Themes pushed into the UI stub, oldest first. */
  uiThemes: ThemeId[];
}

function createRecorder(): Recorder {
  return {
    screens: [],
    hud: null,
    draft: null,
    result: null,
    shop: null,
    settings: null,
    levels: [],
    toasts: [],
    hints: [],
    tutorials: [],
    playDigCalls: 0,
    uiThemes: [],
  };
}

/** Observable store so tests can assert on what actually hit persistence. */
function createTestStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

function createStubRenderer(): RendererAPI & { picked: Cell | null; themes: ThemeId[]; characters: CharacterId[] } {
  const themes: ThemeId[] = [];
  const characters: CharacterId[] = [];
  return {
    picked: null,
    themes,
    characters,
    setTheme(theme) {
      themes.push(theme);
    },
    setCharacter(character) {
      characters.push(character);
    },
    setState() {},
    playDig() {
      void 0;
    },
    setTargets() {},
    setHover() {},
    update() {},
    render() {},
    resize() {},
    pickCell() {
      return null;
    },
    setReducedMotion() {},
    isBusy: () => false,
    stats: () => ({ fps: 60, drawCalls: 0, instances: 0 }),
    dispose() {},
  };
}

function createStubUi(recorder: Recorder): UIAPI {
  return {
    setScreen(screen) {
      recorder.screens.push(screen);
    },
    renderLevels(levels) {
      recorder.levels = levels;
    },
    renderDraft(view) {
      recorder.draft = view;
    },
    renderHud(view) {
      recorder.hud = view;
    },
    renderResult(view) {
      recorder.result = view;
    },
    renderShop(view) {
      recorder.shop = view;
    },
    renderSettings(view) {
      recorder.settings = view;
    },
    setTutorial(step) {
      if (step) recorder.tutorials.push(step.id);
    },
    toast(message) {
      recorder.toasts.push(message);
    },
    hint(message) {
      recorder.hints.push(message);
    },
    setTheme(theme) {
      recorder.uiThemes.push(theme);
    },
    dispose() {},
  };
}

function setup(options: { seed?: number; store?: KeyValueStore } = {}) {
  const recorder = createRecorder();

  const renderer = createStubRenderer();
  const analytics = createAnalytics();
  const audio = createAudio();
  const store = options.store ?? createTestStore();
  const storage = createStorage(store);

  const ui = createStubUi(recorder);
  const game = createGame({
    ui,
    renderer,
    audio,
    storage,
    analytics,
    fixedSeed: options.seed ?? 1234,
    haptics: () => undefined,
  });

  game.boot();
  return { game, recorder, renderer, analytics, storage, store, ui: game.handlers };
}

describe('app loop', () => {
  it('boots to the title screen', () => {
    const { recorder } = setup();
    expect(recorder.screens).toEqual(['title']);
  });

  it('walks title -> levels -> draft -> run', () => {
    const { recorder, ui } = setup();
    ui.goToLevels();
    expect(recorder.screens.at(-1)).toBe('levels');
    // Daily shaft rides at the top of the list, so one more than the story ladder.
    expect(recorder.levels).toHaveLength(LEVELS.length + 1);
    expect(recorder.levels[0]?.id.startsWith('daily_')).toBe(true);
    expect(recorder.levels[0].unlocked).toBe(true);
    expect(recorder.levels[1].unlocked).toBe(true);
    expect(recorder.levels[2].unlocked).toBe(false);

    ui.selectLevel(LEVELS[0].id);
    expect(recorder.screens.at(-1)).toBe('draft');
    expect(recorder.draft?.levelId).toBe(LEVELS[0].id);
    expect(recorder.draft?.maxCards).toBe(3);

    ui.beginRun();
    expect(recorder.screens.at(-1)).toBe('run');
    // The starter card is auto-equipped on a fresh profile, so the pickaxe
    // can start above the level baseline.
    expect(recorder.hud?.durability).toBeGreaterThanOrEqual(LEVELS[0].baseDurability);
  });

  it('refuses locked levels', () => {
    const { recorder, ui } = setup();
    ui.goToLevels();
    ui.selectLevel(LEVELS[2].id);
    expect(recorder.screens.at(-1)).toBe('levels');
    expect(recorder.toasts.join(' ')).toContain('先通关上一条矿道');
  });

  it('starts a fresh profile with a starter card', () => {
    const { game } = setup();
    expect(Object.keys(game.getProfile().cards).length).toBe(1);
  });

  it('shows the tutorial on the first run and stops after it', () => {
    const { recorder, ui, game, renderer } = setup();
    ui.goToLevels();
    ui.selectLevel(LEVELS[0].id);
    ui.beginRun();
    expect(recorder.tutorials).toContain('tap-to-dig');

    // Dig through the app so the tutorial state machine actually advances.
    const run = game.getRun();
    expect(run).not.toBeNull();
    for (let i = 0; i < 5 && run && run.status === 'running'; i++) {
      tapFirstTarget(game, renderer, run);
    }
    expect(recorder.tutorials).toContain('fall-and-chain');
  });

  it('records the run, pays out and moves to the result screen', () => {
    const { game, recorder, ui, renderer } = setup();
    ui.goToLevels();
    ui.selectLevel(LEVELS[0].id);
    ui.beginRun();

    const run = game.getRun();
    if (!run) throw new Error('no run');
    // Carve a pocket above the goal layer, then tap through to win.
    teleportToGoal(run);
    renderer.pickCell = () => ({ col: 0, row: run.level.targetDepth });
    game.tapAt(1, 1);

    expect(run.status).toBe('won');
    game.frame(2); // let the result timer elapse
    expect(recorder.screens.at(-1)).toBe('result');
    expect(recorder.result?.won).toBe(true);
    expect(recorder.result?.settlement.winBonus).toBeGreaterThan(0);
    expect(game.getProfile().cash).toBe(recorder.result?.settlement.total);
    expect(game.getProfile().levels[LEVELS[0].id].clears).toBe(1);
    // First clear while flawless (>50% durability left) pays the epic cache.
    expect(game.getProfile().pendingChests).toContain('epic');
  });

  it('unlocks the next level after the first clear', () => {
    const { game, ui, recorder, renderer } = setup();
    ui.goToLevels();
    ui.selectLevel(LEVELS[0].id);
    ui.beginRun();
    const run = game.getRun();
    if (!run) throw new Error('no run');
    teleportToGoal(run);
    renderer.pickCell = () => ({ col: 0, row: run.level.targetDepth });
    game.tapAt(1, 1);
    game.frame(2);

    ui.claimResult();
    ui.goToLevels();
    expect(recorder.levels[1].unlocked).toBe(true);
  });

  it('claims the reward crate and returns to the draft', () => {
    const { game, ui, recorder, renderer } = setup();
    ui.goToLevels();
    ui.selectLevel(LEVELS[0].id);
    ui.beginRun();
    const run = game.getRun();
    if (!run) throw new Error('no run');
    teleportToGoal(run);
    renderer.pickCell = () => ({ col: 0, row: run.level.targetDepth });
    game.tapAt(1, 1);
    game.frame(2);

    const before = game.getProfile().pendingChests.length;
    ui.claimResult();
    expect(game.getProfile().pendingChests.length).toBeGreaterThanOrEqual(before);
    expect(recorder.screens.at(-1)).toBe('draft');
  });

  it('buys a pickaxe upgrade when there is cash', () => {
    const { game, ui } = setup();
    game.getProfile().cash = 100000;
    ui.goToShop();
    ui.buyPickaxe();
    expect(game.getProfile().pickaxeLevel).toBe(2);
  });

  it('refuses an upgrade without cash', () => {
    const { game, ui, recorder } = setup();
    game.getProfile().cash = 0;
    ui.goToShop();
    ui.buyPickaxe();
    expect(game.getProfile().pickaxeLevel).toBe(1);
    expect(recorder.toasts).toContain('金币不足');
  });

  it('opens a pending crate and grants a card', () => {
    const { game, ui } = setup();
    game.getProfile().pendingChests.push('common');
    const cardsBefore = Object.keys(game.getProfile().cards).length;
    ui.goToShop();
    ui.openPendingChest('common');
    expect(game.getProfile().pendingChests).toEqual([]);
    expect(Object.keys(game.getProfile().cards).length).toBeGreaterThanOrEqual(cardsBefore);
  });

  it('persists progress across a reload', () => {
    const first = setup();
    first.ui.goToLevels();
    first.ui.selectLevel(LEVELS[0].id);
    first.ui.beginRun();
    const run = first.game.getRun();
    if (!run) throw new Error('no run');
    teleportToGoal(run);
    first.renderer.pickCell = () => ({ col: 0, row: run.level.targetDepth });
    first.game.tapAt(1, 1);
    first.game.frame(2);
    const cashAfterWin = first.game.getProfile().cash;

    // A second game reading the same store must see the saved profile.
    const analytics = createAnalytics();
    const recorder = createRecorder();
    const reloaded = createGame({
      ui: createStubUi(recorder),
      renderer: createStubRenderer(),
      audio: createAudio(),
      storage: first.storage,
      analytics,
      fixedSeed: 999,
    });
    reloaded.boot();
    expect(reloaded.getProfile().cash).toBe(cashAfterWin);
    expect(reloaded.getProfile().levels[LEVELS[0].id].clears).toBe(1);
  });

  it('resets the save on request', () => {
    const { game, ui } = setup();
    game.getProfile().cash = 5000;
    ui.resetSave();
    expect(game.getProfile().cash).toBe(0);
    expect(game.getProfile().pickaxeLevel).toBe(1);
  });

  it('tracks analytics events for a full run', () => {
    const { game, ui, analytics, renderer } = setup();
    ui.goToLevels();
    ui.selectLevel(LEVELS[0].id);
    ui.beginRun();
    const run = game.getRun();
    if (!run) throw new Error('no run');
    tapFirstTarget(game, renderer, run);
    teleportToGoal(run);
    renderer.pickCell = () => ({ col: 0, row: run.level.targetDepth });
    game.tapAt(1, 1);
    game.frame(2);

    const names = analytics.export().map((event) => event.name);
    expect(names).toContain('run_start');
    expect(names).toContain('run_end');
  });

  it('queues a tap while the miner is busy instead of dropping it', () => {
    const { game, ui, renderer } = setup();
    let busy = true;
    renderer.isBusy = () => busy;

    ui.goToLevels();
    ui.selectLevel(LEVELS[0].id);
    ui.beginRun();
    const run = game.getRun();
    if (!run) throw new Error('no run');

    // Force the renderer to report busy, tap, then free it on the next frame.
    const before = run.commands.length;
    renderer.pickCell = () => getTarget(run);
    game.tapAt(10, 10);
    expect(run.commands.length).toBe(before); // queued, not executed

    busy = false;
    game.frame(0.016);
    expect(run.commands.length).toBe(before + 1); // drained
  });

  it('hints when the player taps something undiggable', () => {
    const { game, ui, recorder, renderer } = setup();
    ui.goToLevels();
    ui.selectLevel(LEVELS[0].id);
    ui.beginRun();
    const run = game.getRun();
    if (!run) throw new Error('no run');
    renderer.pickCell = () => ({ col: 0, row: 0 }); // air above the miner
    game.tapAt(5, 5);
    expect(run.commands.length).toBe(0);

    renderer.pickCell = () => ({ col: 0, row: 40 }); // far below, unreachable
    game.tapAt(5, 5);
    expect(recorder.hints.length).toBeGreaterThan(0);
  });

  it('boots on the default skin and reports it in the settings view', () => {
    const { ui, recorder, renderer } = setup();
    ui.goToSettings();
    expect(recorder.settings?.theme).toBe(DEFAULT_THEME);
    expect(renderer.themes).toContain(DEFAULT_THEME);
    expect(recorder.uiThemes).toContain(DEFAULT_THEME);
  });

  it('switches the skin into both layers and persists it', () => {
    const { game, ui, recorder, renderer, store } = setup();
    ui.goToSettings();
    ui.setTheme('ember');

    expect(game.getProfile().settings.theme).toBe('ember');
    expect(renderer.themes.at(-1)).toBe('ember');
    expect(recorder.uiThemes.at(-1)).toBe('ember');
    expect(recorder.settings?.theme).toBe('ember');
    expect(store.getItem(THEME_MIRROR_KEY)).toBe('ember');
  });

  it('boots on the default character and reports it in the settings view', () => {
    const { ui, recorder, renderer } = setup();
    ui.goToSettings();
    expect(recorder.settings?.character).toBe(DEFAULT_CHARACTER);
    expect(renderer.characters).toContain(DEFAULT_CHARACTER);
  });

  it('switches the character into the renderer and persists it', () => {
    const { game, ui, recorder, renderer } = setup();
    ui.goToSettings();
    ui.setCharacter('robot');

    expect(game.getProfile().settings.character).toBe('robot');
    expect(renderer.characters.at(-1)).toBe('robot');
    expect(recorder.settings?.character).toBe('robot');
  });

  it('boots the saved character after a reload', () => {
    const first = setup();
    first.ui.setCharacter('boy');

    const second = setup({ store: first.store });
    expect(second.game.getProfile().settings.character).toBe('boy');
    expect(second.renderer.characters).toContain('boy');
  });

  it('boots the saved skin after a reload', () => {
    const first = setup();
    first.ui.setTheme('ember');

    const second = setup({ store: first.store });
    expect(second.game.getProfile().settings.theme).toBe('ember');
    expect(second.renderer.themes).toContain('ember');
    expect(second.recorder.uiThemes).toContain('ember');
  });

  it('never exceeds the pickaxe ceiling', () => {
    const { game, ui } = setup();
    game.getProfile().cash = 10_000_000;
    for (let i = 0; i < PICKAXE_MAX_LEVEL + 5; i++) {
      ui.goToShop();
      ui.buyPickaxe();
    }
    expect(game.getProfile().pickaxeLevel).toBe(PICKAXE_MAX_LEVEL);
  });
});

/** Tap the first legal target through the real app path. */
function tapFirstTarget(game: GameAPI, renderer: RendererAPI, run: RunState): void {
  const targets = getLegalTargets(run);
  if (targets.length === 0) return;
  renderer.pickCell = () => ({ col: targets[0].col, row: targets[0].row });
  game.tapAt(1, 1);
  game.frame(0.016);
}

/** Put the miner in a carved pocket directly above the goal layer. */
function teleportToGoal(run: RunState): void {
  const row = run.level.targetDepth - 1;
  run.grid.setAt(0, row, BlockKind.Empty);
  run.player = { col: 0, row };
}

function getTarget(run: RunState): Cell {
  const targets = getLegalTargets(run) as TargetInfo[];
  return { col: targets[0].col, row: targets[0].row };
}

// Silence unused-symbol complaints for the imported types used only in stubs.
export type { CardView, DigResult };
