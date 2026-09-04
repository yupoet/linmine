/**
 * Synthesised sound effects. No audio files are shipped: every sound is
 * generated with WebAudio primitives, which keeps the build small and keeps
 * the project free of third-party assets (plan: original audio only).
 */

export type SoundName =
  | 'ui'
  | 'dig'
  | 'break'
  | 'explode'
  | 'cash'
  | 'repair'
  | 'fall'
  | 'land'
  | 'win'
  | 'lose'
  | 'error'
  | 'chest';

export interface AudioAPI {
  /** Must be called from a real user gesture before any sound will play. */
  unlock(): void;
  setMuted(muted: boolean): void;
  get muted(): boolean;
  /** `intensity` 0..1 scales pitch/volume (used for chain depth). */
  play(name: SoundName, intensity?: number): void;
  dispose(): void;
}

interface Voices {
  ctx: AudioContext;
  master: GainNode;
  noise: AudioBuffer;
}

const MASTER_GAIN = 0.5;

function createNoiseBuffer(ctx: AudioContext, seconds = 1): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i++) {
    // Slightly brown-ish noise: softer than pure white, reads as "dirt".
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.5;
  }
  return buffer;
}

export function createAudio(): AudioAPI {
  let voices: Voices | null = null;
  let muted = false;

  function ensure(): Voices | null {
    if (voices) return voices;
    if (typeof window === 'undefined') return null;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor();
    const master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER_GAIN;
    master.connect(ctx.destination);
    voices = { ctx, master, noise: createNoiseBuffer(ctx) };
    return voices;
  }

  function noise(vo: Voices, options: {
    duration: number;
    gain: number;
    filter: BiquadFilterType;
    from: number;
    to: number;
    q?: number;
    delay?: number;
  }): void {
    const start = vo.ctx.currentTime + (options.delay ?? 0);
    const source = vo.ctx.createBufferSource();
    source.buffer = vo.noise;
    source.loop = true;

    const filter = vo.ctx.createBiquadFilter();
    filter.type = options.filter;
    filter.Q.value = options.q ?? 1;
    filter.frequency.setValueAtTime(options.from, start);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, options.to), start + options.duration);

    const gain = vo.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, options.gain), start + Math.min(0.02, options.duration * 0.3));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + options.duration);

    source.connect(filter).connect(gain).connect(vo.master);
    source.start(start);
    source.stop(start + options.duration + 0.02);
  }

  function tone(vo: Voices, options: {
    freq: number;
    to?: number;
    duration: number;
    gain: number;
    type?: OscillatorType;
    delay?: number;
  }): void {
    const start = vo.ctx.currentTime + (options.delay ?? 0);
    const osc = vo.ctx.createOscillator();
    osc.type = options.type ?? 'sine';
    osc.frequency.setValueAtTime(options.freq, start);
    if (options.to !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, options.to), start + options.duration);
    }

    const gain = vo.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, options.gain), start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + options.duration);

    osc.connect(gain).connect(vo.master);
    osc.start(start);
    osc.stop(start + options.duration + 0.02);
  }

  function render(name: SoundName, vo: Voices, intensity: number): void {
    const k = Math.max(0, Math.min(1, intensity));
    switch (name) {
      case 'ui':
        tone(vo, { freq: 880, duration: 0.05, gain: 0.12, type: 'triangle' });
        break;
      case 'dig':
        noise(vo, { duration: 0.16, gain: 0.22, filter: 'bandpass', from: 900 + 400 * k, to: 300, q: 0.8 });
        tone(vo, { freq: 150, to: 70, duration: 0.12, gain: 0.16, type: 'sine' });
        break;
      case 'break':
        noise(vo, { duration: 0.22, gain: 0.3, filter: 'lowpass', from: 2600, to: 260, q: 0.7 });
        tone(vo, { freq: 220, to: 90, duration: 0.16, gain: 0.14, type: 'triangle' });
        break;
      case 'explode':
        noise(vo, { duration: 0.55, gain: 0.42, filter: 'lowpass', from: 1800, to: 90, q: 0.6 });
        tone(vo, { freq: 110, to: 34, duration: 0.5, gain: 0.32, type: 'sine' });
        tone(vo, { freq: 70, to: 28, duration: 0.6, gain: 0.22, type: 'square', delay: 0.02 });
        break;
      case 'cash':
        tone(vo, { freq: 660 * Math.pow(1.0595, Math.round(k * 12)), duration: 0.11, gain: 0.16, type: 'triangle' });
        tone(vo, { freq: 990 * Math.pow(1.0595, Math.round(k * 12)), duration: 0.09, gain: 0.09, type: 'sine', delay: 0.05 });
        break;
      case 'repair':
        tone(vo, { freq: 440, duration: 0.1, gain: 0.14, type: 'sine' });
        tone(vo, { freq: 660, duration: 0.14, gain: 0.14, type: 'sine', delay: 0.08 });
        tone(vo, { freq: 880, duration: 0.18, gain: 0.12, type: 'sine', delay: 0.16 });
        break;
      case 'fall':
        noise(vo, { duration: 0.42, gain: 0.2, filter: 'lowpass', from: 1200, to: 180, q: 1.2 });
        break;
      case 'land':
        tone(vo, { freq: 120, to: 50, duration: 0.18, gain: 0.26, type: 'sine' });
        noise(vo, { duration: 0.16, gain: 0.16, filter: 'lowpass', from: 700, to: 120 });
        break;
      case 'win':
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, index) => {
          tone(vo, { freq, duration: 0.32, gain: 0.16, type: 'triangle', delay: index * 0.09 });
        });
        break;
      case 'lose':
        [440, 349.23, 261.63].forEach((freq, index) => {
          tone(vo, { freq, duration: 0.34, gain: 0.15, type: 'triangle', delay: index * 0.13 });
        });
        break;
      case 'error':
        tone(vo, { freq: 150, to: 110, duration: 0.14, gain: 0.12, type: 'square' });
        break;
      case 'chest':
        [880, 1174.7, 1567.98].forEach((freq, index) => {
          tone(vo, { freq, duration: 0.2, gain: 0.12, type: 'sine', delay: index * 0.06 });
        });
        noise(vo, { duration: 0.5, gain: 0.12, filter: 'highpass', from: 2000, to: 6000, delay: 0.05 });
        break;
    }
  }

  return {
    unlock(): void {
      const vo = ensure();
      if (!vo) return;
      if (vo.ctx.state === 'suspended') void vo.ctx.resume();
    },
    setMuted(value: boolean): void {
      muted = value;
      if (voices) voices.master.gain.value = value ? 0 : MASTER_GAIN;
    },
    get muted(): boolean {
      return muted;
    },
    play(name: SoundName, intensity = 0.5): void {
      if (muted) return;
      const vo = ensure();
      if (!vo || vo.ctx.state === 'suspended') return;
      render(name, vo, intensity);
    },
    dispose(): void {
      if (!voices) return;
      void voices.ctx.close();
      voices = null;
    },
  };
}
