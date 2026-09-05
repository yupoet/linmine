import {
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  PerspectiveCamera,
  Plane,
  PointLight,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { RendererAPI, RendererOptions } from '../app/contracts.ts';
import { BlockKind, BLOCKS } from '../config/blocks.ts';
import type { TargetInfo } from '../core/run.ts';
import type { Cell, DigResult, Removal, RunState } from '../core/types.ts';
import { BlockField, HighlightField } from './blocks.ts';
import {
  CAMERA_CATCHUP_ERROR,
  CAMERA_FOCUS_OFFSET,
  CAMERA_FOV,
  CAMERA_FOV_MAX,
  CAMERA_LERP_K,
  CAMERA_ROWS,
  CAMERA_TILT,
  CHAIN_STAGGER,
  DARK_BY_ROW,
  DEEP_COLOR,
  DIG_BUDGET,
  SETTLE_TIME,
  SKY_COLOR,
  STEP_IN_TIME,
  SWING_IMPACT,
  SWING_TIME,
  WALK_PER_CELL,
  WAVE_GAP,
  damp,
  fallDuration,
  feetY,
  smoothstep,
  worldX,
  worldY,
} from './constants.ts';
import { DomLayer, type PopupTone, type Projector } from './dom.ts';
import { Particles, ScreenShake } from './fx.ts';
import { Miner } from './miner.ts';

const MAX_WAVES = 8;
const MAX_SEGMENTS = 16;
const EMPTY_TARGETS: readonly TargetInfo[] = [];

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * Three.js view of a run. It reads `RunState` and animates what the rules
 * layer already decided; it never mutates state and never calls into the
 * simulation.
 */
class SceneRenderer implements RendererAPI {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: WebGLRenderer;
  private readonly onWave: NonNullable<RendererOptions['onWave']>;
  private readonly onLand: NonNullable<RendererOptions['onLand']>;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(CAMERA_FOV, 1, 0.1, 200);
  private readonly bgColor = new Color(SKY_COLOR);
  private readonly deepColor = new Color(DEEP_COLOR);
  private readonly fog = new Fog(SKY_COLOR, 10, 30);
  private readonly hemi: HemisphereLight;
  private readonly sun: DirectionalLight;
  private readonly lamp = new PointLight(0xffe6a8, 1.2, 6, 1.8);
  private readonly field: BlockField;
  private readonly highlights = new HighlightField();
  private readonly miner = new Miner();
  private readonly particles = new Particles();
  private readonly shake = new ScreenShake();
  private readonly dom = new DomLayer();

  // Reused scratch objects: the update/render path must not allocate.
  private readonly ndc = new Vector2();
  private readonly raycaster = new Raycaster();
  private readonly frontPlane = new Plane(new Vector3(0, 0, -1), 0.5);
  private readonly hitPoint = new Vector3();
  private readonly lookTarget = new Vector3();
  private readonly shakeOffset = new Vector3();
  private readonly tmpColor = new Color();
  private readonly project: Projector;

  private state: RunState | null = null;
  private targets: readonly TargetInfo[] = EMPTY_TARGETS;
  private hover: Cell | null = null;
  private gridWidth: number;
  private reducedMotion = false;
  private contextLost = false;

  private camDist = 15;
  private tiltHeight = 1.5;
  private camX = 0;
  private camY = 0;
  private viewLeft = 0;
  private viewTop = 0;
  private viewWidth = 1;
  private viewHeight = 1;

  private minerX = 0;
  private minerY = 0;
  private time = 0;
  private fps = 60;
  private lastDrawCalls = 0;
  private lastInstances = 0;
  private qualityScale = 1;
  private lowFpsStreak = 0;
  private highFpsStreak = 0;

  // --- dig sequencer --------------------------------------------------------
  private playing = false;
  private elapsed = 0;
  private total = 0;
  private segCount = 0;
  private segIndex = 0;
  private readonly segEnd = new Float32Array(MAX_SEGMENTS);
  private readonly segFromX = new Float32Array(MAX_SEGMENTS);
  private readonly segFromY = new Float32Array(MAX_SEGMENTS);
  private readonly segToX = new Float32Array(MAX_SEGMENTS);
  private readonly segToY = new Float32Array(MAX_SEGMENTS);
  private readonly segFall = new Uint8Array(MAX_SEGMENTS);
  private readonly waveAt = new Float32Array(MAX_WAVES);
  private readonly waveDone = new Uint8Array(MAX_WAVES);
  private readonly waveLists: Removal[][] = [];
  private waveCount = 0;
  private tSwing0 = 0;
  private tSwing1 = 0;
  private tStepIn = 0;
  private tFallStart = 0;
  private tFallEnd = 0;
  private swingTime = SWING_TIME;
  private swingStarted = false;
  private landed = false;
  private fallRows = 0;
  private workX = 0;
  private workY = 0;
  private targetX = 0;
  private landingY = 0;

  constructor(options: RendererOptions) {
    this.canvas = options.canvas;
    this.gridWidth = options.width;
    this.onWave = options.onWave ?? (() => undefined);
    this.onLand = options.onLand ?? (() => undefined);

    this.renderer = new WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 1);

    this.scene.background = this.bgColor;
    this.scene.fog = this.fog;

    this.hemi = new HemisphereLight(0xcfe9ff, 0x3a2a1c, 0.95);
    this.sun = new DirectionalLight(0xffffff, 1.15);
    this.sun.position.set(3, 6, 8);
    this.lamp.position.set(0, 0.8, 0.45);
    this.miner.group.add(this.lamp);
    this.scene.add(this.hemi, this.sun, this.miner.group);

    this.field = new BlockField(this.gridWidth);
    this.scene.add(this.field.mesh, this.highlights.mesh, this.particles.mesh);

    for (let i = 0; i < MAX_WAVES; i++) this.waveLists.push([]);

    this.project = (x: number, y: number, z: number, out: Vector3): Vector3 => {
      out.set(x, y, z).project(this.camera);
      out.x = this.viewLeft + (out.x * 0.5 + 0.5) * this.viewWidth;
      out.y = this.viewTop + (-out.y * 0.5 + 0.5) * this.viewHeight;
      return out;
    };

    this.dom.attach(document.body);
    this.miner.setVisible(false);
    this.resize();
    this.snapCamera();

    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', this.onResize);
    this.canvas.addEventListener('webglcontextlost', this.onContextLost);
    this.canvas.addEventListener('webglcontextrestored', this.onContextRestored);
  }

  // --- RendererAPI ----------------------------------------------------------

  setState(state: RunState | null): void {
    const previous = this.state;
    this.state = state;

    if (!state) {
      this.field.reset(this.gridWidth);
      this.highlights.clear();
      this.dom.clear();
      this.particles.clear();
      this.shake.reset();
      this.miner.setVisible(false);
      this.playing = false;
      this.targets = EMPTY_TARGETS;
      this.hover = null;
      return;
    }

    this.gridWidth = state.grid.width;
    this.miner.setVisible(true);

    // Re-arm only for a genuinely new run: the app may hand us a fresh state
    // object for the same run (new grid instance, same runId) and we must not
    // snap the camera mid-animation in that case.
    if (!previous || previous.runId !== state.runId) {
      this.field.reset(this.gridWidth);
      this.particles.clear();
      this.dom.clear();
      this.highlights.clear();
      this.shake.reset();
      this.targets = EMPTY_TARGETS;
      this.hover = null;
      this.playing = false;
      this.time = 0;
      this.miner.setFacing(1);
      this.miner.setMotion('idle');
      this.setMinerPosition(worldX(state.player.col, this.gridWidth), feetY(state.player.row));
    }

    this.resize();
    this.field.sync(state.grid, state.player.row);
    this.snapCamera();
  }

  playDig(result: DigResult, state: RunState): void {
    this.state = state;
    if (!result.ok || !result.work) {
      // A rejected tap still deserves a nudge; no animation, no busy state.
      this.shake.add(0.08);
      return;
    }
    this.buildDig(result, state);
  }

  setTargets(targets: readonly TargetInfo[], state: RunState): void {
    this.state = state;
    if (!state) return;
    this.targets = targets;
    this.gridWidth = state.grid.width;
    this.highlights.set(this.gridWidth, targets, this.hover);
    this.dom.setLabels(targets, this.gridWidth);
  }

  setHover(cell: Cell | null): void {
    this.hover = cell;
    this.highlights.set(this.gridWidth, this.targets, cell);
  }

  update(dt: number): void {
    const step = dt > 0 ? dt : 0;
    this.time += step;
    if (step > 0) this.fps += (1 / step - this.fps) * (1 - Math.exp(-3 * step));
    this.adaptQuality();

    this.advanceDig(step);
    this.miner.update(step);
    this.particles.update(step);
    this.field.updateHit(step, this.reducedMotion);

    this.updateAtmosphere();
    this.field.pulseGoal(this.time);
    if (this.state) this.field.sync(this.state.grid, Math.max(0, Math.round(this.minerRow)));
    this.updateCamera(step);
    this.highlights.update(this.time);
    this.dom.update(step, this.project);
  }

  // Drop pixel ratio when the GPU can't sustain 60fps, restore it slowly
  // once frames recover. Hysteresis avoids a flickering toggle.
  private adaptQuality(): void {
    if (this.qualityScale === 1) {
      if (this.fps < 48) this.lowFpsStreak += 1 / 60;
      else this.lowFpsStreak = 0;
      if (this.lowFpsStreak > 1.5) {
        this.qualityScale = 0.75;
        this.applyQuality();
      }
    } else if (this.qualityScale === 0.75) {
      if (this.fps > 57) this.highFpsStreak += 1 / 60;
      else this.highFpsStreak = 0;
      if (this.highFpsStreak > 3) {
        this.qualityScale = 1;
        this.applyQuality();
      }
    }
  }

  private applyQuality(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * this.qualityScale;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(this.viewWidth, this.viewHeight, false);
  }

  render(): void {
    if (this.contextLost) return;
    this.renderer.render(this.scene, this.camera);
    this.lastDrawCalls = this.renderer.info.render.calls;
    this.lastInstances = this.field.count + this.particles.count + this.highlights.count;
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    let width = Math.round(rect.width);
    let height = Math.round(rect.height);
    // Canvas not laid out yet: fall back to the viewport and set the style so
    // the drawing buffer and the element agree.
    const degenerate = width < 2 || height < 2;
    if (degenerate) {
      width = Math.max(1, window.innerWidth);
      height = Math.max(1, window.innerHeight);
    }

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2) * this.qualityScale);
    this.renderer.setSize(width, height, degenerate);

    const aspect = width / Math.max(1, height);
    // Tall/narrow screens widen the fov so every column still fits.
    const fov = aspect >= 0.6 ? CAMERA_FOV : Math.min(CAMERA_FOV_MAX, CAMERA_FOV + (0.6 - aspect) * 90);
    const halfV = Math.tan((fov * Math.PI) / 360);
    const distForRows = CAMERA_ROWS / (2 * halfV);
    const distForWidth = (this.gridWidth + 1.4) / (2 * halfV * aspect);

    this.camera.fov = fov;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.camDist = Math.max(distForRows, distForWidth) * 1.04;
    this.tiltHeight = this.camDist * Math.tan(CAMERA_TILT);

    this.viewLeft = rect.left;
    this.viewTop = rect.top;
    this.viewWidth = width;
    this.viewHeight = height;
    this.dom.layout(rect.left, rect.top, width, height);
  }

  pickCell(clientX: number, clientY: number): Cell | null {
    const state = this.state;
    if (!state) return null;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hit = this.raycaster.ray.intersectPlane(this.frontPlane, this.hitPoint);
    if (!hit) return null;

    const width = state.grid.width;
    const col = Math.round(hit.x + (width - 1) / 2);
    const row = Math.round(-hit.y);
    if (!state.grid.inBounds(col, row)) return null;
    if (row > state.grid.highestGenerated) return null;
    return { col, row };
  }

  setReducedMotion(value: boolean): void {
    this.reducedMotion = value;
    this.particles.setReducedMotion(value);
    if (value) this.shake.reset();
  }

  isBusy(): boolean {
    return this.playing;
  }

  stats(): { fps: number; drawCalls: number; instances: number } {
    return { fps: Math.round(this.fps), drawCalls: this.lastDrawCalls, instances: this.lastInstances };
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('orientationchange', this.onResize);
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);

    this.scene.remove(this.field.mesh, this.highlights.mesh, this.particles.mesh, this.miner.group);
    this.field.dispose();
    this.highlights.dispose();
    this.particles.dispose();
    this.miner.dispose();
    this.dom.dispose();
    this.renderer.dispose();
    this.state = null;
    this.targets = EMPTY_TARGETS;
  }

  // --- dig sequencer --------------------------------------------------------

  private hitPending = -1;
  private hitPendingCell = -1;

  /**
   * Lays out the whole tap as absolute times and then compresses the flexible
   * parts (walk, swing, chain stagger) so a tap never exceeds DIG_BUDGET.
   * Falls keep their speed: long drops are the point, so they are treated as
   * fixed cost and the rest gives way.
   */
  private buildDig(result: DigResult, state: RunState): void {
    const width = state.grid.width;
    const work = result.work;
    if (!work) return;
    const target = result.target;
    const motion = this.reducedMotion ? 0.75 : 1;

    for (let i = 0; i < MAX_WAVES; i++) {
      this.waveLists[i].length = 0;
      this.waveDone[i] = 0;
    }
    this.waveCount = 0;
    for (let i = 0; i < result.removed.length; i++) {
      const removal = result.removed[i];
      const wave = clamp(removal.wave, 0, MAX_WAVES - 1);
      this.waveLists[wave].push(removal);
      if (wave + 1 > this.waveCount) this.waveCount = wave + 1;
      // The grid already reports these as empty; keep them on screen until
      // their wave's animation fires.
      this.field.keepVisible(state.grid.index(removal.col, removal.row));
    }

    // --- pass 1: measure the walk/fall to the work cell ---
    const steps = result.steps;
    let walked = 0;
    let fallWorkTime = 0;
    let prevRow = this.minerRow;
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (step.fell) fallWorkTime += fallDuration(step.row - prevRow);
      else walked++;
      prevRow = step.row;
    }
    // Collapse absurdly long paths into a single slide.
    const collapsed = steps.length > MAX_SEGMENTS;
    if (collapsed) {
      fallWorkTime = fallDuration(work.row - this.minerRow);
      walked = 0;
    }

    this.workX = worldX(work.col, width);
    this.workY = feetY(work.row);
    this.targetX = worldX(target.col, width);
    const landedRow = result.landedRow ?? work.row;
    this.landingY = feetY(landedRow);
    this.fallRows = Math.max(0, Math.round(landedRow - work.row));
    const fallAfterTime = this.fallRows > 0 ? fallDuration(this.fallRows) : 0;
    const stepInTime = STEP_IN_TIME * motion;

    // --- budget: compress walk / swing / chain, never the falls ---
    const chainTime = Math.max(0, this.waveCount - 1) * CHAIN_STAGGER;
    const flex = walked * WALK_PER_CELL + SWING_TIME + chainTime;
    const fixed = fallWorkTime + fallAfterTime + stepInTime + SETTLE_TIME;
    const scale = flex > 0.001 ? clamp((DIG_BUDGET - fixed) / flex, 0.4, 1) : 1;
    const walkPer = WALK_PER_CELL * scale * motion;
    this.swingTime = SWING_TIME * scale * motion;
    const stagger = CHAIN_STAGGER * scale * (this.reducedMotion ? 0.5 : 1);

    // --- pass 2: build the movement segments ---
    this.segCount = 0;
    if (collapsed) {
      this.pushSegment(
        this.minerX,
        this.minerY,
        this.workX,
        this.workY,
        fallDuration(work.row - this.minerRow),
        1,
      );
    } else {
      let fromX = this.minerX;
      let fromY = this.minerY;
      let fromRow = this.minerRow;
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const toX = worldX(step.col, width);
        const toY = feetY(step.row);
        if (step.fell) {
          this.pushSegment(fromX, fromY, toX, toY, fallDuration(step.row - fromRow), 1);
        } else {
          this.pushSegment(fromX, fromY, toX, toY, walkPer, 0);
        }
        fromX = toX;
        fromY = toY;
        fromRow = step.row;
      }
    }

    // --- absolute schedule ---
    let cursor = this.segCount > 0 ? this.segEnd[this.segCount - 1] : 0;
    this.tSwing0 = cursor;
    this.tSwing1 = cursor + this.swingTime;
    const impactAt = cursor + this.swingTime * SWING_IMPACT;
    for (let w = 0; w < this.waveCount; w++) this.waveAt[w] = impactAt + w * stagger;

    const lastWave = this.waveCount > 0 ? this.waveAt[this.waveCount - 1] : impactAt;
    this.tStepIn = Math.max(this.tSwing1, lastWave) + WAVE_GAP;
    this.tFallStart = this.tStepIn + stepInTime;
    this.tFallEnd = this.tFallStart + fallAfterTime;
    this.total = this.tFallEnd + SETTLE_TIME;

    this.elapsed = 0;
    this.segIndex = 0;
    this.swingStarted = false;
    this.landed = false;
    this.hitPending = Math.max(0, impactAt - 0.1);
    this.hitPendingCell = state.grid.index(target.col, target.row);
    this.playing = true;
    this.highlights.setSuppressed(true);
    this.dom.setLabelsVisible(false);
  }

  private pushSegment(fromX: number, fromY: number, toX: number, toY: number, duration: number, isFall: number): void {
    if (this.segCount >= MAX_SEGMENTS) return;
    const i = this.segCount++;
    this.segFromX[i] = fromX;
    this.segFromY[i] = fromY;
    this.segToX[i] = toX;
    this.segToY[i] = toY;
    this.segFall[i] = isFall;
    this.segEnd[i] = (i === 0 ? 0 : this.segEnd[i - 1]) + Math.max(0.016, duration);
  }

  private advanceDig(dt: number): void {
    if (!this.playing) return;
    const state = this.state;
    if (!state) {
      this.playing = false;
      return;
    }

    this.elapsed += dt;
    const e = this.elapsed;

    // Hit flash: the tapped block reacts shortly before the impact lands.
    if (this.hitPending >= 0 && e >= this.hitPending) {
      this.field.hit(this.hitPendingCell);
      this.hitPending = -1;
    }

    for (let w = 0; w < this.waveCount; w++) {
      if (this.waveDone[w] === 0 && e >= this.waveAt[w]) {
        this.waveDone[w] = 1;
        this.breakWave(w, state);
      }
    }

    if (e < this.tSwing0) {
      this.advanceSegments(e);
      return;
    }

    if (e < this.tSwing1) {
      if (!this.swingStarted) {
        this.swingStarted = true;
        this.setMinerPosition(this.workX, this.workY);
        this.miner.setMotion('idle');
        if (this.targetX !== this.workX) this.miner.setFacing(this.targetX > this.workX ? 1 : -1);
        this.miner.startSwing(this.swingTime);
      }
      return;
    }

    if (e < this.tStepIn) {
      this.setMinerPosition(this.workX, this.workY);
      return;
    }

    if (e < this.tFallStart) {
      // Step into the freshly dug cell.
      const k = (e - this.tStepIn) / Math.max(0.0001, this.tFallStart - this.tStepIn);
      if (this.targetX !== this.workX) this.miner.setFacing(this.targetX > this.workX ? 1 : -1);
      this.miner.setMotion('walk');
      this.setMinerPosition(this.workX + (this.targetX - this.workX) * smoothstep(k), this.workY);
      return;
    }

    if (e < this.tFallEnd) {
      const k = (e - this.tFallStart) / Math.max(0.0001, this.tFallEnd - this.tFallStart);
      this.miner.setMotion('fall');
      // k² reads as gravity; the landing squash sells the stop.
      this.setMinerPosition(this.targetX, this.workY + (this.landingY - this.workY) * k * k);
      return;
    }

    if (!this.landed) {
      this.landed = true;
      this.onLanded();
    }
    this.miner.setMotion('idle');
    this.setMinerPosition(this.targetX, this.landingY);
    if (e >= this.total) this.finishDig(state);
  }

  private advanceSegments(e: number): void {
    while (this.segIndex < this.segCount - 1 && e >= this.segEnd[this.segIndex]) this.segIndex++;
    const i = this.segIndex;
    const start = i === 0 ? 0 : this.segEnd[i - 1];
    const duration = Math.max(0.0001, this.segEnd[i] - start);
    const k = clamp((e - start) / duration, 0, 1);
    const fromX = this.segFromX[i];
    const toX = this.segToX[i];
    const fromY = this.segFromY[i];
    const toY = this.segToY[i];

    if (toX !== fromX) this.miner.setFacing(toX > fromX ? 1 : -1);

    if (this.segFall[i] === 1) {
      this.miner.setMotion('fall');
      // Walk off the ledge: slide across during the first 40% of the drop.
      const slide = smoothstep(Math.min(1, k / 0.4));
      this.setMinerPosition(fromX + (toX - fromX) * slide, fromY + (toY - fromY) * k * k);
    } else {
      this.miner.setMotion('walk');
      const s = smoothstep(k);
      this.setMinerPosition(fromX + (toX - fromX) * s, fromY + (toY - fromY) * s);
    }
  }

  private breakWave(wave: number, state: RunState): void {
    const list = this.waveLists[wave];
    if (list.length === 0) return;
    const width = state.grid.width;
    let destroyed = 0;
    let firstKind = list[0].kind;

    for (let i = 0; i < list.length; i++) {
      const removal = list[i];
      this.field.hide(state.grid.index(removal.col, removal.row));
      const def = BLOCKS[removal.kind];
      const x = worldX(removal.col, width);
      const y = worldY(removal.row);
      const power = removal.source === 'chain' ? 1.4 : 1;
      this.tmpColor.setHex(def.color);
      this.particles.burst(x, y, 0.2, this.tmpColor, 8 * power, 2.4 * power, 0.12);

      if (removal.cash > 0) {
        const tone: PopupTone =
          def.isOre || removal.kind === BlockKind.Vault ? 'gold' : def.repair > 0 ? 'repair' : 'cash';
        this.dom.spawnPopup(x, y, 0.6, `+${removal.cash}`, tone);
      }
      destroyed++;
    }

    // Audio/haptics fire at the true on-screen impact moment.
    this.onWave(wave, destroyed, firstKind, wave > 0);

    if (destroyed > 0) {
      // Later waves hit harder: a chain should build like a firework.
      this.shake.add(Math.min(0.55, 0.09 + destroyed * 0.045) * (wave === 0 ? 1 : 1.25));
    }
  }

  private onLanded(): void {
    const strength = Math.min(1, 0.3 + this.fallRows * 0.12);
    this.miner.squash(strength);
    this.particles.dust(this.targetX, this.minerY - 0.05, 0.3, strength);
    if (!this.reducedMotion) this.shake.add(Math.min(0.3, 0.04 + this.fallRows * 0.03));
    if (this.fallRows >= 2) this.onLand(this.fallRows);
  }

  private finishDig(state: RunState): void {
    this.playing = false;
    this.highlights.setSuppressed(false);
    this.dom.setLabelsVisible(true);
    this.miner.setMotion('idle');
    // Snap to the authoritative position; the animation should already agree.
    this.setMinerPosition(worldX(state.player.col, state.grid.width), feetY(state.player.row));
  }

  // --- view -----------------------------------------------------------------

  /** Continuous row of the miner's feet (fractional while falling). */
  private get minerRow(): number {
    return -this.minerY - 0.5;
  }

  private setMinerPosition(x: number, y: number): void {
    this.minerX = x;
    this.minerY = y;
    this.miner.setPosition(x, y);
  }

  private updateAtmosphere(): void {
    const state = this.state;
    const row = state ? Math.max(0, this.minerRow) : 0;
    const t = smoothstep(row / DARK_BY_ROW);

    this.bgColor.setHex(SKY_COLOR).lerp(this.deepColor, t);
    this.fog.color.copy(this.bgColor);
    // Fog tightens with depth: the walls close in.
    this.fog.near = this.camDist + 1.5 - 4 * t;
    this.fog.far = this.camDist + 18 - 11 * t;
    this.hemi.intensity = 0.95 - 0.65 * t;
    this.sun.intensity = 1.15 - 0.6 * t;
    this.lamp.intensity = 1.2 + 4.3 * t;
    this.dom.setVignette(0.18 + 0.42 * t);

    this.field.setGoal(state ? state.level.targetDepth : -1, 1 + 0.8 * t);
  }

  private updateCamera(dt: number): void {
    const targetY = this.state ? this.minerY + 0.5 - CAMERA_FOCUS_OFFSET : 0;
    const error = Math.abs(targetY - this.camY);
    // Catch up faster during long falls so the miner never leaves the frame.
    const k = error > CAMERA_CATCHUP_ERROR ? CAMERA_LERP_K * 2.2 : CAMERA_LERP_K;
    this.camY = damp(this.camY, targetY, k, dt);
    this.camX = damp(this.camX, this.state ? this.minerX * 0.2 : 0, CAMERA_LERP_K * 0.6, dt);

    this.shake.update(dt, !this.reducedMotion, this.shakeOffset);
    const sx = this.shakeOffset.x;
    const sy = this.shakeOffset.y;
    // A translation shared by position and target keeps the framing stable.
    this.camera.position.set(this.camX + sx, this.camY + this.tiltHeight + sy, this.camDist + this.shakeOffset.z);
    this.lookTarget.set(this.camX + sx, this.camY + sy, 0);
    this.camera.lookAt(this.lookTarget);
  }

  private snapCamera(): void {
    this.camY = this.state ? this.minerY + 0.5 - CAMERA_FOCUS_OFFSET : 0;
    this.camX = this.state ? this.minerX * 0.2 : 0;
    this.updateCamera(0);
  }

  // --- events ---------------------------------------------------------------

  private readonly onResize = (): void => {
    this.resize();
  };

  private readonly onContextLost = (event: Event): void => {
    // Required for the browser to attempt a restore.
    event.preventDefault();
    this.contextLost = true;
  };

  private readonly onContextRestored = (): void => {
    this.contextLost = false;
    this.resize();
    this.field.invalidate();
    this.highlights.set(this.gridWidth, this.targets, this.hover);
    if (this.state) this.field.sync(this.state.grid, Math.max(0, Math.round(this.minerRow)));
  };
}

export function createRenderer(options: RendererOptions): RendererAPI {
  return new SceneRenderer(options);
}

export type { RendererAPI, RendererOptions };
