/**
 * Replay codec.
 *
 * A run is fully described by seed + level + build + the ordered list of taps,
 * so bugs can be reproduced from a short string instead of a screen recording.
 * The devtools panel and tests both use this encoding.
 */

import { levelById } from '../config/levels.ts';
import { replayCommands } from '../core/run.ts';
import type { OwnedCard } from '../core/modifiers.ts';
import type { RunState } from '../core/types.ts';

export interface ReplaySpec {
  seed: number;
  levelId: string;
  cards: OwnedCard[];
  pickaxeLevel: number;
  commands: { col: number; row: number }[];
}

const BASE36 = 36;

/** Encode as `v1.<seed36>.<levelId>.<pick36>.<cards>.<moves>` — compact and URL safe. */
export function encodeReplay(spec: ReplaySpec): string {
  const cards = spec.cards.map((card) => `${card.id}~${card.level}`).join(',');
  const moves = spec.commands.map((command) => `${command.col.toString(BASE36)}${command.row.toString(BASE36)}`).join('');
  return ['v1', spec.seed.toString(BASE36), spec.levelId, spec.pickaxeLevel.toString(BASE36), cards, moves].join('.');
}

export function decodeReplay(code: string): ReplaySpec | null {
  const parts = code.split('.');
  if (parts.length < 6 || parts[0] !== 'v1') return null;
  const [, seedText, levelId, pickText, cardsText, moves] = parts;

  const seed = parseInt(seedText, BASE36);
  const pickaxeLevel = parseInt(pickText, BASE36);
  if (!Number.isFinite(seed) || !Number.isFinite(pickaxeLevel)) return null;

  let level;
  try {
    level = levelById(levelId);
  } catch {
    return null;
  }

  const cards: OwnedCard[] = cardsText
    ? cardsText.split(',').map((entry) => {
        const [id, levelText] = entry.split('~');
        return { id, level: Number.parseInt(levelText ?? '1', 10) || 1 };
      })
    : [];

  const commands: { col: number; row: number }[] = [];
  for (let i = 0; i + 1 < moves.length; i += 2) {
    const col = parseInt(moves[i], BASE36);
    const row = parseInt(moves[i + 1], BASE36);
    if (!Number.isFinite(col) || !Number.isFinite(row)) return null;
    commands.push({ col, row });
  }

  return { seed, levelId: level.id, cards, pickaxeLevel, commands };
}

/** Replay a run from its final state; used by regression tests. */
export function replayFrom(state: RunState): RunState {
  return replayCommands(
    {
      seed: state.seed,
      level: state.level,
      cards: [],
      pickaxeLevel: state.mods.startDurability > 0 ? 1 : 1,
      configVersion: state.configVersion,
    },
    state.commands,
  );
}

export function encodeRun(state: RunState, cards: OwnedCard[], pickaxeLevel: number): string {
  return encodeReplay({
    seed: state.seed,
    levelId: state.level.id,
    cards,
    pickaxeLevel,
    commands: state.commands,
  });
}
