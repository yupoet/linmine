/**
 * Application state machine: boots the game, owns the profile and the active
 * run, and pushes view models into the UI and the renderer.
 *
 * All rule decisions live in core/; this file only orchestrates.
 */

import { blockCost } from '../core/modifiers.ts';
import {
  applyDig,
  createRun,
  getLegalTargets,
  type TargetInfo,
} from '../core/run.ts';
import { createRng } from '../core/rng.ts';
import {
  createProfile,
  isLevelUnlocked,
  type Profile,
} from '../core/save.ts';
import {
  pickaxeDurabilityBonus,
  pickaxeUpgradeCost,
  settleRun,
  CHESTS,
  PICKAXE_MAX_LEVEL,
  type ChestTier,
} from '../config/economy.ts';
import { CARDS, cardById, MAX_CARDS_PER_RUN } from '../config/cards.ts';
import { LEVELS, levelById } from '../config/levels.ts';
import { CONFIG_VERSION } from '../config/version.ts';
import { BlockKind } from '../config/blocks.ts';
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
  TutorialStep,
  UIAPI,
  UIHandlers,
} from './contracts.ts';
import {
  buyChest,
  buyPickaxe,
  draftCards,
  grantStarterCard,
  openChest,
  recordRunResult,
  takePendingChest,
  type ChestReward,
} from './profile.ts';
import type { AnalyticsAPI } from './analytics.ts';
import type { AudioAPI } from '../platform/audio.ts';
import type { StorageAPI } from '../platform/storage.ts';
import type { Cell, DigResult, RunState } from '../core/types.ts';
import { gameName, setLang as setI18nLang, t, tCardDesc, tChest, type Lang } from '../i18n/index.ts';

export interface GameDeps {
  ui: UIAPI;
  /** Rebuilds the UI (language switch rebuilds static chrome). Optional. */
  rebuildUI?: () => UIAPI;
  renderer: RendererAPI;
  audio: AudioAPI;
  storage: StorageAPI;
  analytics: AnalyticsAPI;
  /** Fixed seed for debugging / replay; random per run when omitted. */
  fixedSeed?: number;
  haptics?: (pattern: number | number[]) => void;
  now?: () => number;
}

const RESULT_DELAY_MS = 900;

export interface GameAPI {
  boot(): void;
  frame(dt: number): void;
  tapAt(clientX: number, clientY: number): void;
  hoverAt(clientX: number, clientY: number): void;
  handlers: UIHandlers;
  getProfile(): Profile;
  getRun(): RunState | null;
  /** Dig an explicit cell; same path a tap takes (devtools / automation). */
  digCell(col: number, row: number): void;
}

