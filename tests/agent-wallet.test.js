import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { hashObject } from "../packages/schema/src/canonicalize.js";
import { assertValidEvent } from "../packages/schema/src/validate.js";
import { buildStateFromDirectory } from "../services/indexer/src/state.js";
import { bindWalletMessage, rotateKeyMessage } from "../services/agent-wallet/messages.js";
import { signEcdsaLegacy, signSchnorrBip340 } from "../services/agent-wallet/sign.js";
import { verifyAgentEvent, verifyAgentState, verifySignatureProof } from "../services/agent-wallet/verify.js";
import { p2wpkh } from "@scure/btc-signer/payment.js";
import { pubECDSA } from "@scure/btc-signer/utils.js";

const priv = randomBytes(32);
const pub = pubECDSA(priv);
const wallet = p2wpkh(pub);

test("schnorr-bip340 signatures verify for bind_wallet messages", () => {
  const event = makeBindWalletEvent();
  const message = bindWalletMessage(event);
  const proof = signSchnorrBip340(message, priv);
  const result = verifySignatureProof(proof, { message });
  assert.equal(result.verified, true);
  assert.equal(result.scheme, "schnorr-bip340");
});

test("ecdsa-legacy signatures verify and match the bound address", () => {
  const event = makeBindWalletEvent();
  const message = bindWalletMessage(event);
  const proof = signEcdsaLegacy(message, priv);
  const result = verifySignatureProof(proof, { message, address: wallet.address });
  assert.equal(result.verified, true);
  assert.equal(result.scheme, "ecdsa-legacy");
});

test("verifyAgentEvent accepts signed bind_wallet and rotate_key events", () => {
  const bindEvent = makeBindWalletEvent();
  bindEvent.wallet_binding.signature_proof = signEcdsaLegacy(bindWalletMessage(bindEvent), priv);
  assert.equal(verifyAgentEvent(bindEvent).verified, true);

  const rotateEvent = makeRotateKeyEvent();
  rotateEvent.key_rotation.signature_proof = signSchnorrBip340(rotateKeyMessage(rotateEvent), priv);
  rotateEvent.key_rotation.proof_hash = hashObject(rotateEvent.key_rotation.new_key);
  assert.equal(verifyAgentEvent(rotateEvent).verified, true);
});

test("tampered bind_wallet signatures are rejected", () => {
  const event = makeBindWalletEvent();
  const proof = signEcdsaLegacy(bindWalletMessage(event), priv);
  proof.signature = `${proof.signature.slice(0, -2)}ff`;
  event.wallet_binding.signature_proof = proof;
  const result = verifyAgentEvent(event);
  assert.equal(result.verified, false);
  assert.equal(result.reason, "ecdsa_verification_failed");
});

test("fixture agents without signature proofs report unsigned wallet history", async () => {
  const state = await buildStateFromDirectory("fixtures/valid");
  const agent = state.assets.find((asset) => asset.id === "dmo:plutus-indexer-agent-001");
  const report = verifyAgentState(agent);
  assert.equal(report.agent_id, "dmo:plutus-indexer-agent-001");
  assert.ok(report.checks.length >= 2);
  assert.equal(report.signed_count, 0);
  assert.equal(report.all_signed_verified, false);
});

test("signed bind_wallet fixtures validate and verify end-to-end", () => {
  const event = makeBindWalletEvent();
  event.wallet_binding.signature_proof = signEcdsaLegacy(bindWalletMessage(event), priv);
  assertValidEvent(event);
  assert.equal(verifyAgentEvent(event).verified, true);
});

function makeBindWalletEvent() {
  const binding = {
    type: "agent_wallet",
    id: "agent-wallet:test-fees-001",
    address: wallet.address,
    purpose: "fees",
    bound_at: "2026-07-07T00:00:00.000Z",
    status: "active"
  };
  binding.proof_hash = hashObject({
    type: binding.type,
    id: binding.id,
    address: binding.address,
    purpose: binding.purpose,
    bound_at: binding.bound_at,
    status: binding.status
  });
  return {
    p: "brc-dmp",
    v: "0.1",
    op: "bind_wallet",
    event_id: "evt:test-bind-wallet-signed",
    dmo_id: "dmo:plutus-indexer-agent-001",
    buc: "btc:840020:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff:0:500",
    source: {
      chain: "bitcoin",
      block: 840020,
      txid: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      vout: 0,
      sat: "500"
    },
    actor: { type: "did", id: "did:plutus:13space", label: "13space" },
    timestamp: "2026-07-07T00:00:00.000Z",
    wallet_binding: binding
  };
}

function makeRotateKeyEvent() {
  const newKey = {
    id: "did:brc-dmp:plutus-indexer-agent-001#key-test",
    type: "Multikey",
    controller: "did:brc-dmp:plutus-indexer-agent-001",
    publicKeyHex: Buffer.from(pub).toString("hex"),
    status: "active"
  };
  return {
    p: "brc-dmp",
    v: "0.1",
    op: "rotate_key",
    event_id: "evt:test-rotate-key-signed",
    dmo_id: "dmo:plutus-indexer-agent-001",
    buc: "btc:840021:abababababababababababababababababababababababababababababababab:0:501",
    source: {
      chain: "bitcoin",
      block: 840021,
      txid: "abababababababababababababababababababababababababababababababab",
      vout: 0,
      sat: "501"
    },
    actor: { type: "did", id: "did:plutus:13space", label: "13space" },
    timestamp: "2026-07-07T00:05:00.000Z",
    key_rotation: {
      revoked_key_id: "did:brc-dmp:plutus-indexer-agent-001#key-1",
      reason: "Signed rotation test",
      new_key: newKey
    }
  };
}
