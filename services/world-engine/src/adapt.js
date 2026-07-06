// BRC-LIFE — changing-environment (self-organized criticality) experiment
// ---------------------------------------------------------------------------
// The static-environment run showed selection drives dark-causality DOWN
// (exploitation wins; τ stays sub-critical). ConstraintNet's trinity, read as
// self-organized criticality, predicts the opposite WHEN the environment
// changes: a moving niche rewards ADAPTABILITY, so exploration (dark causality)
// becomes fit, and the population should be pulled toward the τ≈2 critical edge.
//
// Model: a niche optimum θ(t) does a bounded random walk (rate = envDrift). An
// agent's foraging success is a Gaussian match between its trait and θ. The
// `dark` gene does double duty, exactly as ConstraintNet frames dark causality
// (the source of adaptation/novelty):
//   • behavioral exploration — a dark action samples a different trait this tick
//     (can capture payoff when the agent is mismatched to a shifted θ);
//   • evolvability — offspring trait mutation scales with the parent's dark gene.
//
// Static θ ⇒ exploration only costs (drifts off a matched trait) ⇒ P^D↓.
// Drifting θ ⇒ exploration tracks the moving optimum ⇒ P^D↑.
// We MEASURE the evolved P^D* and the emergent τ across environmental change.
import { diversity, fitZipf } from "./zipf.js";

export const ADAPT_DEFAULTS = Object.freeze({
  seed: 7,
  ticks: 900,
  capacity: 1600,
  basal: 4,
  reproThreshold: 140,
  childEndowment: 40,
  initialPop: 40,
  initialEnergy: 60,
  initialDark: 0.3,
  maxPop: 700,
  posPayoff: 12,
  prefExponent: 1, // rich-get-richer foraging (keeps the Zipf structure)
  refEnergy: 50,
  // environment
  envDrift: 0.1, // std of the niche optimum's random walk per tick (0 = static)
  thetaAmplitude: 4, // reflecting bound on θ
  nicheWidth: 0.9, // Gaussian matching tolerance
  baselineMatch: 0.1, // survival floor: even a mismatched agent forages a little (prevents mass extinction)
  // genetics — dark causality = EVOLVABILITY (offspring trait mutation rate)
  traitMutBase: 0.02, // mutation of a pure-exploiter (dark→0): tiny, preserves a matched trait
  traitMutDark: 0.3, // a pure-explorer (dark→1) mutates this much: tracks a moving optimum
  darkMutStd: 0.04, // mutation of the dark gene itself
  initialTrait: 0,
  sampleEvery: 2,
  warmup: 0.25, // ignore the first quarter (let the population adapt) for the readout
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

export function runAdaptiveEvolution(options = {}) {
  const p = { ...ADAPT_DEFAULTS, ...options };
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
    // Environment drifts (bounded random walk).
    theta = clamp(theta + p.envDrift * gaussian(rng), -p.thetaAmplitude, p.thetaAmplitude);

    const alive = population.filter((a) => a.alive);
    if (alive.length === 0) break;

    const claims = alive.map((agent) => {
      // Foraging success = how well the agent's trait matches the current niche
      // optimum θ, on a floor so a mismatched agent still scrapes by while adapting.
      const fit = Math.exp(-((agent.trait - theta) ** 2) / (2 * p.nicheWidth * p.nicheWidth));
      const match = p.baselineMatch + (1 - p.baselineMatch) * fit;
      const pref = Math.pow(Math.max(agent.energy, 1) / p.refEnergy, p.prefExponent);
      return Math.max(0, p.posPayoff * agent.forage * pref * match);
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
        // Dark causality = evolvability: the dark gene IS the offspring mutation rate.
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
        maladaptation: round4(mean(population.map((a) => Math.abs(a.trait - theta)))),
        diversity: round4(diversity(energies))
      });
    }
  }

  const warmupCut = Math.floor(history.length * p.warmup);
  const tail = history.slice(Math.max(warmupCut, history.length - Math.ceil(history.length * p.tailFraction)));
  const settled = {
    tau: round4(meanOf(tail, "tau")),
    mean_dark: round4(meanOf(tail, "mean_dark")),
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

// Sweep the environmental change rate. The key test: does the evolved
// dark-causality ratio P^D* rise with environmental change, pulling τ toward 2?
export function adaptiveSweep(options = {}, driftValues = [0, 0.02, 0.05, 0.1, 0.2, 0.35]) {
  return driftValues.map((envDrift) => {
    const run = runAdaptiveEvolution({ ...options, envDrift });
    return {
      env_drift: envDrift,
      evolved_dark: run.settled.mean_dark,
      tau: run.settled.tau,
      maladaptation: run.settled.maladaptation,
      diversity: run.settled.diversity,
      alive: run.settled.alive,
      survived: run.lineage.final_alive > 0
    };
  });
}

// Averaged drift study (reduces single-seed noise): for each environmental
// change rate, evolve under several seeds and average the settled readouts.
// The headline test of the trinity's SOC reading lives here.
export function adaptiveDriftStudy(options = {}, drifts = [0, 0.04, 0.08, 0.15, 0.25, 0.4], seeds = [7, 11, 23]) {
  return drifts.map((envDrift) => {
    const runs = seeds.map((seed) => runAdaptiveEvolution({ ...options, seed, envDrift }));
    const avg = (key) => runs.reduce((sum, run) => sum + (run.settled[key] ?? 0), 0) / runs.length;
    return {
      env_drift: envDrift,
      evolved_dark: round4(avg("mean_dark")),
      tau: round4(avg("tau")),
      maladaptation: round4(avg("maladaptation")),
      diversity: round4(avg("diversity")),
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
