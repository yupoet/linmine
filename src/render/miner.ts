import { Group } from 'three';
import { PLAYER_Z, feetY, worldX } from './constants.ts';
import { buildParts, type MinerParts, type PartSlot } from './minerParts.ts';
import { DEFAULT_CHARACTER, type CharacterId } from '../config/characters.ts';
import type { RenderTheme } from './themes/types.ts';

export type MinerMotion = 'idle' | 'walk' | 'fall';

/** One full leg/arm cycle per walked cell (0.1 s) feels right at this scale. */
const WALK_CYCLE = Math.PI * 2 / 0.1;
const LAND_TIME = 0.22;

/** Pickaxe keyframes, as arm-pivot rotation about z (radians). */
const ARM_REST = 0.15;
const ARM_RAISE = 2.1;
const ARM_STRIKE = -0.8;
const SWING_RAISE_END = 0.42;
const SWING_IMPACT = 0.72;

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

function easeIn(t: number): number {
  return t * t * t;
}

/**
 * The miner rig: a hierarchy of pivots posed entirely by time accumulators.
 *
 * The shapes hanging off the pivots come from `minerParts.ts` — classic boxes
 * for ember, chibi spheres and capsules for candy — so this animation code is
 * identical for every skin, and so are the frames at which the dig sequencer
 * fires `onWave` / `onLand`.
 *
 * Hierarchy:
 *   group  -> world position of the feet
 *     tilt -> lean into the direction of travel
 *       body   -> squash & stretch (landing, falling)
 *         armL / armR(+pickaxe) / legL / legR, plus the skin's body parts
 *
 * Facing is a yaw flip on the root, so every local pose (lean, swing, limb
 * swing) is written once and mirrors itself.
 */
export class Miner {
  readonly group = new Group();
  private readonly tilt = new Group();
  private readonly body = new Group();
  private readonly armLeft = new Group();
  private readonly armRight = new Group();
  private readonly legLeft = new Group();
  private readonly legRight = new Group();
  private readonly parts: MinerParts;

  private direction = 1;
  private motion: MinerMotion = 'idle';
  private time = 0;
  private walkPhase = 0;
  private swingT = -1;
  private swingDur = 0.16;
  private landT = -1;
  private landStrength = 1;

  constructor(theme: RenderTheme, character: CharacterId = DEFAULT_CHARACTER) {
    this.group.add(this.tilt);
    this.tilt.add(this.body);

    this.parts = buildParts(theme.miner.variant, theme, character);
    const { armX, armY, legX, legY } = this.parts.pivots;
    this.armLeft.position.set(-armX, armY, 0);
    this.armRight.position.set(armX, armY, 0);
    this.legLeft.position.set(-legX, legY, 0);
    this.legRight.position.set(legX, legY, 0);

    // Torso before limbs, matching the order the parts are listed in. Sibling
    // order breaks ties in three.js's opaque sort, so it is part of the look.
    for (const part of this.parts.parts) if (part.slot === 'body') this.body.add(part.mesh);
    this.body.add(this.armLeft, this.armRight, this.legLeft, this.legRight);
    for (const part of this.parts.parts) if (part.slot !== 'body') this.groupFor(part.slot).add(part.mesh);
  }

  private groupFor(slot: PartSlot): Group {
    if (slot === 'armLeft') return this.armLeft;
    if (slot === 'armRight') return this.armRight;
    if (slot === 'legLeft') return this.legLeft;
    if (slot === 'legRight') return this.legRight;
    return this.body;
  }

  /** +1 when facing right, -1 when facing left. */
  get facing(): number {
    return this.direction;
  }

  /** Idle-breathing clock, in seconds. */
  get clock(): number {
    return this.time;
  }

  /** Walk cycle phase, in radians. */
  get stride(): number {
    return this.walkPhase;
  }

  /**
   * Adopt another miner's animation phase.
   *
   * A skin swap builds a fresh rig; without this the idle bob and the walk
   * cycle would restart from zero and the miner would visibly twitch at the
   * moment the player changes skin.
   */
  syncClock(time: number, walkPhase: number): void {
    this.time = time;
    this.walkPhase = walkPhase;
  }

  setVisible(value: boolean): void {
    this.group.visible = value;
  }

