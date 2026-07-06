#!/usr/bin/env node
// Deterministic signed agent-wallet fixtures (TEST KEYS ONLY — never use on mainnet).
import { writeFile } from "node:fs/promises";
import { p2wpkh } from "@scure/btc-signer/payment.js";
import { pubECDSA } from "@scure/btc-signer/utils.js";
import { hashObject } from "../packages/schema/src/canonicalize.js";
import { assertValidEvent } from "../packages/schema/src/validate.js";
import { bindWalletMessage, rotateKeyMessage } from "../services/agent-wallet/messages.js";
import { signBip322Simple, signSchnorrBip340 } from "../services/agent-wallet/sign.js";
import { verifyAgentEvent } from "../services/agent-wallet/verify.js";

const BIND_PRIV = Buffer.from("11".repeat(32), "hex");
const ROTATE_PRIV = Buffer.from("22".repeat(32), "hex");
const bindWallet = p2wpkh(pubECDSA(BIND_PRIV));
const rotatePub = pubECDSA(ROTATE_PRIV);

const bindEvent = {
  p: "brc-dmp",
  v: "0.1",
  op: "bind_wallet",
  event_id: "evt:013-bind-agent-wallet-signed",
  dmo_id: "dmo:plutus-indexer-agent-001",
  buc: "btc:840007:1111111111111111111111111111111111111111111111111111111111111111:0:457",
  source: {
    chain: "bitcoin",
    block: 840007,
    txid: "1111111111111111111111111111111111111111111111111111111111111111",
    vout: 0,
    sat: "457"
  },
  actor: { type: "did", id: "did:plutus:13space", label: "13space" },
  timestamp: "2026-05-05T11:10:00.000Z",
  wallet_binding: {
    type: "agent_wallet",
    id: "agent-wallet:plutus-indexer-fees-001",
    address: bindWallet.address,
    purpose: "fees",
    bound_at: "2026-05-05T11:10:00.000Z",
    status: "active"
  }
};

bindEvent.wallet_binding.proof_hash = hashObject({
  type: bindEvent.wallet_binding.type,
  id: bindEvent.wallet_binding.id,
  address: bindEvent.wallet_binding.address,
  purpose: bindEvent.wallet_binding.purpose,
  bound_at: bindEvent.wallet_binding.bound_at,
  status: bindEvent.wallet_binding.status
});
bindEvent.wallet_binding.signature_proof = signBip322Simple(
  bindWalletMessage(bindEvent),
  BIND_PRIV,
  bindWallet.address
);

const rotateEvent = {
  p: "brc-dmp",
  v: "0.1",
  op: "rotate_key",
  event_id: "evt:014-rotate-agent-key-signed",
  dmo_id: "dmo:plutus-indexer-agent-001",
  buc: "btc:840008:2222222222222222222222222222222222222222222222222222222222222222:0:458",
  source: {
    chain: "bitcoin",
    block: 840008,
    txid: "2222222222222222222222222222222222222222222222222222222222222222",
    vout: 0,
    sat: "458"
  },
  actor: { type: "did", id: "did:plutus:13space", label: "13space" },
  timestamp: "2026-05-05T11:20:00.000Z",
  key_rotation: {
    revoked_key_id: "did:brc-dmp:plutus-indexer-agent-001#key-1",
    reason: "Signed fixture key rotation drill (production-style Schnorr proof).",
    new_key: {
      id: "did:brc-dmp:plutus-indexer-agent-001#key-2",
      type: "Multikey",
      controller: "did:brc-dmp:plutus-indexer-agent-001",
      publicKeyHex: Buffer.from(rotatePub).toString("hex"),
      publicKeyMultibase: "z6MkfixtureAgentKey222222222222222222222222222222222",
      status: "active"
    }
  }
};

rotateEvent.key_rotation.proof_hash = hashObject(rotateEvent.key_rotation.new_key);
rotateEvent.key_rotation.signature_proof = signSchnorrBip340(rotateKeyMessage(rotateEvent), ROTATE_PRIV);

for (const event of [bindEvent, rotateEvent]) {
  assertValidEvent(event);
  const result = verifyAgentEvent(event);
  if (!result.verified) throw new Error(`${event.event_id} failed verification: ${result.reason}`);
}

await writeFile("fixtures/agents/013-bind-agent-wallet-signed.json", `${JSON.stringify(bindEvent, null, 2)}\n`);
await writeFile("fixtures/agents/014-rotate-agent-key-signed.json", `${JSON.stringify(rotateEvent, null, 2)}\n`);

console.log("Wrote fixtures/agents/013-bind-agent-wallet-signed.json");
console.log(`  bind address: ${bindWallet.address}`);
console.log("Wrote fixtures/agents/014-rotate-agent-key-signed.json");
console.log(`  rotate pubkey: ${Buffer.from(rotatePub).toString("hex")}`);
