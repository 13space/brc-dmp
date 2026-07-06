// BRC-LIFE World Engine
// ---------------------------------------------------------------------------
// Turns ConstraintNet (v1.3) into the indexer's liveness-judgement layer.
// It computes, for every autopoietic_agent in an indexed world state, a
// three-valued constraint-closure vector CoC³ = (pos, neg, dark) and a
// liveness verdict (closed | critical_closed | broken).
//
// This module is the SOLE source of truth for "is it alive?". It is pure and
// deterministic: same state + same params => same engine_root.
//
// v1 evaluates two of ConstraintNet's five closure conditions:
//   C1  energy-work closure   (dynamic, from the metabolism ledger + basal drain)
//   C4  topological closure   (structural, from the (M,R,phi) triad + membrane + edges)
// C2 (time-scale separation), C3 (ergodicity) and C5 (Zipf) are declared but
// not yet evaluated; they are listed in `pending_conditions` for later milestones.
import { hashObject } from "../../../packages/schema/src/canonicalize.js";
import { analyzePopulation } from "./zipf.js";

export const DEFAULT_PARAMS = Object.freeze({
  epsilon: 4, // ΔE dead-band for C1 (ConstraintNet v1.3 §3.2 condition 1)
  kappa1: 4, // sigmoid temperature for C1
  window: 1, // ΔE is measured over this many ticks
  comfortEnergy: 60, // reserves at/above this (and not collapsing) => robustly closed
  criticalEnergy: 30, // reserves below this => critical (low fuel)
  thetaPos: 0.45, // CoC⁺ threshold for "closed"
  thetaNeg: 0.55, // CoC⁻ threshold for "closure breaking"
  // C2 — time-scale separation (ρ = τ_constraint / τ_flow)
  c2_kappa: 3, // ρ threshold: genes should change >=3x slower than metabolism
  c2_temp: 0.7,
  // C3 — ergodicity / stability (Foster–Lyapunov proxy via time-to-zero)
  c3_horizon: 6, // ticks; survival beyond this counts as a stable attractor
  c3_delta: 0.5, // dead-band so the edge (time-to-zero ≈ horizon) reads dark
  c3_temp: 0.6
});

// CoC³ now evaluates four per-agent conditions; C5 (Zipf) is the emergent
// population-level condition reported separately by the World Engine.
const EVALUATED_CONDITIONS = ["C1_energy_work", "C2_timescale", "C3_ergodicity", "C4_topological"];
const PENDING_CONDITIONS = ["C5_zipf_population_level"];

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

// energy(tick): genesis endowment + signed ledger deltas up to tick − basal drain.
// The World Engine owns "true" energy because basal drain accrues with ticks,
// not with discrete events.
export function energyAt(metabolism, tick, params) {
  const genesisTick = metabolism.genesis_tick ?? 0;
  const t = Math.max(tick, genesisTick);
  let energy = metabolism.energy_genesis;
  for (const entry of metabolism.ledger) {
    if (entry.tick <= t) energy += entry.delta;
  }
  energy -= metabolism.basal_cost_per_tick * (t - genesisTick);
  return energy;
}

// C1 — energy-work closure, three-valued (ConstraintNet v1.3 §3.2, condition 1).
function energyWorkClosure(deltaEnergy, params) {
  const pos = sigmoid((deltaEnergy - params.epsilon) / params.kappa1); // surplus → stable
  const neg = sigmoid((-deltaEnergy - params.epsilon) / params.kappa1); // deficit → collapsing
  const dark = 1 - pos - neg; // |ΔE| < ε → critical balance (edge of chaos)
  return normalizeTriple({ pos, neg, dark });
}

