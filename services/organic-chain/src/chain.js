// BRC-LIFE — Organic chain (Mode B): the world engine IN CONSENSUS.
// ---------------------------------------------------------------------------
// Each block is one metabolic tick. Producing a block requires Proof-of-Useful-
// Work (pouw.js): the miner discovers a high-closure genome, which JOINS the
// on-chain population. The block also issues energy (the block reward = metabolic
// energy), every living agent metabolizes and competes, and agents that run out
// of energy die. The resulting living-population state (world_root) is committed
// in the block and DETERMINISTICALLY RECOMPUTED by every validator — so
// "who is alive" is consensus-enforced, with no trusted indexer.
import { hashObject } from "../../../packages/schema/src/canonicalize.js";
import { POUW_PARAMS, attempt, expectedWork, mineSolution, verifySolution } from "./pouw.js";

export const CHAIN_PARAMS = Object.freeze({
  blockReward: 90, // energy issued per block (split competitively among living agents)
  initialDifficulty: 0.8, // starting fitness threshold for PoUW
  // Difficulty self-tunes (deterministically, from in-block fitness) to keep the
  // winning-genome margin near this target — analogous to keeping block time constant.
  targetMargin: 0.025,
  retargetInterval: 5,
  difficultyStep: 0.01,
  minDifficulty: 0.5,
  maxDifficulty: 0.92,
  maxTrials: 500000,
  maxPopulation: 200
});

// Deterministic difficulty schedule: the difficulty the NEXT block must use,
// computed purely from prior blocks' (verified) fitness — a consensus rule, so
// no miner can choose an easier target. Retargets toward CHAIN_PARAMS.targetMargin.
export function nextDifficulty(blocks, params = CHAIN_PARAMS) {
  const real = blocks.filter((b) => b.height > 0);
  let difficulty = params.initialDifficulty;
  const scheduled = [];
  for (let i = 0; i < real.length; i += 1) {
    scheduled.push(difficulty);
    if ((i + 1) % params.retargetInterval === 0) {
      const window = [];
      for (let k = i + 1 - params.retargetInterval; k <= i; k += 1) window.push(real[k].fitness - scheduled[k]);
      const avgMargin = window.reduce((a, b) => a + b, 0) / window.length;
      difficulty =
        avgMargin > params.targetMargin
          ? Math.min(params.maxDifficulty, round2(difficulty + params.difficultyStep))
          : Math.max(params.minDifficulty, round2(difficulty - params.difficultyStep));
    }
  }
  return difficulty;
}

const round2 = (x) => Math.round(x * 100) / 100;
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

// Deterministic world-state transition (the consensus-critical part): add the
// winning genome, issue + compete for energy, metabolize, cull the dead.
export function applyBlockToWorld(agents, block, params = CHAIN_PARAMS) {
  const next = agents.map((a) => ({ ...a }));
  next.push({
    id: `agent-${block.height}`,
    born_block: block.height,
    miner: block.miner,
    forage: block.candidate.forage,
    basal: block.candidate.basal,
    fitness: block.fitness,
    energy: round2(block.candidate.energy0)
  });

  // Block reward = issued energy, split by forage share (competition / carrying capacity).
  const totalForage = next.reduce((sum, a) => sum + a.forage, 0) || 1;
  for (const a of next) {
    const intake = params.blockReward * (a.forage / totalForage);
    a.energy = round2(a.energy + intake - a.basal);
  }

  let living = next.filter((a) => a.energy > 0);
  // Cap population by keeping the most-energetic (resource limit).
  if (living.length > params.maxPopulation) {
    living = living.slice().sort((a, b) => b.energy - a.energy).slice(0, params.maxPopulation);
  }
  living.sort((a, b) => a.id.localeCompare(b.id));
  const world_root = hashObject(living.map((a) => ({ id: a.id, energy: a.energy, born_block: a.born_block })));
  return { living, world_root };
}

function blockHash(block) {
  const { hash, ...rest } = block;
  void hash;
  return hashObject(rest);
}

