// BRC-LIFE — unified model: dark causality drives BOTH adaptability AND the
// resource distribution. The decisive test of ConstraintNet's full trinity.
// ---------------------------------------------------------------------------
// Two earlier models each captured half of the trinity:
//   • evolve.js  — dark actions inject foraging variance ⇒ τ couples to P^D
//     (but a static environment selects P^D DOWN, and high P^D collapses).
//   • adapt.js   — a changing environment selects P^D UP (dark = evolvability),
//     but dark never touches the energy distribution ⇒ τ stays decoupled (~0.8).
//
// Here dark causality does both, through ONE mechanism. A "dark action" is an
// EXPLORATION: the agent samples a different effective trait this tick and is
// paid by how well THAT sampled trait matches the drifting niche optimum θ(t).
//   • Adaptive: when θ has moved and the agent is mismatched, exploring can land
//     near θ → big payoff (so a changing environment rewards dark causality).
//   • Heavy-tailed: sampling through the sharply-peaked match landscape makes
//     payoffs occasionally huge, usually small → inequality → it moves τ.
// Plus dark = evolvability (offspring trait-mutation rate), and preferential
// (rich-get-richer) foraging that lets the variance compound into a power law.
//
// Prediction under test: the environmental change rate that selects the
// interior-optimal P^D* also drives the energy distribution to Zipf τ ≈ 2 —
// i.e. adaptability-criticality and Zipf-criticality COINCIDE.
import { diversity, fitZipf } from "./zipf.js";

