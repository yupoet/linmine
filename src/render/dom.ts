import { Vector3 } from 'three';
import type { TargetInfo } from '../core/run.ts';
import { CUBE_SIZE, MAX_LABELS, MAX_POPUPS, worldX, worldY } from './constants.ts';
import { popupAlpha } from './fx.ts';

/** Projects a world point to viewport pixels. Provided by the renderer. */
export type Projector = (x: number, y: number, z: number, out: Vector3) => Vector3;

export type PopupTone = 'cash' | 'gold' | 'repair';

interface Popup {
  el: HTMLDivElement;
  x: number;
  y: number;
  z: number;
  t: number;
  duration: number;
  active: boolean;
}

interface Label {
  el: HTMLDivElement;
  x: number;
  y: number;
  z: number;
  active: boolean;
  lastX: number;
  lastY: number;
}

const POPUP_LIFE = 0.9;
const POPUP_COLORS: Record<PopupTone, string> = {
  cash: '#eafff2',
  gold: '#ffd856',
  repair: '#8ef0a4',
};

/**
 * DOM layer sitting over the canvas: floating cash numbers, per-block
 * durability costs and a vignette. Kept in the DOM (rather than in 3D) so
 * numbers stay crisp at any pixel ratio; elements are pooled and only touched
 * while they are on screen.
 *
 * Positioned with `position: fixed` against the canvas rect, so it never
 * depends on how the host page lays the canvas out.
 */
export class DomLayer {
  readonly root: HTMLDivElement;
  private readonly vignette: HTMLDivElement;
  private readonly popups: Popup[] = [];
  private readonly labels: Label[] = [];
  private readonly point = new Vector3();
  private left = 0;
  private top = 0;
  private vignetteAmount = -1;
  private cursor = 0;
  private labelsHidden = false;

  constructor() {
    this.root = document.createElement('div');
    this.root.style.cssText =
      'position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;overflow:hidden;z-index:5;';

    this.vignette = document.createElement('div');
    this.vignette.style.cssText =
      'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;opacity:0;' +
      'background:radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 42%, rgba(0,0,0,0.85) 100%);';
    this.root.appendChild(this.vignette);

    for (let i = 0; i < MAX_POPUPS; i++) this.popups.push(this.makePopup());
    for (let i = 0; i < MAX_LABELS; i++) this.labels.push(this.makeLabel());
  }

  attach(parent: HTMLElement): void {
    parent.appendChild(this.root);
  }

  layout(left: number, top: number, width: number, height: number): void {
    this.left = left;
    this.top = top;
    this.root.style.left = `${left}px`;
    this.root.style.top = `${top}px`;
    this.root.style.width = `${width}px`;
    this.root.style.height = `${height}px`;
  }

  setVignette(amount: number): void {
    const clamped = Math.round(amount * 50) / 50;
    if (clamped === this.vignetteAmount) return;
    this.vignetteAmount = clamped;
    this.vignette.style.opacity = `${clamped}`;
  }

  spawnPopup(x: number, y: number, z: number, text: string, tone: PopupTone): void {
    let popup = this.popups[this.cursor];
    for (let i = 0; i < this.popups.length; i++) {
      const candidate = this.popups[(this.cursor + i) % this.popups.length];
      if (!candidate.active) {
        popup = candidate;
        this.cursor = (this.cursor + i + 1) % this.popups.length;
        break;
      }
    }
    popup.x = x;
    popup.y = y;
    popup.z = z;
    popup.t = 0;
    popup.duration = POPUP_LIFE;
    popup.active = true;
    popup.el.textContent = text;
    popup.el.style.color = POPUP_COLORS[tone];
    popup.el.style.display = 'block';
  }

  /** Durability cost badges for every reachable block. */
  setLabels(targets: readonly TargetInfo[], width: number): void {
    let index = 0;
    for (let i = 0; i < targets.length && index < this.labels.length; i++) {
      const target = targets[i];
      const label = this.labels[index++];
      label.active = true;
      label.x = worldX(target.col, width);
      label.y = worldY(target.row);
      label.z = CUBE_SIZE * 0.55;
      label.lastX = Number.NaN;
      label.lastY = Number.NaN;
      label.el.textContent = `${target.cost}`;
      label.el.style.color = target.affordable ? '#f2fff8' : '#ff8b76';
      label.el.style.display = 'block';
    }
    for (let i = index; i < this.labels.length; i++) {
      const label = this.labels[i];
      if (!label.active) continue;
      label.active = false;
      label.el.style.display = 'none';
    }
  }

  setLabelsVisible(visible: boolean): void {
    this.labelsHidden = !visible;
    for (const label of this.labels) {
      if (!label.active) continue;
      label.el.style.display = visible ? 'block' : 'none';
    }
  }

  clear(): void {
    for (const popup of this.popups) {
      popup.active = false;
      popup.el.style.display = 'none';
    }
    for (const label of this.labels) {
      label.active = false;
      label.el.style.display = 'none';
    }
  }

  update(dt: number, project: Projector): void {
    for (const popup of this.popups) {
      if (!popup.active) continue;
      popup.t += dt;
      if (popup.t >= popup.duration) {
        popup.active = false;
        popup.el.style.display = 'none';
        continue;
      }
      const k = popup.t / popup.duration;
      // Drifts up ~0.9 world units over its life.
      project(popup.x, popup.y + k * 0.9, popup.z, this.point);
      const x = this.point.x - this.left;
      const y = this.point.y - this.top;
      const scale = 0.85 + 0.35 * Math.min(1, k * 5);
      popup.el.style.transform = `translate(-50%,-50%) translate(${Math.round(x)}px,${Math.round(y)}px) scale(${scale.toFixed(2)})`;
      popup.el.style.opacity = `${popupAlpha(k).toFixed(2)}`;
    }

    if (this.labelsHidden) return;
    for (const label of this.labels) {
      if (!label.active) continue;
      project(label.x, label.y, label.z, this.point);
      const x = Math.round(this.point.x - this.left);
      const y = Math.round(this.point.y - this.top);
      if (x === label.lastX && y === label.lastY) continue;
      label.lastX = x;
      label.lastY = y;
      label.el.style.transform = `translate(-50%,-50%) translate(${x}px,${y}px)`;
    }
  }

  dispose(): void {
    this.clear();
    this.root.remove();
  }

  private makePopup(): Popup {
    const el = document.createElement('div');
    el.style.cssText =
      'position:absolute;left:0;top:0;display:none;font:700 15px/1 system-ui,sans-serif;' +
      'text-shadow:0 1px 2px rgba(0,0,0,0.9);white-space:nowrap;will-change:transform,opacity;';
    this.root.appendChild(el);
    return { el, x: 0, y: 0, z: 0, t: 0, duration: POPUP_LIFE, active: false };
  }

  private makeLabel(): Label {
    const el = document.createElement('div');
    el.style.cssText =
      'position:absolute;left:0;top:0;display:none;font:800 11px/1 system-ui,sans-serif;' +
      'text-shadow:0 1px 2px rgba(0,0,0,0.95);white-space:nowrap;will-change:transform;';
    this.root.appendChild(el);
    return { el, x: 0, y: 0, z: 0, active: false, lastX: Number.NaN, lastY: Number.NaN };
  }
}