export function createChain(params = CHAIN_PARAMS) {
  const genesis = {
    height: 0,
    prev_hash: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    tick: 0,
    miner: "genesis",
    nonce: 0,
    candidate: null,
    fitness: 0,
    difficulty: 0,
    trials: 0,
    world_root: hashObject([]),
    cumulative_work: 0
  };
  genesis.hash = blockHash(genesis);
  return {
    params,
    blocks: [genesis],
    agents: [],
    difficulty: params.initialDifficulty
  };
}

export function tip(chain) {
  return chain.blocks[chain.blocks.length - 1];
}

// Mine the next block: do the useful-work search, build the block, apply the
// world transition, commit world_root.
export function mineBlock(chain, miner) {
  const prev = tip(chain);
  const difficulty = round2(nextDifficulty(chain.blocks, chain.params));
  const solution = mineSolution(prev.hash, miner, difficulty, chain.params.maxTrials, POUW_PARAMS);
  if (!solution.found) return null;

  const work = expectedWork(difficulty); // objective (consensus-computed from difficulty)
  const block = {
    height: prev.height + 1,
    prev_hash: prev.hash,
    tick: prev.tick + 1,
    miner,
    nonce: solution.nonce,
    candidate: solution.candidate,
    fitness: solution.fitness,
    difficulty,
    trials: solution.trials, // informational only (not trusted by consensus)
    work,
    cumulative_work: prev.cumulative_work + work
  };
  const { world_root } = applyBlockToWorld(chain.agents, block, chain.params);
  block.world_root = world_root;
  block.hash = blockHash(block);
  return block;
}

// Validate a block independently (PoUW + recomputed world_root + links + hash).
export function validateBlock(chain, block) {
  const prev = tip(chain);
  if (block.height !== prev.height + 1) return { valid: false, reason: "bad_height" };
  if (block.prev_hash !== prev.hash) return { valid: false, reason: "bad_prev_hash" };
  // Difficulty is a consensus rule: it must equal the deterministic schedule.
  if (block.difficulty !== round2(nextDifficulty(chain.blocks, chain.params))) {
    return { valid: false, reason: "bad_difficulty_schedule" };
  }
  // Proof-of-Useful-Work: the genome must clear the committed difficulty.
  if (!verifySolution(prev.hash, block.miner, block.nonce, block.fitness, block.difficulty, POUW_PARAMS)) {
    return { valid: false, reason: "bad_pouw" };
  }
  // Work is objective (a function of the enforced difficulty) — it cannot be faked.
  if (block.work !== expectedWork(block.difficulty)) return { valid: false, reason: "bad_work" };
  if (block.cumulative_work !== prev.cumulative_work + block.work) return { valid: false, reason: "bad_cumulative_work" };
  // World engine in consensus: recompute the state transition and match world_root.
  const { world_root } = applyBlockToWorld(chain.agents, block, chain.params);
  if (world_root !== block.world_root) return { valid: false, reason: "bad_world_root" };
  if (blockHash(block) !== block.hash) return { valid: false, reason: "bad_hash" };
  return { valid: true };
}

export function addBlock(chain, block) {
  const check = validateBlock(chain, block);
  if (!check.valid) throw new Error(`invalid block: ${check.reason}`);
  const { living } = applyBlockToWorld(chain.agents, block, chain.params);
  chain.blocks.push(block);
  chain.agents = living;
  chain.difficulty = round2(nextDifficulty(chain.blocks, chain.params));
  return chain;
}

// Validate an entire chain from genesis (independent full-node verification).
export function validateChain(blocks, params = CHAIN_PARAMS) {
  const replay = createChain(params);
  for (let i = 1; i < blocks.length; i += 1) {
    const check = validateBlock(replay, blocks[i]);
    if (!check.valid) return { valid: false, height: blocks[i].height, reason: check.reason };
    addBlock(replay, blocks[i]);
  }
  return { valid: true, height: tip(replay).height, world_root: tip(replay).world_root };
}

export function populationFitness(agents) {
  return round2(mean(agents.map((a) => a.fitness ?? 0)));
}

export { attempt };
