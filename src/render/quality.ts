/**
 * Adaptive resolution.
 *
 * When the GPU cannot hold 60 fps the pixel ratio drops; it climbs back only
 * after a sustained recovery. The asymmetric streak lengths are the hysteresis
 * that stops the renderer from flickering between the two scales — and the
 * reason candy's next skin rebuild can safely read `scale` to decide whether to
 * fall back to cheaper cube geometry.
 */
export class QualityGovernor {
  /** Pixel-ratio multiplier: 1 at full quality, 0.75 when throttled. */
  scale = 1;
  private lowStreak = 0;
  private highStreak = 0;

  /** Feed the smoothed frame rate; returns true when the scale changed. */
  update(fps: number): boolean {
    if (this.scale === 1) {
      this.lowStreak = fps < 48 ? this.lowStreak + 1 / 60 : 0;
      if (this.lowStreak > 1.5) {
        this.scale = 0.75;
        this.lowStreak = 0;
        return true;
      }
      return false;
    }

    this.highStreak = fps > 57 ? this.highStreak + 1 / 60 : 0;
    if (this.highStreak > 3) {
      this.scale = 1;
      this.highStreak = 0;
      return true;
    }
    return false;
  }
}
