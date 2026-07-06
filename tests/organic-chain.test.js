import assert from "node:assert/strict";
import test from "node:test";
import {
  CHAIN_PARAMS,
  addBlock,
  createChain,
  evaluateFitness,
  mineBlock,
  mineSolution,
  populationFitness,
  tip,
  validateBlock,
  validateChain,
  verifySolution
} from "../services/organic-chain/src/index.js";

function mineN(n) {
  const chain = createChain();
  const miners = ["alice", "bob", "carol", "dave"];
  for (let h = 1; h <= n; h += 1) addBlock(chain, mineBlock(chain, miners[h % miners.length]));
  return chain;
}

test("PoUW is hard to produce but cheap to verify, and tunable by difficulty", () => {
  const easy = mineSolution("genesis", "alice", 0.6, 100000);
  const hard = mineSolution("genesis", "alice", 0.92, 500000);
  assert.ok(easy.found && hard.found);
  assert.ok(hard.trials > easy.trials, "higher difficulty should need more search");
  // verification is a single cheap re-evaluation
  assert.ok(verifySolution("genesis", "alice", hard.nonce, hard.fitness, 0.92));
  assert.ok(!verifySolution("genesis", "alice", hard.nonce, hard.fitness, 0.999), "should fail an impossible difficulty");
});

test("useful work scores real alife configs: fitness is in [0,1] and rewards survivors", () => {
  const dead = evaluateFitness({ forage: 0.2, basal: 16, energy0: 30 }); // starves immediately
  const thriving = evaluateFitness({ forage: 1.5, basal: 10, energy0: 80 });
  assert.ok(dead >= 0 && dead <= 1 && thriving >= 0 && thriving <= 1);
  assert.ok(thriving > dead, "a homeostatic survivor should outscore a starver");
});

test("mining is deterministic and the chain self-validates", () => {
  const a = mineN(20);
  const b = mineN(20);
  assert.equal(tip(a).hash, tip(b).hash, "same miners ⇒ identical chain");
  const verdict = validateChain(a.blocks);
  assert.equal(verdict.valid, true);
  assert.equal(verdict.world_root, tip(a).world_root, "world_root must be independently reproducible (consensus)");
});

test("world engine in consensus: a tampered block is rejected", () => {
  const chain = mineN(15);
  // tamper with a committed world_root → independent recompute won't match
  const tampered = chain.blocks.map((b) => ({ ...b }));
  tampered[8] = { ...tampered[8], world_root: "sha256:" + "0".repeat(64) };
  const verdict = validateChain(tampered);
  assert.equal(verdict.valid, false);
  assert.ok(["bad_world_root", "bad_hash", "bad_pouw"].includes(verdict.reason));
});

test("difficulty self-tunes within bounds and useful-work accumulates", () => {
  const chain = mineN(40);
  assert.ok(tip(chain).difficulty >= CHAIN_PARAMS.minDifficulty);
  assert.ok(tip(chain).difficulty <= CHAIN_PARAMS.maxDifficulty);
  assert.ok(tip(chain).difficulty > CHAIN_PARAMS.initialDifficulty, "difficulty should rise toward the target-trials equilibrium");
  assert.ok(tip(chain).cumulative_work > 40, "cumulative useful-work should accumulate");
});

test("the chain curates well-closed life (block reward + metabolic selection)", () => {
  const chain = mineN(40);
  assert.ok(chain.agents.length > 0, "a living population should persist");
  assert.ok(populationFitness(chain.agents) > 0.7, "mean closure-fitness should be high (only good genomes survive)");
  // every living agent cleared the PoUW gate (fitness ≥ some difficulty)
  assert.ok(chain.agents.every((a) => a.fitness >= CHAIN_PARAMS.minDifficulty));
});