// C4 — topological / organizational closure, three-valued (structural).
// Grounded in (M,R)-systems: presence of the M, R and phi triad means R is
// re-produced by the system itself (organizational closure); a bound membrane
// gives operational closure; a produced_by cycle in the ConstraintNet closes
// the constraint loop.
function topologicalClosure(dmo) {
  const g = dmo.genome || {};
  const hasTriad = Boolean(g.M && g.R && g.phi);
  const hasMembrane = Boolean(dmo.membrane && dmo.membrane.binding);
  const hasProducedByCycle = (dmo.constraints || []).some((c) => c.relation === "produced_by");

  let pos = (hasTriad ? 0.6 : 0.15) + (hasMembrane ? 0.3 : 0) + (hasProducedByCycle ? 0.1 : 0);
  pos = Math.min(pos, 0.98);
  const dark = hasTriad ? 0.1 : 0.35;
  const neg = Math.max(0, 1 - pos - dark);
  return normalizeTriple({ pos, neg, dark });
}

// C2 — time-scale separation, three-valued (ConstraintNet v1.3 §3.2, condition 2).
// Life needs slow constraints (the genome) riding on fast flows (metabolism):
// ρ = τ_constraint / τ_flow should be ≫ 1.
function timescaleClosure(dmo, tick, params) {
  const m = dmo.metabolism;
  const age = Math.max(1, tick - (m.genesis_tick ?? 0));
  const flowEvents = m.ledger.length;
  const tauFlow = flowEvents >= 2 ? age / flowEvents : 1; // mean ticks between metabolic events
  const genomeChanges = dmo.genome_mutations?.length ?? 0;
  const tauConstraint = genomeChanges >= 1 ? age / genomeChanges : age; // stable genome ⇒ whole life
  const rho = tauConstraint / Math.max(tauFlow, 1e-6);
  const logRho = Math.log(Math.max(rho, 1e-6));
  const threshold = Math.log(params.c2_kappa);
  const pos = sigmoid((logRho - threshold) / params.c2_temp); // genes slow vs flow → separated
  const neg = sigmoid((-logRho - threshold) / params.c2_temp); // genes faster than flow → pathological
  const dark = 1 - pos - neg; // ρ ≈ 1 → constraint and flow co-evolve (edge)
  return normalizeTriple({ pos, neg, dark });
}

// C3 — ergodicity / stability, three-valued (Foster–Lyapunov proxy).
// Does the agent stay bounded above zero (a stable attractor), or escape to death?
function ergodicityClosure(energyNow, deltaEnergy, params) {
  if (energyNow <= 0) return { pos: 0, neg: 1, dark: 0 };
  const timeToZero = deltaEnergy < 0 ? energyNow / -deltaEnergy : Infinity;
  if (!Number.isFinite(timeToZero)) return normalizeTriple({ pos: 0.85, neg: 0.05, dark: 0.1 });
  const x = Math.log(Math.max(timeToZero, 1e-6) / params.c3_horizon); // >0 stable, <0 escaping
  const pos = sigmoid((x - params.c3_delta) / params.c3_temp);
  const neg = sigmoid((-x - params.c3_delta) / params.c3_temp);
  const dark = 1 - pos - neg; // time-to-zero ≈ horizon → edge of viability
  return normalizeTriple({ pos, neg, dark });
}

// Three-valued conjunction ⊗ (ConstraintNet v1.3 §3.3, product form).
function combineClosure(a, b) {
  const pos = a.pos * b.pos;
  const neg = 1 - (1 - a.neg) * (1 - b.neg);
  const dark = 1 - pos - neg;
  return normalizeTriple({ pos, neg, dark });
}

function combineClosures(conditions) {
  return conditions.reduce((accumulator, condition) => combineClosure(accumulator, condition));
}

// Liveness verdict from CoC³ plus the reserve state. CoC³ captures the closure
// RATE/structure; reserves capture the buffer the agent has to survive deficits.
function livenessStatus(coc3, energyNow, params) {
  if (energyNow <= 0) return "broken"; // starved to death
  if (coc3.neg > params.thetaNeg) {
    return energyNow < params.criticalEnergy ? "broken" : "critical_closed";
  }
  if (energyNow >= params.comfortEnergy) return "closed"; // ample reserves, not collapsing
  if (energyNow < params.criticalEnergy) return "critical_closed";
  if (coc3.dark > coc3.pos) return "critical_closed";
  if (coc3.pos >= params.thetaPos) return "closed";
  return "critical_closed";
}

