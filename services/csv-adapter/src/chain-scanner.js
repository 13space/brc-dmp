import { parseOpReturn } from "./bitcoin-esplora.js";
import { decodeChainPayload } from "./event-codec.js";
import { decodeInscriptionEvent } from "./inscription.js";

// Extract BRC-DMP/BRC-LIFE events from a Bitcoin transaction object (Esplora shape).
export function extractEventsFromTx(tx, options = {}) {
  const resolveEventByHash = options.resolveEventByHash || null;
  const found = [];
  const txid = tx.txid;
  const block = tx.status?.block_height ?? null;

  for (const [index, vout] of (tx.vout || []).entries()) {
    if (vout.scriptpubkey_type !== "op_return") continue;
    const dataHex = parseOpReturn(vout.scriptpubkey);
    const decoded = decodeChainPayload(dataHex);
    if (!decoded) continue;
    found.push({
      ...decoded,
      source: { chain: "bitcoin", block, txid, vout: index },
      transport: "op_return"
    });
  }

  for (const vin of tx.vin || []) {
    const decoded = decodeInscriptionEvent(vin.witness || []);
    if (!decoded) continue;
    found.push({
      ...decoded,
      source: { chain: "bitcoin", block, txid, vout: vin.vout ?? 0 },
      transport: "inscription"
    });
  }

  return Promise.all(
    found.map(async (item) => {
      if (item.kind === "event") {
        return enrichEvent(item.event, item.source, item.transport);
      }
      if (item.kind === "hash" && resolveEventByHash) {
        const event = await resolveEventByHash(item.hash);
        if (!event) return null;
        return enrichEvent(event, item.source, "op_return_hash");
      }
      return null;
    })
  ).then((items) => items.filter(Boolean));
}

export function enrichEvent(event, source, transport) {
  const mergedSource = {
    chain: "bitcoin",
    block: source.block ?? event.source?.block ?? 0,
    txid: source.txid ?? event.source?.txid,
    vout: source.vout ?? event.source?.vout ?? 0,
    sat: event.source?.sat
  };
  return {
    ...event,
    source: { ...event.source, ...mergedSource },
    chain_meta: {
      transport,
      anchored_txid: mergedSource.txid,
      anchored_vout: mergedSource.vout,
      anchored_block: mergedSource.block
    }
  };
}

export async function scanTransactions(txs, options = {}) {
  const events = [];
  for (const tx of txs) {
    events.push(...(await extractEventsFromTx(tx, options)));
  }
  return sortChainEvents(events);
}

export function sortChainEvents(events) {
  return events.slice().sort((a, b) => {
    const blockA = a.source?.block ?? 0;
    const blockB = b.source?.block ?? 0;
    if (blockA !== blockB) return blockA - blockB;
    const txCmp = String(a.source?.txid || "").localeCompare(String(b.source?.txid || ""));
    if (txCmp !== 0) return txCmp;
    return (a.source?.vout ?? 0) - (b.source?.vout ?? 0);
  });
}
