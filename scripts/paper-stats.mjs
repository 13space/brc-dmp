// paper-stats.mjs — reproducible statistics for the paper revision (P0 roadmap).
// ============================================================================
// Computes, from the REAL deterministic models, the numbers reviewers asked for:
//   • multi-seed mean ± 95% CI for M1–M4 (≥20 seeds)
//   • M3 distribution of "fraction of ticks with τ near 2" across seeds
//   • M4 power-law goodness-of-fit: Clauset-style MLE exponent + KS distance
//     + nonparametric bootstrap 95% CI, alongside the existing rank-size R².
// Run:  node scripts/paper-stats.mjs   (prints a report; ~1–2 min for SOC seeds)
import { runEvolution } from "../services/world-engine/src/evolve.js";
import { runAdaptiveEvolution } from "../services/world-engine/src/adapt.js";
import { runUnified } from "../services/world-engine/src/unify.js";
import { runSandpile } from "../services/world-engine/src/soc.js";

const SEEDS = Array.from({ length: 24 }, (_, i) => 1009 + i * 97); // 24 fixed, well-spread seeds

// ---- small stats helpers ----------------------------------------------------
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const std = (xs) => {
  const m = mean(xs);
  // sample standard deviation (n-1)
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
};
// 95% CI half-width via Student-t (df = n-1). t for df≥20 ≈ 2.07–2.09; use 2.08.
const ci95 = (xs) => {
  const n = xs.length;
  const tcrit = n >= 30 ? 2.045 : n >= 20 ? 2.07 : 2.2; // conservative for n≈24
  return (tcrit * std(xs)) / Math.sqrt(n);
};
const fmt = (m, h, d = 4) => `${m.toFixed(d)} ± ${h.toFixed(d)}`;
const round = (x, d = 4) => Math.round(x * 10 ** d) / 10 ** d;

function summarize(label, xs, d = 4) {
  const m = mean(xs);
  const h = ci95(xs);
  console.log(`    ${label.padEnd(22)} ${fmt(m, h, d)}   (n=${xs.length}, min ${round(Math.min(...xs), d)}, max ${round(Math.max(...xs), d)})`);
  return { mean: round(m, d), ci95: round(h, d), n: xs.length };
}

// ---- Clauset-style discrete power-law MLE + KS ------------------------------
// For p(s) ∝ s^(-alpha), s ≥ smin. Discrete MLE (continuous approximation, good
// for the avalanche range here): alpha = 1 + n / Σ ln( s_i / (smin - 0.5) ).
function fitPowerLawMLE(sizes, smin = 1) {
  const xs = sizes.filter((s) => s >= smin);
  const n = xs.length;
  const denom = xs.reduce((a, s) => a + Math.log(s / (smin - 0.5)), 0);
  const alpha = 1 + n / denom;
  // KS distance between empirical CDF and the fitted (discrete, continuous-approx) CDF.
  // Power-law CDF (continuous approx): P(>=s) = (s / smin)^(-(alpha-1)); CDF F(s)=1-P(>=s+1)
  const sorted = [...xs].sort((a, b) => a - b);
  const uniq = [...new Set(sorted)];
  let D = 0;
  for (const s of uniq) {
    const empCDF = sorted.filter((v) => v <= s).length / n;       // S(s)
    const fitCDF = 1 - Math.pow((s + 1) / smin, -(alpha - 1));     // F(s) model
    D = Math.max(D, Math.abs(empCDF - fitCDF));
  }
  return { alpha, ks: D, n, smin };
}

// nonparametric bootstrap CI for alpha (and the implied rank-size tau = 1/(alpha-1))
function bootstrapAlpha(sizes, smin = 1, B = 300, seed = 12345) {
  let a = seed >>> 0;
  const rng = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const xs = sizes.filter((s) => s >= smin);
  const n = xs.length;
  const alphas = [];
  const taus = [];
  for (let b = 0; b < B; b += 1) {
    const sample = new Array(n);
    for (let i = 0; i < n; i += 1) sample[i] = xs[Math.floor(rng() * n)];
    const { alpha } = fitPowerLawMLE(sample, smin);
    alphas.push(alpha);
    taus.push(1 / (alpha - 1));
  }
  alphas.sort((x, y) => x - y);
  taus.sort((x, y) => x - y);
  const q = (arr, p) => arr[Math.floor(p * (arr.length - 1))];
  return {
    alpha_lo: q(alphas, 0.025), alpha_hi: q(alphas, 0.975),
    tau_lo: q(taus, 0.025), tau_hi: q(taus, 0.975)
  };
}