  /** Feet position in world space. */
  setPosition(x: number, y: number): void {
    this.group.position.set(x, y, PLAYER_Z);
  }

  setCell(col: number, row: number, width: number): void {
    this.setPosition(worldX(col, width), feetY(row));
  }

  /** +1 faces right, -1 faces left; 0 keeps the current facing. */
  setFacing(direction: number): void {
    if (direction === 0) return;
    const next = direction > 0 ? 1 : -1;
    if (next === this.direction) return;
    this.direction = next;
    this.group.rotation.y = next > 0 ? 0 : Math.PI;
  }

  setMotion(motion: MinerMotion): void {
    if (motion === this.motion) return;
    this.motion = motion;
    if (motion === 'walk') this.walkPhase = 0;
    if (motion === 'fall') this.armLeft.rotation.z = -0.9;
  }

  startSwing(duration: number): void {
    this.swingT = 0;
    this.swingDur = Math.max(0.05, duration);
  }

  /** Squash-and-stretch pulse, e.g. after a landing. */
  squash(strength: number): void {
    this.landT = 0;
    this.landStrength = strength;
  }

  update(dt: number): void {
    this.time += dt;

    if (this.swingT >= 0) {
      this.swingT += dt / this.swingDur;
      if (this.swingT >= 1) this.swingT = -1;
    }
    if (this.landT >= 0) {
      this.landT += dt / LAND_TIME;
      if (this.landT >= 1) this.landT = -1;
    }

    let bob = 0;
    let lean = 0;
    let armSwing = 0;
    let legSwing = 0;
    let stretchY = 1;
    let stretchX = 1;

    if (this.motion === 'walk') {
      this.walkPhase += dt * WALK_CYCLE;
      bob = Math.abs(Math.sin(this.walkPhase)) * 0.05;
      legSwing = Math.sin(this.walkPhase) * 0.55;
      armSwing = -Math.sin(this.walkPhase) * 0.4;
      lean = -0.16;
    } else if (this.motion === 'fall') {
      // Slight stretch sells the acceleration; arms fly up.
      stretchY = 1.14;
      stretchX = 0.92;
      armSwing = -1.1;
      legSwing = 0.3;
      lean = 0.12;
    } else {
      bob = Math.sin(this.time * 2.4) * 0.02;
      armSwing = Math.sin(this.time * 2.4) * 0.07;
    }

    if (this.swingT >= 0) {
      const t = this.swingT;
      let angle = ARM_REST;
      let swingLean = 0;
      if (t < SWING_RAISE_END) {
        angle = ARM_REST + (ARM_RAISE - ARM_REST) * easeOut(t / SWING_RAISE_END);
        swingLean = 0.16 * (t / SWING_RAISE_END);
      } else if (t < SWING_IMPACT) {
        const k = easeIn((t - SWING_RAISE_END) / (SWING_IMPACT - SWING_RAISE_END));
        angle = ARM_RAISE + (ARM_STRIKE - ARM_RAISE) * k;
        swingLean = 0.16 - 0.5 * k;
      } else {
        const k = (t - SWING_IMPACT) / (1 - SWING_IMPACT);
        angle = ARM_STRIKE + (ARM_REST - ARM_STRIKE) * k;
        swingLean = -0.34 * (1 - k);
      }
      this.armRight.rotation.z = angle;
      this.armLeft.rotation.z = angle * 0.25;
      lean += swingLean;
      legSwing = 0;
    } else if (this.motion !== 'fall') {
      this.armRight.rotation.z = armSwing;
      this.armLeft.rotation.z = -armSwing;
    } else {
      this.armLeft.rotation.z = -0.9;
    }

    this.legLeft.rotation.z = legSwing;
    this.legRight.rotation.z = -legSwing;

    let squashY = 1;
    let squashX = 1;
    if (this.landT >= 0) {
      const pulse = Math.sin(this.landT * Math.PI) * this.landStrength;
      squashY = 1 - 0.32 * pulse;
      squashX = 1 + 0.26 * pulse;
    }

    this.body.position.y = bob;
    this.body.scale.set(stretchX * squashX, stretchY * squashY, stretchX * squashX);
    this.tilt.rotation.z = lean;
  }

  dispose(): void {
    this.parts.dispose();
  }
}
