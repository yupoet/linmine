/**
 * Icons, drawn as inline SVG so the game ships with no external assets.
 * Every path here is authored for this project (no third-party icon set).
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

export type IconName =
  | 'pickaxe'
  | 'coin'
  | 'gear'
  | 'lock'
  | 'check'
  | 'back'
  | 'chest'
  | 'chain'
  | 'pause'
  | 'depth'
  | 'gem'
  | 'close'
  | 'bolt'
  | 'spark';

const STROKE = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

/** Gear built from a hub plus teeth so it stays crisp at every size. */
function gear(): string {
  const teeth: string[] = [];
  const count = 8;
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const x1 = (12 + cos * 4.6).toFixed(2);
    const y1 = (12 + sin * 4.6).toFixed(2);
    const x2 = (12 + cos * 8).toFixed(2);
    const y2 = (12 + sin * 8).toFixed(2);
    teeth.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-width="3.2"/>`);
  }
  return `<circle cx="12" cy="12" r="4.6" ${STROKE}/><g ${STROKE}>${teeth.join('')}</g>`;
}

const ICONS: Record<IconName, string> = {
  pickaxe: `<g ${STROKE}><path d="M5.2 20.4 14 11.6"/><path d="M7.6 16.6C7 8.8 12.4 4 21 4"/></g>`,
  coin: `<circle cx="12" cy="12" r="8.6" fill="currentColor" opacity="0.2"/><circle cx="12" cy="12" r="8.6" ${STROKE}/><g ${STROKE} stroke-width="1.8"><path d="M9.2 9.4h5.6"/><path d="M9.2 14.6h5.6"/><path d="M12 6.8v10.4"/></g>`,
  gear: gear(),
  lock: `<g ${STROKE}><rect x="4.2" y="10" width="15.6" height="10.4" rx="2.6"/><path d="M8 10V7.6a4 4 0 0 1 8 0V10"/></g><circle cx="12" cy="15.2" r="1.5" fill="currentColor"/>`,
  check: `<path d="M4.6 12.6 9.6 17.6 19.4 6.6" ${STROKE} stroke-width="3"/>`,
  back: `<path d="M14.6 4.8 7.4 12l7.2 7.2" ${STROKE} stroke-width="2.8"/>`,
  chest: `<g ${STROKE}><path d="M3.6 8.4C3.6 4.8 7.4 2.8 12 2.8s8.4 2 8.4 5.6"/><rect x="3.4" y="8.4" width="17.2" height="12.4" rx="2.6"/><path d="M3.4 12.4h17.2"/><path d="M11.8 12.4v3.6"/></g><rect x="10.6" y="10.6" width="2.8" height="3.6" rx="1.2" fill="currentColor"/>`,
  chain: `<g ${STROKE}><rect x="2.8" y="8" width="10.6" height="8" rx="4"/><rect x="10.6" y="8" width="10.6" height="8" rx="4"/></g>`,
  pause: `<g fill="currentColor"><rect x="7" y="5" width="3.6" height="14" rx="1.5"/><rect x="13.4" y="5" width="3.6" height="14" rx="1.5"/></g>`,
  depth: `<g ${STROKE}><path d="M4.6 4.6h14.8"/><path d="M12 5.4v12.4"/><path d="M7 12.8 12 18l5-5.2"/></g>`,
  gem: `<g ${STROKE}><path d="M6.4 3.4h11.2l4 5.6L12 20.6 2.4 9z"/><path d="M2.4 9h19.2"/><path d="M9 3.4 7 9l5 11.6L17 9l-2-5.6"/></g>`,
  close: `<g ${STROKE}><path d="M6.4 6.4 17.6 17.6"/><path d="M17.6 6.4 6.4 17.6"/></g>`,
  bolt: `<path d="M13.4 2.6 5.6 14.2h5.6l-1.2 7.2 8.4-11.8h-6z" fill="currentColor"/>`,
  spark: `<path d="M12 2.6 14.4 9 20.8 11.4 14.4 13.8 12 20.2 9.6 13.8 3.2 11.4 9.6 9z" fill="currentColor"/>`,
};

export function svg(name: IconName, className = 'icon'): SVGSVGElement {
  const el = document.createElementNS(SVG_NS, 'svg');
  el.setAttribute('viewBox', '0 0 24 24');
  el.setAttribute('class', className);
  el.setAttribute('aria-hidden', 'true');
  el.setAttribute('focusable', 'false');
  el.innerHTML = ICONS[name];
  return el;
}
