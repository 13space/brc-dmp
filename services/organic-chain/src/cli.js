// BRC-LIFE — Organic chain (Mode B): Proof-of-Useful-Work demo.
//   node services/organic-chain/src/cli.js [blocks]
//
// Mines a chain whose security work IS the alife evolution: each block requires
// discovering a high-closure genome (useful), which joins the on-chain
// population; every node recomputes the living-world state (consensus); the
// block reward issues metabolic energy. Security budget == life budget.
import { addBlock, createChain, mineBlock, populationFitness, tip, validateChain } from "./chain.js";

const blocks = Number(process.argv[2] || 60);
const miners = ["alice", "bob", "carol", "dave", "erin"];

const chain = createChain();

console.log("\nBRC-LIFE — Organic Chain (Mode B): Proof-of-Useful-Work");
console.log("=".repeat(72));
console.log("Work = evolutionary search for high-closure genomes. Block = metabolic tick.\n");
console.log(" height | miner | difficulty | trials | fitness | pop | popFit | cum.work");

let totalTrials = 0;
for (let h = 1; h <= blocks; h += 1) {
  const block = mineBlock(chain, miners[h % miners.length]);
  if (!block) {
    console.log(`  block ${h}: no solution within maxTrials`);
    break;
  }
  addBlock(chain, block);
  totalTrials += block.trials;
  if (h <= 3 || h % 5 === 0) {
    console.log(
      `   ${String(h).padStart(4)}  | ${block.miner.padEnd(5)} |    ${block.difficulty.toFixed(2)}    |  ${String(block.trials).padStart(4)}  | ${block.fitness.toFixed(3)} | ${String(chain.agents.length).padStart(3)} |  ${populationFitness(chain.agents).toFixed(2)}  | ${block.cumulative_work}`
    );
  }
}

const head = tip(chain);
console.log("\nchain head:");
console.log(`  height ${head.height} · difficulty ${head.difficulty} · cumulative useful-work ${head.cumulative_work} trials`);
console.log(`  living population ${chain.agents.length} · mean closure-fitness ${populationFitness(chain.agents)}`);
console.log(`  world_root ${head.world_root}`);

// Independent full-node validation: recompute every world transition.
const verdict = validateChain(chain.blocks);
console.log("\nconsensus check (independent full-node re-validation):");
console.log(`  chain valid: ${verdict.valid} · world_root reproduced: ${verdict.world_root === head.world_root}`);

// Tamper test.
const tampered = chain.blocks.map((b) => ({ ...b }));
const target = Math.min(10, tampered.length - 1);
tampered[target] = { ...tampered[target], fitness: 0.999 };
const tamperVerdict = validateChain(tampered);
console.log(`  tampered chain rejected: ${!tamperVerdict.valid} (reason: ${tamperVerdict.reason} @ height ${tamperVerdict.height})`);

console.log("\nREADING:");
console.log(`  • Proof-of-Useful-Work: ${totalTrials} genome evaluations secured the chain — and every`);
console.log(`    one scored a real autopoietic configuration (no wasted hashing).`);
console.log(`  • The world engine runs IN CONSENSUS: liveness + energy are recomputed by every`);
console.log(`    validator (world_root), so "who is alive" needs no trusted indexer.`);
console.log(`  • Block reward = metabolic energy issuance; difficulty self-tunes; the population's`);
console.log(`    mean closure-fitness rises — the chain literally breeds better-closed life.`);
console.log(`  • Security budget == life-evolution budget: the "二合一" of Mode B.`);
console.log("");
