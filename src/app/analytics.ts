/**
 * Minimal analytics event bus (plan 8.1).
 *
 * No third-party service is contacted. Events stay in a capped in-memory
 * buffer that devtools can export as JSON; wiring a real backend later means
 * adding a sink, not changing call sites.
 */

export type AnalyticsEventName =
  | 'run_start'
  | 'first_input'
  | 'block_mined'
  | 'chain_triggered'
  | 'run_end'
  | 'upgrade_buy'
  | 'chest_open'
  | 'tutorial_step'
  | 'error';

export interface AnalyticsEvent {
  name: AnalyticsEventName | string;
  /** Session-relative milliseconds. */
  t: number;
  payload: Record<string, unknown>;
}

export interface AnalyticsContext {
  runId?: string;
  seed?: number;
  configVersion?: string;
  levelId?: string;
}

export interface AnalyticsAPI {
  track(name: AnalyticsEventName | string, payload?: Record<string, unknown>): void;
  setContext(context: AnalyticsContext): void;
  onEvent(callback: (event: AnalyticsEvent) => void): () => void;
  export(): AnalyticsEvent[];
  clear(): void;
}

const MAX_EVENTS = 2000;

export function createAnalytics(): AnalyticsAPI {
  const events: AnalyticsEvent[] = [];
  const listeners = new Set<(event: AnalyticsEvent) => void>();
  let context: AnalyticsContext = {};
  const start = typeof performance !== 'undefined' ? performance.now() : 0;

  return {
    track(name, payload = {}): void {
      const event: AnalyticsEvent = {
        name,
        t: Math.round((typeof performance !== 'undefined' ? performance.now() : 0) - start),
        payload: { ...context, ...payload },
      };
      events.push(event);
      if (events.length > MAX_EVENTS) events.shift();
      for (const listener of listeners) listener(event);
    },
    setContext(next: AnalyticsContext): void {
      context = { ...context, ...next };
    },
    onEvent(callback): () => void {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    export(): AnalyticsEvent[] {
      return events.map((event) => ({ ...event, payload: { ...event.payload } }));
    },
    clear(): void {
      events.length = 0;
    },
  };
}
