// BRC-LIFE World Engine — Zipf / C5 closure analysis
// ---------------------------------------------------------------------------
// ConstraintNet's "deepened trinity":
//   constraint closure (CoC) ⟺ maximum diversity (max D) ⟺ Zipf (τ ≈ 2) ⟺ optimal dark-causality ratio.
// C5 is therefore an EMERGENT, POPULATION-LEVEL condition (not a per-agent one):
// it asks whether the rank-size distribution of the living population follows a
// power law with exponent τ ≈ 2 — the critical, maximally diverse, "edge of
// chaos" state where the ecosystem has the most computational/evolutionary
// capacity (ConstraintNet v1.3 §3.2, condition 5; §4 deepened trinity).

export const ZIPF_PARAMS = Object.freeze({
  target_tau: 2, // critical exponent (max diversity)
  epsilon_zipf: 0.3, // |τ-2| < ε  => at criticality (C5⁺)
  delta_zipf: 0.8, // |τ-2| > δ  => off criticality (C5⁻)
  kappa_zipf: 0.25, // sigmoid temperature
  min_population: 8 // below this a power-law fit is meaningless => C5 not evaluated
});

function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

function round6(x) {
  return Math.round(x * 1e6) / 1e6;
}

function normalizeTriple({ pos, neg, dark }) {
  const p = Math.max(0, pos);
  const n = Math.max(0, neg);
  const d = Math.max(0, dark);
  const sum = p + n + d;
  if (sum === 0) return { pos: 0, neg: 0, dark: 1 };
  return { pos: p / sum, neg: n / sum, dark: d / sum };
}

function roundTriple(t) {
  return { pos: round6(t.pos), neg: round6(t.neg), dark: round6(t.dark) };
}

// Least-squares fit of log(size) = a − τ·log(rank) over the rank-size curve.
export function fitZipf(sizes) {
  const ranked = sizes.filter((s) => s > 0).sort((a, b) => b - a);
  const n = ranked.length;
  if (n < 2) return { tau: null, r_squared: null, n, ranked };

  const xs = ranked.map((_, index) => Math.log(index + 1));
  const ys = ranked.map((size) => Math.log(size));
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const r2 = sxx === 0 || syy === 0 ? 0 : (sxy * sxy) / (sxx * syy);
  return { tau: -slope, r_squared: r2, n, ranked };
}

// Normalized Shannon diversity of the size distribution (0..1; 1 = perfectly even).
export function diversity(sizes) {
  const positive = sizes.filter((s) => s > 0);
  const total = positive.reduce((a, b) => a + b, 0);
  if (total === 0 || positive.length <= 1) return 0;
  let entropy = 0;
  for (const size of positive) {
    const p = size / total;
    entropy -= p * Math.log(p);
  }
  return entropy / Math.log(positive.length);
}

// Three-valued C5 closure centered on τ = 2.
export function zipfClosure(tau, params = ZIPF_PARAMS) {
  if (tau == null) return { pos: 0, neg: 0, dark: 1 };
  const deviation = Math.abs(tau - params.target_tau);
  const pos = sigmoid((params.epsilon_zipf - deviation) / params.kappa_zipf);
  const neg = sigmoid((deviation - params.delta_zipf) / params.kappa_zipf);
  const dark = 1 - pos - neg;
  return normalizeTriple({ pos, neg, dark });
}

// Analyze a population's size distribution. Returns an unevaluated marker when
// the population is too small for a meaningful power-law fit.
export function analyzePopulation(sizes, params = ZIPF_PARAMS) {
  const fit = fitZipf(sizes);
  if (fit.n < params.min_population) {
    return { evaluated: false, n: fit.n, min_population: params.min_population };
  }
  const deviation = Math.abs(fit.tau - params.target_tau);
  const c5 = zipfClosure(fit.tau, params);
  const status =
    deviation < params.epsilon_zipf
      ? "optimal_criticality"
      : fit.tau < 1 || fit.tau > 3
        ? "off_criticality"
        : "transitional";

  return {
    evaluated: true,
    n: fit.n,
    tau: round6(fit.tau),
    r_squared: round6(fit.r_squared),
    diversity: round6(diversity(sizes)),
    target_tau: params.target_tau,
    deviation: round6(deviation),
    c5: roundTriple(c5),
    status,
    rank_size: fit.ranked
  };
}
