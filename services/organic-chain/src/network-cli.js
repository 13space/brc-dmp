// BRC-LIFE — Organic chain (Mode B): toy P2P network demo.
//   node services/organic-chain/src/network-cli.js
//
// Five full nodes gossip, then the network partitions (two branches diverge),
// then heals — and every node converges on the heaviest valid chain, reorging
// the lighter branch. Fork-choice is sound: work is objective and difficulty is
// consensus-enforced.
import { broadcast, converged, createNetwork, heal, mineAndBroadcast, partition, tipsSummary } from "./network.js";

const net = createNetwork(["n1", "n2", "n3", "n4", "n5"]);
const show = (label) => {
  const t = tipsSummary(net);
  console.log(`  ${label.padEnd(20)} converged=${converged(net)}  ` + t.map((x) => `${x.id}@h${x.height}/w${x.work}`).join("  "));
};

console.log("\nBRC-LIFE — Organic Chain (Mode B): toy P2P network");
console.log("=".repeat(72));
console.log("5 full nodes · fork-choice = heaviest valid chain (objective work).\n");

console.log("PHASE 1 — honest mining + gossip:");
for (let i = 0; i < 12; i += 1) mineAndBroadcast(net, net.nodes[i % 5].id);
gossip();
show("after honest phase");

console.log("\nPHASE 2 — partition {n1,n2,n3} | {n4,n5}, each branch mines alone:");
partition(net, ["n1", "n2", "n3"], ["n4", "n5"]);
for (let i = 0; i < 7; i += 1) {
  mineAndBroadcast(net, "n1");
  mineAndBroadcast(net, "n2");
}
for (let i = 0; i < 3; i += 1) mineAndBroadcast(net, "n4");
const tA = tipsSummary(net).find((x) => x.id === "n1");
const tB = tipsSummary(net).find((x) => x.id === "n4");
console.log(`  branch A {n1-n3}: h${tA.height} / work ${tA.work} / ${tA.tip}`);
console.log(`  branch B {n4-n5}: h${tB.height} / work ${tB.work} / ${tB.tip}   (lighter)`);
console.log(`  converged: ${converged(net)}  ← the chain has forked`);

console.log("\nPHASE 3 — heal the partition and gossip to consensus:");
heal(net);
const reorgs = gossip();
show("after heal");
console.log(`  reorgs: ${reorgs.length ? reorgs.map((r) => `${r.node} dropped ${r.orphaned} block(s)`).join("; ") : "none"}`);

console.log("\nREADING:");
console.log("  • Honest nodes gossip blocks and converge on one tip.");
console.log("  • A partition makes two branches diverge; the heavier (more cumulative useful-work)");
console.log("    branch wins on heal — every node REORGS to it, orphaning the lighter branch and");
console.log("    recomputing its living-world state along the new chain.");
console.log("  • Sound fork-choice: difficulty is consensus-enforced and work is objective");
console.log("    (work = expectedWork(difficulty)), so a node cannot win by faking work.");
console.log("");

// Gossip every node's chain to its peers until no node adopts anything; collect reorg events.
function gossip() {
  const collected = [];
  for (let round = 0; round < 30; round += 1) {
    let changed = false;
    for (const node of net.nodes) {
      const events = broadcast(net, node.id);
      for (const e of events) {
        changed = true;
        if (e.reorg_depth > 0) collected.push({ node: e.node, orphaned: e.orphaned });
      }
    }
    if (!changed) break;
  }
  return collected;
}
