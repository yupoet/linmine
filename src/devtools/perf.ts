/**
 * Devtools overlay (?dev=1 in the URL): frame stats and a button to dump the
 * analytics buffer as JSON. Deliberately tiny — it must not ship in the
 * critical path of the game.
 */

import type { AnalyticsAPI } from '../app/analytics.ts';
import type { GameAPI } from '../app/game.ts';
import type { RendererAPI } from '../app/contracts.ts';

export interface DevtoolsDeps {
  renderer: RendererAPI;
  analytics: AnalyticsAPI;
  game: GameAPI;
}

export interface DevtoolsHandle {
  update(dt?: number): void;
  dispose(): void;
}

export function attachDevtools(deps: DevtoolsDeps): DevtoolsHandle {
  const panel = document.createElement('div');
  panel.style.cssText = [
    'position:absolute',
    'top:0',
    'left:0',
    'z-index:50',
    'padding:6px 8px',
    'font:11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace',
    'color:#9ef29e',
    'background:rgba(0,0,0,0.55)',
    'pointer-events:auto',
    'white-space:pre',
    'border-bottom-right-radius:6px',
  ].join(';');

  const dump = document.createElement('button');
  dump.textContent = 'dump events';
  dump.style.cssText = 'pointer-events:auto;font:inherit;color:inherit;background:#222;border:1px solid #444;border-radius:4px;cursor:pointer';
  dump.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(deps.analytics.export(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'linmine-events.json';
    link.click();
    URL.revokeObjectURL(url);
  });
  panel.appendChild(dump);

  const readout = document.createElement('div');
  panel.appendChild(readout);

  document.body.appendChild(panel);

  let accumulator = 0;
  let frames = 0;
  let fps = 0;

  return {
    update(dt = 0): void {
      accumulator += dt;
      frames++;
      if (accumulator >= 0.5) {
        fps = frames / accumulator;
        accumulator = 0;
        frames = 0;
        const stats = deps.renderer.stats();
        const run = deps.game.getRun();
        readout.textContent =
          `fps ${fps.toFixed(0)}  draw ${stats.drawCalls}  inst ${stats.instances}\n` +
          (run
            ? `row ${run.depth}/${run.level.targetDepth}  dur ${run.durability}/${run.maxDurability}  cash ${run.cash}`
            : 'idle');
      }
    },
    dispose(): void {
      panel.remove();
    },
  };
}
