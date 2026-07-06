import assert from "node:assert/strict";
import test from "node:test";
import { commitmentToOpReturnScript, createEsploraBitcoin, parseOpReturn } from "../services/csv-adapter/src/bitcoin-esplora.js";

test("parseOpReturn decodes real signet OP_RETURN pushes", () => {
  // captured from real signet tx d7f8da13… (29-byte message push)
  assert.equal(
    parseOpReturn("6a1d23706172646f6e73616d6f7572616920234672656553616d6f75726169"),
    "23706172646f6e73616d6f7572616920234672656553616d6f75726169"
  );
  // a 32-byte commitment push (OP_RETURN OP_PUSHBYTES_32)
  const hex = "ab".repeat(32);
  assert.equal(parseOpReturn(`6a20${hex}`), hex);
  // not an OP_RETURN
  assert.equal(parseOpReturn(`0014${"11".repeat(20)}`), null);
});

test("commitment ↔ OP_RETURN scriptPubKey round-trips", () => {
  const commitment = `sha256:${"cd".repeat(32)}`;
  const script = commitmentToOpReturnScript(commitment);
  assert.equal(script, `6a20${"cd".repeat(32)}`);
  assert.equal(`sha256:${parseOpReturn(script)}`, commitment);
});

test("Esplora getSpend follows a seal to its spend + commitment (offline stub)", async () => {
  const commitmentHex = "ef".repeat(32);
  const spendTxid = "aa".repeat(32);
  const responses = {
    "/blocks/tip/height": "308194",
    "/tx/seal/outspend/0": JSON.stringify({ spent: true, txid: spendTxid, vin: 0, status: { confirmed: true, block_height: 308180 } }),
    [`/tx/${spendTxid}`]: JSON.stringify({
      txid: spendTxid,
      vin: [{ txid: "seal", vout: 0 }],
      vout: [
        { scriptpubkey: `0014${"11".repeat(20)}`, scriptpubkey_type: "v0_p2wpkh", value: 9000 },
        { scriptpubkey: `6a20${commitmentHex}`, scriptpubkey_type: "op_return", value: 0 }
      ],
      status: { confirmed: true, block_height: 308180 }
    }),
    "/tx/open/outspend/0": JSON.stringify({ spent: false })
  };
  const fetchImpl = async (url) => {
    const body = responses[url];
    if (body === undefined) return { ok: false, status: 404, text: async () => "" };
    return { ok: true, text: async () => body };
  };
  const backend = createEsploraBitcoin({ baseUrl: "", fetchImpl });

  assert.equal(await backend.tipHeight(), 308194);
  assert.equal(await backend.isUnspent("open:0"), true);
  assert.equal(await backend.isUnspent("seal:0"), false);

  const spend = await backend.getSpend("seal:0");
  assert.equal(spend.spend_txid, spendTxid);
  assert.equal(spend.commitment, `sha256:${commitmentHex}`);
  assert.equal(spend.next_seal, `${spendTxid}:0`);
  assert.equal(spend.confirmed, true);
  assert.equal(spend.height, 308180);

  assert.equal(await backend.getSpend("open:0"), null);
});
