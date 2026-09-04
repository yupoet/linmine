import {
  BoxGeometry,
  type BufferGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  type Material,
  SphereGeometry,
} from 'three';
import { CUBE_SIZE, PLAYER_Z, feetY, worldX } from './constants.ts';

export type MinerMotion = 'idle' | 'walk' | 'fall';

const SHIRT = 0xe0574a;
const TROUSERS = 0x2f4a7a;
const SKIN = 0xf0c193;
const HELMET = 0xffc93c;
const LAMP = 0xfff6c8;
const STEEL = 0x8d949e;
const WOOD = 0x8a5a3b;

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
 * Low-poly miner assembled from boxes, posed entirely by time accumulators.
 *
 * Hierarchy:
 *   group  -> world position of the feet
 *     tilt -> lean into the direction of travel
 *       body   -> squash & stretch (landing, falling)
 *         body / head / helmet / lamp / armL / armR(+pickaxe) / legL / legR
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
  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: Material[] = [];

  private facing = 1;
  private motion: MinerMotion = 'idle';
  private time = 0;
  private walkPhase = 0;
  private swingT = -1;
  private swingDur = 0.16;
  private landT = -1;
  private landStrength = 1;

  constructor() {
    this.group.add(this.tilt);
    this.tilt.add(this.body);

    const torso = this.box(0.4, 0.34, 0.26, SHIRT, 0, 0.39, 0);
    this.body.add(torso);
    const hips = this.box(0.36, 0.12, 0.24, TROUSERS, 0, 0.24, 0);
    this.body.add(hips);

    const head = this.box(0.28, 0.26, 0.26, SKIN, 0, 0.69, 0);
    this.body.add(head);
    const helmet = this.box(0.34, 0.13, 0.32, HELMET, 0, 0.86, 0);
    this.body.add(helmet);

    const lampGeo = new SphereGeometry(0.055, 8, 6);
    const lampMaterial = new MeshBasicMaterial({ color: LAMP });
    this.geometries.push(lampGeo);
    this.materials.push(lampMaterial);
    const lamp = new Mesh(lampGeo, lampMaterial);
    lamp.position.set(0, 0.79, 0.15);
    this.body.add(lamp);

    // Limbs pivot at the shoulder / hip; the mesh hangs below the pivot.
    this.buildLimb(this.armLeft, -0.25, 0.52, 0.11, 0.3, 0.13, SKIN);
    this.buildLimb(this.armRight, 0.25, 0.52, 0.11, 0.3, 0.13, SKIN);
    this.buildLimb(this.legLeft, -0.1, 0.24, 0.13, 0.24, 0.15, TROUSERS);
    this.buildLimb(this.legRight, 0.1, 0.24, 0.13, 0.24, 0.15, TROUSERS);
    this.body.add(this.armLeft, this.armRight, this.legLeft, this.legRight);

    // Pickaxe, held in the right hand.
    const handle = this.box(0.05, 0.46, 0.05, WOOD, 0, -0.34, 0.02);
    const pickHead = this.box(0.3, 0.09, 0.09, STEEL, 0, -0.56, 0.02);
    this.armRight.add(handle, pickHead);
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
    if (next === this.facing) return;
    this.facing = next;
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
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.geometries.length = 0;
    this.materials.length = 0;
  }

  private buildLimb(
    pivot: Group,
    x: number,
    y: number,
    width: number,
    height: number,
    depth: number,
    color: number,
  ): void {
    pivot.position.set(x, y, 0);
    const mesh = this.box(width, height, depth, color, 0, -height / 2, 0);
    pivot.add(mesh);
  }

  private box(width: number, height: number, depth: number, color: number, x: number, y: number, z: number): Mesh {
    const geometry = new BoxGeometry(width * CUBE_SIZE, height * CUBE_SIZE, depth * CUBE_SIZE);
    const material = new MeshLambertMaterial({ color });
    this.geometries.push(geometry);
    this.materials.push(material);
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, z);
    return mesh;
  }
}
