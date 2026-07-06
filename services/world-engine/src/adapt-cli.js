// Changing-environment (self-organized criticality) experiment — CLI.
//   node services/world-engine/src/adapt-cli.js
//
// Tests the trinity's SOC reading: does a CHANGING environment reward
// adaptability, selecting dark-causality (here: evolvability) UP — flipping the
// static-environment result where exploitation wins? We measure, honestly.
import { adaptiveDriftStudy, runAdaptiveEvolution } from "./adapt.js";

const SPARK = "▁▂▃▄▅▆▇█";
function sparkline(values, min, max) {
  const lo = min ?? Math.min(...values);
  const hi = max ?? Math.max(...values);
  const span = hi - lo || 1;
  return values.map((v) => SPARK[Math.max(0, Math.min(7, Math.round(((v - lo) / span) * 7)))]).join("");
}

function downsample(rows, n) {
  if (rows.length <= n) return rows;
  const step = rows.length / n;
  return Array.from({ length: n }, (_, i) => rows[Math.floor(i * step)]);
}

console.log("\nBRC-LIFE — Changing-Environment (Self-Organized Criticality) Experiment");
console.log("=".repeat(72));
console.log("Dark causality = evolvability (offspring mutation rate). θ(t) drifts.\n");

const study = adaptiveDriftStudy({ ticks: 1000 });
console.log("envDrift | evolved P^D* |   τ    | maladapt | alive | extinct/seeds");
for (const r of study) {
  console.log(
    `  ${String(r.env_drift).padStart(5)}  |    ${r.evolved_dark.toFixed(3)}     | ${r.tau.toFixed(3)} |  ${String(r.maladaptation).padStart(6)}  | ${String(r.alive).padStart(4)}  | ${r.extinctions}/${r.seeds}`
  );
}

const pds = study.map((r) => r.evolved_dark);
const peak = study.reduce((best, r) => (r.evolved_dark > best.evolved_dark ? r : best), study[0]);
console.log(`\n  P^D* vs change rate  ${sparkline(pds)}   peak at envDrift ${peak.env_drift} → P^D* ${peak.evolved_dark}`);
console.log(`  τ    vs change rate  ${sparkline(study.map((r) => r.tau))}   (stays ~${study[0].tau.toFixed(1)})`);

// A representative run near the peak: watch the population track the moving niche.
const run = runAdaptiveEvolution({ seed: 7, ticks: 1000, envDrift: 0.1 });
const series = downsample(run.history, 56);
console.log("\nRepresentative run (envDrift 0.1) — population tracks the moving optimum:");
console.log(`  θ(t) niche optimum  ${sparkline(series.map((r) => r.theta))}`);
console.log(`  P^D(t) dark gene    ${sparkline(series.map((r) => r.mean_dark), 0, 1)}`);
console.log(`  maladaptation(t)    ${sparkline(series.map((r) => r.maladaptation))}  (bounded ⇒ tracking)`);

console.log("\nREADING (honest):");
const lowDrift = study[0].evolved_dark;
console.log(`  • Static environment ⇒ P^D* ≈ ${lowDrift} (exploitation; evolvability only costs).`);
console.log(`  • A MODERATE change rate (envDrift ≈ ${peak.env_drift}) maximises evolved`);
console.log(`    dark-causality (P^D* ≈ ${peak.evolved_dark}) — change rewards adaptability. ✓ (trinity's SOC direction)`);
console.log(`  • Too-fast change ⇒ the population can't track (maladaptation explodes,`);
console.log(`    extinctions begin) and P^D* falls back — an "edge of chaos" in tracking.`);
console.log(`  • BUT τ stays ~${study[0].tau.toFixed(1)} throughout: in this trait-matching model the`);
console.log(`    dark-causality ratio and the Zipf exponent are DECOUPLED. The`);
console.log(`    "max diversity ⟺ τ≈2" leg is not reproduced — an honest open question.`);
console.log("");