// Per-agent closure snapshot at a given tick.
export function computeAgentClosure(dmo, tick, params = DEFAULT_PARAMS) {
  const energyNow = energyAt(dmo.metabolism, tick, params);
  const energyPrev = energyAt(dmo.metabolism, tick - params.window, params);
  const deltaEnergy = energyNow - energyPrev;

  const c1 = energyWorkClosure(deltaEnergy, params);
  const c2 = timescaleClosure(dmo, tick, params);
  const c3 = ergodicityClosure(energyNow, deltaEnergy, params);
  const c4 = topologicalClosure(dmo);
  const coc3 = combineClosures([c1, c2, c3, c4]);

  // Death is permanent, but only from the tick it was recorded — the life arc
  // reconstructs closure as-of each historical tick, so an agent is not "dead"
  // at ticks before its apoptosis.
  const deathTick = dmo.death?.tick;
  const dead = dmo.life_status === "dead" && (deathTick == null || tick >= deathTick);
  const status = dead ? "broken" : livenessStatus(coc3, energyNow, params);

  return {
    id: dmo.id,
    generation: dmo.lineage?.generation ?? 0,
    tick,
    energy: round6(energyNow),
    delta_energy: round6(deltaEnergy),
    c1_energy_work: roundTriple(c1),
    c2_timescale: roundTriple(c2),
    c3_ergodicity: roundTriple(c3),
    c4_topological: roundTriple(c4),
    coc3: roundTriple(coc3),
    status,
    recorded_death: dead ? dmo.death?.reason ?? "apoptosed" : null,
    evaluated_conditions: EVALUATED_CONDITIONS,
    pending_conditions: PENDING_CONDITIONS
  };
}

// The full life arc of one agent: a closure snapshot at every tick in [from, to].
export function computeLifeArc(dmo, fromTick, toTick, params = DEFAULT_PARAMS) {
  const arc = [];
  for (let tick = fromTick; tick <= toTick; tick += 1) {
    const snap = computeAgentClosure(dmo, tick, params);
    arc.push({ tick, energy: snap.energy, status: snap.status, coc3: snap.coc3 });
  }
  return arc;
}

function livingAgents(state) {
  return state.assets.filter((asset) => asset.kind === "autopoietic_agent" && asset.metabolism);
}

function maxTick(agents) {
  let max = 0;
  for (const agent of agents) {
    const m = agent.metabolism;
    const last = Math.max(m.genesis_tick ?? 0, m.last_tick ?? 0);
    const deathTick = agent.death?.tick ?? 0;
    max = Math.max(max, last, deathTick);
  }
  return max;
}

// Run the engine over an indexed world state. Returns per-agent verdicts plus a
// deterministic engine_root (the closure analogue of the indexer's state_root).
export function runWorldEngine(state, options = {}) {
  const params = { ...DEFAULT_PARAMS, ...(options.params || {}) };
  const agents = livingAgents(state);
  const atTick = options.atTick ?? maxTick(agents);

  const reports = agents
    .map((agent) => computeAgentClosure(agent, atTick, params))
    .sort((a, b) => a.id.localeCompare(b.id));

  const population = reports.length;
  const alive = reports.filter((r) => r.status !== "broken").length;
  const critical = reports.filter((r) => r.status === "critical_closed").length;
  const dead = reports.filter((r) => r.status === "broken").length;

  // C5 — Zipf / criticality, an emergent population-level condition: does the
  // rank-size distribution of the living population sit at τ ≈ 2 (max diversity)?
  const livingSizes = reports.filter((r) => r.status !== "broken").map((r) => r.energy);
  const zipf = analyzePopulation(livingSizes, options.zipfParams);

  const summary = { at_tick: atTick, population, alive, critical, dead };
  return {
    ...summary,
    params,
    zipf,
    agents: reports,
    engine_root: hashObject({ summary, params, zipf, agents: reports })
  };
}
