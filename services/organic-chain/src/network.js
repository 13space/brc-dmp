// BRC-LIFE — Organic chain (Mode B): a toy P2P network.
// ---------------------------------------------------------------------------
// An in-process gossip network of full nodes. Each node holds its own chain,
// mines, and broadcasts. The fork-choice rule is HEAVIEST VALID CHAIN (most
// cumulative_work — which is objective, since difficulty is consensus-enforced
// and work = expectedWork(difficulty), so it cannot be faked). On receiving a
// heavier valid chain a node REORGS: it replays + re-validates from genesis,
// switches tip, and recomputes its living-world state. Partition the network and
// the branches diverge; heal it and every node converges on the heaviest branch,
// orphaning the lighter one.
import { addBlock, createChain, mineBlock, tip, validateChain } from "./chain.js";

export function createNode(id, params) {
  return { id, chain: createChain(params) };
}

export function nodeTip(node) {
  return tip(node.chain);
}
export function nodeWork(node) {
  return tip(node.chain).cumulative_work;
}

// Full-node re-validation: replay a block array into a fresh chain from genesis.
export function replayChain(blocks, params) {
  const chain = createChain(params);
  for (let i = 1; i < blocks.length; i += 1) {
    try {
      addBlock(chain, blocks[i]);
    } catch (error) {
      return { valid: false, reason: error.message, height: blocks[i].height };
    }
  }
  return { valid: true, chain };
}

function commonAncestorHeight(a, b) {
  let height = 0;
  const max = Math.min(a.length, b.length);
  for (let i = 0; i < max; i += 1) {
    if (a[i].hash === b[i].hash) height = i;
    else break;
  }
  return height;
}

// Fork-choice + reorg: adopt the incoming chain iff it is valid, shares our
// genesis, and is strictly heavier.
export function nodeReceiveChain(node, blocks) {
  if (!Array.isArray(blocks) || blocks.length < 1) return { adopted: false, reason: "empty" };
  if (blocks[0].hash !== node.chain.blocks[0].hash) return { adopted: false, reason: "different_genesis" };
  const incomingTip = blocks[blocks.length - 1];
  if (incomingTip.cumulative_work <= nodeWork(node)) return { adopted: false, reason: "not_heavier" };

  const replay = replayChain(blocks, node.chain.params);
  if (!replay.valid) return { adopted: false, reason: replay.reason };

  const ancestor = commonAncestorHeight(node.chain.blocks, blocks);
  const reorgDepth = nodeTip(node).height - ancestor;
  const orphaned = node.chain.blocks.slice(ancestor + 1).map((b) => b.hash);
  node.chain = replay.chain;
  return { adopted: true, reorg_depth: reorgDepth, orphaned: orphaned.length, new_height: incomingTip.height };
}

export function nodeMine(node, miner) {
  const block = mineBlock(node.chain, miner);
  if (!block) return null;
  addBlock(node.chain, block);
  return block;
}

const linkKey = (a, b) => [a, b].sort().join("__");

export function createNetwork(nodeIds, params) {
  const links = new Set();
  for (const a of nodeIds) for (const b of nodeIds) if (a !== b) links.add(linkKey(a, b));
  return { nodes: nodeIds.map((id) => createNode(id, params)), links, params };
}

function connected(network, a, b) {
  return network.links.has(linkKey(a, b));
}

// Gossip one node's chain to its connected peers; return the adoption events.
export function broadcast(network, fromId) {
  const from = network.nodes.find((n) => n.id === fromId);
  const events = [];
  for (const peer of network.nodes) {
    if (peer.id === fromId || !connected(network, fromId, peer.id)) continue;
    const result = nodeReceiveChain(peer, from.chain.blocks);
    if (result.adopted) events.push({ node: peer.id, ...result });
  }
  return events;
}

export function mineAndBroadcast(network, nodeId, miner) {
  const node = network.nodes.find((n) => n.id === nodeId);
  const block = nodeMine(node, miner || nodeId);
  const adoptions = broadcast(network, nodeId);
  return { block, adoptions };
}

export function partition(network, groupA, groupB) {
  for (const a of groupA) for (const b of groupB) network.links.delete(linkKey(a, b));
}

export function heal(network) {
  const ids = network.nodes.map((n) => n.id);
  for (const a of ids) for (const b of ids) if (a !== b) network.links.add(linkKey(a, b));
}

// Gossip until quiescent (no more adoptions) or a round cap.
export function gossipToConsensus(network, maxRounds = 20) {
  for (let round = 0; round < maxRounds; round += 1) {
    let changed = false;
    for (const node of network.nodes) {
      if (broadcast(network, node.id).length > 0) changed = true;
    }
    if (!changed) return round + 1;
  }
  return maxRounds;
}

export function converged(network) {
  const tips = network.nodes.map((n) => nodeTip(n).hash);
  return tips.every((t) => t === tips[0]);
}

export function tipsSummary(network) {
  return network.nodes.map((n) => ({
    id: n.id,
    height: nodeTip(n).height,
    work: nodeWork(n),
    population: n.chain.agents.length,
    tip: nodeTip(n).hash.slice(7, 17)
  }));
}

export { validateChain };
