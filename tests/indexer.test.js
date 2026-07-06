import assert from "node:assert/strict";
import test from "node:test";
import { buildStateFromDirectory } from "../services/indexer/src/state.js";

test("indexer builds deterministic DMO state from fixtures", async () => {
  const first = await buildStateFromDirectory("fixtures/valid");
  const second = await buildStateFromDirectory("fixtures/valid");

  assert.equal(first.state_root, second.state_root);
  assert.equal(first.assets.length, 4);
  assert.equal(first.events.length, 12);
});

test("rwa fixture accumulates owner, proofs, trust, and fractions", async () => {
  const state = await buildStateFromDirectory("fixtures/valid");
  const asset = state.assets.find((item) => item.id === "dmo:the-one-rwa-001");

  assert.ok(asset);
  assert.equal(asset.kind, "rwa_art");
  assert.equal(asset.owner.id, "bc1qcollector000000000000000000000000000000");
  assert.equal(asset.proofs.length, 2);
  assert.equal(asset.fractions.length, 1);
  assert.equal(asset.trust.authenticity, 40);
  assert.equal(asset.trust.provenance, 40);
  assert.equal(asset.trust.curation, 40);
  assert.equal(asset.trust.risk, 20);
});

test("agent fixture records wallet identity and interaction proof", async () => {
  const state = await buildStateFromDirectory("fixtures/valid");
  const agent = state.assets.find((item) => item.id === "dmo:plutus-indexer-agent-001");

  assert.ok(agent);
  assert.equal(agent.kind, "agent_identity");
  assert.equal(agent.owner.type, "agent_wallet");
  assert.equal(agent.interactions.length, 1);
  assert.equal(agent.proofs[0].type, "interaction_proof");
  assert.equal(agent.anchors.length, 1);
  assert.equal(agent.agent.did_document.authentication[0], "did:brc-dmp:plutus-indexer-agent-001#key-2");
  assert.equal(agent.agent.wallets.length, 2);
  assert.equal(agent.agent.keys.length, 2);
  assert.equal(agent.agent.permissions.length, 4);
  assert.equal(agent.agent.interaction_privacy.default_level, "selective");
  assert.equal(agent.agent.key_history.length, 1);
  assert.equal(agent.agent.policy_history.length, 1);
});

test("rwa fixtures include image, certificate, owner, proof hash, and risk fields", async () => {
  const state = await buildStateFromDirectory("fixtures/valid");
  const rwaAssets = state.assets.filter((item) => item.kind === "rwa_art");

  assert.equal(rwaAssets.length, 3);
  for (const asset of rwaAssets) {
    assert.ok(asset.metadata.image_uri);
    assert.ok(asset.metadata.certificate_uri);
    assert.ok(asset.metadata.risk.summary);
    assert.ok(asset.owner.address);
    assert.ok(asset.proofs.every((proof) => proof.hash.startsWith("sha256:")));
  }
});
