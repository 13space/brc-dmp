// BRC-LIFE — self-organized criticality: the missing feedback.
// ---------------------------------------------------------------------------
// All three eco-evolution models gave bistable FLICKERING across the τ≈2 edge,
// never POISE on it. The reason: they lacked the defining mechanism of SOC — a
// slow drive + threshold release + dissipation, whose balance is a stable
// attractor exactly at the critical point (sandpile / Bak–Tang–Wiesenfeld).
//
// Here that mechanism is mapped to the project's language as a "constraint-
// tension sandpile": each agent slowly accumulates constraint tension (slow
// drive); when tension exceeds a closure threshold it RELEASES in a metabolic
// avalanche, shedding tension to coupled agents and possibly triggering a
// cascade (this release IS a burst of dark-causality — the system exploring/
// reorganizing). A little tension dissipates at each step. With no tuning, the
// system self-organizes to the critical density where avalanches span all
// scales.
//
// Prediction: avalanche sizes follow a power law. Mean-field SOC has frequency
// exponent α ≈ 3/2, i.e. a RANK-SIZE exponent 1/(α−1) ≈ 2 in the project's
// fitZipf convention — so the self-organized τ should land at ≈ 2, AND be
// poised (a stable attractor), not bistable. We measure, honestly.
import { fitZipf } from "./zipf.js";

export const SOC_DEFAULTS = Object.freeze({
  seed: 7,
  sites: 800, // coupled agents
  zCrit: 2, // closure threshold (Manna-style)
  dissipation: 0.01, // fraction of released tension that leaves the system (mean-field-clean regime ⇒ rank-size τ≈2)
  drives: 60000, // slow-drive events (one unit of tension added per event, then full relaxation)
  warmup: 0.3, // ignore the transient before the critical state is reached
  initialLoad: 0
});

function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const std = (xs) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};
const round4 = (x) => (x == null ? null : Math.round(x * 1e4) / 1e4);

export function runSandpile(options = {}) {
  const p = { ...SOC_DEFAULTS, ...options };
  const rng = makeRng(p.seed);
  const randSite = () => Math.floor(rng() * p.sites);

  const z = new Array(p.sites).fill(p.initialLoad);
  const avalanches = [];
  const loadSeries = [];
  const sampleEvery = Math.max(1, Math.floor(p.drives / 400));

  for (let g = 1; g <= p.drives; g += 1) {
    // Slow drive: one unit of constraint tension added to a random agent.
    const seed = randSite();
    z[seed] += 1;

    // Fast relaxation: topple every agent above threshold until all are stable.
    let size = 0;
    const stack = [];
    if (z[seed] >= p.zCrit) stack.push(seed);
    while (stack.length) {
      const i = stack.pop();
      while (z[i] >= p.zCrit) {
        z[i] -= p.zCrit;
        size += 1;
        for (let m = 0; m < p.zCrit; m += 1) {
          if (rng() >= p.dissipation) {
            const j = randSite(); // mean-field coupling: release to a random neighbour
            z[j] += 1;
            if (z[j] >= p.zCrit) stack.push(j);
          }
        }
      }
    }
    avalanches.push(size);
    if (g % sampleEvery === 0) loadSeries.push(round4(mean(z)));
  }

  // Self-organized critical state: mean load should converge to a fixed point.
  const warmupCut = Math.floor(loadSeries.length * p.warmup);
  const tailLoad = loadSeries.slice(warmupCut);
  const warmupDrives = Math.floor(p.drives * p.warmup);
  const tailAval = avalanches.slice(warmupDrives).filter((s) => s > 0);

  const fit = fitZipf(tailAval);

  // Avalanche-size histogram (log-spaced bins) for the power-law view.
  const maxSize = Math.max(1, ...tailAval);
  const edges = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, Infinity];
  const histogram = edges.slice(0, -1).map((lo, i) => ({
    lo,
    hi: edges[i + 1],
    label: edges[i + 1] === Infinity ? `${lo}+` : `${lo}-${edges[i + 1] - 1}`,
    count: tailAval.filter((s) => s >= lo && s < edges[i + 1]).length
  }));

  return {
    params: p,
    tau: round4(fit.tau),
    tau_r_squared: round4(fit.r_squared),
    critical_density: round4(mean(tailLoad)),
    load_fixed_point_std: round4(std(tailLoad)), // small ⇒ POISE (converges), not bistable
    mean_avalanche: round4(mean(tailAval)),
    max_avalanche: maxSize,
    avalanche_count: tailAval.length,
    load_series: loadSeries,
    avalanche_sizes: tailAval, // raw post-warmup avalanche sizes (for MLE/KS goodness-of-fit)
    histogram
  };
}

// SOC's defining signature: the critical state is an ATTRACTOR — reached from
// any initial condition. Drive from empty AND from over-full; the critical
// density and τ should coincide (self-organized, not tuned).
export function socRobustness(options = {}, initialLoads = [0, 1, 4]) {
  return initialLoads.map((initialLoad) => {
    const run = runSandpile({ ...options, initialLoad });
    return {
      initial_load: initialLoad,
      critical_density: run.critical_density,
      tau: run.tau,
      load_fixed_point_std: run.load_fixed_point_std
    };
  });
}
