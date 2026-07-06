import assert from "node:assert/strict";
import test from "node:test";
import {
  broadcast,
  converged,
  createNetwork,
  heal,
  mineAndBroadcast,
  nodeReceiveChain,
  nodeTip,
  partition,
  tipsSummary
} from "../services/organic-chain/src/network.js";

function gossip(net) {
  for (let round = 0; round < 30; round += 1) {
    let changed = false;
    for (const node of net.nodes) if (broadcast(net, node.id).length > 0) changed = true;
    if (!changed) break;
  }
}

test("honest nodes gossip and converge on one tip", () => {
  const net = createNetwork(["a", "b", "c", "d"]);
  for (let i = 0; i < 12; i += 1) mineAndBroadcast(net, net.nodes[i % 4].id);
  gossip(net);
  assert.equal(converged(net), true);
  const heights = tipsSummary(net).map((t) => t.height);
  assert.ok(heights.every((h) => h === heights[0]));
});

test("a partition forks the chain; healing converges on the heaviest branch (reorg)", () => {
  const net = createNetwork(["a", "b", "c", "d", "e"]);
  for (let i = 0; i < 8; i += 1) mineAndBroadcast(net, net.nodes[i % 5].id);
  gossip(net);
  const forkHeight = nodeTip(net.nodes[0]).height;

  partition(net, ["a", "b", "c"], ["d", "e"]);
  for (let i = 0; i < 6; i += 1) {
    mineAndBroadcast(net, "a");
    mineAndBroadcast(net, "b");
  } // majority branch (heavier)
  for (let i = 0; i < 2; i += 1) mineAndBroadcast(net, "d"); // minority branch (lighter)
  assert.equal(converged(net), false, "the network should be forked while partitioned");

  const heavy = tipsSummary(net).find((t) => t.id === "a");
  const light = tipsSummary(net).find((t) => t.id === "d");
  assert.ok(heavy.work > light.work, "majority branch should have more cumulative work");

  heal(net);
  gossip(net);
  assert.equal(converged(net), true, "healed network should converge");
  // Everyone adopts the heavier branch (branch A's tip), above the fork point.
  const finalTip = nodeTip(net.nodes[0]);
  assert.ok(finalTip.height > forkHeight);
  assert.equal(finalTip.hash, nodeTip(net.nodes[3]).hash, "the minority node should have reorged to the heavy branch");
});

test("a node never adopts a lighter or invalid chain", () => {
  const net = createNetwork(["a", "b"]);
  for (let i = 0; i < 6; i += 1) mineAndBroadcast(net, net.nodes[i % 2].id);
  gossip(net);
  const nodeA = net.nodes[0];
  const before = nodeTip(nodeA).hash;

  // a shorter prefix of A's own chain is lighter ⇒ must be rejected
  const lighter = nodeA.chain.blocks.slice(0, nodeA.chain.blocks.length - 2);
  assert.equal(nodeReceiveChain(nodeA, lighter).adopted, false);

  // a tampered chain (mutated world_root) must be rejected on replay
  const tampered = nodeA.chain.blocks.map((b) => ({ ...b }));
  tampered[3] = { ...tampered[3], world_root: "sha256:" + "0".repeat(64) };
  // make it "heavier" by bumping cumulative_work so it passes the weight gate but fails validation
  tampered[tampered.length - 1] = { ...tampered[tampered.length - 1], cumulative_work: 999999 };
  assert.equal(nodeReceiveChain(nodeA, tampered).adopted, false);

  assert.equal(nodeTip(nodeA).hash, before, "tip must be unchanged after rejecting bad chains");
});

test("reorg recomputes the living-world state deterministically", () => {
  const net = createNetwork(["a", "b", "c"]);
  for (let i = 0; i < 6; i += 1) mineAndBroadcast(net, net.nodes[i % 3].id);
  gossip(net);
  partition(net, ["a"], ["b", "c"]);
  for (let i = 0; i < 5; i += 1) mineAndBroadcast(net, "b"); // heavier
  mineAndBroadcast(net, "a"); // lighter
  heal(net);
  gossip(net);
  assert.equal(converged(net), true);
  // node "a" reorged; its world (agents) must match the canonical chain's world_root
  const a = net.nodes[0];
  const b = net.nodes[1];
  assert.equal(nodeTip(a).world_root, nodeTip(b).world_root, "reorged world_root must match");
});