export function createGame(deps: GameDeps): GameAPI {
  const { renderer, audio, storage, analytics } = deps;
  let ui = deps.ui;
  const now = deps.now ?? (() => Date.now());
  const haptics = deps.haptics ?? (() => undefined);

  let profile: Profile = createProfile();
  let screen: ScreenId = 'title';
  let run: RunState | null = null;
  let draftLevelId: string | null = null;
  let selectedCardIds: string[] = [];
  let pendingResult: ResultView | null = null;
  let resultTimer = 0;
  let queuedTap: Cell | null = null;
  let firstInputTracked = false;
  let tutorial: TutorialStep | null = null;
  let banner: string | null = null;
  let bannerTimer = 0;
  let lastHintAt = 0;

  // ---------------------------------------------------------------- helpers

  function save(): void {
    storage.save(profile);
  }

  function nextSeed(): number {
    if (deps.fixedSeed !== undefined) return deps.fixedSeed;
    return Math.floor(Math.random() * 0xffffffff) >>> 0;
  }

  function cardViews(selected: readonly string[]): CardView[] {
    const owned = draftCards(profile);
    return CARDS.map((card) => {
      const ownedEntry = profile.cards[card.id];
      const level = ownedEntry?.level ?? 0;
      return {
        id: card.id,
        name: t(card.name),
        family: card.family,
        level,
        maxLevel: card.maxLevel,
        description: tCardDesc(card, Math.max(1, level)),
        owned: owned.some((entry) => entry.id === card.id),
        selected: selected.includes(card.id),
      };
    });
  }

  function levelViews(): LevelView[] {
    return LEVELS.map((level) => {
      const record = profile.levels[level.id];
      return {
        id: level.id,
        name: t(level.name),
        blurb: t(level.blurb),
        targetDepth: level.targetDepth,
        unlocked: isLevelUnlocked(profile, level.index),
        cleared: (record?.clears ?? 0) > 0,
        bestDepth: record?.bestDepth ?? 0,
        plays: record?.plays ?? 0,
        clears: record?.clears ?? 0,
      };
    });
  }

  function hudView(): HudView {
    if (!run) {
      return {
        durability: 0,
        maxDurability: 1,
        cash: 0,
        depth: 0,
        targetDepth: 1,
        chains: 0,
        levelName: '',
        banner: null,
      };
    }
    return {
      durability: run.durability,
      maxDurability: run.maxDurability,
      cash: run.cash,
      depth: run.depth,
      targetDepth: run.level.targetDepth,
      chains: run.stats.chainsTriggered,
      levelName: t(run.level.name),
      banner,
    };
  }

  function pushHud(): void {
    ui.renderHud(hudView());
  }

  function pushTargets(): void {
    if (!run) return;
    renderer.setTargets(getLegalTargets(run), run);
  }

  function setTutorial(step: TutorialStep | null): void {
    tutorial = step;
    ui.setTutorial(step);
    if (step) analytics.track('tutorial_step', { step: step.id });
  }

  function hint(message: string): void {
    const t = now();
    if (t - lastHintAt < 400) return;
    lastHintAt = t;
    ui.hint(message);
    audio.play('error');
  }

  function vibrate(pattern: number | number[]): void {
    if (profile.settings.haptics) haptics(pattern);
  }

  // ------------------------------------------------------------------ screens

  function goTo(screenId: ScreenId): void {
    screen = screenId;
    ui.setScreen(screenId);
  }

  function goToLevels(): void {
    run = null;
    renderer.setState(null);
    ui.renderLevels(levelViews(), profile.cash, profile.pickaxeLevel);
    goTo('levels');
  }

  function goToDraft(levelId: string): void {
    draftLevelId = levelId;
    const owned = draftCards(profile).map((card) => card.id);
    selectedCardIds = owned.slice(0, MAX_CARDS_PER_RUN);
    renderDraft();
    goTo('draft');
  }

  function renderDraft(): void {
    if (!draftLevelId) return;
    const level = levelById(draftLevelId);
    const cards = cardViews(selectedCardIds);
    const equipped = selectedCardIds
      .map((id) => profile.cards[id]?.level ?? 1)
      .map((level, index) => ({ id: selectedCardIds[index], level }));
    const durability = level.baseDurability + pickaxeDurabilityBonus(profile.pickaxeLevel) + equipped.reduce((sum, entry) => {
      const card = cardById(entry.id);
      const effect = card.effects.find((item) => item.key === 'startDurability');
      if (!effect) return sum;
      return sum + effect.value + effect.perLevel * (entry.level - 1);
    }, 0);

    const view: DraftView = {
      levelId: level.id,
      levelName: level.name,
      targetDepth: level.targetDepth,
      durability: Math.round(durability),
      cards,
      selectedIds: [...selectedCardIds],
      maxCards: MAX_CARDS_PER_RUN,
    };
    ui.renderDraft(view);
  }

  function goToShop(): void {
    const view: ShopView = {
      cash: profile.cash,
      pickaxeLevel: profile.pickaxeLevel,
      pickaxeMaxLevel: PICKAXE_MAX_LEVEL,
      upgradeCost: pickaxeUpgradeCost(profile.pickaxeLevel),
      nextDurabilityBonus: 3,
      cards: cardViews([]),
      chests: {
        common: { name: tChest(CHESTS.common.name), cost: CHESTS.common.cost, cards: CHESTS.common.cards },
        rare: { name: tChest(CHESTS.rare.name), cost: CHESTS.rare.cost, cards: CHESTS.rare.cards },
        epic: { name: tChest(CHESTS.epic.name), cost: CHESTS.epic.cost, cards: CHESTS.epic.cards },
      },
      pendingChests: [...profile.pendingChests],
    };
    ui.renderShop(view);
    goTo('shop');
  }

  function goToSettings(): void {
    const view: SettingsView = {
      muted: profile.settings.muted,
      reducedMotion: profile.settings.reducedMotion,
      haptics: profile.settings.haptics,
      lang: profile.settings.lang,
      schemaVersion: profile.schemaVersion,
      configVersion: CONFIG_VERSION,
    };
    ui.renderSettings(view);
    goTo('settings');
  }

  // -------------------------------------------------------------------- run

  function beginRun(): void {
    if (!draftLevelId) return;
    const level = levelById(draftLevelId);
    const cards = selectedCardIds
      .filter((id) => (profile.cards[id]?.count ?? 0) > 0)
      .map((id) => ({ id, level: profile.cards[id].level }));

    const seed = nextSeed();
    run = createRun({ seed, level, cards, pickaxeLevel: profile.pickaxeLevel, configVersion: CONFIG_VERSION });

    analytics.setContext({ runId: run.runId, seed, configVersion: CONFIG_VERSION, levelId: level.id });
    analytics.track('run_start', {
      levelId: level.id,
      seed,
      durability: run.durability,
      targetDepth: level.targetDepth,
      cards: cards.map((card) => `${card.id}:${card.level}`),
      pickaxeLevel: profile.pickaxeLevel,
    });

    firstInputTracked = false;
    banner = null;
    bannerTimer = 0;
    queuedTap = null;

    renderer.setState(run);
    pushTargets();
    pushHud();
    goTo('run');

    if (!profile.tutorialDone) {
      setTutorial({
        id: 'tap-to-dig',
        text: t('Tap a glowing block to dig. The miner walks there and swings.'),
        anchor: 'grid',
      });
    }
  }

  function estimatedImpactDelay(result: DigResult): number {
    const walk = result.steps.length * 110;
    return walk + 160;
  }

  function playSoundsFor(result: DigResult): void {
    const impact = estimatedImpactDelay(result);
    const terrainBlock = result.removed.find((entry) => entry.source === 'dig');
    const oreInChain = result.removed.some(
      (entry) => entry.source === 'chain' && (entry.kind === BlockKind.Gold || entry.kind === BlockKind.Copper),
    );

    // Initial impact: pitch tracks the tapped block's hardness so stone reads
    // as a thud and dirt as a soft scrape, without burning an extra voice.
    const initialIntensity = terrainBlock
      ? terrainBlock.kind === BlockKind.Stone
        ? 0.7
        : terrainBlock.kind === BlockKind.Gold
          ? 0.85
          : 0.4
      : 0.6;
    setTimeout(() => {
      audio.play(terrainBlock ? 'dig' : 'break', initialIntensity);
    }, impact);

    const chainBlocks = result.removed.filter((entry) => entry.source === 'chain');
    if (chainBlocks.length > 0) {
      const waves = Math.max(...chainBlocks.map((entry) => entry.wave));
      for (let wave = 1; wave <= waves; wave++) {
        const waveIntensity = Math.min(1, 0.4 + wave * 0.18);
        setTimeout(() => {
          audio.play('explode', waveIntensity);
          vibrate(Math.min(60, 18 + wave * 7));
        }, impact + 90 + wave * 90);
      }
      setTimeout(() => {
        audio.play('cash', Math.min(1, chainBlocks.length / 12));
        if (chainBlocks.length >= 6) {
          // Triumphant overtone for big payouts.
          setTimeout(() => audio.play('cash', 1), 60);
          setTimeout(() => audio.play('cash', 0.9), 130);
          if (oreInChain) setTimeout(() => audio.play('chest', 0.5), 200);
        }
      }, impact + 120 + waves * 90);
    }

    if (result.durabilityRepaired > 0) {
      setTimeout(() => audio.play('repair'), impact + 60);
    }

    if (result.fellDistance >= 2) {
      setTimeout(() => audio.play('fall', Math.min(1, result.fellDistance / 12)), impact + 120);
      setTimeout(() => {
        audio.play('land');
        vibrate(30);
      }, impact + 120 + Math.min(450, result.fellDistance * 50));
    }
  }

  function dig(col: number, row: number): void {
    if (!run || run.status !== 'running') return;

    const result = applyDig(run, col, row);
    if (!result.ok) {
      switch (result.reason) {
        case 'indestructible':
          hint(t('Bedrock — the pick cannot bite'));
          break;
        case 'unreachable':
          hint(t('The miner cannot reach that yet'));
          break;
        case 'no_durability':
          hint(t('No durability left'));
          break;
        default:
          break;
      }
      analytics.track('error', { reason: result.reason ?? 'unknown', col, row });
      return;
    }

    if (!firstInputTracked) {
      firstInputTracked = true;
      analytics.track('first_input', { col, row, depth: run.depth });
    }

    analytics.track('block_mined', {
      col,
      row,
      cost: result.cost,
      cash: result.cashGained,
      removed: result.removed.length,
      durability: run.durability,
      depth: run.depth,
    });
    if (result.removed.length > 1) {
      analytics.track('chain_triggered', {
        col,
        row,
        cleared: result.removed.length - 1,
        waves: Math.max(...result.removed.map((entry) => entry.wave)),
        cash: result.cashGained,
      });
    }

    const cleared = result.removed.length;
    if (cleared >= 6) {
      banner = t('CHAIN x{n}!', { n: cleared });
      bannerTimer = 1.4;
    }

    playSoundsFor(result);
    renderer.playDig(result, run);
    pushHud();

    if (!profile.tutorialDone) {
      if (tutorial?.id === 'tap-to-dig') {
        setTutorial({
          id: 'fall-and-chain',
          text: t('Blast crates chain for free, and long drops cost nothing. Use them.'),
          anchor: 'hud',
        });
      } else if (tutorial?.id === 'fall-and-chain' && run.durability < run.maxDurability * 0.35) {
        setTutorial({
          id: 'repair',
          text: t('Running low? Green supply crates restore durability.'),
          anchor: 'hud',
        });
      } else if (tutorial?.id === 'repair') {
        profile.tutorialDone = true;
        save();
        setTutorial(null);
      }
    }

    if (run.status !== 'running') {
      resultTimer = RESULT_DELAY_MS / 1000;
      pendingResult = buildResult(run);
    } else {
      pushTargets();
    }
  }

  function buildResult(state: RunState): ResultView {
    const won = state.status === 'won';
    const settlement = settleRun({
      cashCollected: state.cash,
      cashMultiplier: state.level.cashMultiplier,
      won,
      winBonus: state.level.winBonus,
      depth: state.depth,
      targetDepth: state.level.targetDepth,
    });

    const previousClears = profile.levels[state.level.id]?.clears ?? 0;
    const outcome = recordRunResult(profile, {
      levelId: state.level.id,
      won,
      depth: state.depth,
      cashCollected: state.cash,
      stats: state.stats,
      total: settlement.total,
    });

    if (outcome.rewardTier) profile.pendingChests.push(outcome.rewardTier);
    save();

    analytics.setContext({});
    analytics.track('run_end', {
      status: state.status,
      reason: state.endReason,
      depth: state.depth,
      targetDepth: state.level.targetDepth,
      cash: settlement.total,
      taps: state.commands.length,
      chains: state.stats.chainsTriggered,
      longestFall: state.stats.longestFall,
    });

    return {
      won,
      reason: state.endReason ?? 'durability',
      levelName: t(state.level.name),
      depth: state.depth,
      targetDepth: state.level.targetDepth,
      cashCollected: state.cash,
      settlement,
      rewardTier: outcome.rewardTier,
      pendingChests: [...profile.pendingChests],
      stats: { ...state.stats },
      unlockedLevelName: previousClears === 0 && outcome.firstClear ? outcome.unlockedLevelName : null,
    };
  }

  function showResult(): void {
    if (!pendingResult || !run) return;
    audio.play(run.status === 'won' ? 'win' : 'lose');
    if (run.status === 'won') vibrate([20, 60, 20, 60, 40]);
    ui.renderResult(pendingResult);
    renderer.setState(null);
    goTo('result');
    if (!profile.tutorialDone) {
      setTutorial({
        id: 'result',
        text: t('Cash buys pickaxe upgrades and crates. Crates hold cards.'),
        anchor: 'result',
      });
    }
  }

  // -------------------------------------------------------------- interaction

  function tapAt(clientX: number, clientY: number): void {
    audio.unlock();
    if (screen !== 'run' || !run) return;
    const cell = renderer.pickCell(clientX, clientY);
    if (!cell) return;

    const targets = getLegalTargets(run);
    const match = targets.find((target) => target.col === cell.col && target.row === cell.row);
    if (!match) {
      const kind = run.grid.kindAt(cell.col, cell.row);
      if (kind === BlockKind.Empty) return;
      hint(kind === BlockKind.Bedrock ? t('Bedrock — the pick cannot bite') : t('The miner cannot reach that yet'));
      return;
    }

    if (renderer.isBusy()) {
      queuedTap = cell;
      return;
    }
    dig(cell.col, cell.row);
  }

  function hoverAt(clientX: number, clientY: number): void {
    if (screen !== 'run' || !run) {
      renderer.setHover(null);
      return;
    }
    renderer.setHover(renderer.pickCell(clientX, clientY));
  }

  // ------------------------------------------------------------- ui handlers

  const handlers: UIHandlers = {
    goToLevels(): void {
      audio.unlock();
      audio.play('ui');
      goToLevels();
    },
    selectLevel(levelId: string): void {
      audio.play('ui');
      if (!isLevelUnlocked(profile, levelById(levelId).index)) {
        ui.toast(t('Clear the previous dig first'));
        return;
      }
      goToDraft(levelId);
    },
    toggleCard(cardId: string): void {
      audio.play('ui');
      const owned = (profile.cards[cardId]?.count ?? 0) > 0;
      if (!owned) {
        ui.toast(t('Find this card in a crate'));
        return;
      }
      const index = selectedCardIds.indexOf(cardId);
      if (index >= 0) {
        selectedCardIds.splice(index, 1);
      } else if (selectedCardIds.length < MAX_CARDS_PER_RUN) {
        selectedCardIds.push(cardId);
      } else {
        ui.toast(t('Only {n} cards per dig', { n: MAX_CARDS_PER_RUN }));
        return;
      }
      renderDraft();
    },
    beginRun(): void {
      audio.unlock();
      audio.play('ui');
      beginRun();
    },
    quitRun(): void {
      audio.play('ui');
      run = null;
      pendingResult = null;
      resultTimer = 0;
      renderer.setState(null);
      goToLevels();
    },
    claimResult(): void {
      audio.play('ui');
      if (pendingResult?.rewardTier) profile.pendingChests.push(pendingResult.rewardTier);
      pendingResult = null;
      save();
      if (draftLevelId) goToDraft(draftLevelId);
      else goToLevels();
    },
    goToShop(): void {
      audio.play('ui');
      goToShop();
    },
    buyPickaxe(): void {
      if (profile.pickaxeLevel >= PICKAXE_MAX_LEVEL) {
        ui.toast(t('Pickaxe is maxed'));
        return;
      }
      if (!buyPickaxe(profile)) {
        ui.toast(t('Not enough cash'));
        audio.play('error');
        return;
      }
      audio.play('chest');
      analytics.track('upgrade_buy', { level: profile.pickaxeLevel, kind: 'pickaxe' });
      save();
      goToShop();
    },
    buyChest(tier: ChestTier): void {
      if (!buyChest(profile, tier)) {
        ui.toast(t('Not enough cash'));
        audio.play('error');
        return;
      }
      audio.play('chest');
      analytics.track('upgrade_buy', { kind: 'chest', tier });
      save();
      goToShop();
    },
    openPendingChest(tier: ChestTier): void {
      if (!takePendingChest(profile, tier)) {
        ui.toast(t('No crate to open'));
        return;
      }
      const reward = openChest(profile, tier, createRng((now() ^ profile.stats.chestsOpened) >>> 0));
      audio.play('chest');
      vibrate([12, 40, 12]);
      analytics.track('chest_open', { tier, cash: reward.cash, cards: reward.cards.map((card) => card.id) });
      save();
      announceReward(reward);
      goToShop();
    },
    goToTitle(): void {
      audio.play('ui');
      goTo('title');
    },
    goToSettings(): void {
      audio.play('ui');
      goToSettings();
    },
    setMuted(muted: boolean): void {
      profile.settings.muted = muted;
      audio.setMuted(muted);
      save();
      goToSettings();
    },
    setReducedMotion(value: boolean): void {
      profile.settings.reducedMotion = value;
      renderer.setReducedMotion(value);
      save();
      goToSettings();
    },
    setHaptics(value: boolean): void {
      profile.settings.haptics = value;
      save();
      goToSettings();
    },
    setLang(lang: Lang): void {
      profile.settings.lang = lang;
      setI18nLang(lang);
      if (typeof document !== 'undefined') document.title = gameName();
      save();
      // Static chrome (headings, buttons) is built once per UI instance, so a
      // language switch rebuilds the whole UI and re-renders the open screen.
      if (deps.rebuildUI) {
        ui.dispose();
        ui = deps.rebuildUI();
      }
      refreshScreen();
    },
    resetSave(): void {
      storage.clear();
      profile = createProfile();
      save();
      audio.setMuted(profile.settings.muted);
      renderer.setReducedMotion(profile.settings.reducedMotion);
      ui.toast(t('Save reset'));
      goTo('title');
    },
    dismissTutorial(): void {
      profile.tutorialDone = true;
      save();
      setTutorial(null);
    },
  };

  /** Re-render whichever screen is open (after a UI rebuild). */
  function refreshScreen(): void {
    switch (screen) {
      case 'title':
        goTo('title');
        break;
      case 'levels':
        goToLevels();
        break;
      case 'draft':
        if (draftLevelId) goToDraft(draftLevelId);
        break;
      case 'run':
        if (run) {
          renderer.setState(run);
          pushTargets();
          pushHud();
        }
        goTo('run');
        break;
      case 'result':
        if (pendingResult) {
          ui.renderResult(pendingResult);
          goTo('result');
        }
        break;
      case 'shop':
        goToShop();
        break;
      case 'settings':
        goToSettings();
        break;
    }
  }

  function announceReward(reward: ChestReward): void {
    const names = reward.cards
      .map((card) => {
        const name = t(card.name);
        return card.duplicates ? `${name}（${t('max')}）` : `${name} L${card.level}`;
      })
      .join(', ');
    ui.toast(t('+{n} cash', { n: reward.cash }) + (names ? ` · ${names}` : ''));
  }

  // ------------------------------------------------------------------- frame

  function frame(dt: number): void {
    if (bannerTimer > 0) {
      bannerTimer -= dt;
      if (bannerTimer <= 0) {
        banner = null;
        pushHud();
      }
    }

    if (resultTimer > 0) {
      resultTimer -= dt;
      if (resultTimer <= 0 && !renderer.isBusy()) {
        showResult();
      } else if (resultTimer <= -2) {
        showResult();
      }
    }

    if (screen === 'run' && run && run.status === 'running' && queuedTap && !renderer.isBusy()) {
      const cell: Cell = queuedTap;
      queuedTap = null;
      dig(cell.col, cell.row);
    }
  }

  // -------------------------------------------------------------------- boot

  function boot(): void {
    const loaded = storage.load();
    profile = loaded.profile;

    if (loaded.status === 'recovered') ui.toast(t('Save restored from backup'));
    if (loaded.status === 'corrupt') ui.toast(t('Save could not be read — starting fresh'));
    if (!storage.persistent) ui.toast(t('Storage unavailable: progress is session-only'));

    if (profile.stats.runs === 0 && Object.keys(profile.cards).length === 0) {
      grantStarterCard(profile, createRng(now() >>> 0));
      save();
    }

    audio.setMuted(profile.settings.muted);
    renderer.setReducedMotion(profile.settings.reducedMotion);
    setI18nLang(profile.settings.lang);
    if (typeof document !== 'undefined') document.title = gameName();
    goTo('title');
  }

  return {
    boot,
    frame,
    tapAt,
    hoverAt,
    handlers,
    getProfile: () => profile,
    getRun: () => run,
    digCell,
  };

  /** Drive a real dig through the app path — used by automation/iteration bots. */
  function digCell(col: number, row: number): void {
    dig(col, row);
  }
}

/** Cost preview shared by the HUD and the highlight layer. */
export function previewCost(state: RunState, target: TargetInfo): number {
  return blockCost(target.kind, state.mods);
}
