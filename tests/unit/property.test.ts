/**
 * Property and batch tests (plan 7.1): arbitrary legal commands must always
 * leave the run in a legal state, and identical seeds must produce identical
 * runs. This is the guard rail for balance changes.
 */

import { describe, expect, it } from 'vitest';
import { BlockKind } from '../../src/config/blocks.ts';
import { LEVELS } from '../../src/config/levels.ts';
import { CONFIG_VERSION } from '../../src/config/version.ts';
import { applyDig, createRun, getLegalTargets } from '../../src/core/run.ts';
import { createRng, type RngState } from '../../src/core/rng.ts';
import { isStandable } from '../../src/core/pathfind.ts';
import { replayCommands } from '../../src/core/run.ts';
import { simulateRun } from '../../src/devtools/simulate.ts';
import type { RunState } from '../../src/core/types.ts';

interface InvariantFailure {
  seed: number;
  reason: string;
}

function checkInvariants(state: RunState): string | null {
  if (!Number.isFinite(state.cash) || state.cash < 0) return `cash out of range: ${state.cash}`;
  if (state.durability < 0) return `negative durability: ${state.durability}`;
  if (!Number.isInteger(state.durability)) return `fractional durability: ${state.durability}`;
  if (state.depth < 0 || !Number.isFinite(state.depth)) return `bad depth: ${state.depth}`;
  if (state.player.row < 0 || state.player.col < 0 || state.player.col >= state.grid.width) {
    return `player out of bounds: ${state.player.col},${state.player.row}`;
  }
  if (state.status !== 'running' && state.endReason === null) return 'ended without a reason';
  if (state.status === 'running') {
    if (!isStandable(state.grid, state.player.col, state.player.row)) {
      return `miner is not standing on solid ground at ${state.player.col},${state.player.row}`;
    }
    if (state.durability <= 0) return 'run continues with no durability';
  }
  return null;
}

/** Play random legal moves and assert the state stays legal after every tap. */
function randomWalk(seed: number, taps: number): InvariantFailure | null {
  const level = LEVELS[seed % LEVELS.length];
  const state = createRun({ seed, level, cards: [], pickaxeLevel: 1, configVersion: CONFIG_VERSION });
  const rng: RngState = createRng(seed ^ 0xabcdef);

  for (let i = 0; i < taps; i++) {
    const targets = getLegalTargets(state);
    if (state.status !== 'running') break;
    if (targets.length === 0) return { seed, reason: 'no legal targets while running' };

    const target = targets[Math.floor(nextFloat(rng) * targets.length)];
    applyDig(state, target.col, target.row);

    const problem = checkInvariants(state);
    if (problem) return { seed, reason: problem };
  }
  return null;
}

function nextFloat(rng: RngState): number {
  // small local helper so the walk stays deterministic and readable
  return (rng.s = (rng.s + 0x6d2b79f5) >>> 0) / 4294967296 % 1;
}

describe('invariants across random play', () => {
  it('keeps every run legal over 400 random walks', () => {
    const failures: InvariantFailure[] = [];
    for (let seed = 0; seed < 400; seed++) {
      const failure = randomWalk(seed, 120);
      if (failure) failures.push(failure);
    }
    expect(failures).toEqual([]);
  });

  it('reproduces the same run from the same seed and commands', () => {
    for (let seed = 0; seed < 40; seed++) {
      const level = LEVELS[seed % LEVELS.length];
      const first = createRun({ seed, level, cards: [], pickaxeLevel: 1 });
      const rng: RngState = createRng(seed + 5);
      const commands: { col: number; row: number }[] = [];

      for (let i = 0; i < 60 && first.status === 'running'; i++) {
        const targets = getLegalTargets(first);
        if (targets.length === 0) break;
        const target = targets[Math.floor(nextFloat(rng) * targets.length)];
        commands.push({ col: target.col, row: target.row });
        applyDig(first, target.col, target.row);
      }

      const replayed = replayCommands({ seed, level, cards: [], pickaxeLevel: 1 }, commands);
      expect(replayed.cash).toBe(first.cash);
      expect(replayed.depth).toBe(first.depth);
      expect(replayed.durability).toBe(first.durability);
      expect(replayed.status).toBe(first.status);
      expect(replayed.player).toEqual(first.player);
    }
  });

  it('never generates a level the miner cannot descend', () => {
    for (let seed = 0; seed < 120; seed++) {
      const level = LEVELS[seed % LEVELS.length];
      const state = createRun({ seed, level, cards: [], pickaxeLevel: 1 });
      let diggable = 0;
      for (let col = 0; col < state.grid.width; col++) {
        if (state.grid.kindAt(col, 1) !== BlockKind.Bedrock) diggable++;
      }
      expect(diggable).toBeGreaterThan(0);
    }
  });
});

describe('batch balance', () => {
  it('keeps win rates in a playable band for every level', () => {
    for (const level of LEVELS) {
      let wins = 0;
      let totalCash = 0;
      const runs = 60;
      for (let i = 0; i < runs; i++) {
        const result = simulateRun({ seed: 5000 + i, level });
        if (result.won) wins++;
        totalCash += result.cash;
        expect(result.depth).toBeGreaterThan(0);
        expect(Number.isFinite(result.cash)).toBe(true);
      }
      const winRate = wins / runs;
      // Skilled bot, no cards, level 1 pickaxe: hard but not hopeless.
      expect(winRate).toBeGreaterThan(0.2);
      expect(winRate).toBeLessThan(0.98);
      expect(totalCash / runs).toBeGreaterThan(100);
    }
  });

  it('rewards the pickaxe line with more depth', () => {
    const level = LEVELS[0];
    let weak = 0;
    let strong = 0;
    for (let i = 0; i < 60; i++) {
      if (simulateRun({ seed: 900 + i, level, pickaxeLevel: 1 }).won) weak++;
      if (simulateRun({ seed: 900 + i, level, pickaxeLevel: 10 }).won) strong++;
    }
    expect(strong).toBeGreaterThan(weak);
  });

  it('rewards cards with more cash', () => {
    const level = LEVELS[0];
    let plain = 0;
    let boosted = 0;
    for (let i = 0; i < 60; i++) {
      plain += simulateRun({ seed: 1300 + i, level }).cash;
      boosted += simulateRun({ seed: 1300 + i, level, cards: [{ id: 'appraiser', level: 5 }] }).cash;
    }
    expect(boosted).toBeGreaterThan(plain);
  });

  it('never ends a run without a terminal reason', () => {
    for (let i = 0; i < 120; i++) {
      const result = simulateRun({ seed: 7000 + i, level: LEVELS[i % LEVELS.length] });
      expect(['exit', 'durability', 'stuck', 'unfinished']).toContain(result.reason);
      expect(result.reason).not.toBe('unfinished');
    }
  });

  it('keeps the stuck rate negligible', () => {
    let stuck = 0;
    const runs = 200;
    for (let i = 0; i < runs; i++) {
      const result = simulateRun({ seed: 8000 + i, level: LEVELS[i % LEVELS.length] });
      if (result.reason === 'stuck') stuck++;
    }
    expect(stuck / runs).toBeLessThan(0.05);
  });
});
