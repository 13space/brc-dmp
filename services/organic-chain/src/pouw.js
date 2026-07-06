// BRC-LIFE — Organic chain (Mode B): Proof-of-Useful-Work.
// ---------------------------------------------------------------------------
// Classic PoW burns energy on a useless hash race. Here the "work" is an
// evolutionary search that is intrinsically useful to the living system: miners
// search the genome space for an autopoietic configuration whose constraint-
// closure / metabolic viability clears the current difficulty threshold.
//
//   • A candidate genome is derived deterministically from
//     sha256(prev_hash || miner || nonce) — like a PoW nonce, but it decodes to
//     an agent's parameters (forage, basal, energy, dark, trait).
//   • Its fitness = a deterministic constraint-closure score in [0,1] that
//     rewards HOMEOSTATIC SURVIVORS (intake ≈ expenditure, the C1 metabolic
//     edge) — i.e. well-closed life, exactly the trinity's ideal.
//   • A valid solution has fitness ≥ difficulty. Because the genome is hashed
//     from the nonce, fitness over nonces is an uncorrelated draw, so finding a
//     high-fitness genome needs brute-force search (PoW-like, tunable) — but
//     every evaluation does USEFUL work (scoring a real alife configuration),
//     and the winning genomes are curated into the ecosystem.
//   • Verification re-derives the one candidate and recomputes its fitness — O(1).
//
// Security budget == life-evolution budget: the chain is secured by the same
// work that breeds better-closed organisms.
import { sha256Hex } from "../../../packages/schema/src/canonicalize.js";

export const POUW_PARAMS = Object.freeze({
  trialTicks: 12, // length of the metabolic viability trial used as the fitness score
  intakeScale: 8 // intake = forage * intakeScale
});

// Decode a 64-hex digest into a candidate genome (uncorrelated across nonces).
export function decodeCandidate(seedHex) {
  const byte = (i) => parseInt(seedHex.slice(i * 2, i * 2 + 2), 16) / 255;
  return {
    forage: round4(0.2 + byte(0) * 2.8), // [0.2, 3.0]
    basal: round4(1 + byte(1) * 15), // [1, 16]
    energy0: round4(30 + byte(2) * 90), // [30, 120]
    dark: round4(byte(3)), // [0, 1] dark-causality propensity
    trait: round4(-2 + byte(4) * 4) // [-2, 2] niche trait
  };
}

// The USEFUL work: score a candidate by running a short metabolic viability
// trial and rewarding a well-closed, homeostatic survivor (the C1 edge).
export function evaluateFitness(candidate, params = POUW_PARAMS) {
  const intake = candidate.forage * params.intakeScale;
  let energy = candidate.energy0;
  let survived = 0;
  for (let t = 0; t < params.trialTicks; t += 1) {
    energy += intake - candidate.basal;
    if (energy <= 0) break;
    survived += 1;
  }
  const survival = survived / params.trialTicks;
  // homeostasis: intake ≈ basal (constraint-closure C1 metabolic balance)
  const balance = 1 - Math.min(1, Math.abs(intake - candidate.basal) / Math.max(candidate.basal, 1));
  const efficiency = Math.max(0, Math.min(1, energy / (candidate.energy0 + params.trialTicks * 4)));
  const fitness = 0.45 * survival + 0.35 * balance + 0.2 * efficiency;
  return round4(Math.max(0, Math.min(1, fitness)));
}

export function solutionSeed(prevHash, miner, nonce) {
  return sha256Hex(`${prevHash}|${miner}|${nonce}`);
}

// One mining attempt: derive + score the candidate for this nonce.
export function attempt(prevHash, miner, nonce, params = POUW_PARAMS) {
  const seed = solutionSeed(prevHash, miner, nonce);
  const candidate = decodeCandidate(seed);
  const fitness = evaluateFitness(candidate, params);
  return { nonce, seed, candidate, fitness };
}

// Search for a solution whose USEFUL-work fitness clears the difficulty target.
// Returns the solution (+ trials done) or null if not found within maxTrials.
export function mineSolution(prevHash, miner, difficulty, maxTrials, params = POUW_PARAMS) {
  for (let nonce = 0; nonce < maxTrials; nonce += 1) {
    const result = attempt(prevHash, miner, nonce, params);
    if (result.fitness >= difficulty) {
      return { ...result, trials: nonce + 1, found: true };
    }
  }
  return { found: false, trials: maxTrials };
}

// Cheap verification: re-derive the candidate and confirm it clears difficulty.
export function verifySolution(prevHash, miner, nonce, fitness, difficulty, params = POUW_PARAMS) {
  const result = attempt(prevHash, miner, nonce, params);
  return result.fitness === fitness && result.fitness >= difficulty;
}

// Deterministic fitness CDF (fixed calibration sample) → objective work measure.
// Every node computes the same expectedWork(difficulty); since difficulty is
// consensus-enforced (chain.js), cumulative work cannot be faked.
const FITNESS_CDF = (() => {
  const sample = [];
  for (let n = 0; n < 4000; n += 1) sample.push(attempt("work-calibration", "calibration", n).fitness);
  return sample.sort((a, b) => a - b);
})();

// Expected number of search trials to find a genome with fitness ≥ difficulty.
export function expectedWork(difficulty) {
  let ge = 0;
  for (let i = FITNESS_CDF.length - 1; i >= 0; i -= 1) {
    if (FITNESS_CDF[i] >= difficulty) ge += 1;
    else break;
  }
  const p = Math.max(1 / FITNESS_CDF.length, ge / FITNESS_CDF.length);
  return Math.round(1 / p);
}

function round4(x) {
  return Math.round(x * 1e4) / 1e4;
}
