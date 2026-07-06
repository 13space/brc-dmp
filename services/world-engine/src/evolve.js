// BRC-LIFE — dark-causality open-ended evolution simulator
// ---------------------------------------------------------------------------
// The real test of ConstraintNet's deepened trinity:
//   constraint closure ⟺ max diversity ⟺ Zipf τ≈2 ⟺ optimal dark-causality P^D*.
//
// We do NOT feed τ in. We run an eco-evolutionary process and MEASURE what
// emerges:
//   • Agents forage a finite shared niche (carrying capacity ⇒ competition).
//   • Each tick an agent acts pos (exploit: steady payoff) or dark (explore:
//     heavy-tailed multiplicative payoff). Its `dark` gene is the probability of
//     a dark action — i.e. its personal P^D.
//   • Basal cost drains energy; energy ≤ 0 ⇒ death (no external fitness fn,
//     Tierra-style: only survival and reproduction).
//   • Above a threshold an agent reproduces: the child splits the parent's
//     energy and inherits a MUTATED genome (dark propensity + forage rate).
//
// Selection therefore tunes the population's dark-causality ratio with no
// target imposed. We then read off the emergent τ and mean P^D, and (via a
// sweep over fixed P^D) check whether the diversity-maximising P^D* coincides
// with Zipf criticality — the trinity's novel coupling.
import { diversity, fitZipf } from "./zipf.js";

export const EVOLVE_DEFAULTS = Object.freeze({
  seed: 42,
  ticks: 600,
  capacity: 1500, // total niche energy available per tick (carrying capacity)
  basal: 4, // basal metabolic cost per tick
  reproThreshold: 140, // energy needed to reproduce
  childEndowment: 40, // fixed energy handed to a child (parent keeps the rest → preserves leads)
  initialPop: 12,
  initialEnergy: 50,
  initialDark: 0.5, // seed dark-causality propensity
  maxPop: 500, // hard population cap (safety)
  mutationStd: 0.06, // genome mutation magnitude
  posPayoff: 7, // base payoff of a pos (exploit) action
  prefExponent: 1, // preferential (rich-get-richer) foraging: claim ∝ energy^pref
  refEnergy: 50, // energy scale used to normalize the preferential factor
  darkSigma: 1.3, // log-variance of a dark (explore) action's payoff
  sampleEvery: 1, // record metrics every N ticks
  tailFraction: 0.2 // average the final fraction of ticks for the "settled" readout
});