// ============================================================================
console.log("\n=================  PAPER STATISTICS (real models, 24 seeds)  =================\n");
console.log(`seeds: ${SEEDS.join(", ")}\n`);

// ---- M1 static evolution ----------------------------------------------------
console.log("M1  STATIC EVOLUTION — settled readouts across seeds:");
{
  const runs = SEEDS.map((seed) => runEvolution({ seed }).settled);
  summarize("P^D* (mean_dark)", runs.map((r) => r.mean_dark));
  summarize("τ (Zipf)", runs.map((r) => r.tau));
  summarize("diversity", runs.map((r) => r.diversity));
  summarize("alive", runs.map((r) => r.alive), 1);
}

// ---- M2 changing environment ------------------------------------------------
console.log("\nM2  CHANGING ENVIRONMENT — P^D* and τ at the peak drift (0.15) across seeds:");
{
  const runs = SEEDS.map((seed) => runAdaptiveEvolution({ seed, envDrift: 0.15 }).settled);
  summarize("P^D* @drift0.15", runs.map((r) => r.mean_dark));
  summarize("τ @drift0.15", runs.map((r) => r.tau));
  console.log("    (static drift=0 reference:)");
  const ref = SEEDS.map((seed) => runAdaptiveEvolution({ seed, envDrift: 0 }).settled);
  summarize("P^D* @drift0", ref.map((r) => r.mean_dark));
  summarize("τ @drift0", ref.map((r) => r.tau));
}

// ---- M3 unified — the headline "fraction near 2" ---------------------------
console.log("\nM3  UNIFIED MODEL (envDrift 0.12) — across seeds:");
{
  const runs = SEEDS.map((seed) => runUnified({ seed, envDrift: 0.12 }).settled);
  summarize("P^D* (mean_dark)", runs.map((r) => r.mean_dark));
  summarize("τ median", runs.map((r) => r.tau_median));
  summarize("frac. near 2", runs.map((r) => r.tau_bands.near_two));
  summarize("frac. sub-critical", runs.map((r) => r.tau_bands.sub_critical));
  summarize("frac. super-critical", runs.map((r) => r.tau_bands.super_critical));
}

// ---- M4 SOC sandpile — poise + goodness-of-fit -----------------------------
console.log("\nM4  SOC SANDPILE — poise across seeds:");
{
  const runs = SEEDS.map((seed) => runSandpile({ seed }));
  summarize("τ (rank-size LS)", runs.map((r) => r.tau));
  summarize("rank-size R²", runs.map((r) => r.tau_r_squared));
  summarize("critical density", runs.map((r) => r.critical_density));
  summarize("load fixed-pt std", runs.map((r) => r.load_fixed_point_std));

  // Goodness-of-fit on POOLED avalanche sizes (3 seeds pooled keeps it ~60k samples).
  console.log("\n  Power-law goodness-of-fit (Clauset-style MLE + KS) on real avalanche sizes:");
  const pooled = [];
  for (const seed of SEEDS.slice(0, 3)) pooled.push(...runSandpile({ seed }).avalanche_sizes);
  for (const smin of [1, 2, 4]) {
    const { alpha, ks, n } = fitPowerLawMLE(pooled, smin);
    const tauImplied = 1 / (alpha - 1);
    const bs = bootstrapAlpha(pooled, smin);
    console.log(`    smin=${smin}: pdf α̂=${round(alpha, 3)}  [${round(bs.alpha_lo,3)}, ${round(bs.alpha_hi,3)}]  ` +
                `⇒ rank-size τ=1/(α−1)=${round(tauImplied, 3)}  [${round(bs.tau_lo,3)}, ${round(bs.tau_hi,3)}]  ` +
                `KS=${round(ks, 4)}  (n=${n})`);
  }
  console.log("    (mean-field SOC predicts pdf α=1.5 ⇒ rank-size τ=2.0)");
}

console.log("\n=============================================================================\n");
