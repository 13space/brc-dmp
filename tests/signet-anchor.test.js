import assert from "node:assert/strict";
import test from "node:test";
import * as btc from "@scure/btc-signer";
import { pubECDSA } from "@scure/btc-signer/utils.js";
import { hex } from "@scure/base";
import { loadEventsFromDirectory } from "../services/indexer/src/state.js";
import { buildAnchorTx } from "../services/csv-adapter/src/signet-anchor.js";
import { commitmentToOpReturnScript } from "../services/csv-adapter/src/bitcoin-esplora.js";
import { planGenesis } from "../services/csv-adapter/src/csv.js";

const PRIV = hex.decode("01".repeat(32));
const UTXO = { txid: "ab".repeat(32), vout: 1, value: 100000 };
const COMMIT = `sha256:${"4f".repeat(32)}`;

test("buildAnchorTx produces a valid signed signet tx anchoring the commitment", () => {
  const built = buildAnchorTx({ priv: PRIV, utxo: UTXO, commitment: COMMIT, feerate: 2 });

  assert.equal(built.seal, `${UTXO.txid}:${UTXO.vout}`);
  assert.equal(built.next_seal, `${built.anchor_txid}:0`);
  assert.ok(built.fee > 0 && built.vsize > 0);
  assert.equal(built.op_return_script, commitmentToOpReturnScript(COMMIT));

  // Re-parse the signed tx and confirm structure.
  const tx = btc.Transaction.fromRaw(hex.decode(built.hex), { allowUnknownOutputs: true });
  assert.equal(hex.encode(tx.getInput(0).txid), UTXO.txid, "input references the seal UTXO in display order");
  assert.equal(tx.getInput(0).index, UTXO.vout);
  assert.equal(hex.encode(tx.getOutput(1).script), `6a20${"4f".repeat(32)}`, "OP_RETURN carries the 32-byte commitment");
  assert.equal(tx.getOutput(1).amount, 0n);
  assert.equal(tx.getOutput(0).amount, BigInt(UTXO.value) - BigInt(built.fee), "continuation output = value - fee");
});

test("anchoring is deterministic for a fixed key + utxo + commitment", () => {
  const a = buildAnchorTx({ priv: PRIV, utxo: UTXO, commitment: COMMIT, feerate: 2 });
  const b = buildAnchorTx({ priv: PRIV, utxo: UTXO, commitment: COMMIT, feerate: 2 });
  assert.equal(a.anchor_txid, b.anchor_txid);
  assert.equal(a.hex, b.hex);
});

test("a too-small UTXO is rejected (dust guard)", () => {
  assert.throws(() => buildAnchorTx({ priv: PRIV, utxo: { txid: "cd".repeat(32), vout: 0, value: 300 }, commitment: COMMIT }), /too small/);
});

test("the anchored OP_RETURN matches the genesis commitment of the real life world", async () => {
  const events = await loadEventsFromDirectory("fixtures/life");
  const plan = planGenesis(events);
  const built = buildAnchorTx({ priv: PRIV, utxo: UTXO, commitment: plan.commitment, feerate: 2 });
  // What ends up on-chain is exactly the engine-recomputed commitment.
  assert.equal(built.op_return_script, `6a20${plan.commitment.slice(7)}`);
});

test("a signet WIF round-trips and a mainnet WIF is rejected on TEST_NETWORK", () => {
  const wif = btc.WIF(btc.TEST_NETWORK).encode(PRIV);
  assert.deepEqual(btc.WIF(btc.TEST_NETWORK).decode(wif), PRIV);
  // a mainnet WIF (version 0x80) must not decode under TEST_NETWORK
  const mainnetWif = btc.WIF(btc.NETWORK).encode(PRIV);
  assert.throws(() => btc.WIF(btc.TEST_NETWORK).decode(mainnetWif));
});
