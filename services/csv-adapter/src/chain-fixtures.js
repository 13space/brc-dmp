import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { encodeEventHashPayload, encodeEventPayload } from "./event-codec.js";
import { encodeInscriptionWitness } from "./inscription.js";

function pushHex(hex) {
  const len = hex.length / 2;
  if (len <= 75) return `${len.toString(16).padStart(2, "0")}${hex}`;
  return `4c${len.toString(16).padStart(2, "0")}${hex}`;
}

// Deterministic Esplora-shaped txs for local chain:scan demos and tests.
export function buildChainFixtureTxs(createEvent, attestEvent) {
  const createEncoded = encodeEventPayload(createEvent);
  const attestEncoded = encodeEventPayload(attestEvent);
  const createWitness = encodeInscriptionWitness(createEncoded.content_type, createEncoded.content);
  const attestWitness = encodeInscriptionWitness(attestEncoded.content_type, attestEncoded.content);
  const hashPayload = encodeEventHashPayload(attestEvent);

  return [
    {
      txid: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      status: { confirmed: true, block_height: 840000 },
      vin: [{ txid: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", vout: 0, witness: [createWitness] }],
      vout: [{ scriptpubkey_type: "v0_p2wpkh", scriptpubkey: `0014${"11".repeat(20)}`, value: 1000 }]
    },
    {
      txid: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      status: { confirmed: true, block_height: 840010 },
      vin: [{ txid: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc", vout: 0, witness: [attestWitness] }],
      vout: [{ scriptpubkey_type: "v0_p2wpkh", scriptpubkey: `0014${"22".repeat(20)}`, value: 1000 }]
    },
    {
      txid: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      status: { confirmed: true, block_height: 840011 },
      vin: [{ txid: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd", vout: 0 }],
      vout: [{ scriptpubkey_type: "op_return", scriptpubkey: `6a${pushHex(hashPayload.envelope_hex)}`, value: 0 }]
    }
  ];
}

export async function loadChainFixtureTxs(directory) {
  const files = (await readdir(directory))
    .filter((file) => file.endsWith(".json") && file.startsWith("tx-"))
    .sort();
  const txs = [];
  for (const file of files) {
    txs.push(JSON.parse(await readFile(path.join(directory, file), "utf8")));
  }
  return txs;
}
