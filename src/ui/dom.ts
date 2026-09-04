/**
 * Tiny DOM helpers shared by every screen.
 *
 * Nothing here knows about game rules; it only builds and updates elements.
 * Every update helper is written so it can be called many times per second
 * without allocating new nodes.
 */

import type { ScreenId } from '../app/contracts.ts';

export type Child = Node | string | number | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  children?: readonly Child[],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (children) appendAll(el, children);
  return el;
}

export function appendAll(parent: Node, children: readonly Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** Writes only when the text actually changed; keeps layout thrash down. */
export function setText(el: HTMLElement, value: string): void {
  if (el.textContent !== value) el.textContent = value;
}

export function setFlag(el: HTMLElement, className: string, on: boolean): void {
  el.classList.toggle(className, on);
}

/** View models come from the app and may be incomplete; never render NaN. */
export function num(value: number | null | undefined, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function text(value: string | null | undefined, fallback = ''): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

export function list<T>(value: readonly T[] | null | undefined): readonly T[] {
  return Array.isArray(value) ? value : [];
}

export function fmtNum(value: number): string {
  const rounded = Math.round(num(value));
  const sign = rounded < 0 ? '-' : '';
  const digits = String(Math.abs(rounded));
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function clamp01(value: number): number {
  const v = num(value);
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function percent(value: number): string {
  return `${Math.round(clamp01(value) * 100)}%`;
}

/** Every screen builds its DOM once and exposes an element plus cleanup. */
export interface ScreenModule {
  readonly el: HTMLElement;
  dispose(): void;
}

export function createScreenEl(id: ScreenId, extraClass = ''): HTMLElement {
  const el = h('section', extraClass ? `screen screen--${id} ${extraClass}` : `screen screen--${id}`);
  el.dataset.screen = id;
  return el;
}

/** Scrollable middle of an opaque panel. */
export function panel(children: readonly Child[]): HTMLDivElement {
  return h('div', 'panel', children);
}

export function panelHead(children: readonly Child[]): HTMLElement {
  return h('header', 'panel__head', children);
}

export function panelBody(children: readonly Child[]): HTMLDivElement {
  return h('div', 'panel__body js-scroll', children);
}

export function panelFoot(children: readonly Child[]): HTMLElement {
  return h('footer', 'panel__foot', children);
}

export function sectionTitle(label: string): HTMLElement {
  return h('h2', 'section__title', [label]);
}

export function button(label: string, className: string, onTap: () => void): HTMLButtonElement {
  const el = h('button', className, [label]);
  el.type = 'button';
  el.addEventListener('click', onTap);
  return el;
}

/**
 * A number that tweens toward its target instead of snapping. Used by the HUD
 * (durability, cash, depth) where values change many times per second.
 */
export interface CounterOptions {
  initial?: number;
  format?: (value: number) => string;
  /** Returns true when tweening should be skipped. */
  reducedMotion?: () => boolean;
}

export class Counter {
  readonly el: HTMLSpanElement;
  private readonly node: Text;
  private readonly format: (value: number) => string;
  private readonly reducedMotion: () => boolean;
  private current: number;
  private target: number;
  private frame = 0;
  private last = 0;

  constructor(options: CounterOptions = {}) {
    this.format = options.format ?? fmtNum;
    this.reducedMotion = options.reducedMotion ?? (() => false);
    const start = num(options.initial);
    this.current = start;
    this.target = start;
    this.el = h('span', 'counter');
    this.node = document.createTextNode(this.format(start));
    this.el.appendChild(this.node);
  }

  set(value: number): void {
    const next = num(value);
    const changed = next !== this.target;
    this.target = next;
    if (this.reducedMotion()) {
      this.current = next;
      this.write();
      return;
    }
    if (changed && this.frame === 0) {
      this.last = 0;
      this.frame = requestAnimationFrame(this.step);
    }
  }

  /** Jump straight to a value, cancelling any tween (new run, new screen). */
  reset(value: number): void {
    this.stop();
    this.current = num(value);
    this.target = this.current;
    this.write();
  }

  dispose(): void {
    this.stop();
  }

  private stop(): void {
    if (this.frame !== 0) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    }
  }

  private write(): void {
    const next = this.format(this.current);
    if (this.node.data !== next) this.node.data = next;
  }

  private readonly step = (now: number): void => {
    const dt = this.last === 0 ? 1 / 60 : Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const diff = this.target - this.current;
    if (Math.abs(diff) < 0.5) {
      this.current = this.target;
      this.write();
      this.frame = 0;
      return;
    }
    // Frame-rate independent exponential approach.
    this.current += diff * (1 - Math.exp(-dt * 14));
    this.write();
    this.frame = requestAnimationFrame(this.step);
  };
}
