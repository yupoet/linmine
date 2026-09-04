/**
 * Frame clock.
 *
 * - one rAF loop drives update + render;
 * - dt is clamped so a background tab cannot teleport the simulation;
 * - the loop pauses on `visibilitychange` and the first frame after resuming
 *   is dropped, so a run never advances by wall-clock time while hidden.
 */

export interface ClockAPI {
  start(): void;
  stop(): void;
  /** Register the per-frame callback. Returns an unsubscribe function. */
  onFrame(callback: (dt: number) => void): () => void;
  setPaused(paused: boolean): void;
  readonly running: boolean;
}

const MAX_DT = 0.1;

export function createClock(): ClockAPI {
  const listeners = new Set<(dt: number) => void>();
  let handle = 0;
  let last = 0;
  let running = false;
  let paused = false;
  let skipNextFrame = false;

  const frame = (now: number): void => {
    if (!running) return;
    handle = requestAnimationFrame(frame);

    if (paused || skipNextFrame) {
      skipNextFrame = false;
      last = now;
      return;
    }

    const dt = Math.min((now - last) / 1000, MAX_DT);
    last = now;
    if (dt <= 0) return;

    for (const listener of listeners) listener(dt);
  };

  const onVisibility = (): void => {
    skipNextFrame = true;
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility);
  }

  return {
    start(): void {
      if (running) return;
      running = true;
      skipNextFrame = true;
      last = performance.now();
      handle = requestAnimationFrame(frame);
    },
    stop(): void {
      running = false;
      if (handle) cancelAnimationFrame(handle);
      handle = 0;
    },
    onFrame(callback: (dt: number) => void): () => void {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    setPaused(value: boolean): void {
      paused = value;
      skipNextFrame = true;
    },
    get running(): boolean {
      return running;
    },
  };
}
