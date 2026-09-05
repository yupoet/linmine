/**
 * Shared contracts between app, render and ui.
 *
 * This file is owned by the app layer. The renderer and the UI may IMPORT from
 * it but must NOT modify it — if either side needs a different shape, say so
 * instead of editing it.
 *
 * Dependency direction (plan 5.1): render/ui/platform -> app -> core/config.
 */

import type { ChestTier, Settlement } from '../config/economy.ts';
import type { TargetInfo } from '../core/run.ts';
import type { Cell, DigResult, RunState, RunStats } from '../core/types.ts';

export type ScreenId = 'title' | 'levels' | 'draft' | 'run' | 'result' | 'shop' | 'settings';

export interface LevelView {
  id: string;
  name: string;
  blurb: string;
  targetDepth: number;
  unlocked: boolean;
  cleared: boolean;
  bestDepth: number;
  plays: number;
  clears: number;
}

export interface CardView {
  id: string;
  name: string;
  family: string;
  level: number;
  maxLevel: number;
  description: string;
  owned: boolean;
  selected: boolean;
}

export interface DraftView {
  levelId: string;
  levelName: string;
  targetDepth: number;
  durability: number;
  cards: CardView[];
  selectedIds: string[];
  maxCards: number;
}

export interface HudView {
  durability: number;
  maxDurability: number;
  cash: number;
  depth: number;
  targetDepth: number;
  chains: number;
  levelName: string;
  /** Set briefly after a tap to celebrate big chain payouts. */
  banner: string | null;
}

export interface ResultView {
  won: boolean;
  reason: string;
  levelName: string;
  depth: number;
  targetDepth: number;
  cashCollected: number;
  settlement: Settlement;
  rewardTier: ChestTier | null;
  pendingChests: ChestTier[];
  stats: RunStats;
  /** True when this clear unlocked the next level. */
  unlockedLevelName: string | null;
}

export interface ShopView {
  cash: number;
  pickaxeLevel: number;
  pickaxeMaxLevel: number;
  upgradeCost: number;
  nextDurabilityBonus: number;
  cards: CardView[];
  chests: Record<ChestTier, { name: string; cost: number; cards: number }>;
  pendingChests: ChestTier[];
}

export interface SettingsView {
  muted: boolean;
  reducedMotion: boolean;
  haptics: boolean;
  lang: 'zh' | 'en';
  schemaVersion: number;
  configVersion: string;
}

export interface TutorialStep {
  id: string;
  text: string;
  /** Which part of the screen the hint points at. */
  anchor: 'grid' | 'hud' | 'draft' | 'result' | null;
}

/** Calls the UI makes into the app. */
export interface UIHandlers {
  goToLevels(): void;
  selectLevel(levelId: string): void;
  toggleCard(cardId: string): void;
  beginRun(): void;
  quitRun(): void;
  claimResult(): void;
  goToShop(): void;
  buyPickaxe(): void;
  buyChest(tier: ChestTier): void;
  openPendingChest(tier: ChestTier): void;
  goToTitle(): void;
  goToSettings(): void;
  setMuted(muted: boolean): void;
  setReducedMotion(value: boolean): void;
  setHaptics(value: boolean): void;
  setLang(lang: 'zh' | 'en'): void;
  resetSave(): void;
  dismissTutorial(): void;
}

/** Calls the app makes into the UI. */
export interface UIAPI {
  setScreen(screen: ScreenId): void;
  renderLevels(levels: LevelView[], cash: number, pickaxeLevel: number): void;
  renderDraft(view: DraftView): void;
  renderHud(view: HudView): void;
  renderResult(view: ResultView): void;
  renderShop(view: ShopView): void;
  renderSettings(view: SettingsView): void;
  setTutorial(step: TutorialStep | null): void;
  /** Transient message, e.g. "Not enough cash". */
  toast(message: string): void;
  /** Non-blocking nudge shown on the HUD, e.g. "Unreachable". */
  hint(message: string): void;
  dispose(): void;
}

export interface RendererOptions {
  canvas: HTMLCanvasElement;
  /** Grid columns; comes from the level config. */
  width: number;
}

/**
 * The renderer is a pure view of the run state. It never mutates game state
 * and never decides rules; it only animates what the app pushes into it.
 */
export interface RendererAPI {
  /** Install (or clear) the run being displayed. Resets the camera. */
  setState(state: RunState | null): void;
  /** Animate one resolved dig: walk, swing, break, chain, fall. */
  playDig(result: DigResult, state: RunState): void;
  /** Reachable blocks and their costs; drives the highlight layer. */
  setTargets(targets: readonly TargetInfo[], state: RunState): void;
  /** Tap preview for the cell under the finger/cursor. */
  setHover(cell: Cell | null): void;
  /** Advance animations. dt is seconds, already clamped by the clock. */
  update(dt: number): void;
  render(): void;
  /** Call on resize / orientation change. */
  resize(): void;
  /** Client coordinates -> grid cell, or null when off-grid. */
  pickCell(clientX: number, clientY: number): Cell | null;
  setReducedMotion(value: boolean): void;
  /** True while the miner is busy walking/digging (input is queued). */
  isBusy(): boolean;
  /** Cheap stats for the perf panel. */
  stats(): { fps: number; drawCalls: number; instances: number };
  dispose(): void;
}
