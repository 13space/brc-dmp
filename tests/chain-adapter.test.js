import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  decodeChainPayload,
  encodeEventHashPayload,
  encodeEventPayload
} from "../services/csv-adapter/src/event-codec.js";
import {
  createHashResolver,
  indexChainEvents,
  loadOffchainEventMap,
  scanAndIndexTransactions
} from "../services/csv-adapter/src/chain-indexer.js";
import { extractEventsFromTx } from "../services/csv-adapter/src/chain-scanner.js";
import { encodeInscriptionWitness } from "../services/csv-adapter/src/inscription.js";
import { parseOpReturn } from "../services/csv-adapter/src/bitcoin-esplora.js";

const CREATE_EVENT = JSON.parse(await readFile("fixtures/valid/001-create-rwa.json", "utf8"));
const OFFCHAIN_EVENT = JSON.parse(await readFile("fixtures/chain/offchain/002-attest-rwa.json", "utf8"));

test("event codec round-trips a protocol event", () => {
  const encoded = encodeEventPayload(OFFCHAIN_EVENT);
  const dataHex = encoded.envelope_hex;
  const decoded = decodeChainPayload(dataHex);
  assert.equal(decoded.kind, "event");
  assert.equal(decoded.event.event_id, OFFCHAIN_EVENT.event_id);
  assert.equal(decoded.event_hash, encoded.event_hash);
});

test("inscription witness extracts a full BRC-DMP event", () => {
  const encoded = encodeEventPayload(OFFCHAIN_EVENT);
  const witness = encodeInscriptionWitness(encoded.content_type, encoded.content);
  const tx = {
    txid: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    status: { block_height: 840010, confirmed: true },
    vin: [{ txid: "prev", vout: 0, witness: [witness] }],
    vout: [{ scriptpubkey_type: "v0_p2wpkh", value: 1000 }]
  };
  return extractEventsFromTx(tx).then((events) => {
    assert.equal(events.length, 1);
    assert.equal(events[0].event_id, OFFCHAIN_EVENT.event_id);
    assert.equal(events[0].chain_meta.transport, "inscription");
  });
});

test("OP_RETURN hash anchor resolves through off-chain event store", async () => {
  const hashPayload = encodeEventHashPayload(OFFCHAIN_EVENT);
  const opReturnData = parseOpReturn(`6a${pushHex(hashPayload.envelope_hex)}`);
  const tx = {
    txid: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    status: { block_height: 840011, confirmed: true },
    vin: [{ txid: "prev", vout: 0 }],
    vout: [{ scriptpubkey_type: "op_return", scriptpubkey: `6a${pushHex(hashPayload.envelope_hex)}` }]
  };
  const offchain = await loadOffchainEventMap("fixtures/chain/offchain");
  const events = await extractEventsFromTx(tx, { resolveEventByHash: createHashResolver(offchain) });
  assert.equal(events.length, 1);
  assert.equal(events[0].event_id, OFFCHAIN_EVENT.event_id);
  assert.equal(events[0].chain_meta.transport, "op_return_hash");
});

test("scanAndIndexTransactions builds deterministic indexed state", async () => {
  const createEncoded = encodeEventPayload(CREATE_EVENT);
  const attestEncoded = encodeEventPayload(OFFCHAIN_EVENT);
  const createWitness = encodeInscriptionWitness(createEncoded.content_type, createEncoded.content);
  const attestWitness = encodeInscriptionWitness(attestEncoded.content_type, attestEncoded.content);
  const hashPayload = encodeEventHashPayload(OFFCHAIN_EVENT);
  const txs = [
    {
      txid: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      status: { block_height: 840000, confirmed: true },
      vin: [{ txid: "prev", vout: 0, witness: [createWitness] }],
      vout: [{ scriptpubkey_type: "v0_p2wpkh", value: 1000 }]
    },
    {
      txid: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      status: { block_height: 840010, confirmed: true },
      vin: [{ txid: "prev", vout: 0, witness: [attestWitness] }],
      vout: [{ scriptpubkey_type: "v0_p2wpkh", value: 1000 }]
    },
    {
      txid: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      status: { block_height: 840011, confirmed: true },
      vin: [{ txid: "prev", vout: 0 }],
      vout: [{ scriptpubkey_type: "op_return", scriptpubkey: `6a${pushHex(hashPayload.envelope_hex)}` }]
    }
  ];
  const offchain = await loadOffchainEventMap("fixtures/chain/offchain");
  const result = await scanAndIndexTransactions(txs, { resolveEventByHash: createHashResolver(offchain) });
  assert.equal(result.event_count, 3);
  assert.equal(result.state.assets.length, 1);
  assert.equal(result.state.assets[0].id, "dmo:the-one-rwa-001");
  assert.ok(result.state.assets[0].trust.curation >= 35);
});

test("indexChainEvents rejects invalid extracted events", async () => {
  const bad = structuredClone(OFFCHAIN_EVENT);
  bad.op = "unknown-op";
  await assert.rejects(() => indexChainEvents([bad]), /Invalid BRC-DMP event/);
});

function pushHex(hex) {
  const len = hex.length / 2;
  if (len <= 75) return `${len.toString(16).padStart(2, "0")}${hex}`;
  return `4c${len.toString(16).padStart(2, "0")}${hex}`;
}