// Deterministic PRNG (mulberry32) + Gaussian so runs are exactly reproducible.
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
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function runEvolution(options = {}) {
  const p = { ...EVOLVE_DEFAULTS, ...options };
  const rng = makeRng(p.seed);

  let nextId = 0;
  const lineage = []; // { id, parent, gen, birth, death }
  const genHistogram = [];
  const newAgent = (energy, dark, forage, gen, parent, birth) => {
    const id = nextId++;
    lineage.push({ id, parent, gen, birth, death: null });
    genHistogram[gen] = (genHistogram[gen] || 0) + 1;
    return { id, energy, dark, forage, gen, parent, birth, alive: true };
  };

  let population = [];
  for (let i = 0; i < p.initialPop; i += 1) {
    const dark = p.fixedDark != null ? p.fixedDark : clamp01(p.initialDark + 0.05 * gaussian(rng));
    population.push(newAgent(p.initialEnergy, dark, 1, 0, null, 0));
  }

  const history = [];
  let totalBorn = population.length;
  let maxGeneration = 0;

  for (let tick = 1; tick <= p.ticks; tick += 1) {
    const alive = population.filter((a) => a.alive);
    if (alive.length === 0) break;

    // 1. Each agent claims energy via a pos (exploit) or dark (explore) action.
    let darkActions = 0;
    const claims = alive.map((agent) => {
      // Preferential (rich-get-richer) foraging: bigger organisms claim more.
      const pref = Math.pow(Math.max(agent.energy, 1) / p.refEnergy, p.prefExponent);
      let claim = p.posPayoff * agent.forage * pref;
      const explore = rng() < agent.dark;
      if (explore) {
        darkActions += 1;
        // Dark action: heavy-tailed, mean-preserving multiplier (explore: usually
        // small, rarely huge) — the variance that amplifies inequality.
        claim *= Math.exp(p.darkSigma * gaussian(rng) - (p.darkSigma * p.darkSigma) / 2);
      }
      return Math.max(0, claim);
    });

    // 2. Competition: scale claims down if the niche is over-subscribed.
    const totalClaim = claims.reduce((a, b) => a + b, 0);
    const scale = totalClaim > p.capacity ? p.capacity / totalClaim : 1;

    // 3. Metabolize: intake − basal.
    alive.forEach((agent, i) => {
      agent.energy += claims[i] * scale - p.basal;
    });

    // 4. Death.
    for (const agent of alive) {
      if (agent.energy <= 0 && agent.alive) {
        agent.alive = false;
        const record = lineage[agent.id];
        if (record) record.death = tick;
      }
    }

    // 5. Reproduction (mutating genome), respecting the population cap.
    const survivors = population.filter((a) => a.alive);
    for (const agent of survivors) {
      if (agent.energy >= p.reproThreshold && population.length < p.maxPop) {
        const childEnergy = p.childEndowment; // fixed endowment ⇒ parent keeps its lead
        agent.energy -= childEnergy;
        const dark = p.fixedDark != null ? p.fixedDark : clamp01(agent.dark + p.mutationStd * gaussian(rng));
        const forage = Math.max(0.1, agent.forage * Math.exp(p.mutationStd * gaussian(rng)));
        const child = newAgent(childEnergy, dark, forage, agent.gen + 1, agent.id, tick);
        population.push(child);
        totalBorn += 1;
        maxGeneration = Math.max(maxGeneration, child.gen);
      }
    }

    // 6. Compact the population list to living agents (keep memory bounded).
    population = population.filter((a) => a.alive);

    // 7. Record metrics.
    if (tick % p.sampleEvery === 0 || tick === p.ticks) {
      const livingEnergies = population.map((a) => a.energy);
      const fit = fitZipf(livingEnergies);
      history.push({
        tick,
        alive: population.length,
        tau: fit.tau == null ? null : round4(fit.tau),
        r_squared: fit.r_squared == null ? null : round4(fit.r_squared),
        mean_dark: round4(mean(population.map((a) => a.dark))),
        realized_dark: round4(alive.length ? darkActions / alive.length : 0),
        diversity: round4(diversity(livingEnergies)),
        births: population.filter((a) => a.birth === tick).length,
        deaths: alive.length - survivors.length
      });
    }
  }

  const tail = history.slice(Math.max(0, history.length - Math.ceil(history.length * p.tailFraction)));
  const settled = {
    tau: round4(meanOf(tail, "tau")),
    mean_dark: round4(meanOf(tail, "mean_dark")),
    realized_dark: round4(meanOf(tail, "realized_dark")),
    diversity: round4(meanOf(tail, "diversity")),
    alive: Math.round(meanOf(tail, "alive"))
  };

  return {
    params: p,
    history,
    settled,
    lineage: {
      total_born: totalBorn,
      max_generation: maxGeneration,
      generation_histogram: genHistogram.map((count, gen) => ({ gen, count })),
      deepest_path: deepestPath(lineage),
      final_alive: population.length
    }
  };
}

// Sweep fixed dark-causality propensities to expose the P^D → (τ, diversity)
// relationship and locate the diversity-maximising P^D*.
export function evolveSweep(options = {}, darkValues = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]) {
  return darkValues.map((dark) => {
    const run = runEvolution({ ...options, fixedDark: dark, initialDark: dark });
    return {
      dark,
      tau: run.settled.tau,
      diversity: run.settled.diversity,
      alive: run.settled.alive,
      survived: run.lineage.final_alive > 0
    };
  });
}

function deepestPath(lineage) {
  if (lineage.length === 0) return [];
  let deepest = lineage[0];
  for (const node of lineage) {
    if (node.gen > deepest.gen) deepest = node;
  }
  const path = [];
  let cursor = deepest;
  const byId = new Map(lineage.map((n) => [n.id, n]));
  while (cursor) {
    path.unshift({ id: cursor.id, gen: cursor.gen, birth: cursor.birth });
    cursor = cursor.parent == null ? null : byId.get(cursor.parent);
  }
  return path;
}

function meanOf(rows, key) {
  const values = rows.map((r) => r[key]).filter((v) => v != null && Number.isFinite(v));
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function round4(x) {
  return x == null ? null : Math.round(x * 1e4) / 1e4;
}
