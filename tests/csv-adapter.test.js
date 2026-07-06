import assert from "node:assert/strict";
import test from "node:test";
import { loadEventsFromDirectory } from "../services/indexer/src/state.js";
import { batchEvents, buildContract, createMockBitcoin, validateContract } from "../services/csv-adapter/src/index.js";

async function freshContract(batchCount = 4) {
  const events = await loadEventsFromDirectory("fixtures/life");
  const backend = createMockBitcoin();
  const contract = buildContract(backend, batchEvents(events, batchCount));
  return { backend, contract };
}

test("a Bitcoin-anchored contract validates client-side, recomputing the world", async () => {
  const { backend, contract } = await freshContract();
  const v = await validateContract(backend, contract);
  assert.equal(v.valid, true);
  assert.equal(v.height, contract.transitions.length);
  // matches the known life world: cell-0001 dead, cell-0002 + cell-0003 alive
  assert.equal(v.world.population, 3);
  assert.equal(v.world.alive, 2);
});

test("no trusted indexer: two independent validators agree deterministically", async () => {
  const { backend, contract } = await freshContract();
  const a = await validateContract(backend, contract);
  const b = await validateContract(backend, contract);
  assert.equal(a.state_root, b.state_root);
  assert.equal(a.engine_root, b.engine_root);
});

test("the seal chain is Bitcoin-linked: each transition spends the prior spend's output", async () => {
  const { backend, contract } = await freshContract();
  for (let i = 1; i < contract.transitions.length; i += 1) {
    assert.equal(contract.transitions[i].seal_in, contract.transitions[i - 1].seal_out);
    assert.equal(backend.getSpend(contract.transitions[i - 1].seal_in).next_seal, contract.transitions[i].seal_in);
  }
});

test("off-chain tampering breaks the Bitcoin commitment and is rejected", async () => {
  const { backend, contract } = await freshContract();
  const tampered = structuredClone(contract);
  tampered.transitions[1].events[0].timestamp = "2099-01-01T00:00:00.000Z";
  const v = await validateContract(backend, tampered);
  assert.equal(v.valid, false);
  assert.ok(["commitment_mismatch", "invalid_state_transition"].some((r) => v.reason.startsWith(r)));
});

test("security = Bitcoin: a forged history with no on-chain anchors is rejected", async () => {
  const { contract } = await freshContract();
  const emptyBitcoin = createMockBitcoin(); // none of the contract's seals are spent here
  const v = await validateContract(emptyBitcoin, contract);
  assert.equal(v.valid, false);
  assert.equal(v.reason, "seal_not_spent_on_bitcoin");
});

test("a single-use seal cannot be double-spent (no competing anchored history)", async () => {
  const { backend, contract } = await freshContract();
  assert.throws(() => backend.spend(contract.genesis_seal, "sha256:" + "1".repeat(64)), /single-use-seal/);
});

test("a broken seal chain is rejected", async () => {
  const { backend, contract } = await freshContract();
  const broken = structuredClone(contract);
  broken.transitions[2].seal_in = "deadbeef".repeat(8) + ":0";
  const v = await validateContract(backend, broken);
  assert.equal(v.valid, false);
  assert.equal(v.reason, "seal_chain_broken");
});