export const UNIFY_DEFAULTS = Object.freeze({
  seed: 7,
  ticks: 1000,
  capacity: 1600,
  basal: 4,
  reproThreshold: 140,
  childEndowment: 40,
  initialPop: 40,
  initialEnergy: 60,
  initialDark: 0.3,
  maxPop: 700,
  posPayoff: 12,
  prefExponent: 1, // rich-get-richer foraging: lets dark variance compound into a power law
  refEnergy: 50,
  // environment
  envDrift: 0.12,
  thetaAmplitude: 4,
  nicheWidth: 0.8,
  baselineMatch: 0.1,
  exploreWidth: 1.4, // a dark (explore) action samples this far in trait space
  darkSigma: 1.0, // heavy-tailed (log-normal) upside of a dark action ⇒ couples to τ
  // genetics — dark also = evolvability
  traitMutBase: 0.02,
  traitMutDark: 0.3,
  darkMutStd: 0.04,
  initialTrait: 0,
  sampleEvery: 2,
  warmup: 0.25,
  tailFraction: 0.4
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

function gaussian(rng) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const round4 = (x) => (x == null ? null : Math.round(x * 1e4) / 1e4);

export function runUnified(options = {}) {
  const p = { ...UNIFY_DEFAULTS, ...options };
  const rng = makeRng(p.seed);

  let nextId = 0;
  let totalBorn = 0;
  let maxGeneration = 0;
  const makeAgent = (energy, trait, dark, forage, gen, parent, birth) => {
    totalBorn += 1;
    maxGeneration = Math.max(maxGeneration, gen);
    return { id: nextId++, energy, trait, dark, forage, gen, parent, birth, alive: true };
  };

  let theta = 0;
  let population = [];
  for (let i = 0; i < p.initialPop; i += 1) {
    const dark = p.fixedDark != null ? p.fixedDark : clamp01(p.initialDark + 0.05 * gaussian(rng));
    population.push(makeAgent(p.initialEnergy, p.initialTrait + 0.3 * gaussian(rng), dark, 1, 0, null, 0));
  }

  const history = [];
  for (let tick = 1; tick <= p.ticks; tick += 1) {
    theta = clamp(theta + p.envDrift * gaussian(rng), -p.thetaAmplitude, p.thetaAmplitude);

    const alive = population.filter((a) => a.alive);
    if (alive.length === 0) break;

    let darkActions = 0;
    const claims = alive.map((agent) => {
      const explore = rng() < agent.dark;
      let effTrait = agent.trait;
      if (explore) {
        darkActions += 1;
        effTrait = agent.trait + p.exploreWidth * gaussian(rng); // dark action = exploration
      }
      const fit = Math.exp(-((effTrait - theta) ** 2) / (2 * p.nicheWidth * p.nicheWidth));
      const match = p.baselineMatch + (1 - p.baselineMatch) * fit;
      const pref = Math.pow(Math.max(agent.energy, 1) / p.refEnergy, p.prefExponent);
      let claim = p.posPayoff * agent.forage * pref * match;
      // A dark action also carries a heavy-tailed (mean-preserving) upside: most
      // explorations gain little, a few hit big — the variance that builds a
      // power-law energy distribution (couples dark causality to τ).
      if (explore) claim *= Math.exp(p.darkSigma * gaussian(rng) - (p.darkSigma * p.darkSigma) / 2);
      return Math.max(0, claim);
    });

    const total = claims.reduce((a, b) => a + b, 0);
    const scale = total > p.capacity ? p.capacity / total : 1;
    alive.forEach((agent, i) => {
      agent.energy += claims[i] * scale - p.basal;
    });

    for (const agent of alive) {
      if (agent.energy <= 0) agent.alive = false;
    }

    const survivors = population.filter((a) => a.alive);
    for (const agent of survivors) {
      if (agent.energy >= p.reproThreshold && population.length < p.maxPop) {
        agent.energy -= p.childEndowment;
        const evolvability = p.traitMutBase + p.traitMutDark * agent.dark;
        const childTrait = agent.trait + evolvability * gaussian(rng);
        const childDark = p.fixedDark != null ? p.fixedDark : clamp01(agent.dark + p.darkMutStd * gaussian(rng));
        const childForage = Math.max(0.1, agent.forage * Math.exp(p.darkMutStd * gaussian(rng)));
        population.push(makeAgent(p.childEndowment, childTrait, childDark, childForage, agent.gen + 1, agent.id, tick));
      }
    }

    population = population.filter((a) => a.alive);

    if (tick % p.sampleEvery === 0 || tick === p.ticks) {
      const energies = population.map((a) => a.energy);
      const fit = fitZipf(energies);
      history.push({
        tick,
        theta: round4(theta),
        alive: population.length,
        tau: fit.tau == null ? null : round4(fit.tau),
        mean_dark: round4(mean(population.map((a) => a.dark))),
        realized_dark: round4(alive.length ? darkActions / alive.length : 0),
        maladaptation: round4(mean(population.map((a) => Math.abs(a.trait - theta)))),
        diversity: round4(diversity(energies))
      });
    }
  }

  const warmupCut = Math.floor(history.length * p.warmup);
  const tail = history.slice(Math.max(warmupCut, history.length - Math.ceil(history.length * p.tailFraction)));
  const tailTaus = tail.map((r) => r.tau).filter((v) => v != null && Number.isFinite(v)).sort((a, b) => a - b);
  const band = (lo, hi) => (tailTaus.length ? tailTaus.filter((v) => v >= lo && v < hi).length / tailTaus.length : 0);
  const settled = {
    tau: round4(meanOf(tail, "tau")),
    tau_median: tailTaus.length ? round4(tailTaus[Math.floor(tailTaus.length / 2)]) : null,
    // τ is bistable; these bands expose whether the system POISES at the critical
    // edge (mass near 2) or merely FLICKERS across it (mass split sub/super).
    tau_bands: {
      sub_critical: round4(band(-Infinity, 1)), // diverse phase
      near_two: round4(band(1.5, 2.5)), // poised at the τ≈2 edge
      super_critical: round4(band(3, Infinity)) // concentrated / winner-take-all phase
    },
    mean_dark: round4(meanOf(tail, "mean_dark")),
    realized_dark: round4(meanOf(tail, "realized_dark")),
    maladaptation: round4(meanOf(tail, "maladaptation")),
    diversity: round4(meanOf(tail, "diversity")),
    alive: Math.round(meanOf(tail, "alive"))
  };

  return {
    params: p,
    history,
    settled,
    lineage: { total_born: totalBorn, max_generation: maxGeneration, final_alive: population.length }
  };
}

// Sweep the environmental change rate; average over seeds. The headline test:
// do P^D* AND τ rise TOGETHER with environmental change, meeting near τ ≈ 2?
export function unifiedDriftStudy(options = {}, drifts = [0, 0.04, 0.08, 0.12, 0.18, 0.28, 0.4], seeds = [7, 11, 23]) {
  return drifts.map((envDrift) => {
    const runs = seeds.map((seed) => runUnified({ ...options, seed, envDrift }));
    const avg = (key) => runs.reduce((sum, run) => sum + (run.settled[key] ?? 0), 0) / runs.length;
    const avgBand = (key) => runs.reduce((sum, run) => sum + (run.settled.tau_bands[key] ?? 0), 0) / runs.length;
    return {
      env_drift: envDrift,
      evolved_dark: round4(avg("mean_dark")),
      tau_mean: round4(avg("tau")),
      tau_median: round4(avg("tau_median")),
      // bistability: where does τ actually spend its time?
      frac_sub_critical: round4(avgBand("sub_critical")),
      frac_near_two: round4(avgBand("near_two")),
      frac_super_critical: round4(avgBand("super_critical")),
      maladaptation: round4(avg("maladaptation")),
      alive: Math.round(avg("alive")),
      extinctions: runs.filter((run) => run.lineage.final_alive === 0).length,
      seeds: seeds.length
    };
  });
}

function meanOf(rows, key) {
  const values = rows.map((r) => r[key]).filter((v) => v != null && Number.isFinite(v));
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}
