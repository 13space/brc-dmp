// export-fig-data.mjs — dump REAL data for the publication figures (no schematics).
// Writes ../figures/data.json with the genuine SOC mean-load time series, the
// avalanche-size histogram, and the MLE power-law fit, so make_figures.py plots
// measured data rather than reconstructions.
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { runSandpile } from "../services/world-engine/src/soc.js";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "../../figures");
mkdirSync(outDir, { recursive: true });

// One representative seed for the time series / histogram (same model as the paper).
const run = runSandpile({ seed: 1009 });

// Clauset-style continuous-approx MLE (matches scripts/paper-stats.mjs).
function fitPowerLawMLE(sizes, smin) {
  const xs = sizes.filter((s) => s >= smin);
  const n = xs.length;
  const denom = xs.reduce((a, s) => a + Math.log(s / (smin - 0.5)), 0);
  const alpha = 1 + n / denom;
  const sorted = [...xs].sort((a, b) => a - b);
  let D = 0;
  for (const s of [...new Set(sorted)]) {
    const emp = sorted.filter((v) => v <= s).length / n;
    const fit = 1 - Math.pow((s + 1) / smin, -(alpha - 1));
    D = Math.max(D, Math.abs(emp - fit));
  }
  return { smin, alpha: Math.round(alpha * 1e3) / 1e3, ks: Math.round(D * 1e4) / 1e4, n };
}

const data = {
  generated: new Date().toISOString(),
  soc: {
    seed: run.params.seed,
    load_series: run.load_series,
    critical_density: run.critical_density,
    load_fixed_point_std: run.load_fixed_point_std,
    tau_rank_size: run.tau,
    tau_r_squared: run.tau_r_squared,
    histogram: run.histogram,            // {lo,hi,label,count}
    mle: [1, 2, 4].map((smin) => fitPowerLawMLE(run.avalanche_sizes, smin))
  },
  // finite-size scaling from scripts/finite-size.mjs (4 seeds/size, 120k drives) —
  // tau is size-independent; the cutoff s_max scales with L ⇒ genuine criticality.
  finite_size: {
    rows: [
      { L: 200,  tau: 1.9267, max_s: 1618, mean_s: 89.96, crit: 0.5582 },
      { L: 400,  tau: 1.9758, max_s: 2294, mean_s: 93.25, crit: 0.5372 },
      { L: 800,  tau: 1.9764, max_s: 3638, mean_s: 95.82, crit: 0.5236 },
      { L: 1600, tau: 1.9536, max_s: 4663, mean_s: 97.45, crit: 0.5146 },
      { L: 3200, tau: 1.9185, max_s: 6007, mean_s: 98.44, crit: 0.5086 }
    ],
    D_max: 0.4808,   // s_max ∝ L^D
    a_mean: 0.0323,  // <s> ∝ L^a
    tau_range: [1.9185, 1.9764]
  },
  // multi-seed 95% CIs from scripts/paper-stats.mjs (24 seeds) — for figure captions.
  ci: {
    M1: { pD: [0.4997, 0.0380], tau: [2.2152, 0.5684], diversity: [0.4415, 0.1917], alive: [175.4, 76.5] },
    M2: { pD_drift015: [0.3197, 0.0363], tau_drift015: [0.8834, 0.1256], pD_drift0: [0.2968, 0.0036], tau_drift0: [0.8570, 0.0005] },
    M3: { pD: [0.3124, 0.0417], tau_median: [1.4990, 0.4922], near2: [0.0438, 0.0377], sub: [0.6612, 0.1854], sup: [0.2001, 0.1508] },
    M4: { tau_ls: [1.9773, 0.0013], r2: [0.9078, 0.0006], crit_density: [0.5235, 0.0003], load_std: [0.0130, 0.0002] }
  }
};

writeFileSync(resolve(outDir, "data.json"), JSON.stringify(data, null, 2));
console.log(`wrote figures/data.json — load_series ${run.load_series.length} pts, ` +
            `crit ${run.critical_density}±std ${run.load_fixed_point_std}, MLE ${JSON.stringify(data.soc.mle)}`);
