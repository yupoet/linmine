/**
 * Balance CLI:  npx vite-node scripts/sim.ts [runsPerLevel] [pickaxeLevel]
 *
 * Prints a per-level report produced by the heuristic bot in
 * src/devtools/simulate.ts. Use it to compare tuning changes; keep the seed
 * base fixed so numbers are comparable across runs.
 */

import { LEVELS } from '../src/config/levels.ts';
import { balanceReport } from '../src/devtools/simulate.ts';

const runsPerLevel = Number(process.argv[2] ?? 200);
const pickaxeLevel = Number(process.argv[3] ?? 1);

const rows = [];
for (const level of LEVELS) {
  const report = balanceReport(level, runsPerLevel, { pickaxeLevel, seedBase: 1000 });
  rows.push({
    level: report.level,
    target: report.targetDepth,
    winRate: `${(report.winRate * 100).toFixed(1)}%`,
    avgDepth: report.avgDepth.toFixed(1),
    progress: `${(report.depthProgress * 100).toFixed(0)}%`,
    avgCash: report.avgCash.toFixed(0),
    medCash: String(report.medianCash),
    taps: report.avgTaps.toFixed(1),
    mined: report.avgBlocks.toFixed(1),
    chained: report.avgChainBlocks.toFixed(1),
    chains: report.avgChains.toFixed(2),
    durLeft: report.avgDurabilityLeft.toFixed(1),
    stuck: `${(report.stuckRate * 100).toFixed(1)}%`,
    maxFall: String(report.longestFall),
  });
}

console.log(`Lin Mine balance report — ${runsPerLevel} runs/level, pickaxe L${pickaxeLevel}`);
console.table(rows);
